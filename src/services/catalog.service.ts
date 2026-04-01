import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { ReviewStatus } from '@prisma/client';

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
  maxPrice?: number;
  q?: string;
  isFeatured?: boolean;
  sort?: string;
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
    ratingAverage: number;
    ratingCount: number;
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

  // Price filter (maxPrice) on effective SKU price (festivePrice if set, else sellingPrice)
  if (params.maxPrice !== undefined) {
    const maxPrice = params.maxPrice;
    where.skus.some = {
      ...where.skus.some,
      AND: [
        {
          OR: [
            { festivePrice: { lte: maxPrice } },
            { AND: [{ festivePrice: { equals: null } }, { sellingPrice: { lte: maxPrice } }] },
          ],
        },
      ],
    };
  }

  // Add isFeatured filter if provided
  if (params.isFeatured !== undefined) {
    where.isFeatured = params.isFeatured;
  }

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

  // Search filter (name/category/subcategory)
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { category: { name: { contains: params.q, mode: 'insensitive' } } },
      { subcategory: { name: { contains: params.q, mode: 'insensitive' } } },
    ];
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
      featuredImageUrl: true,
      categoryId: true,
      subcategoryId: true,
      category: {
        select: {
          name: true,
        },
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
          mrp: true,
        },
      },
    },
    orderBy:
      params.sort === 'oldest'
        ? { createdAt: 'asc' as const }
        : params.sort === 'newest' || !params.sort
          ? { createdAt: 'desc' as const }
          : { createdAt: 'desc' as const },
  });

  // Approved-only rating aggregation for current page.
  const productIds = products.map((p) => p.id);
  const ratingAggRows =
    productIds.length > 0
      ? await prisma.review.groupBy({
          by: ['productId'],
          where: {
            productId: { in: productIds },
            status: ReviewStatus.APPROVED,
          },
          _avg: { rating: true },
          _count: { id: true },
        })
      : [];

  const ratingMap = new Map<string, { ratingAverage: number; ratingCount: number }>(
    ratingAggRows.map((row) => [
      row.productId,
      {
        ratingAverage: row._avg.rating ?? 0,
        ratingCount: row._count.id,
      },
    ])
  );

  // Transform products to include min/max prices and featured image
  let transformedProducts = products.map((product) => {
    const prices = product.skus
      .map((sku) => {
        // Use festivePrice if available, otherwise sellingPrice
        const price = sku.festivePrice ? Number(sku.festivePrice) : Number(sku.sellingPrice);
        return price;
      })
      .filter((price) => !isNaN(price));

    const mrps = product.skus
      .map((sku) => Number(sku.mrp))
      .filter((m) => !isNaN(m));

    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const maxMrp = mrps.length > 0 ? Math.max(...mrps) : 0;

    const rating = ratingMap.get(product.id) ?? { ratingAverage: 0, ratingCount: 0 };

    return {
      id: product.id,
      name: product.name,
      slug: product.id, // Using ID as slug for now (can be enhanced later)
      description: product.description,
      isFeatured: product.isFeatured,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      categoryName: product.category?.name || null,
      minPrice,
      maxPrice,
      maxMrp,
      ratingAverage: rating.ratingAverage,
      ratingCount: rating.ratingCount,
      featuredImageUrl: product.featuredImageUrl ?? product.images[0]?.imageUrl ?? null,
    };
  });

  // Server-side sort modes (applied after enrichment).
  if (params.sort === 'priceLow') {
    transformedProducts.sort((a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0));
  } else if (params.sort === 'priceHigh') {
    transformedProducts.sort((a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0));
  } else if (params.sort === 'popularity') {
    transformedProducts.sort((a, b) => {
      const ra = b.ratingAverage - a.ratingAverage;
      if (ra !== 0) return ra;
      return (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
    });
  }

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
 * Returns full product info with images and all active SKUs (including out-of-stock).
 * Store listings still only show products that have at least one in-stock SKU; this
 * endpoint includes OOS variants so the PDP can show them with overlays/disabled CTAs.
 * Deep links still work when every variant is OOS (at least one active SKU must exist).
 */
export async function getProductDetail(productId: string) {
  logger.info('Fetching product detail', { productId });

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      // include featuredImageUrl (scalar) by default in result
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

  // Only return product if it's active and has at least one active SKU (in stock or not)
  if (!product.isActive) {
    logger.warn('Product is not active', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  if (product.skus.length === 0) {
    logger.warn('Product has no active SKUs', { productId });
    throw new AppError('NOT_FOUND', `Product with id '${productId}' not found`, 404);
  }

  logger.info('Product detail retrieved', { productId, skuCount: product.skus.length });

  // Approved-only rating aggregation
  const ratingAgg = await prisma.review.aggregate({
    where: { productId, status: ReviewStatus.APPROVED },
    _avg: { rating: true },
    _count: { id: true },
  });

  const ratingAverage = ratingAgg._avg.rating ?? 0;
  const ratingCount = ratingAgg._count.id;

  return {
    ...product,
    featuredImageUrl: product.featuredImageUrl ?? product.images?.[0]?.imageUrl ?? null,
    ratingAverage,
    ratingCount,
  };
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

