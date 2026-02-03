import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class EmailClient {
    private static instance: EmailClient;
    private client: SESClient;

    private constructor() {
        this.client = new SESClient({
            region: env.sesRegion,
            credentials: {
                accessKeyId: env.sesAccessKeyId,
                secretAccessKey: env.sesSecretAccessKey,
            },
        });
    }

    public static getInstance(): EmailClient {
        if (!EmailClient.instance) {
            EmailClient.instance = new EmailClient();
        }
        return EmailClient.instance;
    }

    /**
     * Send an email using SES
     */
    public async sendEmail(
        to: string,
        subject: string,
        htmlBody: string
    ): Promise<void> {
        try {
            const command = new SendEmailCommand({
                Source: env.emailFromAddress,
                Destination: {
                    ToAddresses: [to],
                },
                Message: {
                    Subject: {
                        Data: subject,
                        Charset: 'UTF-8',
                    },
                    Body: {
                        Html: {
                            Data: htmlBody,
                            Charset: 'UTF-8',
                        },
                    },
                },
            });

            const response = await this.client.send(command);
            logger.info(`Email sent successfully to ${to}`, {
                messageId: response.MessageId,
                subject,
            });
        } catch (error) {
            logger.error('Failed to send email via SES', {
                error: error instanceof Error ? error.message : String(error),
                to,
                subject,
            });
            // specific requirement: Do NOT throw error to prevent order flow interruption
        }
    }
}
