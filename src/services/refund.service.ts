import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderStatus, PaymentMethod, PaymentStatus, RefundStatus } from '@prisma/client';

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
export async function initiateRefund(orderId: string, adminId: string): Promise<InitiateRefundResult> {
  logger.info('Initiate refund request', { orderId, adminId });

  // Fetch order with refunds and payments
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      refunds: {
        select: {
          id: true,
          status: true,
        },
      },
      payments: {
        select: {
          id: true,
          status: true,
        },
      },
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

  // Validate order status is CANCELLED or RETURN_APPROVED
  if (order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.RETURN_APPROVED) {
    throw new AppError(
      'INVALID_STATE',
      `Refund can only be initiated for CANCELLED or RETURN_APPROVED orders. Current status: ${order.status}`,
      400
    );
  }

  // Validate no existing refund
  if (order.refunds.length > 0) {
    throw new AppError(
      'INVALID_STATE',
      `Refund already exists for order '${orderId}'`,
      400
    );
  }

  // Calculate refund amount: subtotalAmount + gstAmount (exclude codFee)
  const refundAmount = Number(order.subtotalAmount) + Number(order.gstAmount);

  logger.info('Refund amount calculated', {
    orderId,
    subtotalAmount: Number(order.subtotalAmount),
    gstAmount: Number(order.gstAmount),
    codFee: Number(order.codFee),
    refundAmount,
  });

  // Execute refund initiation in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create refund record
    const refund = await tx.refund.create({
      data: {
        orderId,
        amount: new Decimal(refundAmount),
        status: RefundStatus.PENDING,
      },
    });

    // Update order payment status and order status
    await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        status: OrderStatus.REFUNDED,
      },
    });

    // Update all payment records for this order to REFUNDED (for consistency)
    await tx.payment.updateMany({
      where: { orderId },
      data: {
        status: PaymentStatus.REFUNDED,
      },
    });

    logger.info('Refund created and order/payment status updated', {
      refundId: refund.id,
      orderId,
      orderNumber: order.orderNumber,
      refundAmount,
      previousOrderStatus: order.status,
      newOrderStatus: OrderStatus.REFUNDED,
      previousPaymentStatus: order.paymentStatus,
      newPaymentStatus: PaymentStatus.REFUNDED,
      adminId,
    });

    return {
      refundId: refund.id,
      orderId,
      amount: refundAmount,
    };
  });

  logger.info('Refund initiated successfully', {
    refundId: result.refundId,
    orderId,
    adminId,
    action: 'INITIATE_REFUND',
    amount: result.amount,
  });

  return result;
}


