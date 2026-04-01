import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { OrderStatus, ReviewStatus } from '@prisma/client';

export interface CreateReviewInput {
  orderItemId: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  comment?: string;
}

function normalizeOptionalText(value?: string): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function createReview(customerId: string, input: CreateReviewInput) {
  logger.info('Create review request received', {
    customerId,
    orderItemId: input.orderItemId,
    rating: input.rating,
  });

  // Fetch order item with ownership + delivery state validation.
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          deliveredAt: true,
          customerId: true,
        },
      },
      sku: {
        select: {
          id: true,
          productId: true,
        },
      },
      review: {
        select: { id: true },
      },
    },
  });

  if (!orderItem) {
    throw new AppError('NOT_FOUND', `Order item with id '${input.orderItemId}' not found`, 404);
  }

  if (orderItem.order.status !== OrderStatus.DELIVERED) {
    throw new AppError(
      'INVALID_STATE',
      `Review can only be submitted for delivered orders. Current order status: ${orderItem.order.status}`,
      400
    );
  }

  if (!orderItem.order.deliveredAt) {
    throw new AppError('INVALID_STATE', 'Order deliveredAt timestamp is missing', 400);
  }

  if (orderItem.order.customerId !== customerId) {
    throw new AppError('FORBIDDEN', 'You can only review your own delivered orders', 403);
  }

  // Enforced by unique constraint too, but keep a friendly error.
  if (orderItem.review) {
    throw new AppError('REVIEW_ALREADY_SUBMITTED', 'A review for this order item already exists', 400);
  }

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new AppError('VALIDATION_ERROR', 'rating must be an integer between 1 and 5', 400);
  }

  const created = await prisma.review.create({
    data: {
      orderItemId: input.orderItemId,
      customerId,
      productId: orderItem.sku.productId,
      skuId: orderItem.sku.id,
      rating: input.rating,
      title: normalizeOptionalText(input.title),
      comment: normalizeOptionalText(input.comment),
      status: ReviewStatus.PENDING,
    },
    include: {
      customer: {
        select: { id: true, name: true },
      },
      product: {
        select: { id: true, name: true },
      },
    },
  });

  return created;
}

export async function updateReview(customerId: string, reviewId: string, input: UpdateReviewInput) {
  logger.info('Update review request received', { customerId, reviewId });

  if (input.rating === undefined && input.title === undefined && input.comment === undefined) {
    throw new AppError('BAD_REQUEST', 'At least one of rating/title/comment must be provided', 400);
  }

  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: {
      id: true,
      customerId: true,
      status: true,
    },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', `Review with id '${reviewId}' not found`, 404);
  }

  if (existing.customerId !== customerId) {
    throw new AppError('FORBIDDEN', 'You can only edit your own reviews', 403);
  }

  if (existing.status !== ReviewStatus.PENDING) {
    throw new AppError('INVALID_STATE', 'Only PENDING reviews can be edited', 400);
  }

  if (input.rating !== undefined) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw new AppError('VALIDATION_ERROR', 'rating must be an integer between 1 and 5', 400);
    }
  }

  const data: Record<string, unknown> = {};
  if (input.rating !== undefined) data.rating = input.rating;
  if (input.title !== undefined) data.title = normalizeOptionalText(input.title);
  if (input.comment !== undefined) data.comment = normalizeOptionalText(input.comment);

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data,
    include: {
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
    },
  });

  return updated;
}

export async function listApprovedProductReviews(productId: string, page = 1, limit = 20) {
  const safePage = page < 1 ? 1 : page;
  const safeLimit = limit < 1 ? 20 : Math.min(limit, 50);
  const skip = (safePage - 1) * safeLimit;

  const where = { productId, status: ReviewStatus.APPROVED };

  const [reviews, total, agg] = await Promise.all([
    prisma.review.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.aggregate({
      where,
      _avg: { rating: true },
      _count: { id: true },
    }),
  ]);

  const totalPages = Math.ceil(total / safeLimit);
  const averageRating = agg?._avg?.rating ?? 0;
  const totalReviews = agg?._count?.id ?? 0;

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      customer: r.customer,
    })),
    stats: {
      averageRating: Number(averageRating) || 0,
      totalReviews,
    },
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages,
    },
  };
}

export async function listAdminReviews(status: ReviewStatus, page = 1, limit = 20) {
  const safePage = page < 1 ? 1 : page;
  const safeLimit = limit < 1 ? 20 : Math.min(limit, 50);
  const skip = (safePage - 1) * safeLimit;

  const where = { status };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true } },
        product: { select: { id: true, name: true } },
        sku: { select: { id: true, skuCode: true } },
        orderItem: {
          select: {
            id: true,
            order: {
              select: { id: true, orderNumber: true, status: true, deliveredAt: true },
            },
          },
        },
      },
    }),
    prisma.review.count({ where }),
  ]);

  return {
    reviews: reviews.map((r) => ({
      id: r.id,
      status: r.status,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      rejectionReason: r.rejectionReason,
      customer: r.customer,
      product: r.product,
      sku: r.sku,
      order: {
        id: r.orderItem.order.id,
        orderItemId: r.orderItem.id,
        orderNumber: r.orderItem.order.orderNumber,
      },
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function approveReview(reviewId: string, adminId: string) {
  const now = new Date();

  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', `Review with id '${reviewId}' not found`, 404);
  }

  if (existing.status !== ReviewStatus.PENDING) {
    throw new AppError('INVALID_STATE', 'Only PENDING reviews can be approved', 400);
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: {
      status: ReviewStatus.APPROVED,
      reviewedByAdminId: adminId,
      reviewedAt: now,
      rejectionReason: null,
    },
  });

  return updated;
}

export async function rejectReview(reviewId: string, adminId: string, reason: string) {
  const now = new Date();

  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, status: true },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', `Review with id '${reviewId}' not found`, 404);
  }

  if (existing.status !== ReviewStatus.PENDING) {
    throw new AppError('INVALID_STATE', 'Only PENDING reviews can be rejected', 400);
  }

  const updated = await prisma.review.update({
    where: { id: reviewId },
    data: {
      status: ReviewStatus.REJECTED,
      reviewedByAdminId: adminId,
      reviewedAt: now,
      rejectionReason: reason.trim() || null,
    },
  });

  return updated;
}

