
export interface AddToCartRequest {
    skuId: string;
    quantity: number;
}

export interface UpdateCartItemRequest {
    quantity: number;
}

export interface CartItemResponse {
    itemId: string;
    skuId: string;
    quantity: number;
    productName: string;
    image: string;
    sellingPrice: number;
    skuAttributes: {
        size?: string | null;
        color?: string | null;
        weight?: string | null;
        material?: string | null;
    };
}

export interface CartResponse {
    cartId: string;
    items: CartItemResponse[];
}
