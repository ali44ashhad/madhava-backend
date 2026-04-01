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
  featuredImageUrl?: string;
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
  if ((input.isFeatured ?? false) && (!input.featuredImageUrl || input.featuredImageUrl.trim().length === 0)) {
    throw new AppError('VALIDATION_ERROR', 'Featured image is required when product is featured', 400);
  }

  const product = await prisma.product.create({
    data: {
      name: input.name,
      description: input.description || null,
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId,
      isFeatured: input.isFeatured ?? false,
      featuredImageUrl: input.featuredImageUrl?.trim() || null,
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

/**
 * Add product image input
 */
export interface AddProductImageInput {
  productId: string;
  imageUrl: string;
  sortOrder?: number;
}

/**
 * Add image to a product
 */
export async function addProductImage(input: AddProductImageInput) {
  logger.info('Adding image to product', { productId: input.productId });

  // Validate that product exists
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });

  if (!product) {
    logger.warn('Add product image failed: product not found', { productId: input.productId });
    throw new AppError('NOT_FOUND', `Product with id '${input.productId}' not found`, 404);
  }

  // Create product image
  const productImage = await prisma.productImage.create({
    data: {
      productId: input.productId,
      imageUrl: input.imageUrl,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  logger.info('Product image added successfully', { productImageId: productImage.id });
  return productImage;
}

/**
 * List products for admin
 * Returns all products with pagination, without stock/SKU restrictions
 */
export async function listProducts(page = 1, limit = 20, search?: string, isFeatured?: boolean) {
  const skip = (page - 1) * limit;

  logger.info('Listing products for admin', { page, limit, search, isFeatured });

  const where: any = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (isFeatured !== undefined) {
    where.isFeatured = isFeatured;
  }

  const total = await prisma.product.count({ where });

  const products = await prisma.product.findMany({
    where,
    skip,
    take: limit,
    include: {
      category: {
        select: { name: true },
      },
      subcategory: {
        select: { name: true },
      },
      images: {
        take: 1,
        select: {
          imageUrl: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
      _count: {
        select: { skus: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const transformedProducts = products.map((product) => ({
    ...product,
    featuredImageUrl: product.featuredImageUrl ?? product.images[0]?.imageUrl ?? null,
    skuCount: product._count.skus,
  }));

  const totalPages = Math.ceil(total / limit);

  return {
    products: transformedProducts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  categoryId?: string;
  subcategoryId?: string;
  isFeatured?: boolean;
  featuredImageUrl?: string | null;
}

export async function updateProduct(productId: string, input: UpdateProductInput) {
  logger.info('Updating product', { productId });

  const existing = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!existing) {
    logger.warn('Update product failed: product not found', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  const nextCategoryId = input.categoryId ?? existing.categoryId;
  const nextSubcategoryId = input.subcategoryId ?? existing.subcategoryId;

  // Validate category/subcategory if either changed
  if (input.categoryId !== undefined || input.subcategoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: nextCategoryId } });
    if (!category) {
      throw new AppError('NOT_FOUND', `Category with id '${nextCategoryId}' not found`, 404);
    }

    const subcategory = await prisma.subcategory.findUnique({ where: { id: nextSubcategoryId } });
    if (!subcategory) {
      throw new AppError('NOT_FOUND', `Subcategory with id '${nextSubcategoryId}' not found`, 404);
    }

    if (subcategory.categoryId !== nextCategoryId) {
      throw new AppError('BAD_REQUEST', `Subcategory '${nextSubcategoryId}' does not belong to category '${nextCategoryId}'`, 400);
    }
  }

  const nextIsFeatured = input.isFeatured ?? existing.isFeatured;

  const nextFeaturedImageUrlRaw =
    input.featuredImageUrl !== undefined ? input.featuredImageUrl : existing.featuredImageUrl;

  const nextFeaturedImageUrl =
    nextFeaturedImageUrlRaw === null ? null : nextFeaturedImageUrlRaw?.trim() || null;

  if (nextIsFeatured && !nextFeaturedImageUrl) {
    throw new AppError('VALIDATION_ERROR', 'Featured image is required when product is featured', 400);
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name !== undefined ? input.name : undefined,
      description: input.description !== undefined ? input.description || null : undefined,
      categoryId: input.categoryId !== undefined ? input.categoryId : undefined,
      subcategoryId: input.subcategoryId !== undefined ? input.subcategoryId : undefined,
      isFeatured: input.isFeatured !== undefined ? input.isFeatured : undefined,
      featuredImageUrl: nextIsFeatured ? nextFeaturedImageUrl : null,
    },
    include: {
      category: true,
      subcategory: true,
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { imageUrl: true, sortOrder: true, id: true },
      },
    },
  });

  logger.info('Product updated successfully', { productId: updated.id });
  return updated;
}

