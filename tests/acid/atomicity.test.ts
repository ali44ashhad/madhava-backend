import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { placeOrder } from '../../src/services/order.service.js';
import { PaymentMethod } from '@prisma/client';
import { razorpay } from '../../src/config/index.js';

describe('Atomicity Properties - Database Transactions', () => {
  let customerId: string;
  let addressId: string;
  let skuId: string;
  let originalStock: number = 10;

  beforeAll(async () => {
    // Setup test data
    const customer = await prisma.customer.create({
      data: {
        name: 'Test Atomicity',
        email: `test-atomicity-${Date.now()}@example.com`,
        phone: '9999999999',
      },
    });
    customerId = customer.id;

    const address = await prisma.address.create({
      data: {
        customerId,
        name: 'Test Address',
        phone: '9999999999',
        line1: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
      },
    });
    addressId = address.id;

    const category = await prisma.category.create({
      data: { name: 'Test Category', slug: `test-cat-${Date.now()}` },
    });

    const subcategory = await prisma.subcategory.create({
      data: { name: 'Test Subcat', slug: `test-subcat-${Date.now()}`, categoryId: category.id },
    });

    const product = await prisma.product.create({
      data: {
        name: 'Atomicity Test Product',
        description: 'Test product for atomicity',
        categoryId: category.id,
        subcategoryId: subcategory.id,
      },
    });

    const sku = await prisma.sku.create({
      data: {
        productId: product.id,
        skuCode: `TEST-SKU-${Date.now()}`,
        mrp: 1000,
        sellingPrice: 800,
        stockQuantity: originalStock,
        isActive: true,
        isCodAllowed: true,
        gstPercent: 18,
        countryOfOrigin: 'Local',
        manufacturerName: 'Test Mfg',
        manufacturerAddress: 'Test Addr',
        sellerName: 'Test Seller',
        sellerAddress: 'Test Seller Addr',
        sellerPincode: '111111',
      },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    // Cleanup test data
    // Delete SKUs and Products
    await prisma.sku.delete({ where: { id: skuId }});
    await prisma.product.deleteMany({ where: { name: 'Atomicity Test Product' } });
    await prisma.subcategory.deleteMany({ where: { name: 'Test Subcat' } });
    await prisma.category.deleteMany({ where: { name: 'Test Category' } });
    
    // Delete Address, Customer
    await prisma.address.delete({ where: { id: addressId } });
    await prisma.customer.delete({ where: { id: customerId } });

    await prisma.$disconnect();
  });

  it('should rollback item creation, stock deduction, and order creation if payment creation fails', async () => {
    // Mock Razorpay to throw an error after order is partially created in the transaction
    if (!razorpay) throw new Error("Razorpay instance not found");
    const razorpayMock = vi.spyOn(razorpay.orders, 'create').mockRejectedValue(new Error('Simulated Razorpay Failure'));

    const input = {
      customerId,
      addressId,
      paymentMethod: PaymentMethod.RAZORPAY,
      items: [{ skuId, quantity: 2 }],
    };

    // The order placement should fail
    await expect(placeOrder(input)).rejects.toThrow('Failed to initialize payment gateway');

    // VERIFY ATOMICITY (ROLLBACK)
    // 1. Stock should NOT be deducted
    const skuAfter = await prisma.sku.findUnique({ where: { id: skuId } });
    expect(skuAfter?.stockQuantity).toBe(originalStock); // Should still be 10

    // 2. Order should NOT exist
    const orders = await prisma.order.findMany({ where: { customerId } });
    expect(orders.length).toBe(0);

    razorpayMock.mockRestore();
  });
});
