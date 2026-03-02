import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createSubcategory, listSubcategories, updateSubcategory, CreateSubcategoryInput } from '../services/subcategory.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create subcategory request body
 * Note: slug is NOT accepted - it will be auto-generated
 */
const createSubcategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  categoryId: z.string().uuid('Invalid category ID format'),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
});

/**
 * Create subcategory controller
 * POST /api/v1/admin/subcategories
 */
export async function createSubcategoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create subcategory request received');

    // Validate request body
    const validationResult = createSubcategorySchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Ensure slug is not provided (admin cannot send slug)
    if (req.body.slug) {
      throw new AppError('VALIDATION_ERROR', 'Slug cannot be provided. It will be auto-generated from the name.', 400);
    }

    const input: CreateSubcategoryInput = {
      name: validationResult.data.name,
      categoryId: validationResult.data.categoryId,
      imageUrl: validationResult.data.imageUrl || undefined,
    };

    // Call service to create subcategory
    const subcategory = await createSubcategory(input);

    // Return success response
    const response = createSuccessResponse(subcategory);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in create subcategory controller', error);
    next(error);
  }
}

/**
 * List subcategories controller (admin view)
 * GET /api/v1/admin/subcategories?categoryId=
 */
export async function listSubcategoriesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('List subcategories request received', { query: req.query });

    // Validate categoryId if provided
    const categoryId = req.query.categoryId as string | undefined;
    if (categoryId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(categoryId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid category ID format', 400);
      }
    }

    // Call service to list subcategories
    const subcategories = await listSubcategories(categoryId);

    // Return success response
    const response = createSuccessResponse(subcategories);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in list subcategories controller', error);
    next(error);
  }
}

/**
 * Zod schema for update subcategory request body
 */
const updateSubcategorySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

/**
 * Update subcategory controller
 * PUT /api/v1/admin/subcategories/:id
 */
export async function updateSubcategoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    logger.info('Update subcategory request received', { subcategoryId: id });

    // Validate parameter
    if (!id) {
      throw new AppError('VALIDATION_ERROR', 'Subcategory ID is required', 400);
    }

    // Validate request body
    const validationResult = updateSubcategorySchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Ensure slug is not provided
    if (req.body.slug) {
      throw new AppError('VALIDATION_ERROR', 'Slug cannot be provided manually.', 400);
    }

    const { name, categoryId, imageUrl, isActive } = validationResult.data;

    // Call service to update subcategory
    const subcategory = await updateSubcategory(id, { name, categoryId, imageUrl, isActive });

    // Return success response
    const response = createSuccessResponse(subcategory);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in update subcategory controller', error);
    next(error);
  }
}

