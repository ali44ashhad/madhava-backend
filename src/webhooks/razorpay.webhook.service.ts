import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';
import { PaymentStatus, RefundStatus } from '@prisma/client';
import { PaymentCapturedPayload, RefundProcessedPayload } from './razorpay.webhook.types.js';

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

    // 3. Update status
    await prisma.payment.update({
        where: { id: payment.id },
        data: {
            status: PaymentStatus.PAID,
        },
    });

    logger.info('Payment updated to PAID', { id: payment.id, razorpayPaymentId: paymentId });
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
    // We need to find the payment linked to the same order.
    // There should typically be one successful payment per order.
    const relevantPayment = await prisma.payment.findFirst({
        where: {
            orderId: refund.orderId,
            status: PaymentStatus.PAID
        }
    });

    // 4. Update Refund and Payment safely in transaction
    if (relevantPayment) {
        await prisma.$transaction([
            prisma.refund.update({
                where: { id: refund.id },
                data: { status: RefundStatus.COMPLETED }
            }),
            prisma.payment.update({
                where: { id: relevantPayment.id },
                data: { status: PaymentStatus.REFUNDED }
            })
        ]);
        logger.info('Refund processed and Payment updated', { refundId, paymentId: relevantPayment.id });
    } else {
        // Just update refund if payment not found (corner case)
        await prisma.refund.update({
            where: { id: refund.id },
            data: { status: RefundStatus.COMPLETED }
        });
        logger.warn('Refund processed but associated PAID payment not found', { refundId, orderId: refund.orderId });
    }
}
