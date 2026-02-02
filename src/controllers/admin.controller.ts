import { Request, Response, NextFunction } from 'express';
import { createSuccessResponse } from '../types/api-response.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middlewares/error.middleware.js';

/**
 * Get current admin info
 * Admin info is attached to request by adminAuth middleware
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Admin should be attached by middleware
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    // Return admin info (id, email, role)
    const adminInfo = {
      id: req.admin.id,
      email: req.admin.email,
      role: req.admin.role,
    };

    const response = createSuccessResponse(adminInfo);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in getMe controller', error);
    next(error); // Pass error to error middleware
  }
}

