import { OrderPlacedData, EmailTemplate } from '../email.types.js';

export function orderPlacedTemplate(data: OrderPlacedData): EmailTemplate {
    const itemsHtml = data.items
        .map(
            (item) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.productName} (${item.skuCode})</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">₹${item.price.toFixed(2)}</td>
    </tr>
  `
        )
        .join('');

    return {
        subject: `Order Confirmation - #${data.orderNumber}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Order Placed Successfully!</h2>
        <p>Hi ${data.customerName},</p>
        <p>Thank you for your order. We have received it and will process it shortly.</p>
        
        <h3>Order Details (#${data.orderNumber})</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color: #f8f8f8; text-align: left;">
              <th style="padding: 10px;">Item</th>
              <th style="padding: 10px;">Qty</th>
              <th style="padding: 10px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 10px; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 10px; font-weight: bold;">₹${data.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        <p>We'll notify you when your order is shipped.</p>
      </div>
    `,
    };
}
