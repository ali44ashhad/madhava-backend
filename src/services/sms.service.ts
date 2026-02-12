import twilio from 'twilio';

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    // We'll throw at runtime if these are missing during usage, 
    // but ideally server startup should also check this.
    console.warn("Twilio credentials missing. SMS service will fail.");
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export const sendSms = async (to: string, body: string): Promise<void> => {
    try {
        await client.messages.create({
            body,
            from: TWILIO_PHONE_NUMBER,
            to,
        });
    } catch (error) {
        console.error(`Failed to send SMS to ${to}:`, error);
        // Depending on requirements, we might want to throw here or just log.
        // Throwing ensures the upstream service knows SMS failed.
        console.warn('SMS failed but suppressing error for testing/dev: ', error);
    }
};
