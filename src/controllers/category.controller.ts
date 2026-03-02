import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createCategory, listCategories, updateCategory, CreateCategoryInput } from '../services/category.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create category request body
 * Note: slug is NOT accepted - it will be auto-generated
 */
const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
});

/**
 * Create category controller
 * POST /api/v1/admin/categories
 */
export async function createCategoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create category request received');

    // Validate request body
    const validationResult = createCategorySchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Ensure slug is not provided (admin cannot send slug)
    if (req.body.slug) {
      throw new AppError('VALIDATION_ERROR', 'Slug cannot be provided. It will be auto-generated from the name.', 400);
    }

    const input: CreateCategoryInput = {
      name: validationResult.data.name,
      imageUrl: validationResult.data.imageUrl || undefined,
    };

    // Call service to create category
    const category = await createCategory(input);

    // Return success response
    const response = createSuccessResponse(category);
    res.status(201).json(response);
  } catch (error) {
    logger.error('Error in create category controller', error);
    next(error);
  }
}

/**
 * List categories controller (admin view)
 * GET /api/v1/admin/categories
 */
export async function listCategoriesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('List categories request received');

    // Call service to list categories
    const categories = await listCategories();

    // Return success response
    const response = createSuccessResponse(categories);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in list categories controller', error);
    next(error);
  }
}

/**
 * Zod schema for update category request body
 */
const updateCategorySchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').optional(),
  imageUrl: z.string().url('Invalid image URL').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

/**
 * Update category controller
 * PUT /api/v1/admin/categories/:id
 */
export async function updateCategoryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    logger.info('Update category request received', { categoryId: id });

    // Validate parameter
    if (!id) {
      throw new AppError('VALIDATION_ERROR', 'Category ID is required', 400);
    }

    // Validate request body
    const validationResult = updateCategorySchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    // Ensure slug is not provided
    if (req.body.slug) {
      throw new AppError('VALIDATION_ERROR', 'Slug cannot be provided manually.', 400);
    }

    const { name, imageUrl, isActive } = validationResult.data;

    // Call service to update category
    const category = await updateCategory(id, { name, imageUrl, isActive });

    // Return success response
    const response = createSuccessResponse(category);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in update category controller', error);
    next(error);
  }
}

