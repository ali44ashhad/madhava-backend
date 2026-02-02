import { Request, Response, NextFunction } from 'express';
import { initiateRefund } from '../services/refund.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Initiate refund controller
 * POST /api/v1/admin/orders/:orderId/refund
 * 
 * Validates orderId param and calls initiateRefund service
 */
export async function initiateRefundController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderId = req.params.orderId;

    if (!orderId) {
      throw new AppError('VALIDATION_ERROR', 'Order ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid order ID format', 400);
    }

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Initiate refund request received', {
      orderId,
      adminId: req.admin.id,
    });

    // Call service to initiate refund
    const result = await initiateRefund(orderId, req.admin.id);

    logger.info('Refund initiated successfully', {
      refundId: result.refundId,
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Refund initiated successfully',
      refundId: result.refundId,
      orderId,
      amount: result.amount,
    });

    res.status(201).json(response);
    return;
  } catch (error) {
    logger.error('Error in initiate refund controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}


