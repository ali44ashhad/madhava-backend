import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Create product input
 */
export interface CreateProductInput {
  name: string;
  description?: string;
  categoryId: string;
  subcategoryId: string;
  isFeatured?: boolean;
}

/**
 * Product service
 * Handles business logic for product operations
 */
export async function createProduct(input: CreateProductInput) {
  logger.info('Creating product', { name: input.name, categoryId: input.categoryId, subcategoryId: input.subcategoryId });

  // Validate that category exists
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
  });

  if (!category) {
    logger.warn('Product creation failed: category not found', { categoryId: input.categoryId });
    throw new AppError('NOT_FOUND', `Category with id '${input.categoryId}' not found`, 404);
  }

  // Validate that subcategory exists and belongs to the category
  const subcategory = await prisma.subcategory.findUnique({
    where: { id: input.subcategoryId },
  });

  if (!subcategory) {
    logger.warn('Product creation failed: subcategory not found', { subcategoryId: input.subcategoryId });
    throw new AppError('NOT_FOUND', `Subcategory with id '${input.subcategoryId}' not found`, 404);
  }

  // Validate that subcategory belongs to the category
  if (subcategory.categoryId !== input.categoryId) {
    logger.warn('Product creation failed: subcategory does not belong to category', {
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      subcategoryCategoryId: subcategory.categoryId,
    });
    throw new AppError('BAD_REQUEST', `Subcategory '${input.subcategoryId}' does not belong to category '${input.categoryId}'`, 400);
  }

  // Create product with isActive = true by default
  const product = await prisma.product.create({
    data: {
      name: input.name,
      description: input.description || null,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      isFeatured: input.isFeatured ?? false,
      isActive: true,
    },
    include: {
      category: true,
      subcategory: true,
    },
  });

  logger.info('Product created successfully', { productId: product.id });
  return product;
}

