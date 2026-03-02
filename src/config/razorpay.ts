import Razorpay from 'razorpay';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * Razorpay SDK Instance
 */
export let razorpay: Razorpay;

try {
    razorpay = new Razorpay({
        key_id: env.razorpayKeyId,
        key_secret: env.razorpayKeySecret,
    });
    logger.info('Razorpay SDK initialized successfully');
} catch (error) {
    logger.error('Failed to initialize Razorpay SDK', { error });
    // We don't throw here to allow the server to start even if Razorpay is misconfigured,
    // but any attempt to use Razorpay will fail later.
}
