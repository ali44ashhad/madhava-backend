import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { handlePaymentCaptured, handleRefundProcessed } from './razorpay.webhook.service.js';
import { RazorpayWebhookEvent } from './razorpay.webhook.types.js';

/**
 * Calculate HMAC SHA256 signature
 */
function calculateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Razorpay Webhook Controller
 * 
 * 1. Verifies X-Razorpay-Signature
 * 2. Parses event
 * 3. Delegates to service
 * 4. Always returns 200 (unless signature fail)
 */
export const razorpayWebhookController = async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'] as string;
    const secret = env.razorpayWebhookSecret;

    // 1. Signature Verification
    // req.body should be a Buffer because we used express.raw()
    // We convert it to string for logging/parsing, but use buffer/string for signature?
    // crypto.update() accepts string or buffer.
    const rawBody = req.body;

    if (!signature) {
        logger.warn('Razorpay webhook missing signature header');
        res.status(400).json({ error: 'Missing signature' });
        return
    }

    // Ensure rawBody is available (it might be empty string or {} if middleware setup wrong)
    // If express.json() ran first, req.body is object. We need raw buffer/string.
    // We will enforce raw middleware in routes.

    // Safe conversion to string for signature check if it's a buffer
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

    // Note: if express.raw() is used, req.body is Buffer.
    // If express.json() is used, req.body is Object.
    // Validation relies on exact raw body.

    const expectedSignature = calculateSignature(bodyString, secret);

    if (signature !== expectedSignature) {
        logger.error('Invalid Razorpay webhook signature', {
            received: signature,
            expected: expectedSignature,
        });
        res.status(400).json({ error: 'Invalid signature' });
        return
    }

    // 2. Parse Event
    let event: RazorpayWebhookEvent;
    try {
        event = JSON.parse(bodyString);
    } catch (error) {
        logger.error('Failed to parse Razorpay webhook body', { error });
        res.status(400).json({ error: 'Invalid JSON' });
        return
    }

    const eventType = event.event;
    // logger.info('Received Razorpay webhook', { event: eventType, id: event.payload?.payment?.entity?.id || 'unknown' });
    // Avoid logging full payload secrets.

    try {
        // 3. Handle Events
        switch (eventType) {
            case 'payment.captured':
                await handlePaymentCaptured(event.payload);
                break;
            case 'refund.processed':
                await handleRefundProcessed(event.payload);
                break;
            // Add other events here if needed
            default:
                logger.info('Ignoring unhandled Razorpay event', { event: eventType });
        }
    } catch (error) {
        // Log logic errors but do NOT return 500 to Razorpay
        // returning 500 causes retries which might be bad if logic is permanently broken
        logger.error('Error processing Razorpay webhook', { event: eventType, error });
    }

    // 4. Always return 200 OK
    res.status(200).json({ status: 'ok' });
};
