import { OrderApprovedData, EmailTemplate } from '../email.types.js';

export function orderApprovedTemplate(data: OrderApprovedData): EmailTemplate {
    return {
        subject: `Order Confirmed - #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Confirmed!</h2>
        <p>Hi ${data.customerName},</p>
        <p>Good news! Your order #${data.orderNumber} has been confirmed and is being prepared for shipping.</p>
        <p>You will receive another email with tracking details once it ships.</p>
      </div>
    `,
    };
}
