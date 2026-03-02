import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Get active categories for store
 * Returns only categories where isActive = true
 */
export async function getCategories() {
  logger.info('Fetching active categories for store');

  const categories = await prisma.category.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  logger.info('Active categories retrieved', { count: categories.length });
  return categories;
}

/**
 * Get products with filters and pagination
 * Returns only active products with at least one active SKU in stock
 */
export interface GetProductsParams {
  categorySlug?: string;
  subcategorySlug?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedProductsResponse {
  products: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    isFeatured: boolean;
    categoryId: string;
    subcategoryId: string;
    minPrice: number;
    maxPrice: number;
    featuredImageUrl: string | null;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getProducts(params: GetProductsParams): Promise<PaginatedProductsResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const skip = (page - 1) * limit;

  logger.info('Fetching products for store', { categorySlug: params.categorySlug, subcategorySlug: params.subcategorySlug, page, limit });

  // Validate: if subcategorySlug is provided, categorySlug must also be provided
  if (params.subcategorySlug && !params.categorySlug) {
    throw new AppError('BAD_REQUEST', 'categorySlug is required when subcategorySlug is provided', 400);
  }

  // Build where clause
  const where: any = {
    isActive: true,
    skus: {
      some: {
        isActive: true,
        stockQuantity: {
          gt: 0,
        },
      },
    },
  };

  // Add category filter if provided
  if (params.categorySlug) {
    where.category = {
      slug: params.categorySlug,
      isActive: true,
    };
  }

  // Add subcategory filter if provided
  if (params.subcategorySlug) {
    where.subcategory = {
      slug: params.subcategorySlug,
      isActive: true,
    };
  }

  // Get total count for pagination
  const total = await prisma.product.count({ where });

  // Get products with their SKUs to calculate min/max prices
  const products = await prisma.product.findMany({
    where,
    skip,
    take: limit,
    select: {
      id: true,
      name: true,
      description: true,
      isFeatured: true,
      categoryId: true,
      subcategoryId: true,
      images: {
        take: 1,
        select: {
          imageUrl: true,
        },
        orderBy: {
          sortOrder: 'asc',
        },
      },
      skus: {
        where: {
          isActive: true,
          stockQuantity: {
            gt: 0,
          },
        },
        select: {
          sellingPrice: true,
          festivePrice: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Transform products to include min/max prices and featured image
  const transformedProducts = products.map((product) => {
    const prices = product.skus
      .map((sku) => {
        // Use festivePrice if available, otherwise sellingPrice
        const price = sku.festivePrice ? Number(sku.festivePrice) : Number(sku.sellingPrice);
        return price;
      })
      .filter((price) => !isNaN(price));

    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    return {
      id: product.id,
      name: product.name,
      slug: product.id, // Using ID as slug for now (can be enhanced later)
      description: product.description,
      isFeatured: product.isFeatured,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      minPrice,
      maxPrice,
      featuredImageUrl: product.images[0]?.imageUrl || null,
    };
  });

  const totalPages = Math.ceil(total / limit);

  logger.info('Products retrieved', { count: transformedProducts.length, total, totalPages });

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

/**
 * Get product detail by ID
 * Returns full product info with images and active SKUs
 */
export async function getProductDetail(productId: string) {
  logger.info('Fetching product detail', { productId });

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      subcategory: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      images: {
        orderBy: {
          sortOrder: 'asc',
        },
        select: {
          id: true,
          imageUrl: true,
          sortOrder: true,
        },
      },
      skus: {
        where: {
          isActive: true,
          stockQuantity: {
            gt: 0,
          },
        },
        select: {
          id: true,
          skuCode: true,
          size: true,
          weight: true,
          material: true,
          color: true,
          mrp: true,
          sellingPrice: true,
          festivePrice: true,
          gstPercent: true,
          stockQuantity: true,
          isCodAllowed: true,
          images: {
            orderBy: {
              sortOrder: 'asc',
            },
            select: {
              id: true,
              imageUrl: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  });

  if (!product) {
    logger.warn('Product not found', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  // Only return product if it's active and has at least one active SKU in stock
  if (!product.isActive) {
    logger.warn('Product is not active', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  if (product.skus.length === 0) {
    logger.warn('Product has no active SKUs in stock', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  logger.info('Product detail retrieved', { productId, skuCount: product.skus.length });

  return product;
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

