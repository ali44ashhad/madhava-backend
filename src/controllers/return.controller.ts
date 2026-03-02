import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requestReturn, listReturnRequests, approveReturn, rejectReturn, getReturnDetailsForEmail, markReturnReceived } from '../services/return.service.js';
import { emailService } from '../emails/email.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for request return body
 */
const requestReturnSchema = z.object({
  reason: z.string().min(1, 'Return reason is required'),
  images: z.array(z.string().url('Invalid image URL')).min(1, 'At least one image is required'),
  note: z.string().optional(),
});

/**
 * Zod schema for reject return body
 */
const rejectReturnSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

/**
 * Zod schema for list returns query params
 */
const listReturnsQuerySchema = z.object({
  status: z.enum(['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED']).optional(),
});

/**
 * Request return controller
 * POST /api/v1/store/orders/:orderItemId/return
 * 
 * Validates orderItemId param and request body, then calls requestReturn service
 */
export async function requestReturnController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderItemId = req.params.orderItemId;

    if (!orderItemId) {
      throw new AppError('VALIDATION_ERROR', 'Order item ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orderItemId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid order item ID format', 400);
    }

    // Validate request body
    const validationResult = requestReturnSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { reason, images, note } = validationResult.data;

    logger.info('Request return request received', {
      orderItemId,
      reason,
      imageCount: images.length,
    });

    // Call service to request return
    const result = await requestReturn(orderItemId, {
      reason,
      images,
      note: note || undefined,
    });

    logger.info('Return requested successfully', {
      returnId: result.returnId,
      orderItemId,
    });

    // Return success response
    const response = createSuccessResponse({
      returnId: result.returnId,
      orderId: result.orderId,
      status: result.status,
    });

    res.status(201).json(response);

    // Send email notification (async)
    getReturnDetailsForEmail(result.returnId)
      .then(async (details) => {
        await emailService.sendReturnRequested(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
          returnId: details.returnRecord.id,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger return requested email', {
          error: err instanceof Error ? err.message : String(err),
          returnId: result.returnId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in request return controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * List return requests controller
 * GET /api/v1/admin/returns?status=
 * 
 * Validates query params and calls listReturnRequests service
 */
export async function listReturnRequestsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    // Validate query params
    const validationResult = listReturnsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { status } = validationResult.data;
    const search = req.query.search as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    logger.info('List return requests request received', {
      adminId: req.admin.id,
      status,
      search,
      page,
      limit,
    });

    // Call service to list return requests
    const dbResult = await listReturnRequests(status, search, page, limit);

    const result = {
      returns: dbResult.returns,
      pagination: {
        total: dbResult.total,
        page,
        limit,
        totalPages: Math.ceil(dbResult.total / limit),
      },
    };

    logger.info('Return requests fetched successfully', {
      adminId: req.admin.id,
      count: dbResult.returns.length,
    });

    // Return success response
    const response = createSuccessResponse(result);

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in list return requests controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Approve return controller
 * POST /api/v1/admin/returns/:returnId/approve
 * 
 * Validates returnId param and calls approveReturn service
 */
export async function approveReturnController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnId = req.params.returnId;

    if (!returnId) {
      throw new AppError('VALIDATION_ERROR', 'Return ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(returnId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid return ID format', 400);
    }

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Approve return request received', {
      returnId,
      adminId: req.admin.id,
    });

    // Call service to approve return
    await approveReturn(returnId, req.admin.id);

    logger.info('Return approved successfully', {
      returnId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Return approved successfully',
      returnId,
    });

    res.status(200).json(response);

    // Send email notification (async)
    getReturnDetailsForEmail(returnId)
      .then(async (details) => {
        await emailService.sendReturnApproved(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
          returnId: details.returnRecord.id,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger return approved email', {
          error: err instanceof Error ? err.message : String(err),
          returnId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in approve return controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Mark return received controller
 * POST /api/v1/admin/returns/:returnId/receive
 * 
 * Validates returnId param and calls markReturnReceived service
 */
export async function markReturnReceivedController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnId = req.params.returnId;

    if (!returnId) {
      throw new AppError('VALIDATION_ERROR', 'Return ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(returnId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid return ID format', 400);
    }

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Mark return received request received', {
      returnId,
      adminId: req.admin.id,
    });

    // Call service to mark return received
    await markReturnReceived(returnId, req.admin.id);

    logger.info('Return marked as received successfully', {
      returnId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Return marked as received successfully',
      returnId,
    });

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in mark return received controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Reject return controller
 * POST /api/v1/admin/returns/:returnId/reject
 * 
 * Validates returnId param and request body, then calls rejectReturn service
 */
export async function rejectReturnController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const returnId = req.params.returnId;

    if (!returnId) {
      throw new AppError('VALIDATION_ERROR', 'Return ID is required', 400);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(returnId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid return ID format', 400);
    }

    // Validate request body
    const validationResult = rejectReturnSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { reason } = validationResult.data;

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Reject return request received', {
      returnId,
      adminId: req.admin.id,
      reason,
    });

    // Call service to reject return
    await rejectReturn(returnId, req.admin.id, reason);

    logger.info('Return rejected successfully', {
      returnId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Return rejected successfully',
      returnId,
    });

    res.status(200).json(response);

    // Send email notification (async)
    getReturnDetailsForEmail(returnId)
      .then(async (details) => {
        await emailService.sendReturnRejected(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
          returnId: details.returnRecord.id,
          reason,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger return rejected email', {
          error: err instanceof Error ? err.message : String(err),
          returnId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in reject return controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}


