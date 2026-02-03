/**
 * Email data types and interfaces
 */

export interface EmailTemplate {
    subject: string;
    html: string;
}

export interface OrderItemSummary {
    productName: string;
    skuCode: string; // SKU code
    quantity: number;
    price: number;
}

export interface OrderPlacedData {
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    items: OrderItemSummary[];
    orderLink?: string; // Optional link to view order
}

export interface OrderApprovedData {
    orderNumber: string;
    customerName: string;
}

export interface OrderShippedData {
    orderNumber: string;
    customerName: string;
    courier: string;
    trackingId: string;
    trackingLink?: string;
}

export interface OrderDeliveredData {
    orderNumber: string;
    customerName: string;
}

export interface ReturnRequestedData {
    orderNumber: string;
    customerName: string;
    returnId: string;
}

export interface ReturnApprovedData {
    orderNumber: string;
    customerName: string;
    returnId: string;
}

export interface ReturnRejectedData {
    orderNumber: string;
    customerName: string;
    returnId: string;
    reason: string;
}

export interface RefundInitiatedData {
    orderNumber: string;
    customerName: string;
    amount: number;
    refundId: string;
}
