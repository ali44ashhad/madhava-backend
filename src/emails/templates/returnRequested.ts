import { ReturnRequestedData, EmailTemplate } from '../email.types.js';

export function returnRequestedTemplate(data: ReturnRequestedData): EmailTemplate {
    return {
        subject: `Return Requested - Order #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Return Request Received</h2>
        <p>Hi ${data.customerName},</p>
        <p>We have received your return request for an item in order #${data.orderNumber}.</p>
        <p><strong>Return ID:</strong> ${data.returnId}</p>
        <p>We will review your request and update you shortly.</p>
      </div>
    `,
    };
}
