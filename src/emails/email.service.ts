import { EmailClient } from './email.client.js';
import {
    OrderPlacedData,
    OrderApprovedData,
    OrderShippedData,
    OrderDeliveredData,
    ReturnRequestedData,
    ReturnApprovedData,
    ReturnRejectedData,
    RefundInitiatedData,
} from './email.types.js';
import { orderPlacedTemplate } from './templates/orderPlaced.js';
import { orderApprovedTemplate } from './templates/orderApproved.js';
import { orderShippedTemplate } from './templates/orderShipped.js';
import { orderDeliveredTemplate } from './templates/orderDelivered.js';
import { returnRequestedTemplate } from './templates/returnRequested.js';
import { returnApprovedTemplate } from './templates/returnApproved.js';
import { returnRejectedTemplate } from './templates/returnRejected.js';
import { refundInitiatedTemplate } from './templates/refundInitiated.js';
import { logger } from '../utils/logger.js';

export class EmailService {
    private client: EmailClient;

    constructor() {
        this.client = EmailClient.getInstance();
    }

    /**
     * Helper to send email safely without throwing
     */
    private async sendSafely(
        to: string,
        templateFn: (data: any) => { subject: string; html: string },
        data: any,
        context: string
    ): Promise<void> {
        try {
            const { subject, html } = templateFn(data);
            await this.client.sendEmail(to, subject, html);
        } catch (error) {
            logger.error(`Failed to send ${context} email`, {
                error: error instanceof Error ? error.message : String(error),
                to,
                data,
            });
            // Do not throw - email is side effect
        }
    }

    async sendOrderPlaced(to: string, data: OrderPlacedData): Promise<void> {
        await this.sendSafely(to, orderPlacedTemplate, data, 'ORDER_PLACED');
    }

    async sendOrderApproved(to: string, data: OrderApprovedData): Promise<void> {
        await this.sendSafely(to, orderApprovedTemplate, data, 'ORDER_APPROVED');
    }

    async sendOrderShipped(to: string, data: OrderShippedData): Promise<void> {
        await this.sendSafely(to, orderShippedTemplate, data, 'ORDER_SHIPPED');
    }

    async sendOrderDelivered(to: string, data: OrderDeliveredData): Promise<void> {
        await this.sendSafely(to, orderDeliveredTemplate, data, 'ORDER_DELIVERED');
    }

    async sendReturnRequested(to: string, data: ReturnRequestedData): Promise<void> {
        await this.sendSafely(to, returnRequestedTemplate, data, 'RETURN_REQUESTED');
    }

    async sendReturnApproved(to: string, data: ReturnApprovedData): Promise<void> {
        await this.sendSafely(to, returnApprovedTemplate, data, 'RETURN_APPROVED');
    }

    async sendReturnRejected(to: string, data: ReturnRejectedData): Promise<void> {
        await this.sendSafely(to, returnRejectedTemplate, data, 'RETURN_REJECTED');
    }

    async sendRefundInitiated(to: string, data: RefundInitiatedData): Promise<void> {
        await this.sendSafely(to, refundInitiatedTemplate, data, 'REFUND_INITIATED');
    }
}

export const emailService = new EmailService();
