import { ReturnApprovedData, EmailTemplate } from '../email.types.js';

export function returnApprovedTemplate(data: ReturnApprovedData): EmailTemplate {
    return {
        subject: `Return Approved - Order #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Return Request Approved</h2>
        <p>Hi ${data.customerName},</p>
        <p>Your return request for order #${data.orderNumber} (Return ID: ${data.returnId}) has been approved.</p>
        <p>Please follow the instructions provided to ship the item back to us.</p>
      </div>
    `,
    };
}
