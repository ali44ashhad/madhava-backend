import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { login } from '../services/admin-auth.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
/**
 * Zod schema for login request body
 */
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Admin login controller
 * Validates input and calls service to authenticate admin
 */
export async function adminLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    logger.info('Login request received', { email: req.body?.email });
    
    // Validate request body
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { email, password } = validationResult.data;
    logger.info('Validation passed, calling login service', { email });

    // Call service to authenticate
    const result = await login(email, password);
    logger.info('Login service completed successfully', { hasToken: !!result.token });

    // Return success response with token
    const response = createSuccessResponse(result);
    logger.info('Sending success response', { responseKeys: Object.keys(response) });
    
    res.status(200).json(response);
    logger.info('Response sent successfully');
    return;
  } catch (error) {
    logger.error('Error in admin login controller', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return next(error); // Pass error to error middleware
  }
}

