import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';
import { generateOrderNumber } from '../utils/order-number.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import { razorpay } from '../config/index.js';

/**
 * Place order input item
 */
export interface PlaceOrderItem {
  skuId: string;
  quantity: number;
}

/**
 * Place order input
 */
export interface PlaceOrderInput {
  customerId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  items: PlaceOrderItem[];
}

/**
 * Place order result
 */
export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  razorpayOrderId?: string;
}

/**
 * COD fee in rupees
 */
const COD_FEE = 50;

/**
 * Place order service
 * Handles complete order placement flow with atomic transaction
 * 
 * Steps:
 * 1. Pre-transaction validations
 * 2. Start transaction
 * 3. Re-fetch and lock SKUs
 * 4. Reduce stock
 * 5. Calculate prices
 * 6. Generate order number
 * 7. Create order
 * 8. Create order items
 * 9. Create payment record
 * 10. Commit transaction
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  logger.info('Placing order', {
    customerId: input.customerId,
    addressId: input.addressId,
    paymentMethod: input.paymentMethod,
    itemCount: input.items.length,
  });

  // Pre-transaction validations
  await validateOrderInput(input);

  // Execute order placement in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Re-fetch SKUs inside transaction (race condition protection)
    const skuIds = input.items.map((item) => item.skuId);
    const skus = await tx.sku.findMany({
      where: {
        id: { in: skuIds },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Validate SKUs exist and are active
    if (skus.length !== skuIds.length) {
      const foundIds = new Set(skus.map((s) => s.id));
      const missingIds = skuIds.filter((id) => !foundIds.has(id));
      throw new AppError('NOT_FOUND', `SKU(s) not found: ${missingIds.join(', ')}`, 404);
    }

    // Validate stock and COD for each item
    for (const item of input.items) {
      const sku = skus.find((s) => s.id === item.skuId);
      if (!sku) {
        throw new AppError('NOT_FOUND', `SKU with id '${item.skuId}' not found`, 404);
      }

      if (!sku.isActive) {
        throw new AppError('INVALID_STATE', `SKU with id '${item.skuId}' is not active`, 400);
      }

      if (sku.stockQuantity < item.quantity) {
        throw new AppError(
          'OUT_OF_STOCK',
          `Insufficient stock for SKU '${sku.skuCode}'. Available: ${sku.stockQuantity}, Requested: ${item.quantity}`,
          400
        );
      }

      // COD validation
      if (input.paymentMethod === PaymentMethod.COD && !sku.isCodAllowed) {
        throw new AppError(
          'BAD_REQUEST',
          `COD is not allowed for SKU '${sku.skuCode}'`,
          400
        );
      }
    }

    // Reduce stock for each SKU
    for (const item of input.items) {
      const sku = skus.find((s) => s.id === item.skuId)!;
      const newStock = sku.stockQuantity - item.quantity;

      await tx.sku.update({
        where: { id: sku.id },
        data: {
          stockQuantity: newStock,
        },
      });

      logger.info('Stock reduced', {
        skuId: sku.id,
        skuCode: sku.skuCode,
        previousStock: sku.stockQuantity,
        quantity: item.quantity,
        newStock,
      });
    }

    // Calculate prices for each item
    const orderItemsData = input.items.map((item) => {
      const sku = skus.find((s) => s.id === item.skuId)!;

      // Effective price: festivePrice ?? sellingPrice
      const effectivePrice = sku.festivePrice ?? sku.sellingPrice;
      const pricePerUnit = Number(effectivePrice);
      const gstPercent = Number(sku.gstPercent);

      // Price is GST-inclusive, so we need to derive the base price and GST amount
      // If price is GST-inclusive: basePrice = price / (1 + gstPercent/100)
      // GST amount = price - basePrice
      const basePrice = pricePerUnit / (1 + gstPercent / 100);
      const gstAmountPerUnit = pricePerUnit - basePrice;

      const lineTotal = pricePerUnit * item.quantity;
      const lineGstAmount = gstAmountPerUnit * item.quantity;

      // Create SKU snapshot
      const skuSnapshot = {
        productName: sku.product.name,
        skuCode: sku.skuCode,
        size: sku.size,
        weight: sku.weight,
        material: sku.material,
        color: sku.color,
        mrp: Number(sku.mrp),
        sellingPrice: Number(sku.sellingPrice),
        festivePrice: sku.festivePrice ? Number(sku.festivePrice) : null,
        gstPercent: gstPercent,
        manufacturerName: sku.manufacturerName,
        manufacturerAddress: sku.manufacturerAddress,
        countryOfOrigin: sku.countryOfOrigin,
        sellerName: sku.sellerName,
        sellerAddress: sku.sellerAddress,
        sellerPincode: sku.sellerPincode,
      };

      return {
        skuId: sku.id,
        quantity: item.quantity,
        pricePerUnit: new Decimal(pricePerUnit),
        gstPercent: new Decimal(gstPercent),
        totalPrice: new Decimal(lineTotal),
        skuSnapshot,
        lineGstAmount,
      };
    });

    // Calculate order totals
    const subtotalAmount = orderItemsData.reduce(
      (sum, item) => sum + Number(item.totalPrice),
      0
    );
    const gstAmount = orderItemsData.reduce(
      (sum, item) => sum + item.lineGstAmount,
      0
    );
    const codFee = input.paymentMethod === PaymentMethod.COD ? COD_FEE : 0;
    const totalAmount = subtotalAmount + codFee;

    // Generate order number (inside transaction for atomicity)
    const orderNumber = await generateOrderNumber(tx);

    // Determine payment status
    // Both COD and RAZORPAY should initially be PENDING
    // COD is paid on delivery, RAZORPAY is verified via webhook
    const paymentStatus = PaymentStatus.PENDING;

    // Fetch address for snapshot
    const address = await tx.address.findUnique({
      where: { id: input.addressId },
    });

    if (!address) {
      throw new AppError('NOT_FOUND', `Address with id '${input.addressId}' not found`, 404);
    }

    // Create address snapshot (all fields)
    const addressSnapshot = {
      id: address.id,
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: address.isDefault,
    };

    // Create order
    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: input.customerId,
        addressSnapshot,
        status: OrderStatus.PLACED,
        paymentMethod: input.paymentMethod,
        paymentStatus,
        subtotalAmount: new Decimal(subtotalAmount),
        gstAmount: new Decimal(gstAmount),
        codFee: new Decimal(codFee),
        totalAmount: new Decimal(totalAmount),
        placedAt: new Date(),
      },
    });

    logger.info('Order created', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    // Create order items
    await tx.orderItem.createMany({
      data: orderItemsData.map((item) => ({
        orderId: order.id,
        skuId: item.skuId,
        quantity: item.quantity,
        pricePerUnit: item.pricePerUnit,
        gstPercent: item.gstPercent,
        totalPrice: item.totalPrice,
        skuSnapshot: item.skuSnapshot,
      })),
    });

    logger.info('Order items created', {
      orderId: order.id,
      itemCount: orderItemsData.length,
    });

    let razorpayOrderId: string | undefined;

    // Create Razorpay order if method is RAZORPAY
    if (input.paymentMethod === PaymentMethod.RAZORPAY) {
      if (!razorpay) {
        throw new AppError('INTERNAL_SERVER_ERROR', 'Razorpay is not configured on the server', 500);
      }
      try {
        const rpOrder = await razorpay.orders.create({
          amount: Math.round(totalAmount * 100), // Amount in paise
          currency: 'INR',
          receipt: orderNumber,
        });
        razorpayOrderId = rpOrder.id;
        logger.info('Razorpay order created', { orderId: order.id, razorpayOrderId });
      } catch (error) {
        logger.error('Failed to create Razorpay order', { error, orderId: order.id });
        throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to initialize payment gateway', 500);
      }
    }

    // Create payment record
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: input.paymentMethod,
        reference: razorpayOrderId || input.paymentReference,
        amount: new Decimal(totalAmount),
        status: paymentStatus,
      },
    });

    logger.info('Payment record created', {
      orderId: order.id,
      paymentMethod: input.paymentMethod,
      paymentStatus,
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      razorpayOrderId,
    };
  });

  logger.info('Order placed successfully', {
    orderId: result.orderId,
    orderNumber: result.orderNumber,
  });

  return result;
}

/**
 * Validate order input before transaction
 * Performs checks that don't require transaction isolation
 */
async function validateOrderInput(input: PlaceOrderInput): Promise<void> {
  // Validate at least one item
  if (!input.items || input.items.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'At least one item is required', 400);
  }

  // Ensure reference is valid if needed (we generate Razorpay Order ID now, so no need to ensure frontend passes it)
  // Re-evaluating this based on new logic: Frontend doesn't need to pass reference for Razorpay.

  // Validate customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError('NOT_FOUND', `Customer with id '${input.customerId}' not found`, 404);
  }

  // Validate address exists and belongs to customer
  const address = await prisma.address.findUnique({
    where: { id: input.addressId },
    select: {
      id: true,
      customerId: true,
    },
  });

  if (!address) {
    throw new AppError('NOT_FOUND', `Address with id '${input.addressId}' not found`, 404);
  }

  if (address.customerId !== input.customerId) {
    throw new AppError(
      'BAD_REQUEST',
      `Address with id '${input.addressId}' does not belong to customer '${input.customerId}'`,
      400
    );
  }

  // Validate all SKUs exist and are active (pre-transaction check)
  const skuIds = input.items.map((item) => item.skuId);
  const uniqueSkuIds = [...new Set(skuIds)];

  if (uniqueSkuIds.length !== skuIds.length) {
    throw new AppError('VALIDATION_ERROR', 'Duplicate SKU IDs in items', 400);
  }

  const skus = await prisma.sku.findMany({
    where: {
      id: { in: uniqueSkuIds },
    },
    select: {
      id: true,
      skuCode: true,
      isActive: true,
      stockQuantity: true,
      isCodAllowed: true,
    },
  });

  if (skus.length !== uniqueSkuIds.length) {
    const foundIds = new Set(skus.map((s) => s.id));
    const missingIds = uniqueSkuIds.filter((id) => !foundIds.has(id));
    throw new AppError('NOT_FOUND', `SKU(s) not found: ${missingIds.join(', ')}`, 404);
  }

  // Validate SKUs are active and have stock
  for (const item of input.items) {
    const sku = skus.find((s) => s.id === item.skuId);
    if (!sku) {
      continue; // Already handled above
    }

    if (!sku.isActive) {
      throw new AppError(
        'INVALID_STATE',
        `SKU with id '${item.skuId}' (${sku.skuCode}) is not active`,
        400
      );
    }

    if (sku.stockQuantity < item.quantity) {
      throw new AppError(
        'OUT_OF_STOCK',
        `Insufficient stock for SKU '${sku.skuCode}'. Available: ${sku.stockQuantity}, Requested: ${item.quantity}`,
        400
      );
    }

    // COD validation
    if (input.paymentMethod === PaymentMethod.COD && !sku.isCodAllowed) {
      throw new AppError(
        'BAD_REQUEST',
        `COD is not allowed for SKU '${sku.skuCode}'`,
        400
      );
    }

    // Validate quantity
    if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new AppError(
        'VALIDATION_ERROR',
        `Invalid quantity for SKU '${item.skuId}'. Must be a positive integer`,
        400
      );
    }
  }
}

/**
 * Approve order service
 * Transitions order from PLACED to CONFIRMED
 * 
 * Rules:
 * - Only allowed when status = PLACED OR ON_HOLD
 * - Sets confirmedAt timestamp
 * - Logs admin action
 */
export async function approveOrder(orderId: string, adminId: string): Promise<void> {
  logger.info('Approve order request', { orderId, adminId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate current status allows transition
  if (order.status !== OrderStatus.PLACED && order.status !== OrderStatus.ON_HOLD) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot approve order. Current status: ${order.status}. Expected: PLACED or ON_HOLD`,
      400
    );
  }

  // Update order status and timestamp
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  logger.info('Order approved', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    previousStatus: OrderStatus.PLACED,
    newStatus: OrderStatus.CONFIRMED,
  });
}

/**
 * Put order on hold service
 * Transitions order from PLACED or CONFIRMED to ON_HOLD
 * 
 * Rules:
 * - Only allowed when status = PLACED or CONFIRMED
 * - Customer-visible status remains PLACED (internal state = ON_HOLD)
 * - Logs admin action
 */
export async function putOrderOnHold(orderId: string, adminId: string): Promise<void> {
  logger.info('Put order on hold request', { orderId, adminId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate current status allows transition
  if (order.status !== OrderStatus.PLACED && order.status !== OrderStatus.CONFIRMED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot put order on hold. Current status: ${order.status}. Expected: PLACED or CONFIRMED`,
      400
    );
  }

  // Update order status to ON_HOLD
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.ON_HOLD,
    },
  });

  logger.info('Order put on hold', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    previousStatus: order.status,
    newStatus: OrderStatus.ON_HOLD,
  });
}

/**
 * Cancel order service
 * Transitions order from PLACED, CONFIRMED, or ON_HOLD to CANCELLED
 * 
 * Rules:
 * - Only allowed when status = PLACED, CONFIRMED, or ON_HOLD
 * - Sets cancelledAt timestamp
 * - Reason is mandatory (logged, not stored in DB per requirements)
 * - Logs admin action with reason
 */
export async function cancelOrder(orderId: string, adminId: string, reason: string): Promise<void> {
  logger.info('Cancel order request', { orderId, adminId, reason });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, paymentMethod: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate current status allows transition
  if (
    order.status !== OrderStatus.PLACED &&
    order.status !== OrderStatus.CONFIRMED &&
    order.status !== OrderStatus.ON_HOLD
  ) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot cancel order. Current status: ${order.status}. Expected: PLACED, CONFIRMED, or ON_HOLD`,
      400
    );
  }

  // Update order status and timestamp
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.CANCELLED,
      cancelledAt: new Date(),
    },
  });

  logger.info('Order cancelled', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    reason,
    previousStatus: order.status,
    newStatus: OrderStatus.CANCELLED,
    paymentMethod: order.paymentMethod,
  });

  // Note: Refund initiation for prepaid orders is not implemented yet (per requirements)
}

/**
 * Cancel own order service (for customers)
 * Transitions order from PLACED or CONFIRMED to CANCELLED and restores stock
 * 
 * Rules:
 * - Only allowed when status = PLACED or CONFIRMED
 * - Validates that the order belongs to the customer
 * - Sets cancelledAt timestamp
 * - Restores inventory directly
 * - Updates payment statuses
 */
export async function cancelMyOrder(orderId: string, customerId: string, reason: string): Promise<void> {
  logger.info('Customer cancel order request', { orderId, customerId, reason });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, paymentMethod: true, customerId: true, paymentStatus: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate ownership
  if (order.customerId !== customerId) {
    throw new AppError('FORBIDDEN', `You do not have permission to cancel this order`, 403);
  }

  // Validate current status allows transition
  if (
    order.status !== OrderStatus.PLACED &&
    order.status !== OrderStatus.CONFIRMED
  ) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot cancel order. Current status: ${order.status}. Only PLACED or CONFIRMED orders can be cancelled.`,
      400
    );
  }

  // Execute cancellation and stock restoration in a transaction
  await prisma.$transaction(async (tx) => {
    // 1. Update order status and timestamp
    const newPaymentStatus = (order.paymentMethod === PaymentMethod.RAZORPAY && order.paymentStatus === PaymentStatus.PAID)
      ? PaymentStatus.REFUNDED
      : PaymentStatus.FAILED;

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        paymentStatus: newPaymentStatus,
        cancelledAt: new Date(),
      },
    });

    // 2. Update payment records
    await tx.payment.updateMany({
      where: { orderId: orderId },
      data: {
        status: newPaymentStatus,
      }
    });

    // 3. Get order items to restore stock
    const orderItems = await tx.orderItem.findMany({
      where: { orderId: orderId },
      select: { skuId: true, quantity: true },
    });

    // 4. Restore stock
    for (const item of orderItems) {
      await tx.sku.update({
        where: { id: item.skuId },
        data: {
          stockQuantity: { increment: item.quantity },
        },
      });
    }
  });

  logger.info('Customer order cancelled successfully and stock restored', {
    orderId,
    orderNumber: order.orderNumber,
    customerId,
    reason,
    previousStatus: order.status,
    newStatus: OrderStatus.CANCELLED,
    paymentMethod: order.paymentMethod,
  });
}

/**
 * Mark order as shipped service
 * Transitions order from CONFIRMED to SHIPPED
 * 
 * Rules:
 * - Only allowed when status = CONFIRMED
 * - Sets shippedAt timestamp
 * - Stores shipping info (courier, trackingId) in JSON field
 * - Logs admin action
 */
export async function markOrderAsShipped(
  orderId: string,
  adminId: string,
  courier: string,
  trackingId: string
): Promise<void> {
  logger.info('Mark order as shipped request', { orderId, adminId, courier, trackingId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate current status allows transition
  if (order.status !== OrderStatus.CONFIRMED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot ship order. Current status: ${order.status}. Expected: CONFIRMED`,
      400
    );
  }

  // Create shipping info JSON
  const shippingInfo = {
    courier,
    trackingId,
  };

  // Update order status, timestamp, and shipping info
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.SHIPPED,
      shippedAt: new Date(),
      shippingInfo,
    },
  });

  logger.info('Order marked as shipped', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    courier,
    trackingId,
    previousStatus: OrderStatus.CONFIRMED,
    newStatus: OrderStatus.SHIPPED,
  });
}

/**
 * Mark order as delivered service
 * Transitions order from SHIPPED to DELIVERED
 * 
 * Rules:
 * - Only allowed when status = SHIPPED
 * - Sets deliveredAt timestamp
 * - Starts 7-day return window (enforced later when returns are implemented)
 * - Logs admin action
 */
export async function markOrderAsDelivered(orderId: string, adminId: string): Promise<void> {
  logger.info('Mark order as delivered request', { orderId, adminId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true, orderNumber: true, paymentMethod: true },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate current status allows transition
  if (order.status !== OrderStatus.SHIPPED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot mark order as delivered. Current status: ${order.status}. Expected: SHIPPED`,
      400
    );
  }

  const isCod = order.paymentMethod === PaymentMethod.COD;

  // Update order status and payment (COD payment is received on delivery)
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
      ...(isCod && { paymentStatus: PaymentStatus.PAID }),
    },
  });

  // Also update the COD payment record to PAID
  if (isCod) {
    await prisma.payment.updateMany({
      where: { orderId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PAID },
    });
  }

  logger.info('Order marked as delivered', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    previousStatus: OrderStatus.SHIPPED,
    newStatus: OrderStatus.DELIVERED,
  });

  // Note: 7-day return window enforcement will be implemented when returns are added
}

/**
 * Get order details for email notification
 * Fetches order with customer, address, and items
 */
export async function getOrderDetailsForEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          sku: true,
        }
      },
      customer: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Determine customer name
  const customerName = order.customer.name || 'Customer';

  return {
    order,
    customerName,
    customerEmail: order.customer.email,
  };
}

/**
 * Get customer orders service
 * Fetches all orders for a specific customer
 */
export async function getCustomerOrders(customerId: string) {
  logger.info('Get customer orders request', { customerId });

  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { placedAt: 'desc' },
    include: {
      orderItems: {
        include: {
          sku: true,
          return: true,
        }
      },
      payments: true,
    },
  });

  return orders;
}

/**
 * Get order by ID service
 * Fetches a specific order by ID
 */
export async function getOrderById(orderId: string) {
  logger.info('Get order by ID request', { orderId });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          sku: true,
          return: true,
        }
      },
      payments: true,
      customer: {
        select: {
          name: true,
          email: true,
          phone: true,
        }
      }
    },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  return order;
}

/**
 * Get all orders service (Admin)
 * Fetches all orders with pagination and sorting
 */
export async function getAllOrders(page: number = 1, limit: number = 20, search?: string, status?: string) {
  logger.info('Get all orders request', { page, limit, search, status });

  const skip = (page - 1) * limit;

  const whereClause: any = {};

  if (status) {
    whereClause.status = status;
  }

  if (search) {
    whereClause.OR = [
      { orderNumber: { contains: search, mode: 'insensitive' } },
      { customer: { email: { contains: search, mode: 'insensitive' } } },
      { customer: { name: { contains: search, mode: 'insensitive' } } }
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { placedAt: 'desc' },
      include: {
        orderItems: {
          include: {
            sku: true,
            return: true,
          }
        },
        payments: true,
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
          }
        }
      },
    }),
    prisma.order.count({ where: whereClause }),
  ]);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  };
}

/**
 * Cleanup stale pending orders
 * Cancels PENDING orders older than the specified minutes and restores their stock
 */
export async function cleanupStalePendingOrders(minutesOld: number = 60, adminId: string): Promise<{ cancelledCount: number }> {
  logger.info('Starting stale order cleanup', { minutesOld, adminId });

  const pastDate = new Date(Date.now() - minutesOld * 60 * 1000);

  // Find all PENDING orders older than pastDate
  const staleOrders = await prisma.order.findMany({
    where: {
      status: OrderStatus.PLACED,
      paymentStatus: PaymentStatus.PENDING,
      placedAt: {
        lt: pastDate,
      },
      paymentMethod: PaymentMethod.RAZORPAY, // Only razorpay payments are prone to abandonment
    },
    select: { id: true },
  });

  let cancelledCount = 0;

  for (const order of staleOrders) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Mark order as cancelled
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            cancelledAt: new Date(),
          },
        });

        // 2. Mark associated payments as failed
        await tx.payment.updateMany({
          where: {
            orderId: order.id,
            status: PaymentStatus.PENDING,
          },
          data: {
            status: PaymentStatus.FAILED,
          },
        });

        // 3. Get order items to restore stock
        const orderItems = await tx.orderItem.findMany({
          where: { orderId: order.id },
          select: { skuId: true, quantity: true },
        });

        // 4. Restore stock
        for (const item of orderItems) {
          await tx.sku.update({
            where: { id: item.skuId },
            data: {
              stockQuantity: { increment: item.quantity },
            },
          });
        }
      });

      logger.info('Stale order cleaned up and stock restored', { orderId: order.id, adminId });
      cancelledCount++;
    } catch (error) {
      logger.error('Failed to cleanup stale order', { orderId: order.id, error });
    }
  }

  logger.info('Stale order cleanup completed', { cancelledCount, adminId });

  return { cancelledCount };
}
