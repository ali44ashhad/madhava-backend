import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getCategories, getProducts, getProductDetail, getSubcategoriesByCategorySlug, GetProductsParams } from '../services/catalog.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for get products query parameters
 */
const getProductsQuerySchema = z.object({
  categorySlug: z.string().optional(),
  subcategorySlug: z.string().optional(),
  maxPrice: z.string().regex(/^\d+$/).transform(Number).optional(),
  q: z
    .preprocess((v) => {
      if (typeof v !== 'string') return v;
      const t = v.trim();
      return t.length > 0 ? t : undefined;
    }, z.string().max(100))
    .optional(),
  isFeatured: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.enum(['newest', 'oldest', 'priceLow', 'priceHigh', 'popularity']).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

/**
 * Get categories controller
 * GET /api/v1/store/categories
 */
export async function getCategoriesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Get categories request received');

    // Call service to get active categories
    const categories = await getCategories();

    // Return success response
    const response = createSuccessResponse(categories);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in get categories controller', error);
    next(error);
  }
}

/**
 * Get products controller
 * GET /api/v1/store/products
 */
export async function getProductsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Get products request received', { query: req.query });

    // Validate query parameters
    const validationResult = getProductsQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const params: GetProductsParams = {
      categorySlug: validationResult.data.categorySlug,
      subcategorySlug: validationResult.data.subcategorySlug,
      maxPrice: validationResult.data.maxPrice,
      q: validationResult.data.q,
      isFeatured: validationResult.data.isFeatured,
      sort: validationResult.data.sort,
      page: validationResult.data.page,
      limit: validationResult.data.limit,
    };

    // Validate page and limit if provided
    if (params.page !== undefined && params.page < 1) {
      throw new AppError('VALIDATION_ERROR', 'Page must be greater than 0', 400);
    }

    if (params.limit !== undefined && (params.limit < 1 || params.limit > 100)) {
      throw new AppError('VALIDATION_ERROR', 'Limit must be between 1 and 100', 400);
    }

    // Call service to get products
    const result = await getProducts(params);

    // Return success response
    const response = createSuccessResponse(result);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in get products controller', error);
    next(error);
  }
}

/**
 * Get product detail controller
 * GET /api/v1/store/products/:productId
 */
export async function getProductDetailController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.productId;
    logger.info('Get product detail request received', { productId });

    // Validate productId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(productId)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid product ID format', 400);
    }

    // Call service to get product detail
    const product = await getProductDetail(productId);

    // Return success response
    const response = createSuccessResponse(product);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in get product detail controller', error);
    next(error);
  }
}

/**
 * Get subcategories by category slug controller
 * GET /api/v1/store/subcategories?categorySlug=
 */
export async function getSubcategoriesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Get subcategories request received', { query: req.query });

    // Validate categorySlug is provided
    const categorySlug = req.query.categorySlug as string | undefined;
    if (!categorySlug || categorySlug.trim().length === 0) {
      throw new AppError('BAD_REQUEST', 'categorySlug query parameter is required', 400);
    }

    // Call service to get subcategories
    const subcategories = await getSubcategoriesByCategorySlug(categorySlug);

    // Return success response
    const response = createSuccessResponse(subcategories);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in get subcategories controller', error);
    next(error);
  }
}

