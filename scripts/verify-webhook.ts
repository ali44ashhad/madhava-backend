import crypto from 'crypto';
import { env } from '../src/config/env.js';

// Configuration
const WEBHOOK_URL = `http://localhost:${env.port}/api/v1/webhooks/razorpay`;
const SECRET = env.razorpayWebhookSecret;

if (!SECRET) {
    console.error('❌ RAZORPAY_WEBHOOK_SECRET is missing in .env');
    process.exit(1);
}

// Dummy Payload for payment.captured
const paymentCapturedPayload = {
    "entity": "event",
    "account_id": "acc_BFSDk8r6a8954h",
    "event": "payment.captured",
    "contains": [
        "payment"
    ],
    "payload": {
        "payment": {
            "entity": {
                "id": "pay_Des7W3e45sDS",
                "entity": "payment",
                "amount": 50000,
                "currency": "INR",
                "status": "captured",
                "order_id": "order_DaZlswTDq912", // This needs to match an existing order ID or Reference in your local DB for full e2e
                "invoice_id": null,
                "international": false,
                "method": "upi",
                "amount_refunded": 0,
                "refund_status": null,
                "captured": true,
                "description": "Test Transaction",
                "card_id": null,
                "bank": null,
                "wallet": null,
                "vpa": "test@upi",
                "email": "gaurav.kumar@example.com",
                "contact": "+919999999999"
            }
        }
    },
    "created_at": 1567674266
};

// Calculate Signature
const payloadString = JSON.stringify(paymentCapturedPayload);
const signature = crypto
    .createHmac('sha256', SECRET)
    .update(payloadString)
    .digest('hex');

console.log(`Payload: ${payloadString}`);
console.log(`Signature: ${signature}`);
console.log(`Sending request to ${WEBHOOK_URL}...`);

// Send Request
async function verifyWebhook() {
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Razorpay-Signature': signature
            },
            body: payloadString
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Webhook Verified Successfully!');
            console.log('Response:', data);
        } else {
            console.error('❌ Webhook Failed!');
            console.error('Status:', response.status);
            console.error('Response:', data);
        }

    } catch (error) {
        console.error('❌ Error sending webhook:', error);
    }
}

verifyWebhook();
