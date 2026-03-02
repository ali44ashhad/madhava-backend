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

/**
 * Update category input
 */
export interface UpdateCategoryInput {
  name?: string;
  imageUrl?: string;
  isActive?: boolean;
}

/**
 * Update an existing category
 */
export async function updateCategory(id: string, input: UpdateCategoryInput) {
  logger.info('Updating category', { categoryId: id, input });

  // Validate category exists
  const category = await prisma.category.findUnique({
    where: { id },
  });

  if (!category) {
    logger.warn('Category update failed: not found', { categoryId: id });
    throw new AppError('NOT_FOUND', `Category with id '${id}' not found`, 404);
  }

  // If name is being updated, check for duplicates and generate new slug
  let slug = category.slug;
  if (input.name && input.name !== category.name) {
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: input.name,
        id: { not: id }, // Exclude current category
      },
    });

    if (existingCategory) {
      logger.warn('Category update failed: duplicate name', {
        categoryId: id,
        name: input.name,
      });
      throw new AppError(
        'VALIDATION_ERROR',
        `Category with name '${input.name}' already exists`,
        400
      );
    }

    slug = await generateUniqueCategorySlug(input.name);
  }

  const updatedCategory = await prisma.category.update({
    where: { id },
    data: {
      name: input.name,
      slug,
      imageUrl: input.imageUrl !== undefined ? (input.imageUrl || null) : undefined,
      isActive: input.isActive,
    },
  });

  logger.info('Category updated successfully', { categoryId: id });
  return updatedCategory;
}

