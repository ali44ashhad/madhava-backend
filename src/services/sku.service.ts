import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Prisma } from '@prisma/client';

/**
 * Create SKU input
 */
export interface CreateSkuInput {
  skuCode: string;
  productId: string;
  size?: string;
  weight?: string;
  material?: string;
  color?: string;
  mrp: number;
  sellingPrice: number;
  festivePrice?: number;
  gstPercent: number;
  stockQuantity: number;
  isCodAllowed?: boolean;
  countryOfOrigin: string;
  manufacturerName: string;
  manufacturerAddress: string;
  sellerName: string;
  sellerAddress: string;
  sellerPincode: string;
}

export interface UpdateSkuInput {
  skuCode?: string;
  productId?: string;
  size?: string;
  weight?: string;
  material?: string;
  color?: string;
  mrp?: number;
  sellingPrice?: number;
  festivePrice?: number | null;
  gstPercent?: number;
  isCodAllowed?: boolean;
  isActive?: boolean;
  countryOfOrigin?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  sellerName?: string;
  sellerAddress?: string;
  sellerPincode?: string;
}

/**
 * SKU service
 * Handles business logic for SKU operations
 */
export async function createSku(input: CreateSkuInput) {
  logger.info('Creating SKU', { skuCode: input.skuCode, productId: input.productId });

  // Check if SKU code already exists
  const existingSku = await prisma.sku.findUnique({
    where: { skuCode: input.skuCode },
  });

  if (existingSku) {
    logger.warn('SKU creation failed: SKU code already exists', { skuCode: input.skuCode });
    throw new AppError('BAD_REQUEST', `SKU with code '${input.skuCode}' already exists`, 400);
  }

  // Validate that product exists
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
  });

  if (!product) {
    logger.warn('SKU creation failed: product not found', { productId: input.productId });
    throw new AppError('NOT_FOUND', `Product with id '${input.productId}' not found`, 404);
  }

  // Validate stock quantity
  if (input.stockQuantity < 0) {
    logger.warn('SKU creation failed: stock quantity is negative', { stockQuantity: input.stockQuantity });
    throw new AppError('VALIDATION_ERROR', 'Stock quantity must be greater than or equal to 0', 400);
  }

  // Validate prices are positive
  if (input.mrp <= 0) {
    logger.warn('SKU creation failed: MRP is not positive', { mrp: input.mrp });
    throw new AppError('VALIDATION_ERROR', 'MRP must be greater than 0', 400);
  }

  if (input.sellingPrice <= 0) {
    logger.warn('SKU creation failed: selling price is not positive', { sellingPrice: input.sellingPrice });
    throw new AppError('VALIDATION_ERROR', 'Selling price must be greater than 0', 400);
  }

  if (input.festivePrice !== undefined && input.festivePrice <= 0) {
    logger.warn('SKU creation failed: festive price is not positive', { festivePrice: input.festivePrice });
    throw new AppError('VALIDATION_ERROR', 'Festive price must be greater than 0', 400);
  }

  // Validate GST percent
  if (input.gstPercent < 0 || input.gstPercent > 100) {
    logger.warn('SKU creation failed: invalid GST percent', { gstPercent: input.gstPercent });
    throw new AppError('VALIDATION_ERROR', 'GST percent must be between 0 and 100', 400);
  }

  // Create SKU with isActive = true and isCodAllowed = true by default
  const sku = await prisma.sku.create({
    data: {
      skuCode: input.skuCode,
      productId: input.productId,
      size: input.size || null,
      weight: input.weight || null,
      material: input.material || null,
      color: input.color || null,
      mrp: new Prisma.Decimal(input.mrp),
      sellingPrice: new Prisma.Decimal(input.sellingPrice),
      festivePrice: input.festivePrice ? new Prisma.Decimal(input.festivePrice) : null,
      gstPercent: new Prisma.Decimal(input.gstPercent),
      stockQuantity: input.stockQuantity,
      isCodAllowed: input.isCodAllowed ?? true,
      isActive: true,
      countryOfOrigin: input.countryOfOrigin,
      manufacturerName: input.manufacturerName,
      manufacturerAddress: input.manufacturerAddress,
      sellerName: input.sellerName,
      sellerAddress: input.sellerAddress,
      sellerPincode: input.sellerPincode,
    },
    include: {
      product: true,
    },
  });

  logger.info('SKU created successfully', { skuId: sku.id });
  return sku;
}

export async function updateSku(skuId: string, input: UpdateSkuInput) {
  logger.info('Updating SKU', { skuId });

  const existing = await prisma.sku.findUnique({
    where: { id: skuId },
  });

  if (!existing) {
    logger.warn('Update SKU failed: SKU not found', { skuId });
    throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
  }

  const nextProductId = input.productId ?? existing.productId;
  if (input.productId !== undefined && input.productId !== existing.productId) {
    const product = await prisma.product.findUnique({
      where: { id: nextProductId },
    });
    if (!product) {
      throw new AppError('NOT_FOUND', `Product with id '${nextProductId}' not found`, 404);
    }
  }

  if (input.skuCode !== undefined && input.skuCode !== existing.skuCode) {
    const duplicate = await prisma.sku.findUnique({
      where: { skuCode: input.skuCode },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError('BAD_REQUEST', `SKU with code '${input.skuCode}' already exists`, 400);
    }
  }

  if (input.mrp !== undefined && input.mrp <= 0) {
    throw new AppError('VALIDATION_ERROR', 'MRP must be greater than 0', 400);
  }

  if (input.sellingPrice !== undefined && input.sellingPrice <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Selling price must be greater than 0', 400);
  }

  if (input.festivePrice !== undefined && input.festivePrice !== null && input.festivePrice <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Festive price must be greater than 0', 400);
  }

  if (input.gstPercent !== undefined && (input.gstPercent < 0 || input.gstPercent > 100)) {
    throw new AppError('VALIDATION_ERROR', 'GST percent must be between 0 and 100', 400);
  }

  const updated = await prisma.sku.update({
    where: { id: skuId },
    data: {
      skuCode: input.skuCode !== undefined ? input.skuCode : undefined,
      productId: input.productId !== undefined ? input.productId : undefined,
      size: input.size !== undefined ? input.size || null : undefined,
      weight: input.weight !== undefined ? input.weight || null : undefined,
      material: input.material !== undefined ? input.material || null : undefined,
      color: input.color !== undefined ? input.color || null : undefined,
      mrp: input.mrp !== undefined ? new Prisma.Decimal(input.mrp) : undefined,
      sellingPrice: input.sellingPrice !== undefined ? new Prisma.Decimal(input.sellingPrice) : undefined,
      festivePrice:
        input.festivePrice !== undefined
          ? input.festivePrice === null
            ? null
            : new Prisma.Decimal(input.festivePrice)
          : undefined,
      gstPercent: input.gstPercent !== undefined ? new Prisma.Decimal(input.gstPercent) : undefined,
      isCodAllowed: input.isCodAllowed !== undefined ? input.isCodAllowed : undefined,
      isActive: input.isActive !== undefined ? input.isActive : undefined,
      countryOfOrigin: input.countryOfOrigin !== undefined ? input.countryOfOrigin : undefined,
      manufacturerName: input.manufacturerName !== undefined ? input.manufacturerName : undefined,
      manufacturerAddress: input.manufacturerAddress !== undefined ? input.manufacturerAddress : undefined,
      sellerName: input.sellerName !== undefined ? input.sellerName : undefined,
      sellerAddress: input.sellerAddress !== undefined ? input.sellerAddress : undefined,
      sellerPincode: input.sellerPincode !== undefined ? input.sellerPincode : undefined,
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          images: {
            take: 1,
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
      images: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  logger.info('SKU updated successfully', { skuId: updated.id });
  return updated;
}

/**
 * Get SKU inventory
 * Returns inventory information for a SKU
 */
export async function getSkuInventory(skuId: string) {
  logger.info('Fetching SKU inventory', { skuId });

  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: {
      id: true,
      stockQuantity: true,
      isActive: true,
    },
  });

  if (!sku) {
    logger.warn('SKU inventory fetch failed: SKU not found', { skuId });
    throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
  }

  logger.info('SKU inventory fetched successfully', { skuId });
  return {
    skuId: sku.id,
    stockQuantity: sku.stockQuantity,
    isActive: sku.isActive,
  };
}

/**
 * Update SKU stock
 * Increments or decrements stock quantity with transaction safety
 */
export async function updateSkuStock(
  skuId: string,
  quantity: number,
  operation: 'INCREMENT' | 'DECREMENT',
  adminId: string
) {
  logger.info('Updating SKU stock', { skuId, quantity, operation, adminId });

  // Validate quantity
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    logger.warn('Stock update failed: invalid quantity', { quantity });
    throw new AppError('VALIDATION_ERROR', 'Quantity must be a positive integer', 400);
  }

  // Validate operation
  if (operation !== 'INCREMENT' && operation !== 'DECREMENT') {
    logger.warn('Stock update failed: invalid operation', { operation });
    throw new AppError('VALIDATION_ERROR', 'Operation must be INCREMENT or DECREMENT', 400);
  }

  // Use transaction to ensure atomicity
  const updatedSku = await prisma.$transaction(async (tx) => {
    // Fetch current SKU with lock (for update)
    const sku = await tx.sku.findUnique({
      where: { id: skuId },
      select: {
        id: true,
        stockQuantity: true,
        isActive: true,
      },
    });

    // Check if SKU exists
    if (!sku) {
      logger.warn('Stock update failed: SKU not found', { skuId });
      throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
    }

    // Check if SKU is active
    if (!sku.isActive) {
      logger.warn('Stock update failed: SKU is inactive', { skuId });
      throw new AppError('INVALID_STATE', `SKU with id '${skuId}' is inactive`, 400);
    }

    // Calculate new stock
    const currentStock = sku.stockQuantity;
    const newStock = operation === 'INCREMENT'
      ? currentStock + quantity
      : currentStock - quantity;

    // Prevent negative stock
    if (newStock < 0) {
      logger.warn('Stock update failed: would result in negative stock', {
        skuId,
        currentStock,
        quantity,
        operation,
        newStock,
      });
      throw new AppError(
        'VALIDATION_ERROR',
        `Cannot decrement stock. Current stock: ${currentStock}, requested decrement: ${quantity}`,
        400
      );
    }

    // Update stock
    const updated = await tx.sku.update({
      where: { id: skuId },
      data: {
        stockQuantity: newStock,
      },
      select: {
        id: true,
        skuCode: true,
        stockQuantity: true,
        isActive: true,
      },
    });

    // Log inventory update for audit
    logger.info('Inventory updated', {
      adminId,
      skuId: updated.id,
      operation,
      quantity,
      previousStock: currentStock,
      newStock: updated.stockQuantity,
      timestamp: new Date().toISOString(),
    });

    return updated;
  });

  logger.info('SKU stock updated successfully', {
    skuId: updatedSku.id,
    newStock: updatedSku.stockQuantity,
  });

  return updatedSku;
}

/**
 * Add image to SKU
 */
export async function addSkuImage(skuId: string, imageUrl: string, sortOrder: number = 0) {
  logger.info('Adding image to SKU', { skuId, imageUrl, sortOrder });

  // Check if SKU exists
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
  });

  if (!sku) {
    logger.warn('Add SKU image failed: SKU not found', { skuId });
    throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
  }

  // Create SKU image
  const skuImage = await prisma.skuImage.create({
    data: {
      skuId,
      imageUrl,
      sortOrder,
    },
  });

  logger.info('SKU image added successfully', { skuImageId: skuImage.id });
  return skuImage;
}

export async function listSkuImages(skuId: string) {
  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: { id: true },
  });

  if (!sku) {
    throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
  }

  return prisma.skuImage.findMany({
    where: { skuId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      imageUrl: true,
      sortOrder: true,
      skuId: true,
    },
  });
}

export async function deleteSkuImage(skuId: string, imageId: string) {
  logger.info('Deleting SKU image', { skuId, imageId });

  const image = await prisma.skuImage.findUnique({
    where: { id: imageId },
    select: { id: true, skuId: true },
  });

  if (!image) {
    throw new AppError('NOT_FOUND', `SKU image with id '${imageId}' not found`, 404);
  }

  if (image.skuId !== skuId) {
    throw new AppError('BAD_REQUEST', 'Image does not belong to the specified SKU', 400);
  }

  await prisma.skuImage.delete({
    where: { id: imageId },
  });

  logger.info('SKU image deleted successfully', { imageId });
  return { deleted: true };
}

export async function reorderSkuImages(
  skuId: string,
  updates: Array<{ id: string; sortOrder: number }>
) {
  logger.info('Reordering SKU images', { skuId, count: updates.length });

  const sku = await prisma.sku.findUnique({
    where: { id: skuId },
    select: { id: true },
  });

  if (!sku) {
    throw new AppError('NOT_FOUND', `SKU with id '${skuId}' not found`, 404);
  }

  const ids = updates.map((u) => u.id);
  const existing = await prisma.skuImage.findMany({
    where: { skuId, id: { in: ids } },
    select: { id: true },
  });

  if (existing.length !== ids.length) {
    throw new AppError('BAD_REQUEST', 'One or more images do not belong to the specified SKU', 400);
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.skuImage.update({
        where: { id: u.id },
        data: { sortOrder: u.sortOrder },
      })
    )
  );

  return listSkuImages(skuId);
}


/**
 * Get all SKUs with pagination and search
 */
export async function getAllSkus(
  page: number = 1,
  limit: number = 20,
  search?: string,
  stock?: string,
  productId?: string
) {
  logger.info('Fetching all SKUs', { page, limit, search, productId });

  const skip = (page - 1) * limit;

  // Build where clause for search
  const where: any = {
    isActive: true, // Only fetch active SKUs by default, or maybe all? Admin should see all? 
    // Let's assume admin sees all for now, but maybe we filter by deletedAt if we had soft delete.
    // The schema doesn't show soft delete, just isActive. 
    // Usually admin wants to see inactive ones too to toggle them.
    // So I will remove isActive: true restriction for admin listing, 
    // or make it optional filter. For now, show all.
  };

  // If we want to show all (active and inactive), we don't set isActive here.
  // However, the previous getSkuInventory only selected active status.

  if (productId) {
    where.productId = productId;
  }

  if (search) {
    where.OR = [
      { skuCode: { contains: search, mode: 'insensitive' } },
      { product: { name: { contains: search, mode: 'insensitive' } } },
      { manufacturerName: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (stock) {
    if (stock === 'out_of_stock') {
      where.stockQuantity = { lte: 0 };
    } else if (stock === 'low') {
      where.stockQuantity = { gt: 0, lte: 10 };
    } else if (stock === 'in_stock') {
      where.stockQuantity = { gt: 10 };
    }
  }

  const [skus, total] = await Promise.all([
    prisma.sku.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            images: {
              take: 1,
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        images: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    prisma.sku.count({ where }),
  ]);

  return {
    skus,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
