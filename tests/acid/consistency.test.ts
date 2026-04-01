import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/config/prisma.js';

describe('Consistency Properties - Database Transactions', () => {

  it('should reject a transaction if a foreign key constraint is violated, leaving the database consistent', async () => {
    // Attempt to create an order directly using Prisma Transaction with an invalid Customer ID
    const dbTransaction = prisma.$transaction(async (tx) => {
      // Step 1: Create a category
      const category = await tx.category.create({
        data: { name: 'Temp Category', slug: `temp-cat-${Date.now()}` },
      });

      // Step 2: create an order with an invalid customer ID
      // This violates the Customer-Order foreign key constraint
      await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          customerId: 'invalid-customer-id', // Does not exist
          addressSnapshot: {},
          status: 'PLACED',
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          subtotalAmount: 100,
          gstAmount: 18,
          codFee: 50,
          totalAmount: 168,
        },
      });

      return category;
    });

    // The transaction should throw a foreign key constraint error (P2003)
    await expect(dbTransaction).rejects.toThrow();

    // Verify consistency: The category created in Step 1 should NOT exist in the db
    const categoriesAtEnd = await prisma.category.findMany({ 
      where: { name: 'Temp Category' } 
    });
    
    expect(categoriesAtEnd.length).toBe(0);
  });

  it('should reject transactions with invalid inputs like negative quantities', async () => {
    // Attempting to place an order with a negative quantity should be blocked by the business logic,
    // ensuring the database is protected from corrupted numeric data.
    const { placeOrder } = await import('../../src/services/order.service.js');
    
    // We expect the function to throw an AppError before anything is written to the DB
    await expect(placeOrder({
      customerId: 'dummy-id',
      addressId: 'dummy-address-id',
      paymentMethod: 'COD',
      items: [{ skuId: 'dummy-sku', quantity: -5 }]
    })).rejects.toThrow('Invalid quantity for SKU');
  });
});
