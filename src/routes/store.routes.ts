import { Router } from 'express';
import { getCategoriesController, getProductsController, getProductDetailController, getSubcategoriesController } from '../controllers/catalog.controller.js';
import { placeOrderController } from '../controllers/order.controller.js';
import { createCustomerController } from '../controllers/customer.controller.js';
import { createAddressController, getCustomerAddressesController } from '../controllers/address.controller.js';
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

// Orders
router.post('/orders', placeOrderController);
router.post('/orders/:orderItemId/return', requestReturnController);

export default router;

