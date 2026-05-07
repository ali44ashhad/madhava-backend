import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { razorpay } from '../config/index.js';
import { validateCoupon } from './coupon.service.js';

export interface InitiateRazorpayInput {
  customerId: string;
  addressId: string;
  items: Array<{ skuId: string; quantity: number }>;
  couponCode?: string;
}

export interface InitiateRazorpayResult {
  razorpayOrderId: string;
  amount: number; // in rupees
  currency: string;
}

/**
 * Initiate a Razorpay payment session.
 *
 * Creates a Razorpay Order ID for use in the checkout popup.
 * Does NOT write anything to the database — no order record,
 * no stock deduction. That only happens in placeOrder() after
 * the payment signature is verified.
 *
 * Steps:
 * 1. Validate customer + address exist
 * 2. Pre-flight stock check (read-only, no lock)
 * 3. Compute total (with optional coupon preview)
 * 4. Create Razorpay order → return ID + amount
 */
export async function initiateRazorpaySession(
  input: InitiateRazorpayInput
): Promise<InitiateRazorpayResult> {
  logger.info('Initiating Razorpay session', {
    customerId: input.customerId,
    addressId: input.addressId,
    itemCount: input.items.length,
  });

  if (!razorpay) {
    throw new AppError('INTERNAL_SERVER_ERROR', 'Razorpay is not configured on the server', 500);
  }

  // 1. Validate customer
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError('NOT_FOUND', `Customer with id '${input.customerId}' not found`, 404);
  }

  // 2. Validate address belongs to customer
  const address = await prisma.address.findUnique({
    where: { id: input.addressId },
    select: { id: true, customerId: true },
  });
  if (!address) {
    throw new AppError('NOT_FOUND', `Address with id '${input.addressId}' not found`, 404);
  }
  if (address.customerId !== input.customerId) {
    throw new AppError('BAD_REQUEST', `Address does not belong to this customer`, 400);
  }

  // 3. Pre-flight stock + price check (read-only, no lock)
  const skuIds = input.items.map((i) => i.skuId);
  const skus = await prisma.sku.findMany({
    where: { id: { in: skuIds } },
    select: {
      id: true,
      skuCode: true,
      isActive: true,
      stockQuantity: true,
      sellingPrice: true,
      festivePrice: true,
    },
  });

  if (skus.length !== skuIds.length) {
    const found = new Set(skus.map((s) => s.id));
    const missing = skuIds.filter((id) => !found.has(id));
    throw new AppError('NOT_FOUND', `SKU(s) not found: ${missing.join(', ')}`, 404);
  }

  let subtotalAmount = 0;

  for (const item of input.items) {
    const sku = skus.find((s) => s.id === item.skuId)!;

    if (!sku.isActive) {
      throw new AppError('INVALID_STATE', `SKU '${sku.skuCode}' is not active`, 400);
    }
    if (sku.stockQuantity < item.quantity) {
      throw new AppError(
        'OUT_OF_STOCK',
        `Insufficient stock for SKU '${sku.skuCode}'. Available: ${sku.stockQuantity}, Requested: ${item.quantity}`,
        400
      );
    }
    if (item.quantity <= 0 || !Number.isInteger(item.quantity)) {
      throw new AppError('VALIDATION_ERROR', `Invalid quantity for SKU '${item.skuId}'`, 400);
    }

    const effectivePrice = sku.festivePrice ?? sku.sellingPrice;
    subtotalAmount += Number(effectivePrice) * item.quantity;
  }

  // 4. Apply coupon discount preview (read-only, no usage recorded)
  let discountAmount = 0;
  if (input.couponCode) {
    try {
      const couponResult = await validateCoupon(
        input.couponCode,
        subtotalAmount,
        input.customerId
      );
      discountAmount = couponResult.discountAmount;
    } catch {
      // If coupon is invalid, proceed without discount — placeOrder will re-validate
      logger.warn('Coupon validation failed during Razorpay initiation, proceeding without discount', {
        couponCode: input.couponCode,
      });
    }
  }

  const totalAmount = Math.max(0, subtotalAmount - discountAmount);
  const amountInPaise = Math.round(totalAmount * 100);

  // 5. Create Razorpay order (no receipt needed — we don't have an order number yet)
  let rpOrder: { id: string };
  try {
    rpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
    }) as { id: string };
  } catch (error) {
    logger.error('Failed to create Razorpay order during session initiation', { error });
    throw new AppError('INTERNAL_SERVER_ERROR', 'Failed to initialize payment gateway', 500);
  }

  logger.info('Razorpay session initiated successfully', {
    razorpayOrderId: rpOrder.id,
    amount: totalAmount,
  });

  return {
    razorpayOrderId: rpOrder.id,
    amount: totalAmount,
    currency: 'INR',
  };
}
