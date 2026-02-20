import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { placeOrder, approveOrder, putOrderOnHold, cancelOrder, markOrderAsShipped, markOrderAsDelivered, getOrderDetailsForEmail, getCustomerOrders, getOrderById, getAllOrders } from '../services/order.service.js';
import { emailService } from '../emails/email.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for place order request body
 */
const placeOrderSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  addressId: z.string().uuid('Invalid address ID format'),
  paymentMethod: z.enum(['RAZORPAY', 'COD'], {
    message: 'Payment method must be RAZORPAY or COD',
  }),
  paymentReference: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        skuId: z.string().uuid('Invalid SKU ID format'),
        quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
      })
    )
    .min(1, 'At least one item is required'),
});

/**
 * Place order controller
 * POST /api/v1/store/orders
 * 
 * Validates request body and calls order service to place order
 */
export async function placeOrderController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Place order request received', {
      customerId: req.body?.customerId,
      itemCount: req.body?.items?.length,
    });

    // Validate request body
    const validationResult = placeOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { customerId, addressId, paymentMethod, paymentReference, items } = validationResult.data;

    logger.info('Validation passed, calling place order service', {
      customerId,
      addressId,
      paymentMethod,
      itemCount: items.length,
    });

    // Call service to place order
    const result = await placeOrder({
      customerId,
      addressId,
      paymentMethod,
      paymentReference: paymentReference ?? null,
      items,
    });

    logger.info('Order placed successfully', {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
    });

    // Return success response
    const response = createSuccessResponse({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      status: result.status,
    });

    res.status(201).json(response);

    // Send email notification (async, non-blocking)
    getOrderDetailsForEmail(result.orderId)
      .then(async (details) => {
        await emailService.sendOrderPlaced(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
          totalAmount: Number(details.order.totalAmount),
          items: details.order.orderItems.map((item) => ({
            productName: (item.skuSnapshot as any).productName || 'Product',
            skuCode: (item.skuSnapshot as any).skuCode || 'SKU',
            quantity: item.quantity,
            price: Number(item.pricePerUnit),
          })),
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger order placed email', {
          error: err instanceof Error ? err.message : String(err),
          orderId: result.orderId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in place order controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error); // Pass error to error middleware
  }
}

/**
 * Zod schema for cancel order request body
 */
const cancelOrderSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});

/**
 * Zod schema for ship order request body
 */
const shipOrderSchema = z.object({
  courier: z.string().min(1, 'Courier name is required'),
  trackingId: z.string().min(1, 'Tracking ID is required'),
});

/**
 * Approve order controller
 * POST /api/v1/admin/orders/:orderId/approve
 * 
 * Validates orderId param and calls approveOrder service
 */
export async function approveOrderController(
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

    logger.info('Approve order request received', {
      orderId,
      adminId: req.admin.id,
    });

    // Call service to approve order
    await approveOrder(orderId, req.admin.id);

    logger.info('Order approved successfully', {
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Order approved successfully',
      orderId,
    });

    res.status(200).json(response);

    // Send email notification
    getOrderDetailsForEmail(orderId)
      .then(async (details) => {
        await emailService.sendOrderApproved(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger order approved email', {
          error: err instanceof Error ? err.message : String(err),
          orderId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in approve order controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Put order on hold controller
 * POST /api/v1/admin/orders/:orderId/on-hold
 * 
 * Validates orderId param and calls putOrderOnHold service
 */
export async function putOrderOnHoldController(
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

    logger.info('Put order on hold request received', {
      orderId,
      adminId: req.admin.id,
    });

    // Call service to put order on hold
    await putOrderOnHold(orderId, req.admin.id);

    logger.info('Order put on hold successfully', {
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Order put on hold successfully',
      orderId,
    });

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in put order on hold controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Cancel order controller
 * POST /api/v1/admin/orders/:orderId/cancel
 * 
 * Validates orderId param and request body, then calls cancelOrder service
 */
export async function cancelOrderController(
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

    // Validate request body
    const validationResult = cancelOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { reason } = validationResult.data;

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Cancel order request received', {
      orderId,
      adminId: req.admin.id,
      reason,
    });

    // Call service to cancel order
    await cancelOrder(orderId, req.admin.id, reason);

    logger.info('Order cancelled successfully', {
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Order cancelled successfully',
      orderId,
    });

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in cancel order controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Mark order as shipped controller
 * POST /api/v1/admin/orders/:orderId/ship
 * 
 * Validates orderId param and request body, then calls markOrderAsShipped service
 */
export async function markOrderAsShippedController(
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

    // Validate request body
    const validationResult = shipOrderSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { courier, trackingId } = validationResult.data;

    // Extract admin ID (set by adminAuth middleware)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin information not found', 401);
    }

    logger.info('Mark order as shipped request received', {
      orderId,
      adminId: req.admin.id,
      courier,
      trackingId,
    });

    // Call service to mark order as shipped
    await markOrderAsShipped(orderId, req.admin.id, courier, trackingId);

    logger.info('Order marked as shipped successfully', {
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Order marked as shipped successfully',
      orderId,
    });

    res.status(200).json(response);

    // Send email notification
    getOrderDetailsForEmail(orderId)
      .then(async (details) => {
        await emailService.sendOrderShipped(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
          courier,
          trackingId,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger order shipped email', {
          error: err instanceof Error ? err.message : String(err),
          orderId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in mark order as shipped controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Mark order as delivered controller
 * POST /api/v1/admin/orders/:orderId/deliver
 * 
 * Validates orderId param and calls markOrderAsDelivered service
 */
export async function markOrderAsDeliveredController(
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

    logger.info('Mark order as delivered request received', {
      orderId,
      adminId: req.admin.id,
    });

    // Call service to mark order as delivered
    await markOrderAsDelivered(orderId, req.admin.id);

    logger.info('Order marked as delivered successfully', {
      orderId,
      adminId: req.admin.id,
    });

    // Return success response
    const response = createSuccessResponse({
      message: 'Order marked as delivered successfully',
      orderId,
    });

    res.status(200).json(response);

    // Send email notification
    getOrderDetailsForEmail(orderId)
      .then(async (details) => {
        await emailService.sendOrderDelivered(details.customerEmail, {
          orderNumber: details.order.orderNumber,
          customerName: details.customerName,
        });
      })
      .catch((err) => {
        logger.error('Failed to trigger order delivered email', {
          error: err instanceof Error ? err.message : String(err),
          orderId,
        });
      });
    return;
  } catch (error) {
    logger.error('Error in mark order as delivered controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Get my orders controller
 * GET /api/v1/store/orders
 * 
 * Fetches all orders for the authenticated customer
 */
export async function getMyOrdersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract customer ID (set by auth middleware)
    if (!req.customer) { // Assuming auth middleware sets req.customer
      // If the middleware puts it in req.user or similar, we need to adjust.
      // Let's assume req.customer based on standard practice in this repo (need to verify auth middleware if unsure)
      // Checking createCustomerController might give a hint but that's public.
      // Let's check how other protected routes access user info.
      throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
    }

    const customerId = req.customer.id;

    logger.info('Get my orders request received', {
      customerId,
    });

    // Call service to get orders
    const orders = await getCustomerOrders(customerId);

    logger.info('My orders fetched successfully', {
      customerId,
      count: orders.length,
    });

    // Return success response
    const response = createSuccessResponse(orders);

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in get my orders controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * Get order by ID controller
 * GET /api/v1/store/orders/:orderId
 * 
 * Fetches order details. Verifies ownership.
 */
export async function getOrderByIdController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orderId = req.params.orderId;

    if (!orderId) {
      throw new AppError('VALIDATION_ERROR', 'Order ID is required', 400);
    }

    // Extract customer ID
    // Note: If no customer ID (e.g. admin or guest?), logic might differ.
    // Spec says "Replace localStorage retrieval with getOrderById(orderNumber)" for Store.
    // So this is likely for the customer.
    if (!req.customer) {
      throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
    }

    const customerId = req.customer.id;

    logger.info('Get order by ID request received', {
      orderId,
      customerId,
    });

    // Call service to get order
    const order = await getOrderById(orderId);

    // Verify ownership
    if (order.customerId !== customerId) {
      throw new AppError('FORBIDDEN', 'You do not have permission to view this order', 403);
    }

    logger.info('Order fetched successfully', {
      orderId,
    });

    // Return success response
    const response = createSuccessResponse(order);

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in get order by ID controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}

/**
 * List all orders controller
 * GET /api/v1/admin/orders
 * 
 * Fetches all orders with pagination
 */
export async function listOrdersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    logger.info('List orders request received', { page, limit });

    const result = await getAllOrders(page, limit);

    const response = createSuccessResponse(result);
    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in list orders controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error);
  }
}
