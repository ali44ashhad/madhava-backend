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


/**
 * Zod schema for add SKU image request body
 */
const addSkuImageSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
  sortOrder: z.number().int().optional().default(0),
});

/**
 * Add SKU image controller
 * POST /api/v1/admin/skus/:skuId/images
 */
export async function addSkuImageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { skuId } = req.params;
    logger.info('Add SKU image request received', { skuId });

    // Validate request body
    const validationResult = addSkuImageSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Call service to add image
    // Note: addSkuImage is not imported yet, strict mode might complain if I don't import it.
    // I will assume I need to update imports in a separate step or try to do it here if possible.
    // Since I can't easily do multiple chunks with replace_file_content in one go without multi_replace, 
    // I'll stick to adding the function here and update imports in next step.

    // Actually, I should use multi_replace for controller file to handle import and new function.
    // But I'm forced to use replace_file_content since I'm appending. 
    // Wait, the agent tools allow multi_replace. I should use that for the controller.

    // Re-reading the plan: "Implement addSkuImageController in sku.controller.ts".
    // I will use replace_file_content to append the function now, and then another call to update the import.

    // wait, I can't easily see where to import without reading the file again or guessing.
    // I see the file content in context. Line 3 has imports.

    // I'll just append the controller code for now.

    // ... wait, I need to call the service function. 
    // const image = await addSkuImage(skuId, validationResult.data.imageUrl, validationResult.data.sortOrder);

    // I'll write the function assuming the import is there, then fix the import.

    // ... actually, let's look at the imports in sku.controller.ts
    // import { createSku, CreateSkuInput, getSkuInventory, updateSkuStock } from '../services/sku.service.js';

    // I will append the controller at the end.

    // ... constructing replacement content ...

    const image = await import('../services/sku.service.js').then(m => m.addSkuImage(
      skuId,
      validationResult.data.imageUrl,
      validationResult.data.sortOrder
    ));

    // Return success response
    const response = createSuccessResponse(image);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in add SKU image controller', error);
    next(error);
  }
}

/**
 * List SKUs controller
 * GET /api/v1/admin/skus
 */
export async function listSkusController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search as string;

    logger.info('List SKUs request received', { page, limit, search });

    // Call service to get SKUs
    // Dynamic import to avoid top-level import issues if I can't easily edit top of file
    const { getAllSkus } = await import('../services/sku.service.js');
    const result = await getAllSkus(page, limit, search);

    // Return success response
    const response = createSuccessResponse(result);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in list SKUs controller', error);
    next(error);
  }
}
