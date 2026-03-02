/**
 * Razorpay Webhook Types
 * Defines the structure of payloads received from Razorpay webhooks
 */

/**
 * Common entity properties
 */
export interface RazorpayEntity {
    id: string;
    entity: string;
    [key: string]: any;
}

/**
 * Payment entity from Razorpay
 */
export interface RazorpayPaymentEntity extends RazorpayEntity {
    entity: 'payment';
    amount: number;
    currency: string;
    status: string;
    order_id: string;
    method: string;
    email: string;
    contact: string;
}

/**
 * Refund entity from Razorpay
 */
export interface RazorpayRefundEntity extends RazorpayEntity {
    entity: 'refund';
    amount: number;
    currency: string;
    payment_id: string;
    status: string;
    notes: Record<string, any>;
}

/**
 * Event payload structure
 */
export interface RazorpayEventPayload {
    entity: RazorpayEntity;
}

/**
 * Payment Captured Payload
 */
export interface PaymentCapturedPayload {
    payment: {
        entity: RazorpayPaymentEntity;
    };
}

/**
 * Refund Processed Payload
 */
export interface RefundProcessedPayload {
    refund: {
        entity: RazorpayRefundEntity;
    };
    payment?: {
        entity: RazorpayPaymentEntity;
    };
}

/**
 * Payment Failed Payload
 */
export interface PaymentFailedPayload {
    payment: {
        entity: RazorpayPaymentEntity & {
            error_code: string;
            error_description: string;
            error_source: string;
            error_step: string;
            error_reason: string;
        };
    };
}

/**
 * Main Webhook Event structure
 */
export interface RazorpayWebhookEvent {
    entity: string;
    account_id: string;
    event: 'payment.captured' | 'payment.failed' | 'refund.processed' | string;
    contains: string[];
    payload: PaymentCapturedPayload | PaymentFailedPayload | RefundProcessedPayload | any;
    created_at: number;
}
