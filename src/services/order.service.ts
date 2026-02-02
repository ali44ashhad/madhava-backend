import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';
import { generateOrderNumber } from '../utils/order-number.js';
import { PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';

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
    const paymentStatus =
      input.paymentMethod === PaymentMethod.RAZORPAY
        ? PaymentStatus.PAID
        : PaymentStatus.PENDING;

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

    // Create payment record
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: input.paymentMethod,
        reference: input.paymentReference,
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

  // Validate payment reference for Razorpay
  if (input.paymentMethod === PaymentMethod.RAZORPAY && !input.paymentReference) {
    throw new AppError(
      'VALIDATION_ERROR',
      'paymentReference is required for RAZORPAY payment method',
      400
    );
  }

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
    select: { id: true, status: true, orderNumber: true },
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

  // Update order status and timestamp
  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
    },
  });

  logger.info('Order marked as delivered', {
    orderId,
    orderNumber: order.orderNumber,
    adminId,
    previousStatus: OrderStatus.SHIPPED,
    newStatus: OrderStatus.DELIVERED,
  });

  // Note: 7-day return window enforcement will be implemented when returns are added
}

