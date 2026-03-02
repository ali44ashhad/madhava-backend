import { Router } from 'express';
import { adminLogin } from '../controllers/admin-auth.controller.js';
import { getMe } from '../controllers/admin.controller.js';
import { getDashboard } from '../controllers/dashboard.controller.js';
import { createCategoryController, listCategoriesController, updateCategoryController } from '../controllers/category.controller.js';
import { createSubcategoryController, listSubcategoriesController, updateSubcategoryController } from '../controllers/subcategory.controller.js';
import { createProductController, addProductImageController, listProductsController } from '../controllers/product.controller.js';
import { createSkuController, getSkuInventoryController, updateSkuStockController, addSkuImageController, listSkusController } from '../controllers/sku.controller.js';
import { approveOrderController, putOrderOnHoldController, cancelOrderController, markOrderAsShippedController, markOrderAsDeliveredController, listOrdersController, cleanupStaleOrdersController } from '../controllers/order.controller.js';
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
router.get('/dashboard', getDashboard);

// Category management
router.post('/categories', createCategoryController);
router.get('/categories', listCategoriesController);
router.put('/categories/:id', updateCategoryController);

// Subcategory management
router.post('/subcategories', createSubcategoryController);
router.get('/subcategories', listSubcategoriesController);
router.put('/subcategories/:id', updateSubcategoryController);

// Product management
router.post('/products', createProductController);
router.get('/products', listProductsController);
router.post('/products/:productId/images', addProductImageController);

// SKU management
router.get('/skus', listSkusController);
router.post('/skus', createSkuController);
router.get('/skus/:skuId/inventory', getSkuInventoryController);
router.patch('/skus/:skuId/stock', updateSkuStockController);
router.post('/skus/:skuId/images', addSkuImageController);

// Order management
router.get('/orders', listOrdersController);
router.post('/orders/cleanup-stale', cleanupStaleOrdersController);
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

