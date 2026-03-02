import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { OrderStatus, ReturnStatus } from '@prisma/client';

/**
 * Request return input
 */
export interface RequestReturnInput {
  reason: string;
  images: string[];
  note?: string;
}

/**
 * Request return result
 */
export interface RequestReturnResult {
  returnId: string;
  orderId: string;
  status: ReturnStatus;
}

/**
 * Request return service
 * Creates a return request for an order item
 * 
 * Validations:
 * - Order item must exist
 * - Order status must be DELIVERED
 * - Current time <= deliveredAt + 7 days
 * - Order item must not already have a return
 * 
 * Behavior:
 * - Creates Return record with status = REQUESTED
 * - Creates ReturnImage records
 * - Updates order status to RETURN_REQUESTED
 */
export async function requestReturn(
  orderItemId: string,
  input: RequestReturnInput
): Promise<RequestReturnResult> {
  logger.info('Request return', {
    orderItemId,
    reason: input.reason,
    imageCount: input.images.length,
  });

  // Fetch order item with order and existing return
  const orderItem = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          deliveredAt: true,
        },
      },
      return: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!orderItem) {
    throw new AppError('NOT_FOUND', `Order item with id '${orderItemId}' not found`, 404);
  }

  // Validate order status is DELIVERED
  if (orderItem.order.status !== OrderStatus.DELIVERED) {
    throw new AppError(
      'INVALID_STATE',
      `Return can only be requested for delivered orders. Current order status: ${orderItem.order.status}`,
      400
    );
  }

  // Validate deliveredAt exists
  if (!orderItem.order.deliveredAt) {
    throw new AppError(
      'INVALID_STATE',
      'Order deliveredAt timestamp is missing',
      400
    );
  }

  // Validate return window (7 days from deliveredAt)
  const now = new Date();
  const deliveredAt = orderItem.order.deliveredAt;
  const returnWindowEnd = new Date(deliveredAt);
  returnWindowEnd.setDate(returnWindowEnd.getDate() + 7);

  if (now > returnWindowEnd) {
    throw new AppError(
      'RETURN_NOT_ALLOWED',
      `Return window has expired. Return must be requested within 7 days of delivery. Delivery date: ${deliveredAt.toISOString()}`,
      400
    );
  }

  // Validate no existing return (also enforced by Prisma unique constraint)
  if (orderItem.return) {
    throw new AppError(
      'RETURN_NOT_ALLOWED',
      `Return already exists for order item '${orderItemId}'`,
      400
    );
  }

  // Execute return request creation in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create return record
    const returnRecord = await tx.return.create({
      data: {
        orderItemId,
        reason: input.reason,
        customerNote: input.note || null,
        status: ReturnStatus.REQUESTED,
        requestedAt: now,
      },
    });

    // Create return images
    await tx.returnImage.createMany({
      data: input.images.map((imageUrl) => ({
        returnId: returnRecord.id,
        imageUrl,
      })),
    });

    // Update order status to RETURN_REQUESTED
    await tx.order.update({
      where: { id: orderItem.order.id },
      data: {
        status: OrderStatus.RETURN_REQUESTED,
      },
    });

    logger.info('Return created and order status updated', {
      returnId: returnRecord.id,
      orderId: orderItem.order.id,
      previousStatus: OrderStatus.DELIVERED,
      newStatus: OrderStatus.RETURN_REQUESTED,
    });

    return {
      returnId: returnRecord.id,
      orderId: orderItem.order.id,
      status: returnRecord.status,
    };
  });

  logger.info('Return requested successfully', {
    returnId: result.returnId,
    orderId: result.orderId,
  });

  return result;
}

/**
 * List return requests service
 * Fetches return requests with optional status filter
 * 
 * Includes:
 * - orderNumber
 * - customer info (name, email, phone)
 * - sku info (id, skuCode, skuSnapshot)
 * - return reason
 * - return images
 */
export async function listReturnRequests(status?: ReturnStatus, search?: string, page: number = 1, limit: number = 20) {
  logger.info('List return requests', { status, search, page, limit });

  const whereClause: any = {};

  if (status) {
    whereClause.status = status;
  }

  if (search) {
    whereClause.OR = [
      { orderItem: { order: { orderNumber: { contains: search, mode: 'insensitive' } } } },
      { orderItem: { order: { customer: { email: { contains: search, mode: 'insensitive' } } } } },
      { orderItem: { order: { customer: { name: { contains: search, mode: 'insensitive' } } } } }
    ];
  }

  const skip = (page - 1) * limit;

  const [returns, total] = await Promise.all([
    prisma.return.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        orderItem: {
          include: {
            order: {
              include: {
                customer: true,
              },
            },
            sku: true,
          },
        },
        images: true,
      },
      orderBy: {
        requestedAt: 'desc',
      },
    }),
    prisma.return.count({ where: whereClause })
  ]);

  // Transform to response format
  const mappedReturns = returns.map((returnRecord) => ({
    id: returnRecord.id,
    status: returnRecord.status,
    reason: returnRecord.reason,
    customerNote: returnRecord.customerNote,
    requestedAt: returnRecord.requestedAt,
    reviewedAt: returnRecord.reviewedAt,
    orderNumber: returnRecord.orderItem.order.orderNumber,
    orderId: returnRecord.orderItem.order.id,
    quantity: returnRecord.orderItem.quantity,
    customer: {
      id: returnRecord.orderItem.order.customer.id,
      name: returnRecord.orderItem.order.customer.name,
      email: returnRecord.orderItem.order.customer.email,
      phone: returnRecord.orderItem.order.customer.phone,
    },
    sku: {
      id: returnRecord.orderItem.sku.id,
      skuCode: returnRecord.orderItem.sku.skuCode,
      skuSnapshot: returnRecord.orderItem.skuSnapshot,
    },
    images: returnRecord.images.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
    })),
  }));

  return { returns: mappedReturns, total };
}

/**
 * Approve return service
 * Approves a return request and updates order status
 * 
 * Validations:
 * - Return must exist
 * - Return status must be REQUESTED
 * - Related order status must be RETURN_REQUESTED
 * 
 * Behavior:
 * - Updates return status to APPROVED
 * - Sets reviewedAt timestamp
 * - Updates order status to RETURN_APPROVED
 * - Logs admin action
 */
export async function approveReturn(returnId: string, adminId: string): Promise<void> {
  logger.info('Approve return request', { returnId, adminId });

  // Fetch return with order
  const returnRecord = await prisma.return.findUnique({
    where: { id: returnId },
    include: {
      orderItem: {
        include: {
          order: {
            select: {
              id: true,
              status: true,
              orderNumber: true,
            },
          },
        },
      },
    },
  });

  if (!returnRecord) {
    throw new AppError('NOT_FOUND', `Return with id '${returnId}' not found`, 404);
  }

  // Validate return status is REQUESTED
  if (returnRecord.status !== ReturnStatus.REQUESTED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot approve return. Current status: ${returnRecord.status}. Expected: REQUESTED`,
      400
    );
  }

  // Validate order status is RETURN_REQUESTED
  if (returnRecord.orderItem.order.status !== OrderStatus.RETURN_REQUESTED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot approve return. Order status must be RETURN_REQUESTED. Current status: ${returnRecord.orderItem.order.status}`,
      400
    );
  }

  // Execute approval in transaction
  await prisma.$transaction(async (tx) => {
    // Update return status and reviewedAt
    await tx.return.update({
      where: { id: returnId },
      data: {
        status: ReturnStatus.APPROVED,
        reviewedAt: new Date(),
      },
    });

    // Update order status to RETURN_APPROVED
    await tx.order.update({
      where: { id: returnRecord.orderItem.order.id },
      data: {
        status: OrderStatus.RETURN_APPROVED,
      },
    });

    logger.info('Return approved and order status updated', {
      returnId,
      orderId: returnRecord.orderItem.order.id,
      orderNumber: returnRecord.orderItem.order.orderNumber,
      adminId,
      previousReturnStatus: ReturnStatus.REQUESTED,
      newReturnStatus: ReturnStatus.APPROVED,
      previousOrderStatus: OrderStatus.RETURN_REQUESTED,
      newOrderStatus: OrderStatus.RETURN_APPROVED,
    });
  });

  logger.info('Return approved successfully', {
    returnId,
    orderId: returnRecord.orderItem.order.id,
    adminId,
    action: 'APPROVE_RETURN',
  });
}

/**
 * Reject return service
 * Rejects a return request and updates order status
 * 
 * Validations:
 * - Return must exist
 * - Return status must be REQUESTED
 * - Rejection reason is required
 * - Related order status must be RETURN_REQUESTED
 * 
 * Behavior:
 * - Updates return status to REJECTED
 * - Sets reviewedAt timestamp
 * - Updates order status to RETURN_REJECTED
 * - Logs admin action with reason
 */
export async function rejectReturn(returnId: string, adminId: string, reason: string): Promise<void> {
  logger.info('Reject return request', { returnId, adminId, reason });

  // Fetch return with order
  const returnRecord = await prisma.return.findUnique({
    where: { id: returnId },
    include: {
      orderItem: {
        include: {
          order: {
            select: {
              id: true,
              status: true,
              orderNumber: true,
            },
          },
        },
      },
    },
  });

  if (!returnRecord) {
    throw new AppError('NOT_FOUND', `Return with id '${returnId}' not found`, 404);
  }

  // Validate return status is REQUESTED
  if (returnRecord.status !== ReturnStatus.REQUESTED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot reject return. Current status: ${returnRecord.status}. Expected: REQUESTED`,
      400
    );
  }

  // Validate order status is RETURN_REQUESTED
  if (returnRecord.orderItem.order.status !== OrderStatus.RETURN_REQUESTED) {
    throw new AppError(
      'INVALID_STATE',
      `Cannot reject return. Order status must be RETURN_REQUESTED. Current status: ${returnRecord.orderItem.order.status}`,
      400
    );
  }

  // Execute rejection in transaction
  await prisma.$transaction(async (tx) => {
    // Update return status and reviewedAt
    await tx.return.update({
      where: { id: returnId },
      data: {
        status: ReturnStatus.REJECTED,
        reviewedAt: new Date(),
      },
    });

    // Update order status to RETURN_REJECTED
    await tx.order.update({
      where: { id: returnRecord.orderItem.order.id },
      data: {
        status: OrderStatus.RETURN_REJECTED,
      },
    });

    logger.info('Return rejected and order status updated', {
      returnId,
      orderId: returnRecord.orderItem.order.id,
      orderNumber: returnRecord.orderItem.order.orderNumber,
      adminId,
      rejectionReason: reason,
      previousReturnStatus: ReturnStatus.REQUESTED,
      newReturnStatus: ReturnStatus.REJECTED,
      previousOrderStatus: OrderStatus.RETURN_REQUESTED,
      newOrderStatus: OrderStatus.RETURN_REJECTED,
    });
  });

  logger.info('Return rejected successfully', {
    returnId,
    orderId: returnRecord.orderItem.order.id,
    adminId,
    action: 'REJECT_RETURN',
    reason,
  });
}


/**
 * Get return details for email notification
 */
export async function getReturnDetailsForEmail(returnId: string) {
  const returnRecord = await prisma.return.findUnique({
    where: { id: returnId },
    include: {
      orderItem: {
        include: {
          order: {
            include: {
              customer: {
                select: {
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!returnRecord) {
    throw new AppError('NOT_FOUND', `Return with id '${returnId}' not found`, 404);
  }

  const order = returnRecord.orderItem.order;
  const customer = order.customer;
  const customerName = customer.name || 'Customer';

  return {
    returnRecord,
    order,
    customerName,
    customerEmail: customer.email,
  };
}
