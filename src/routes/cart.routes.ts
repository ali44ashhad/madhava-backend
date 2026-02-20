
import { Router } from 'express';
import { customerAuthMiddleware } from '../middlewares/auth.middleware.js';
import * as cartController from '../controllers/cart.controller.js';

const router = Router();

// Apply auth middleware to all cart routes
router.use(customerAuthMiddleware);

router.get('/', cartController.getCartController);
router.post('/items', cartController.addItemToCartController);
router.patch('/items/:itemId', cartController.updateCartItemController);
router.delete('/items/:itemId', cartController.removeCartItemController);
router.delete('/', cartController.clearCartController);

export default router;
