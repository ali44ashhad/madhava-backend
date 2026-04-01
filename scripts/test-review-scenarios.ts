/**
 * Rating & Review Scenario Tests
 *
 * This is a lightweight script (no Jest) that validates the critical rules:
 * - Customer can submit reviews only for DELIVERED orders
 * - One review per delivered order item
 * - Admin moderation gates public visibility (only APPROVED shows)
 * - Customer can edit only while review is PENDING
 *
 * Prerequisites:
 * - Dev server running (npm run dev in /server)
 * - Prisma DB reachable via DATABASE_URL
 *
 * Run:
 *   npx tsx scripts/test-review-scenarios.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../src/config/prisma.js';

const PORT = Number(process.env.PORT || 5012);
const BASE = `http://localhost:${PORT}/api/v1`;
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'access-secret';

const ADMIN_EMAIL = process.env.REVIEW_ADMIN_EMAIL || 'admin1@email.com';
const ADMIN_PASSWORD = process.env.REVIEW_ADMIN_PASSWORD || 'password';

const TEST_CATEGORY_SLUG = 'review-test-cat';
const TEST_SUBCATEGORY_SLUG = 'review-test-sub';
const TEST_PRODUCT_NAME = 'Review Test Product';

const TEST_CUSTOMER_EMAIL = `review_test_runner_${crypto.randomBytes(3).toString('hex')}@wmv.internal`;
const TEST_CUSTOMER_NAME = 'Review Test Runner';
const TEST_CUSTOMER_PHONE = '9000000000';

type HttpResult = { status: number; data: any };
type Result = { name: string; pass: boolean; detail?: string };

const results: Result[] = [];

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function pass(name: string, detail?: string) {
  results.push({ name, pass: true, detail });
  console.log(`  ${GREEN}PASS${RESET}  ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, pass: false, detail });
  console.log(`  ${RED}FAIL${RESET}  ${name}\n          ${detail}`);
}

function assertStatus(name: string, actual: number, expected: number, dataCheck?: () => string | null) {
  if (actual !== expected) {
    fail(name, `HTTP ${actual} (expected ${expected})`);
    return false;
  }
  const err = dataCheck?.();
  if (err) {
    fail(name, err);
    return false;
  }
  pass(name);
  return true;
}

async function http(method: string, path: string, token?: string, body?: unknown): Promise<HttpResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { status: res.status, data };
}

function signCustomerToken(customerId: string): string {
  return jwt.sign({ customerId, role: 'CUSTOMER' }, CUSTOMER_JWT_SECRET, { expiresIn: '15m' });
}

async function adminLogin(): Promise<string> {
  const res = await http('POST', '/admin/auth/login', undefined, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Admin login failed with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
  }
  const token = res.data?.data?.token;
  if (!token) {
    throw new Error(`Admin login response missing token: ${JSON.stringify(res.data)}`);
  }
  return token as string;
}

async function ensureAdmin() {
  const existing = await prisma.admin.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) return;

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

  await prisma.admin.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    },
  });
}

async function ensureCatalog() {
  let category = await prisma.category.findUnique({ where: { slug: TEST_CATEGORY_SLUG } });
  if (!category) {
    category = await prisma.category.create({
      data: { name: 'Review Test Category', slug: TEST_CATEGORY_SLUG, isActive: true },
    });
  }

  let subcategory = await prisma.subcategory.findFirst({ where: { slug: TEST_SUBCATEGORY_SLUG, categoryId: category.id } });
  if (!subcategory) {
    subcategory = await prisma.subcategory.create({
      data: { name: 'Review Test Subcategory', slug: TEST_SUBCATEGORY_SLUG, categoryId: category.id, isActive: true },
    });
  }

  let product = await prisma.product.findFirst({ where: { name: TEST_PRODUCT_NAME, categoryId: category.id, subcategoryId: subcategory.id } });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: TEST_PRODUCT_NAME,
        description: 'Used for review moderation tests',
        categoryId: category.id,
        subcategoryId: subcategory.id,
        isActive: true,
      },
    });
  }

  return { category, subcategory, product };
}

async function createSku(productId: string) {
  const skuCode = `REVIEW-SKU-${crypto.randomBytes(4).toString('hex')}`;
  return prisma.sku.create({
    data: {
      skuCode,
      productId,
      size: 'M',
      weight: '1kg',
      material: 'Cotton',
      color: 'Red',
      mrp: new Prisma.Decimal(1000),
      sellingPrice: new Prisma.Decimal(900),
      festivePrice: null,
      gstPercent: new Prisma.Decimal(18),
      stockQuantity: 999,
      isCodAllowed: true,
      isActive: true,
      countryOfOrigin: 'IN',
      manufacturerName: 'Test Manufacturer',
      manufacturerAddress: 'Test Address',
      sellerName: 'Test Seller',
      sellerAddress: 'Test Seller Address',
      sellerPincode: '000001',
    },
  });
}

function makeOrderNumber(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`.slice(0, 40);
}

async function createOrderWithSingleItem(args: {
  customerId: string;
  skuId: string;
  orderStatus: OrderStatus;
  deliveredAt?: Date;
}) {
  const { customerId, skuId, orderStatus, deliveredAt } = args;

  // Use SKU sellingPrice + a simple gst calculation for consistent totals.
  const sku = await prisma.sku.findUnique({ where: { id: skuId }, select: { sellingPrice: true, gstPercent: true } });
  if (!sku) throw new Error('SKU missing for order creation');

  const quantity = 1;
  const pricePerUnit = sku.sellingPrice;
  const gstPercent = sku.gstPercent;

  const totalPrice = new Prisma.Decimal(sku.sellingPrice).mul(quantity);
  const gstAmount = totalPrice.mul(gstPercent).div(100);
  const subtotalAmount = totalPrice;
  const codFee = new Prisma.Decimal(0);
  const totalAmount = subtotalAmount.plus(gstAmount).plus(codFee);

  const order = await prisma.order.create({
    data: {
      orderNumber: makeOrderNumber('ORD'),
      customerId,
      addressSnapshot: {
        name: TEST_CUSTOMER_NAME,
        phone: TEST_CUSTOMER_PHONE,
        line1: 'Test line1',
        line2: null,
        city: 'TestCity',
        state: 'TestState',
        pincode: '000001',
      },
      shippingInfo: null,
      status: orderStatus,
      paymentMethod: PaymentMethod.COD,
      paymentStatus: PaymentStatus.PAID,
      subtotalAmount,
      gstAmount,
      codFee,
      totalAmount,
      deliveredAt: deliveredAt ?? undefined,
      orderItems: {
        create: {
          skuId,
          skuSnapshot: { skuId, skuCode: 'test', at: new Date().toISOString() },
          quantity,
          pricePerUnit,
          gstPercent,
          totalPrice,
          discountAmount: new Prisma.Decimal(0),
          netTotalPrice: null,
          netPricePerUnit: null,
        },
      },
    },
    include: { orderItems: true },
  });

  return { orderId: order.id, orderItemId: order.orderItems[0].id, productId: sku ? skuId : undefined };
}

async function main() {
  console.log(`${CYAN}▶ Running review moderation scenario tests${RESET}`);

  const categoryBundle = await ensureCatalog();

  const customer = await prisma.customer.create({
    data: { name: TEST_CUSTOMER_NAME, email: TEST_CUSTOMER_EMAIL, phone: TEST_CUSTOMER_PHONE },
  });

  const { product } = categoryBundle;
  const sku = await createSku(product.id);
  const token = signCustomerToken(customer.id);

  await ensureAdmin();
  const adminToken = await adminLogin();

  // Create one non-delivered order item (should not allow review submission)
  const nonDelivered = await createOrderWithSingleItem({
    customerId: customer.id,
    skuId: sku.id,
    orderStatus: OrderStatus.SHIPPED,
  });

  // Create two delivered order items (one for approve flow, one for reject flow)
  const deliveredApproved = await createOrderWithSingleItem({
    customerId: customer.id,
    skuId: sku.id,
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  });

  const deliveredRejected = await createOrderWithSingleItem({
    customerId: customer.id,
    skuId: sku.id,
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
  });

  // Non-delivered should fail
  const create1 = await http('POST', '/store/reviews', token, {
    orderItemId: nonDelivered.orderItemId,
    rating: 5,
    title: 'Nice',
    comment: 'Should not be allowed before delivery',
  });
  assertStatus('reject review on non-delivered order', create1.status, 400);

  // Delivered should succeed (PENDING by default)
  const create2 = await http('POST', '/store/reviews', token, {
    orderItemId: deliveredApproved.orderItemId,
    rating: 4,
    title: 'Good product',
    comment: 'Looks great',
  });
  assertStatus('create pending review on delivered order', create2.status, 201, () => {
    const review = create2.data?.data;
    if (!review) return 'missing review in response';
    if (review.status !== 'PENDING') return `expected status PENDING, got ${review.status}`;
    return null;
  });

  const pendingReviewId = create2.data.data.id as string;
  const productId = product.id;

  // Pending review should not appear publicly
  const listBeforeApprove = await http('GET', `/store/products/${productId}/reviews`);
  const reviewsBefore = listBeforeApprove.data?.data?.reviews ?? [];
  const containsPending = reviewsBefore.some((r: any) => r.id === pendingReviewId);
  if (containsPending) {
    fail('pending review not visible publicly', 'pending review was returned in approved list');
  } else {
    pass('pending review not visible publicly');
  }

  // Uniqueness: creating a second review for same order item should fail
  const createDup = await http('POST', '/store/reviews', token, {
    orderItemId: deliveredApproved.orderItemId,
    rating: 2,
    title: 'Duplicate',
  });
  assertStatus('unique review per order item', createDup.status, 400);

  // Edit while pending should work
  const update1 = await http('PATCH', `/store/reviews/${pendingReviewId}`, token, { rating: 3 });
  assertStatus('edit pending review', update1.status, 200, () => {
    const review = update1.data?.data;
    if (!review) return 'missing updated review';
    if (review.rating !== 3) return `expected rating 3, got ${review.rating}`;
    if (review.status !== 'PENDING') return `expected status PENDING after edit, got ${review.status}`;
    return null;
  });

  // Admin approve
  const approveRes = await http('PATCH', `/admin/reviews/${pendingReviewId}/approve`, adminToken, {});
  assertStatus('admin approve pending review', approveRes.status, 200, () => {
    const review = approveRes.data?.data;
    if (!review) return 'missing approved review';
    if (review.status !== 'APPROVED') return `expected status APPROVED, got ${review.status}`;
    return null;
  });

  // Approved review should appear publicly
  const listAfterApprove = await http('GET', `/store/products/${productId}/reviews`);
  const reviewsAfter = listAfterApprove.data?.data?.reviews ?? [];
  const containsApproved = reviewsAfter.some((r: any) => r.id === pendingReviewId);
  if (!containsApproved) {
    fail('approved review visible publicly', 'approved review not present in list');
  } else {
    pass('approved review visible publicly');
  }

  // Editing after approval should fail
  const updateAfter = await http('PATCH', `/store/reviews/${pendingReviewId}`, token, { rating: 1 });
  assertStatus('edit after approval is blocked', updateAfter.status, 400);

  // Create another delivered review to test rejection
  const create3 = await http('POST', '/store/reviews', token, {
    orderItemId: deliveredRejected.orderItemId,
    rating: 2,
    title: 'Rejected review',
    comment: 'This will be rejected',
  });
  assertStatus('create second pending review', create3.status, 201);

  const rejectedReviewId = create3.data.data.id as string;

  // Admin reject
  const rejectRes = await http('PATCH', `/admin/reviews/${rejectedReviewId}/reject`, adminToken, {
    reason: 'Not a valid purchase / suspected spam',
  });
  assertStatus('admin reject pending review', rejectRes.status, 200, () => {
    const review = rejectRes.data?.data;
    if (!review) return 'missing rejected review';
    if (review.status !== 'REJECTED') return `expected status REJECTED, got ${review.status}`;
    return null;
  });

  // Rejected review should never appear publicly
  const listAfterReject = await http('GET', `/store/products/${productId}/reviews`);
  const reviewsAfterReject = listAfterReject.data?.data?.reviews ?? [];
  const containsRejected = reviewsAfterReject.some((r: any) => r.id === rejectedReviewId);
  if (containsRejected) {
    fail('rejected review not visible publicly', 'rejected review was returned in approved list');
  } else {
    pass('rejected review not visible publicly');
  }

  // Admin queue check (pending should now be empty after approvals/rejections for these ids)
  const adminPendingList = await http('GET', `/admin/reviews?status=PENDING`, adminToken);
  if (adminPendingList.status !== 200) {
    fail('admin pending queue responds', `HTTP ${adminPendingList.status}`);
  } else {
    const pendingQueue = adminPendingList.data?.data?.reviews ?? [];
    const stillPending = pendingQueue.some((r: any) => r.id === pendingReviewId || r.id === rejectedReviewId);
    if (stillPending) fail('admin pending queue excludes handled reviews', 'some handled review ids are still pending');
    else pass('admin pending queue excludes handled reviews');
  }

  // Cleanup
  // Delete only our created objects to keep DB stable for local runs.
  try {
    await prisma.review.deleteMany({
      where: {
        orderItemId: {
          in: [nonDelivered.orderItemId, deliveredApproved.orderItemId, deliveredRejected.orderItemId],
        },
      },
    });

    await prisma.orderItem.deleteMany({
      where: {
        id: {
          in: [nonDelivered.orderItemId, deliveredApproved.orderItemId, deliveredRejected.orderItemId],
        },
      },
    });

    await prisma.order.deleteMany({
      where: {
        id: {
          in: [nonDelivered.orderId, deliveredApproved.orderId, deliveredRejected.orderId],
        },
      },
    });

    await prisma.sku.delete({ where: { id: sku.id } });

    // Note: We intentionally do not delete Product/Category/Subcategory to avoid affecting other dev/test flows.
  } catch (e) {
    console.warn('Cleanup failed (continuing):', e);
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n${GREEN}${passed}/${total} checks passed${RESET}`);

  // Exit code
  if (passed !== total) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('Test script failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

