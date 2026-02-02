import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createCustomer } from '../services/customer.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create customer request body
 */
const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required and cannot be empty').trim(),
  email: z.string().email('Invalid email format').trim().toLowerCase(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits (optionally prefixed with +)')
    .trim(),
});

/**
 * Create customer controller
 * POST /api/v1/store/customers
 * 
 * Validates request body and calls customer service to create customer
 */
export async function createCustomerController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create customer request received', {
      email: req.body?.email,
    });

    // Validate request body
    const validationResult = createCustomerSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { name, email, phone } = validationResult.data;

    logger.info('Validation passed, calling create customer service', {
      email,
      name,
    });

    // Call service to create customer
    const result = await createCustomer({
      name,
      email,
      phone,
    });

    logger.info('Customer created successfully', {
      customerId: result.customerId,
    });

    // Return success response
    const response = createSuccessResponse({
      customerId: result.customerId,
    });

    res.status(201).json(response);
    return;
  } catch (error) {
    logger.error('Error in create customer controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error); // Pass error to error middleware
  }
}

