import { OrderShippedData, EmailTemplate } from '../email.types.js';

export function orderShippedTemplate(data: OrderShippedData): EmailTemplate {
    return {
        subject: `Order Shipped - #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Order is on the Way!</h2>
        <p>Hi ${data.customerName},</p>
        <p>Your order #${data.orderNumber} has been shipped via ${data.courier}.</p>
        <p><strong>Tracking ID:</strong> ${data.trackingId}</p>
        <p>You can expect delivery soon.</p>
      </div>
    `,
    };
}
