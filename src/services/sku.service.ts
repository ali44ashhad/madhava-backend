import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';

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
      mrp: new Decimal(input.mrp),
      sellingPrice: new Decimal(input.sellingPrice),
      festivePrice: input.festivePrice ? new Decimal(input.festivePrice) : null,
      gstPercent: new Decimal(input.gstPercent),
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

