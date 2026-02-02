import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createSku, CreateSkuInput, getSkuInventory, updateSkuStock } from '../services/sku.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create SKU request body
 */
const createSkuSchema = z.object({
  skuCode: z.string().min(1, 'SKU code is required'),
  productId: z.string().uuid('Invalid product ID format'),
  size: z.string().optional(),
  weight: z.string().optional(),
  material: z.string().optional(),
  color: z.string().optional(),
  mrp: z.number().positive('MRP must be greater than 0'),
  sellingPrice: z.number().positive('Selling price must be greater than 0'),
  festivePrice: z.number().positive('Festive price must be greater than 0').optional(),
  gstPercent: z.number().min(0, 'GST percent must be at least 0').max(100, 'GST percent must be at most 100'),
  stockQuantity: z.number().int('Stock quantity must be an integer').min(0, 'Stock quantity must be at least 0'),
  isCodAllowed: z.boolean().optional(),
  countryOfOrigin: z.string().min(1, 'Country of origin is required'),
  manufacturerName: z.string().min(1, 'Manufacturer name is required'),
  manufacturerAddress: z.string().min(1, 'Manufacturer address is required'),
  sellerName: z.string().min(1, 'Seller name is required'),
  sellerAddress: z.string().min(1, 'Seller address is required'),
  sellerPincode: z.string().min(1, 'Seller pincode is required'),
});

/**
 * Zod schema for update stock request body
 */
const updateStockSchema = z.object({
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be greater than 0'),
  operation: z.enum(['INCREMENT', 'DECREMENT'], {
    message: 'Operation must be INCREMENT or DECREMENT',
  }),
});

/**
 * Create SKU controller
 * POST /api/v1/admin/skus
 */
export async function createSkuController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create SKU request received');

    // Validate request body
    const validationResult = createSkuSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const input: CreateSkuInput = {
      skuCode: validationResult.data.skuCode,
      productId: validationResult.data.productId,
      size: validationResult.data.size,
      weight: validationResult.data.weight,
      material: validationResult.data.material,
      color: validationResult.data.color,
      mrp: validationResult.data.mrp,
      sellingPrice: validationResult.data.sellingPrice,
      festivePrice: validationResult.data.festivePrice,
      gstPercent: validationResult.data.gstPercent,
      stockQuantity: validationResult.data.stockQuantity,
      isCodAllowed: validationResult.data.isCodAllowed,
      countryOfOrigin: validationResult.data.countryOfOrigin,
      manufacturerName: validationResult.data.manufacturerName,
      manufacturerAddress: validationResult.data.manufacturerAddress,
      sellerName: validationResult.data.sellerName,
      sellerAddress: validationResult.data.sellerAddress,
      sellerPincode: validationResult.data.sellerPincode,
    };

    // Call service to create SKU
    const sku = await createSku(input);

    // Return success response
    const response = createSuccessResponse(sku);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in create SKU controller', error);
    next(error);
  }
}

/**
 * Get SKU inventory controller
 * GET /api/v1/admin/skus/:skuId/inventory
 */
export async function getSkuInventoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { skuId } = req.params;
    logger.info('Get SKU inventory request received', { skuId });

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(skuId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid SKU ID format. Expected UUID', 400);
    }

    // Call service to get inventory
    const inventory = await getSkuInventory(skuId);

    // Return success response
    const response = createSuccessResponse(inventory);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in get SKU inventory controller', error);
    next(error);
  }
}

/**
 * Update SKU stock controller
 * PATCH /api/v1/admin/skus/:skuId/stock
 */
export async function updateSkuStockController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { skuId } = req.params;
    logger.info('Update SKU stock request received', { skuId });

    // Validate admin is authenticated (should be set by middleware, but check for safety)
    if (!req.admin) {
      throw new AppError('UNAUTHORIZED', 'Admin authentication required', 401);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(skuId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid SKU ID format. Expected UUID', 400);
    }

    // Validate request body
    const validationResult = updateStockSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Call service to update stock
    const updatedSku = await updateSkuStock(
      skuId,
      validationResult.data.quantity,
      validationResult.data.operation,
      req.admin.id
    );

    // Return success response
    const response = createSuccessResponse(updatedSku);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in update SKU stock controller', error);
    next(error);
  }
}

