import { ReturnRejectedData, EmailTemplate } from '../email.types.js';

export function returnRejectedTemplate(data: ReturnRejectedData): EmailTemplate {
    return {
        subject: `Update on Return Request - Order #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Return Request Rejected</h2>
        <p>Hi ${data.customerName},</p>
        <p>We regret to inform you that your return request for order #${data.orderNumber} (Return ID: ${data.returnId}) has been rejected.</p>
        <p><strong>Reason:</strong> ${data.reason}</p>
        <p>If you have any questions, please contact our support team.</p>
      </div>
    `,
    };
}
