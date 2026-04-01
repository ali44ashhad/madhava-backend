import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/config/prisma.js';
import { placeOrder } from '../../src/services/order.service.js';
import { PaymentMethod } from '@prisma/client';

describe('Isolation Edge Cases - Concurrent Coupon Usage', () => {
  let customerId: string;
  let addressId: string;
  let sku1Id: string;
  let sku2Id: string;
  let couponId: string;
  let product1Id: string;
  let product2Id: string;
  let catId: string;
  let subcatId: string;
  const COUPON_CODE = `RACE-${Date.now()}`;

  beforeAll(async () => {
    let customer = await prisma.customer.create({
      data: { name: 'Coupon Racer', email: `racer-${Date.now()}@ex.com`, phone: '8888888888' },
    });
    customerId = customer.id;

    let address = await prisma.address.create({
      data: { customerId, name: 'Addr', phone: '8888888888', line1: '1', city: 'C', state: 'S', pincode: '1' },
    });
    addressId = address.id;

    const category = await prisma.category.create({
      data: { name: 'Cat', slug: `cat-c-${Date.now()}` },
    });
    catId = category.id;
    const subcategory = await prisma.subcategory.create({
      data: { name: 'Sub', slug: `sub-c-${Date.now()}`, categoryId: category.id },
    });
    subcatId = subcategory.id;
    const product1 = await prisma.product.create({
      data: { name: 'Prod1', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id },
    });
    product1Id = product1.id;
    const product2 = await prisma.product.create({
      data: { name: 'Prod2', description: 'desc', categoryId: category.id, subcategoryId: subcategory.id },
    });
    product2Id = product2.id;

    const sku1 = await prisma.sku.create({
      data: {
        productId: product1.id,
        skuCode: `SKU-C1-${Date.now()}`,
        mrp: 1000,
        sellingPrice: 100,
        stockQuantity: 100,
        isActive: true,
        isCodAllowed: true,
        gstPercent: 18,
        countryOfOrigin: 'Local',
        manufacturerName: 'Test',
        manufacturerAddress: 'Test',
        sellerName: 'Test',
        sellerAddress: 'Test',
        sellerPincode: '11',
      },
    });
    sku1Id = sku1.id;

    const sku2 = await prisma.sku.create({
      data: {
        productId: product2.id,
        skuCode: `SKU-C2-${Date.now()}`,
        mrp: 1000,
        sellingPrice: 100,
        stockQuantity: 100,
        isActive: true,
        isCodAllowed: true,
        gstPercent: 18,
        countryOfOrigin: 'Local',
        manufacturerName: 'Test',
        manufacturerAddress: 'Test',
        sellerName: 'Test',
        sellerAddress: 'Test',
        sellerPincode: '11',
      },
    });
    sku2Id = sku2.id;

    // Create a coupon strictly limited to 1 use PER CUSTOMER
    const coupon = await prisma.coupon.create({
      data: {
        code: COUPON_CODE,
        discountType: 'FLAT',
        discountValue: 10,
        usageLimitPerCustomer: 1, // Only 1 use allowed!
        isActive: true,
      }
    });
    couponId = coupon.id;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { order: { customerId } } });
    await prisma.couponUsage.deleteMany({ where: { customerId } });
    await prisma.orderItem.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });

    await prisma.coupon.delete({ where: { id: couponId } });
    await prisma.sku.deleteMany({ where: { id: { in: [sku1Id, sku2Id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [product1Id, product2Id] } } });
    await prisma.subcategory.deleteMany({ where: { id: subcatId } });
    await prisma.category.deleteMany({ where: { id: catId } });
    await prisma.address.delete({ where: { id: addressId } });
    await prisma.customer.delete({ where: { id: customerId } })

    await prisma.$disconnect();
  });

  it('should strictly enforce per-customer coupon limits even under concurrent race conditions across distinct SKUs', async () => {
    // Fire two identical requests with DIFFERENT SKUs so they don't safely serialize on the SKU inventory row lock.
    const req1 = placeOrder({
      customerId,
      addressId,
      paymentMethod: PaymentMethod.COD,
      items: [{ skuId: sku1Id, quantity: 1 }],
      couponCode: COUPON_CODE
    });

    const req2 = placeOrder({
      customerId,
      addressId,
      paymentMethod: PaymentMethod.COD,
      items: [{ skuId: sku2Id, quantity: 1 }],
      couponCode: COUPON_CODE
    });

    const results = await Promise.allSettled([req1, req2]);
    const successes = results.filter(r => r.status === 'fulfilled');

    // Expected ACID behavior: the user can only succeed in using the coupon ONCE.
    expect(successes.length).toBe(1);

    // Verify usage record in DB
    const usages = await prisma.couponUsage.findMany({ where: { customerId, couponId } });
    expect(usages.length).toBe(1);
  });
});
