import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createProduct, CreateProductInput } from '../services/product.service.js';
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

