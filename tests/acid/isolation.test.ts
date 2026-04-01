import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { placeOrder } from '../../src/services/order.service.js';
import { PaymentMethod } from '@prisma/client';

describe('Isolation Properties - Database Transactions (Concurrent Race Condition)', () => {
  let customer1Id: string;
  let customer1AddressId: string;
  let customer2Id: string;
  let customer2AddressId: string;
  let skuId: string;

  beforeAll(async () => {
    // Setup test data
    let customer1 = await prisma.customer.create({
      data: { name: 'Test C1', email: `test-isol1-${Date.now()}@ex.com`, phone: '9999999991' },
    });
    customer1Id = customer1.id;
    let customer2 = await prisma.customer.create({
      data: { name: 'Test C2', email: `test-isol2-${Date.now()}@ex.com`, phone: '9999999992' },
    });
    customer2Id = customer2.id;

    let address1 = await prisma.address.create({
      data: { customerId: customer1Id, name: 'Addr1', phone: '9999999991', line1: '1', city: 'C', state: 'S', pincode: '1' },
    });
    customer1AddressId = address1.id;

    let address2 = await prisma.address.create({
      data: { customerId: customer2Id, name: 'Addr2', phone: '9999999992', line1: '2', city: 'C', state: 'S', pincode: '2' },
    });
    customer2AddressId = address2.id;

    const category = await prisma.category.create({
      data: { name: 'Test Category', slug: `test-cat-iso-${Date.now()}` },
    });
    const subcategory = await prisma.subcategory.create({
      data: { name: 'Test Subcat', slug: `test-subcat-iso-${Date.now()}`, categoryId: category.id },
    });
    const product = await prisma.product.create({
      data: { name: 'Iso Test Product', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id },
    });

    const sku = await prisma.sku.create({
      data: {
        productId: product.id,
        skuCode: `TEST-SKU-ISO-${Date.now()}`,
        mrp: 1000,
        sellingPrice: 800,
        stockQuantity: 1, // Only 1 in stock!
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
    // Delete test orders first to satisfy foreign keys
    await prisma.payment.deleteMany({ where: { order: { customerId: { in: [customer1Id, customer2Id] } } } });
    await prisma.orderItem.deleteMany({ where: { order: { customerId: { in: [customer1Id, customer2Id] } } } });
    await prisma.order.deleteMany({ where: { customerId: { in: [customer1Id, customer2Id] } } });
    
    // Delete catalog data
    await prisma.sku.delete({ where: { id: skuId }});
    await prisma.product.deleteMany({ where: { name: 'Iso Test Product' } });
    await prisma.subcategory.deleteMany({ where: { name: 'Test Subcat' } });
    await prisma.category.deleteMany({ where: { name: 'Test Category' } });
    
    // Delete Address, Customer
    await prisma.address.delete({ where: { id: customer1AddressId } });
    await prisma.customer.delete({ where: { id: customer1Id } });
    await prisma.address.delete({ where: { id: customer2AddressId } });
    await prisma.customer.delete({ where: { id: customer2Id } });

    await prisma.$disconnect();
  });

  it('should prevent race conditions when two users try to order the last item concurrently', async () => {
    // We have only 1 item in stock. We run two concurrent placeOrder calls.
    // One should succeed, the other should fail with an OUT_OF_STOCK AppError or similar rollback.
    // If BOTH succeed, there is an Isolation bug (Overselling / DB Race Condition).

    const promise1 = placeOrder({
      customerId: customer1Id,
      addressId: customer1AddressId,
      paymentMethod: PaymentMethod.COD,
      items: [{ skuId, quantity: 1 }],
    });

    const promise2 = placeOrder({
      customerId: customer2Id,
      addressId: customer2AddressId,
      paymentMethod: PaymentMethod.COD,
      items: [{ skuId, quantity: 1 }],
    });

    const results = await Promise.allSettled([promise1, promise2]);
    
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    // Expected ACID behavior: Exactly one succeeds, exactly one fails.
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify database reflects exact 1 item sold, and 0 remaining stock
    const skuAfter = await prisma.sku.findUnique({ where: { id: skuId } });
    expect(skuAfter?.stockQuantity).toBe(0);
  });
});
