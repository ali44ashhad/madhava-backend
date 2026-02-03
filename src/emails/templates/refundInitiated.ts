import { RefundInitiatedData, EmailTemplate } from '../email.types.js';

export function refundInitiatedTemplate(data: RefundInitiatedData): EmailTemplate {
    return {
        subject: `Refund Initiated - Order #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Refund Initiated</h2>
        <p>Hi ${data.customerName},</p>
        <p>A refund of <strong>₹${data.amount.toFixed(2)}</strong> has been initiated for your order #${data.orderNumber}.</p>
        <p><strong>Refund ID:</strong> ${data.refundId}</p>
        <p>It may take 5-7 business days for the amount to reflect in your account.</p>
      </div>
    `,
    };
}
