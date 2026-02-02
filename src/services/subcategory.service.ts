import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { generateUniqueSubcategorySlug } from '../utils/slug.js';

/**
 * Create subcategory input
 */
export interface CreateSubcategoryInput {
  name: string;
  categoryId: string;
  imageUrl?: string;
}

/**
 * Subcategory service
 * Handles business logic for subcategory operations
 */
export async function createSubcategory(input: CreateSubcategoryInput) {
  logger.info('Creating subcategory', { name: input.name, categoryId: input.categoryId });

  // Validate category exists and is active
  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
  });

  if (!category) {
    logger.warn('Subcategory creation failed: category not found', { categoryId: input.categoryId });
    throw new AppError('NOT_FOUND', `Category with id '${input.categoryId}' not found`, 404);
  }

  if (!category.isActive) {
    logger.warn('Subcategory creation failed: category is not active', { categoryId: input.categoryId });
    throw new AppError('BAD_REQUEST', `Category with id '${input.categoryId}' is not active`, 400);
  }

  // Check if subcategory with same name already exists under this category
  const existingSubcategory = await prisma.subcategory.findFirst({
    where: {
      categoryId: input.categoryId,
      name: input.name,
    },
  });

  if (existingSubcategory) {
    logger.warn('Subcategory creation failed: duplicate name under same category', {
      name: input.name,
      categoryId: input.categoryId,
    });
    throw new AppError(
      'VALIDATION_ERROR',
      `Subcategory with name '${input.name}' already exists under this category`,
      400
    );
  }

  // Generate unique slug
  const slug = await generateUniqueSubcategorySlug(input.name, input.categoryId);

  // Create subcategory with isActive = true by default
  const subcategory = await prisma.subcategory.create({
    data: {
      name: input.name,
      slug,
      categoryId: input.categoryId,
      imageUrl: input.imageUrl || null,
      isActive: true,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  logger.info('Subcategory created successfully', { subcategoryId: subcategory.id, slug });
  return subcategory;
}

/**
 * List all subcategories (admin view)
 * If categoryId is provided, filter by it
 * Returns all subcategories regardless of active status
 */
export async function listSubcategories(categoryId?: string) {
  logger.info('Listing subcategories', { categoryId });

  const where = categoryId ? { categoryId } : {};

  const subcategories = await prisma.subcategory.findMany({
    where,
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  logger.info('Subcategories retrieved', { count: subcategories.length });
  return subcategories;
}

/**
 * Get active subcategories by category slug (store view)
 * Returns only active subcategories ordered alphabetically
 */
export async function getSubcategoriesByCategorySlug(categorySlug: string) {
  logger.info('Fetching active subcategories by category slug', { categorySlug });

  // Validate category exists and is active
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });

  if (!category) {
    logger.warn('Category not found', { categorySlug });
    throw new AppError('NOT_FOUND', `Category with slug '${categorySlug}' not found`, 404);
  }

  if (!category.isActive) {
    logger.warn('Category is not active', { categorySlug });
    throw new AppError('NOT_FOUND', `Category with slug '${categorySlug}' not found`, 404);
  }

  const subcategories = await prisma.subcategory.findMany({
    where: {
      categoryId: category.id,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  logger.info('Active subcategories retrieved', { count: subcategories.length, categorySlug });
  return subcategories;
}

