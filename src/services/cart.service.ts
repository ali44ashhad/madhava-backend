
import { CartResponse, CartItemResponse } from '../types/cart.types.js';
import { prisma } from '../config/prisma.js';

export const getCartService = async (customerId: string): Promise<CartResponse> => {
    const cart = await prisma.cart.findUnique({
        where: { customerId },
        include: {
            items: {
                include: {
                    sku: {
                        include: {
                            product: {
                                include: {
                                    images: {
                                        take: 1,
                                        orderBy: { sortOrder: 'asc' }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    sku: {
                        createdAt: 'desc' // consistent ordering
                    }
                }
            }
        }
    });

    if (!cart) {
        return { cartId: '', items: [] };
    }

    const items: CartItemResponse[] = cart.items.map(item => ({
        itemId: item.id,
        skuId: item.skuId,
        quantity: item.quantity,
        productName: item.sku.product.name,
        // Fallback to product image if SKU has none
        image: item.sku.product.images[0]?.imageUrl || '',
        sellingPrice: Number(item.sku.festivePrice ?? item.sku.sellingPrice),
        skuAttributes: {
            size: item.sku.size,
            color: item.sku.color,
            weight: item.sku.weight,
            material: item.sku.material
        }
    }));

    return {
        cartId: cart.id,
        items
    };
};

export const addItemToCartService = async (customerId: string, skuId: string, quantity: number): Promise<CartResponse> => {
    // 1. Validate SKU
    const sku = await prisma.sku.findUnique({
        where: { id: skuId, isActive: true },
        select: { id: true }
    });

    if (!sku) {
        throw new Error('SKU not found or inactive');
    }

    // 2. Find or create cart
    let cart = await prisma.cart.findUnique({
        where: { customerId }
    });

    if (!cart) {
        cart = await prisma.cart.create({
            data: { customerId }
        });
    }

    // 3. Check if item exists
    const existingItem = await prisma.cartItem.findUnique({
        where: {
            cartId_skuId: {
                cartId: cart.id,
                skuId
            }
        }
    });

    if (existingItem) {
        await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: { increment: quantity } }
        });
    } else {
        await prisma.cartItem.create({
            data: {
                cartId: cart.id,
                skuId,
                quantity
            }
        });
    }

    return getCartService(customerId);
};

export const updateCartItemService = async (customerId: string, itemId: string, quantity: number): Promise<CartResponse> => {
    if (quantity < 1) {
        throw new Error('Quantity must be at least 1');
    }

    // Ensure item belongs to user's cart
    const cart = await prisma.cart.findUnique({
        where: { customerId },
        select: { id: true }
    });

    if (!cart) throw new Error('Cart not found');

    const item = await prisma.cartItem.findFirst({
        where: { id: itemId, cartId: cart.id }
    });

    if (!item) throw new Error('Item not found in cart');

    await prisma.cartItem.update({
        where: { id: itemId },
        data: { quantity }
    });

    return getCartService(customerId);
};

export const removeCartItemService = async (customerId: string, itemId: string): Promise<CartResponse> => {
    const cart = await prisma.cart.findUnique({
        where: { customerId },
        select: { id: true }
    });

    if (!cart) throw new Error('Cart not found');

    // Use deleteMany to avoid error if item doesn't exist, strictly scoped to user's cart
    await prisma.cartItem.deleteMany({
        where: {
            id: itemId,
            cartId: cart.id
        }
    });

    return getCartService(customerId);
};

export const clearCartService = async (customerId: string): Promise<void> => {
    const cart = await prisma.cart.findUnique({
        where: { customerId },
        select: { id: true }
    });

    if (cart) {
        await prisma.cartItem.deleteMany({
            where: { cartId: cart.id }
        });
    }
};
