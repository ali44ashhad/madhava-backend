import { Router } from 'express';
import { getCategoriesController, getProductsController, getProductDetailController, getSubcategoriesController } from '../controllers/catalog.controller.js';
import { placeOrderController, getMyOrdersController, getOrderByIdController, cancelMyOrderController } from '../controllers/order.controller.js';
import { createCustomerController } from '../controllers/customer.controller.js';
import { createAddressController, getCustomerAddressesController, updateAddressController, deleteAddressController } from '../controllers/address.controller.js';
import { requestReturnController } from '../controllers/return.controller.js';

const router = Router();

/**
 * Store routes (public catalog endpoints)
 * No authentication required
 */

// Categories
router.get('/categories', getCategoriesController);

// Subcategories
router.get('/subcategories', getSubcategoriesController);

// Products
router.get('/products', getProductsController);
router.get('/products/:productId', getProductDetailController);

// Customers
router.post('/customers', createCustomerController);

// Addresses
router.post('/addresses', createAddressController);
router.get('/addresses', getCustomerAddressesController);

import { customerAuthMiddleware } from '../middlewares/auth.middleware.js';

// Orders
router.post('/orders', customerAuthMiddleware, placeOrderController);
router.get('/orders', customerAuthMiddleware, getMyOrdersController);
router.get('/orders/:orderId', customerAuthMiddleware, getOrderByIdController);
router.post('/orders/:orderId/cancel', customerAuthMiddleware, cancelMyOrderController);
router.post('/orders/:orderItemId/return', customerAuthMiddleware, requestReturnController);

// Authenticated Address Routes (Update & Delete)
router.put('/addresses/:addressId', customerAuthMiddleware, updateAddressController);
router.delete('/addresses/:addressId', customerAuthMiddleware, deleteAddressController);

export default router;

