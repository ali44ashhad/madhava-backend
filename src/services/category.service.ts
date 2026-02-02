import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { generateUniqueCategorySlug } from '../utils/slug.js';

/**
 * Create category input
 */
export interface CreateCategoryInput {
  name: string;
  imageUrl?: string;
}

/**
 * Category service
 * Handles business logic for category operations
 */
export async function createCategory(input: CreateCategoryInput) {
  logger.info('Creating category', { name: input.name });

  // Check if category with same name already exists
  const existingCategory = await prisma.category.findFirst({
    where: {
      name: input.name,
    },
  });

  if (existingCategory) {
    logger.warn('Category creation failed: duplicate name', {
      name: input.name,
    });
    throw new AppError(
      'VALIDATION_ERROR',
      `Category with name '${input.name}' already exists`,
      400
    );
  }

  // Generate unique slug
  const slug = await generateUniqueCategorySlug(input.name);

  // Create category with isActive = true by default
  const category = await prisma.category.create({
    data: {
      name: input.name,
      slug,
      imageUrl: input.imageUrl || null,
      isActive: true,
    },
  });

  logger.info('Category created successfully', { categoryId: category.id, slug });
  return category;
}

/**
 * List all categories (admin view)
 * Returns all categories regardless of active status
 */
export async function listCategories() {
  logger.info('Listing all categories');

  const categories = await prisma.category.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });

  logger.info('Categories retrieved', { count: categories.length });
  return categories;
}

