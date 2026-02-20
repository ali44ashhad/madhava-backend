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
export async function listProducts(page = 1, limit = 20) {
  const skip = (page - 1) * limit;

  logger.info('Listing products for admin', { page, limit });

  const total = await prisma.product.count();

  const products = await prisma.product.findMany({
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
    featuredImageUrl: product.images[0]?.imageUrl || null,
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

