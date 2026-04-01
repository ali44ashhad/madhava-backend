import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Prisma, OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '@prisma/client';
import { razorpay } from '../config/index.js';

/**
 * Initiate refund result
 */
export interface InitiateRefundResult {
  refundId: string;
  orderId: string;
  amount: number;
}

/**
 * Initiate refund service
 * Creates a refund record and updates order/payment status
 * 
 * Validations:
 * - Order must exist
 * - Payment method must NOT be COD
 * - Order status must be CANCELLED (prepaid) or RETURN_APPROVED
 * - Refund must not already exist for the order
 * 
 * Refund amount calculation:
 * - subtotalAmount + gstAmount
 * - EXCLUDE codFee (always)
 * 
 * Behavior:
 * - Creates Refund record with status = PENDING
 * - Updates Order.paymentStatus to REFUNDED
 * - Updates Order.status to REFUNDED
 * - Updates Payment.status to REFUNDED (for consistency)
 * - Logs admin action
 */
export async function initiateRefund(orderId: string, adminId: string, amount?: number): Promise<InitiateRefundResult> {
  logger.info('Initiate refund request', { orderId, adminId });

  // Fetch order with refunds and payments
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      refunds: true,
      payments: true,
    },
  });

  if (!order) {
    throw new AppError('NOT_FOUND', `Order with id '${orderId}' not found`, 404);
  }

  // Validate payment method is NOT COD
  if (order.paymentMethod === PaymentMethod.COD) {
    throw new AppError(
      'INVALID_STATE',
      'Refunds are not allowed for COD orders',
      400
    );
  }

  // For cancelled orders, we check order status directly.
  // For returns, we check that the order has at least one received return.
  const hasReceivedReturn = await prisma.return.findFirst({
    where: {
      orderItem: { orderId },
      status: 'RECEIVED',
    },
  });

  if (order.status !== OrderStatus.CANCELLED && !hasReceivedReturn) {
    throw new AppError(
      'INVALID_STATE',
      `Refund can only be initiated for CANCELLED orders or orders with a RECEIVED return. Current status: ${order.status}`,
      400
    );
  }

  // Validate payment was actually captured (prevent refunding unpaid/abandoned orders)
  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw new AppError(
      'INVALID_STATE',
      `Refund can only be initiated when payment has been captured. Current payment status: ${order.paymentStatus}`,
      400
    );
  }

  // Validate there is a successful Razorpay payment we can refund against
  const successfulPayment = order.payments.find(
    (p) => p.status === PaymentStatus.PAID && p.provider === PaymentMethod.RAZORPAY
  );

  if (!successfulPayment) {
    throw new AppError(
      'INVALID_STATE',
      'No successful Razorpay payment found for this order to refund against',
      400
    );
  }

  if (!successfulPayment.gatewayPaymentId) {
    throw new AppError(
      'INVALID_STATE',
      'Missing Razorpay payment id for this order. Cannot initiate refund.',
      500
    );
  }

  // IMPORTANT:
  // Refund cap must never exceed the amount actually captured by Razorpay.
  // Our safest source-of-truth is the PAID Payment.amount we stored.
  const capturedAmount = Number(successfulPayment.amount);

  // Calculate already refunded amount (only COMPLETED refunds count against the cap)
  const alreadyRefundedAmount = order.refunds
    .filter((r) => r.status === RefundStatus.COMPLETED)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const maxRefundableAmount = capturedAmount - alreadyRefundedAmount;

  if (maxRefundableAmount <= 0) {
    throw new AppError(
      'INVALID_STATE',
      'Order has already been fully refunded',
      400
    );
  }

  // If refund is being initiated due to a RECEIVED return and the caller did not provide a manual amount,
  // default to refunding only the value of items actually received back (proportionally adjusting coupon discount).
  let computedReturnRefundAmount: number | undefined;
  let receivedReturnIdsToMarkRefunded: string[] = [];

  if (amount === undefined && order.status !== OrderStatus.CANCELLED) {
    const receivedReturns = await prisma.return.findMany({
      where: {
        orderItem: { orderId },
        status: 'RECEIVED',
      },
      select: {
        id: true,
        orderItem: {
          select: {
            totalPrice: true,
            netTotalPrice: true,
          },
        },
      },
    });

    const returnedNetTotal = receivedReturns.reduce((sum, r) => {
      const net = r.orderItem.netTotalPrice;
      return sum + (net === null ? 0 : Number(net));
    }, 0);

    const hasNetTotalsForAll = receivedReturns.length > 0 && receivedReturns.every((r) => r.orderItem.netTotalPrice !== null);

    if (hasNetTotalsForAll && returnedNetTotal > 0) {
      // Preferred path: refund exactly what customer paid for returned items.
      computedReturnRefundAmount = Math.round(returnedNetTotal * 100) / 100;
      receivedReturnIdsToMarkRefunded = receivedReturns.map((r) => r.id);
    } else {
      // Legacy fallback: prorate order-level discount across returned items by their (gross) totals.
      const returnedSubtotal = receivedReturns.reduce(
        (sum, r) => sum + Number(r.orderItem.totalPrice),
        0
      );

      // Guard: should not happen given hasReceivedReturn, but keep it safe.
      if (returnedSubtotal > 0) {
        const orderSubtotal = Number(order.subtotalAmount);
        const orderDiscount = Number(order.discountAmount ?? 0);

        // Apply coupon discount proportionally to the returned subtotal (never exceeding returned subtotal).
        const proportionalDiscount =
          orderSubtotal > 0 ? (orderDiscount * returnedSubtotal) / orderSubtotal : 0;

        const refundableForReturns = Math.max(0, returnedSubtotal - proportionalDiscount);

        computedReturnRefundAmount = Math.round(refundableForReturns * 100) / 100;
        receivedReturnIdsToMarkRefunded = receivedReturns.map((r) => r.id);
      }
    }
  }

  // Determine requested refund amount (rounded to 2 decimals for paise safety)
  const requestedAmountRaw = amount ?? computedReturnRefundAmount ?? maxRefundableAmount;
  const requestedAmount = Math.round(requestedAmountRaw * 100) / 100;

  if (requestedAmount <= 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Refund amount must be greater than zero',
      400
    );
  }

  if (requestedAmount > maxRefundableAmount) {
    throw new AppError(
      'VALIDATION_ERROR',
      `Refund amount exceeds maximum refundable amount. Max refundable: ${maxRefundableAmount}`,
      400
    );
  }

  // Prevent multiple concurrent pending refunds for the same order
  const hasPendingRefund = order.refunds.some(
    (r) => r.status === RefundStatus.PENDING
  );

  if (hasPendingRefund) {
    throw new AppError(
      'INVALID_STATE',
      'A refund is already pending for this order. Please wait until it is processed.',
      400
    );
  }

  logger.info('Refund amount calculated', {
    orderId,
    subtotalAmount: Number(order.subtotalAmount),
    gstAmount: Number(order.gstAmount),
    codFee: Number(order.codFee),
    capturedAmount,
    alreadyRefundedAmount,
    maxRefundableAmount,
    requestedAmount,
    computedReturnRefundAmount,
  });

  if (!razorpay) {
    throw new AppError(
      'INTERNAL_SERVER_ERROR',
      'Razorpay is not configured on the server',
      500
    );
  }

  // Execute refund initiation in transaction (DB changes only)
  const { refundId } = await prisma.$transaction(async (tx) => {
    // Create refund record in PENDING state
    const refund = await tx.refund.create({
      data: {
        orderId,
        amount: new Prisma.Decimal(requestedAmount),
        status: RefundStatus.PENDING,
      },
    });

    logger.info('Refund record created in PENDING state', {
      refundId: refund.id,
      orderId,
      orderNumber: order.orderNumber,
      requestedAmount,
      adminId,
    });

    return { refundId: refund.id };
  });

  // Create refund with Razorpay using the captured payment id
  const requestedAmountInPaise = Math.round(requestedAmount * 100);
  const maxRefundableInPaise = Math.round(maxRefundableAmount * 100);

  if (requestedAmountInPaise > maxRefundableInPaise) {
    // Extra safety against floating point issues
    throw new AppError(
      'VALIDATION_ERROR',
      `Refund amount exceeds maximum refundable amount. Max refundable: ${Math.round(maxRefundableInPaise) / 100}`,
      400
    );
  }

  try {
    const notes: Record<string, string> = {
      orderId,
      adminId,
      refundId,
    };

    if (receivedReturnIdsToMarkRefunded.length > 0) {
      notes.returnIds = receivedReturnIdsToMarkRefunded.join(',');
    }

    const razorpayRefund = await (razorpay as any).payments.refund(successfulPayment.gatewayPaymentId, {
      amount: requestedAmountInPaise,
      speed: 'normal',
      notes,
    });

    // Store Razorpay refund id on the Refund record; keep status PENDING until webhook confirms
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        reference: String(razorpayRefund.id),
      },
    });

    logger.info('Razorpay refund created', {
      refundId,
      orderId,
      adminId,
      requestedAmount,
      razorpayRefundId: String(razorpayRefund.id),
    });
  } catch (error) {
    logger.error('Failed to create Razorpay refund', {
      orderId,
      adminId,
      requestedAmount,
      error,
    });

    // Mark refund as FAILED if Razorpay call did not succeed
    await prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.FAILED,
      },
    });

    throw new AppError(
      'INTERNAL_SERVER_ERROR',
      'Failed to initiate refund with payment gateway',
      500
    );
  }

  logger.info('Refund initiation completed (awaiting Razorpay webhook)', {
    refundId,
    orderId,
    adminId,
    action: 'INITIATE_REFUND',
    amount: requestedAmount,
  });

  return {
    refundId,
    orderId,
    amount: requestedAmount,
  };
}



/**
 * Get refund details for email notification
 */
export async function getRefundDetailsForEmail(refundId: string) {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: {
      order: {
        include: {
          customer: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!refund) {
    throw new AppError('NOT_FOUND', `Refund with id '${refundId}' not found`, 404);
  }

  const order = refund.order;
  const customer = order.customer;
  const customerName = customer.name || 'Customer';

  return {
    refund,
    order,
    customerName,
    customerEmail: customer.email,
  };
}
