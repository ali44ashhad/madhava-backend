import { Router } from 'express';
import { adminLogin } from '../controllers/admin-auth.controller.js';
import { getMe } from '../controllers/admin.controller.js';
import { createCategoryController, listCategoriesController } from '../controllers/category.controller.js';
import { createSubcategoryController, listSubcategoriesController } from '../controllers/subcategory.controller.js';
import { createProductController } from '../controllers/product.controller.js';
import { createSkuController, getSkuInventoryController, updateSkuStockController } from '../controllers/sku.controller.js';
import { approveOrderController, putOrderOnHoldController, cancelOrderController, markOrderAsShippedController, markOrderAsDeliveredController } from '../controllers/order.controller.js';
import { listReturnRequestsController, approveReturnController, rejectReturnController } from '../controllers/return.controller.js';
import { initiateRefundController } from '../controllers/refund.controller.js';
import { adminAuth } from '../middlewares/adminAuth.middleware.js';

const router = Router();

/**
 * Admin routes
 * All routes except /auth/login require authentication
 */

// Public login endpoint (must be before middleware)
router.post('/auth/login', adminLogin);

// Apply adminAuth middleware to all routes below
router.use(adminAuth);

// Protected routes
router.get('/me', getMe);

// Category management
router.post('/categories', createCategoryController);
router.get('/categories', listCategoriesController);

// Subcategory management
router.post('/subcategories', createSubcategoryController);
router.get('/subcategories', listSubcategoriesController);

// Product management
router.post('/products', createProductController);

// SKU management
router.post('/skus', createSkuController);
router.get('/skus/:skuId/inventory', getSkuInventoryController);
router.patch('/skus/:skuId/stock', updateSkuStockController);

// Order management
router.post('/orders/:orderId/approve', approveOrderController);
router.post('/orders/:orderId/on-hold', putOrderOnHoldController);
router.post('/orders/:orderId/cancel', cancelOrderController);
router.post('/orders/:orderId/ship', markOrderAsShippedController);
router.post('/orders/:orderId/deliver', markOrderAsDeliveredController);
router.post('/orders/:orderId/refund', initiateRefundController);

// Returns & Refunds
router.get('/returns', listReturnRequestsController);
router.post('/returns/:returnId/approve', approveReturnController);
router.post('/returns/:returnId/reject', rejectReturnController);

export default router;

