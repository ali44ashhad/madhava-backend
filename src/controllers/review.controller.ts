import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createReview,
  listApprovedProductReviews,
  listAdminReviews,
  approveReview,
  rejectReview,
  updateReview,
} from '../services/review.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { ReviewStatus } from '@prisma/client';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createReviewSchema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200).optional(),
  comment: z.string().min(1).max(2000).optional(),
});

const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().min(1).max(200).optional(),
    comment: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => v.rating !== undefined || v.title !== undefined || v.comment !== undefined, {
    message: 'At least one of rating/title/comment must be provided',
  });

const rejectReviewSchema = z.object({
  reason: z.string().min(1).max(500),
});

export async function createReviewController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.customer) {
      throw new AppError('UNAUTHORIZED', 'Customer information not found', 401);
    }

    const validationResult = createReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { orderItemId, rating, title, comment } = validationResult.data;

    if (!uuidRegex.test(orderItemId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid order item ID format', 400);
    }

    const result = await createReview(req.customer.id, { orderItemId, rating, title, comment });

    res.status(201).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in create review controller', error);
    return next(error);
  }
}

export async function updateReviewController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.customer) {
      throw new AppError('UNAUTHORIZED', 'Customer information not found', 401);
    }

    const reviewId = req.params.reviewId;
    if (!reviewId) {
      throw new AppError('VALIDATION_ERROR', 'Review ID is required', 400);
    }
    if (!uuidRegex.test(reviewId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid review ID format', 400);
    }

    const validationResult = updateReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const result = await updateReview(req.customer.id, reviewId, validationResult.data);

    res.status(200).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in update review controller', error);
    return next(error);
  }
}

export async function listApprovedProductReviewsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.productId;
    if (!productId) {
      throw new AppError('VALIDATION_ERROR', 'Product ID is required', 400);
    }
    if (!uuidRegex.test(productId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid product ID format', 400);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await listApprovedProductReviews(productId, page, limit);

    res.status(200).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in listApprovedProductReviews controller', error);
    return next(error);
  }
}

const listAdminReviewsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});

export async function listAdminReviewsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    const validationResult = listAdminReviewsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const status = (validationResult.data.status ?? 'PENDING') as ReviewStatus;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await listAdminReviews(status, page, limit);

    res.status(200).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in listAdminReviews controller', error);
    return next(error);
  }
}

export async function approveReviewController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    const reviewId = req.params.reviewId;
    if (!reviewId) {
      throw new AppError('VALIDATION_ERROR', 'Review ID is required', 400);
    }
    if (!uuidRegex.test(reviewId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid review ID format', 400);
    }

    const result = await approveReview(reviewId, req.admin.id);

    res.status(200).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in approveReviewController', error);
    return next(error);
  }
}

export async function rejectReviewController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    const reviewId = req.params.reviewId;
    if (!reviewId) {
      throw new AppError('VALIDATION_ERROR', 'Review ID is required', 400);
    }
    if (!uuidRegex.test(reviewId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid review ID format', 400);
    }

    const validationResult = rejectReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { reason } = validationResult.data;

    const result = await rejectReview(reviewId, req.admin.id, reason);

    res.status(200).json(createSuccessResponse(result));
    return;
  } catch (error) {
    logger.error('Error in rejectReviewController', error);
    return next(error);
  }
}

