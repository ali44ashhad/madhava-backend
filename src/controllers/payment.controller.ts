import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { initiateRazorpaySession } from '../services/payment.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

const initiateRazorpaySchema = z.object({
  addressId: z.string().uuid('Invalid address ID format'),
  items: z
    .array(
      z.object({
        skuId: z.string().uuid('Invalid SKU ID format'),
        quantity: z
          .number()
          .int('Quantity must be an integer')
          .positive('Quantity must be greater than 0'),
      })
    )
    .min(1, 'At least one item is required'),
  couponCode: z.string().optional(),
});

/**
 * POST /api/v1/store/payments/razorpay/initiate
 *
 * Creates a Razorpay Order ID (session) without writing anything to the DB.
 * The client uses this ID to open the Razorpay checkout popup.
 * The actual order is created only after payment succeeds and the HMAC
 * signature is verified server-side.
 */
export async function initiateRazorpayController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.customer) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const validation = initiateRazorpaySchema.safeParse(req.body);
    if (!validation.success) {
      const messages = validation.error.issues.map((i) => i.message).join(', ');
      throw new AppError('VALIDATION_ERROR', messages, 400);
    }

    const { addressId, items, couponCode } = validation.data;

    logger.info('Razorpay initiate request received', {
      customerId: req.customer.id,
      addressId,
      itemCount: items.length,
    });

    const result = await initiateRazorpaySession({
      customerId: req.customer.id,
      addressId,
      items,
      couponCode,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (error) {
    return next(error);
  }
}
