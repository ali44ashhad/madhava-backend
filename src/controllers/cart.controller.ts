
import { Request, Response } from 'express';
import * as cartService from '../services/cart.service.js';

export const getCartController = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.customer?.id;
        if (!customerId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const cart = await cartService.getCartService(customerId);
        res.status(200).json(cart);
    } catch (error) {
        console.error('Get Cart Error:', error);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
};

export const addItemToCartController = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.customer?.id;
        if (!customerId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { skuId, quantity } = req.body;

        if (!skuId || typeof quantity !== 'number' || quantity < 1) {
            res.status(400).json({ error: 'Invalid input. skuId and quantity >= 1 required.' });
            return;
        }

        const cart = await cartService.addItemToCartService(customerId, skuId, quantity);
        res.status(200).json(cart);
    } catch (error: any) {
        console.error('Add Item Error:', error);
        if (error.message === 'SKU not found or inactive') {
            res.status(404).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
};

export const updateCartItemController = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.customer?.id;
        if (!customerId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { itemId } = req.params;
        const { quantity } = req.body;

        if (typeof quantity !== 'number') {
            res.status(400).json({ error: 'Quantity must be a number' });
            return;
        }

        if (quantity < 1) {
            // Requirement: "If quantity = 0 → delete item". But usually PATCH with 0 is treated as delete or invalid. 
            // The prompt says "If quantity = 0 -> delete item".
            // Let's handle 0 as delete.
            if (quantity === 0) {
                const cart = await cartService.removeCartItemService(customerId, itemId);
                res.status(200).json(cart);
                return;
            }
            res.status(400).json({ error: 'Quantity must be >= 0' });
            return;
        }

        const cart = await cartService.updateCartItemService(customerId, itemId, quantity);
        res.status(200).json(cart);
    } catch (error: any) {
        console.error('Update Item Error:', error);
        if (error.message === 'Item not found in cart') {
            res.status(404).json({ error: error.message });
            return;
        }
        res.status(500).json({ error: 'Failed to update cart item' });
    }
};

export const removeCartItemController = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.customer?.id;
        if (!customerId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { itemId } = req.params;
        const cart = await cartService.removeCartItemService(customerId, itemId);
        res.status(200).json(cart);
    } catch (error) {
        console.error('Remove Item Error:', error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
};

export const clearCartController = async (req: Request, res: Response): Promise<void> => {
    try {
        const customerId = req.customer?.id;
        if (!customerId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        await cartService.clearCartService(customerId);
        res.status(200).json({ message: 'Cart cleared' });
    } catch (error) {
        console.error('Clear Cart Error:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
};
