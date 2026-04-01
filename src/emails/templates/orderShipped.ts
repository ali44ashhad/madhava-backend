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
        ${data.trackingLink ? `<p><a href="${data.trackingLink}" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #88013C; color: #ffffff; text-decoration: none; border-radius: 5px; margin-top: 10px;">Track Your Order</a></p>` : ''}
        <p>You can expect delivery soon.</p>
      </div>
    `,
  };
}
