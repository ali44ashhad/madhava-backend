import { OrderDeliveredData, EmailTemplate } from '../email.types.js';

export function orderDeliveredTemplate(data: OrderDeliveredData): EmailTemplate {
    return {
        subject: `Order Delivered - #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Delivered!</h2>
        <p>Hi ${data.customerName},</p>
        <p>Your order #${data.orderNumber} has been delivered successfully.</p>
        <p>We hope you love your purchase!</p>
      </div>
    `,
    };
}
