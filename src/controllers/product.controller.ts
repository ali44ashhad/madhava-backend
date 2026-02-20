import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createProduct, addProductImage, listProducts, CreateProductInput } from '../services/product.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create product request body
 */
const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  categoryId: z.string().uuid('Invalid category ID format'),
  subcategoryId: z.string().uuid('Invalid subcategory ID format'),
  isFeatured: z.boolean().optional(),
});

/**
 * Create product controller
 * POST /api/v1/admin/products
 */
export async function createProductController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create product request received');

    // Validate request body
    const validationResult = createProductSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const input: CreateProductInput = {
      name: validationResult.data.name,
      description: validationResult.data.description,
      categoryId: validationResult.data.categoryId,
      subcategoryId: validationResult.data.subcategoryId,
      isFeatured: validationResult.data.isFeatured,
    };

    // Call service to create product
    const product = await createProduct(input);

    // Return success response
    const response = createSuccessResponse(product);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in create product controller', error);
    next(error);
  }
}


/**
 * Zod schema for add product image request body
 */
const addProductImageSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
  sortOrder: z.number().int().optional(),
});

/**
 * Add product image controller
 * POST /api/v1/admin/products/:productId/images
 */
export async function addProductImageController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { productId } = req.params;
    logger.info('Add product image request received', { productId });

    // Validate request body
    const validationResult = addProductImageSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Call service to add image
    const image = await addProductImage({
      productId,
      imageUrl: validationResult.data.imageUrl,
      sortOrder: validationResult.data.sortOrder,
    });

    // Return success response
    const response = createSuccessResponse(image);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in add product image controller', error);
    next(error);
  }
}

/**
 * List products controller
 * GET /api/v1/admin/products
 */
export async function listProductsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    logger.info('List products request received', { page, limit });

    // Validate page and limit
    if (page < 1) {
      throw new AppError('VALIDATION_ERROR', 'Page must be greater than 0', 400);
    }
    if (limit < 1 || limit > 100) {
      throw new AppError('VALIDATION_ERROR', 'Limit must be between 1 and 100', 400);
    }

    const result = await listProducts(page, limit);
    const response = createSuccessResponse(result);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in list products controller', error);
    next(error);
  }
}

