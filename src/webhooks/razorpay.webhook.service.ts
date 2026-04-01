import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, RefundStatus, OrderStatus } from '@prisma/client';
import { PaymentCapturedPayload, RefundProcessedPayload, PaymentFailedPayload } from './razorpay.webhook.types.js';

/**
 * Handle 'payment.captured' event
 * Updates Payment status to PAID
 * Idempotent: Ignores if already PAID
 */
export async function handlePaymentCaptured(payload: PaymentCapturedPayload): Promise<void> {
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id; // Note: razorpay order id, not our internal order id if different

    logger.info('Handling payment.captured', { paymentId, orderId });

    // 1. Find Payment by reference (which stores the razorpay_payment_id or razorpay_order_id depending on flow)
    // In our case, we likely stored the razorpay_order_id as reference or we need to find by matching amount/order
    // However, the best practice is to store the razorpay_payment_id if available, or search by order relation.
    // Let's assume 'reference' in Payment model stores the razorpay payment ID or order ID.
    // Actually, standard Razorpay flow:
    // Order created in system -> Order created in Razorpay (rp_order_id) -> Payment created in Razorpay (rp_pay_id)
    // We need to link back to our system's Payment record.
    // Verification: The Payment record in our DB is likely created when the user initiates payment or after success logic on frontend.
    // If we created it with status PENDING and reference = razorpay_order_id, we can find it.

    // Strategy: Find payment where reference matches paymentId OR associated order's payment reference matches
    // But wait, the payload has 'notes' which might contain our internal orderId if we sent it.
    // If not, we rely on the fact that we might have stored the razorpay_order_id in the Payment record or Order record.

    // Let's look at order.service.ts -> placeOrder -> Payment created with Input Reference.
    // Input Reference is typically the Razorpay Order ID (e.g. order_DaZ...).
    // The webhook payload contains `payment.entity.order_id` which acts as the foreign key to Razorpay Order.
    // So we should find the Payment record where `reference` equals `payment.entity.order_id`.

    const razorpayOrderId = paymentEntity.order_id;

    const payment = await prisma.payment.findFirst({
        where: {
            reference: razorpayOrderId,
        },
    });

    if (!payment) {
        logger.warn('Payment record not found for webhook event', { razorpayOrderId, paymentId });
        return;
    }

    // 2. Idempotency check
    if (payment.status === PaymentStatus.PAID) {
        logger.info('Payment already marked as PAID, ignoring event', { id: payment.id });
        return;
    }

    // 3. Update status and store gateway payment id in a transaction
    await prisma.$transaction([
        prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: PaymentStatus.PAID,
                gatewayPaymentId: paymentId,
            },
        }),
        prisma.order.update({
            where: { id: payment.orderId },
            data: {
                paymentStatus: PaymentStatus.PAID,
            },
        })
    ]);

    logger.info('Payment updated to PAID', { id: payment.id, razorpayPaymentId: paymentId, razorpayOrderId });
}

/**
 * Handle 'payment.failed' event
 * Updates Payment status to FAILED and Order status to CANCELLED
 * Restores stock for all SKUs in the order
 */
export async function handlePaymentFailed(payload: PaymentFailedPayload): Promise<void> {
    const paymentEntity = payload.payment.entity;
    const paymentId = paymentEntity.id;
    const razorpayOrderId = paymentEntity.order_id;
    const errorDescription = paymentEntity.error_description || paymentEntity.error_reason || 'Payment failed';

    logger.info('Handling payment.failed', { paymentId, razorpayOrderId, errorDescription });

    const payment = await prisma.payment.findFirst({
        where: {
            reference: razorpayOrderId,
            order: {
                paymentStatus: {
                    in: [PaymentStatus.PENDING, PaymentStatus.FAILED]
                }
            }
        },
        include: { order: true }
    });

    if (!payment) {
        logger.warn('Pending Payment record not found for failed webhook event', { razorpayOrderId, paymentId });
        return;
    }

    if (payment.status === PaymentStatus.FAILED && payment.order.status === OrderStatus.CANCELLED) {
        logger.info('Payment already marked as FAILED and Order CANCELLED, ignoring event', { id: payment.id });
        return;
    }

    // We only restore stock if the order wasn't ALREADY cancelled
    // (In case another webhook or admin already cancelled it)
    const shouldRestoreStock = payment.order.status !== OrderStatus.CANCELLED;

    // Get order items to restore stock
    const orderItems = shouldRestoreStock ? await prisma.orderItem.findMany({
        where: { orderId: payment.orderId },
        select: { skuId: true, quantity: true }
    }) : [];

    await prisma.$transaction(async (tx) => {
        // 1. Mark payment as failed
        await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.FAILED }
        });

        // 2. Mark order as cancelled and payment failed
        await tx.order.update({
            where: { id: payment.orderId },
            data: {
                status: OrderStatus.CANCELLED,
                paymentStatus: PaymentStatus.FAILED,
                cancelledAt: new Date()
            }
        });

        // 3. Restore stock if needed
        if (shouldRestoreStock && orderItems.length > 0) {
            for (const item of orderItems) {
                await tx.sku.update({
                    where: { id: item.skuId },
                    data: {
                        stockQuantity: { increment: item.quantity }
                    }
                });
            }
            logger.info('Stock restored for failed payment', { orderId: payment.orderId, itemsCount: orderItems.length });
        }
    });

    logger.info('Payment updated to FAILED and Order CANCELLED', { id: payment.id, razorpayPaymentId: paymentId });
}

/**
 * Handle 'refund.processed' event
 * Updates Refund status to COMPLETED and Payment status to REFUNDED
 * Idempotent: Ignores if already COMPLETED
 */
export async function handleRefundProcessed(payload: RefundProcessedPayload): Promise<void> {
    const refundEntity = payload.refund.entity;
    const refundId = refundEntity.id; // razorpay refund id (e.g. rfnd_...)
    const paymentId = refundEntity.payment_id;
    const notes = refundEntity.notes || {};
    const returnIdsRaw = typeof notes.returnIds === 'string' ? notes.returnIds : '';
    const returnIds = returnIdsRaw
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean);

    logger.info('Handling refund.processed', { refundId, paymentId });

    // 1. Find Refund by reference
    // We assume the refund reference (e.g. rfnd_...) is stored in the Refund model
    const refund = await prisma.refund.findFirst({
        where: {
            reference: refundId,
        },
    });

    if (!refund) {
        logger.warn('Refund record not found for webhook event', { refundId });
        return;
    }

    // 2. Idempotency check
    if (refund.status === RefundStatus.COMPLETED) {
        logger.info('Refund already marked as COMPLETED, ignoring event', { id: refund.id });
        return;
    }

    // 3. Find associated payment to update
    // There should typically be one successful payment per order.
    const relevantPayment = await prisma.payment.findFirst({
        where: {
            orderId: refund.orderId,
            status: PaymentStatus.PAID
        }
    });

    // 4. Update Refund, Payment, and Order safely in a transaction
    if (relevantPayment) {
        await prisma.$transaction(async (tx) => {
            // Mark this refund as completed
            await tx.refund.update({
                where: { id: refund.id },
                data: { status: RefundStatus.COMPLETED }
            });

            // Recalculate total refunded amount for the order (only COMPLETED refunds)
            const completedRefunds = await tx.refund.findMany({
                where: {
                    orderId: refund.orderId,
                    status: RefundStatus.COMPLETED
                }
            });

            const totalRefunded = completedRefunds.reduce(
                (sum, r) => sum + Number(r.amount),
                0
            );

            // Fetch order totals to decide if fully refunded
            const order = await tx.order.findUnique({
                where: { id: refund.orderId }
            });

            if (!order) {
                logger.warn('Order not found while processing refund webhook', { orderId: refund.orderId });
                // Still mark payment as REFUNDED for safety
                await tx.payment.update({
                    where: { id: relevantPayment.id },
                    data: { status: PaymentStatus.REFUNDED }
                });
                return;
            }

            // Use the captured PAID payment amount as our source-of-truth for "fully refunded".
            // (Order subtotal/gst/discount logic can vary; payment.amount is what was actually captured.)
            const refundableTotal = Number(relevantPayment.amount);

            const isFullyRefunded = totalRefunded >= refundableTotal;

            // Always mark the captured payment as REFUNDED once at least one refund completes
            await tx.payment.update({
                where: { id: relevantPayment.id },
                data: {
                    status: PaymentStatus.REFUNDED
                }
            });

            // If the refund notes included specific return ids, mark only those returns as REFUNDED now
            // (we intentionally do NOT mark returns as REFUNDED during initiation).
            if (returnIds.length > 0) {
                await tx.return.updateMany({
                    where: {
                        id: { in: returnIds },
                        status: 'RECEIVED'
                    },
                    data: {
                        status: 'REFUNDED'
                    }
                });
            }

            // If fully refunded, also update order paymentStatus and status
            if (isFullyRefunded) {
                await tx.order.update({
                    where: { id: refund.orderId },
                    data: {
                        paymentStatus: PaymentStatus.REFUNDED,
                        status: OrderStatus.REFUNDED
                    }
                });
            }

            logger.info('Refund processed and local state updated', {
                refundId,
                paymentId: relevantPayment.id,
                totalRefunded,
                refundableTotal,
                isFullyRefunded
            });
        });
    } else {
        // Just update refund if payment not found (corner case)
        await prisma.refund.update({
            where: { id: refund.id },
            data: { status: RefundStatus.COMPLETED }
        });
        logger.warn('Refund processed but associated PAID payment not found', { refundId, orderId: refund.orderId });
    }
}
