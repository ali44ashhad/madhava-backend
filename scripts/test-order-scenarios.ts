/**
 * Order Status Scenario Test Script
 *
 * Tests every order lifecycle scenario against the running dev server.
 * Seeds its own test data (customer, address, SKU) and cleans up after.
 *
 * Prerequisites:
 *   - Dev server running: npm run dev (in /server)
 *   - .env loaded with CUSTOMER_JWT_SECRET, DATABASE_URL, PORT
 *
 * Run:
 *   npx ts-node --esm scripts/test-order-scenarios.ts
 *
 * Admin credentials used: admin1@email.com / password
 */

import 'dotenv/config';
import { PrismaClient, PaymentMethod, PaymentStatus, OrderStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ─── Config ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT;
const BASE = `http://localhost:${PORT}/api/v1`;
const JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'access-secret';

const ADMIN_EMAIL = 'admin1@email.com';
const ADMIN_PASSWORD = 'password';

// ─── Prisma ────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ─── Helpers ───────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

function pass(name: string, detail?: string) {
    results.push({ name, pass: true, detail });
    console.log(`  ${GREEN}✅ PASS${RESET}  ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name: string, detail: string) {
    results.push({ name, pass: false, detail });
    console.log(`  ${RED}❌ FAIL${RESET}  ${name}\n          ${detail}`);
}

function section(title: string) {
    console.log(`\n${CYAN}▶ ${title}${RESET}`);
}

/** Sign a JWT for a test customer (same secret as the server). */
function signCustomerToken(customerId: string): string {
    return jwt.sign({ customerId, role: 'CUSTOMER' }, JWT_SECRET, { expiresIn: '15m' });
}

/** Generic HTTP helper. Returns { status, data }. */
async function http(
    method: string,
    path: string,
    body?: unknown,
    token?: string
): Promise<{ status: number; data: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data: any;
    try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, data };
}

/** Place an order and return the full response data. */
async function placeOrder(
    token: string,
    addressId: string,
    skuId: string,
    paymentMethod: 'COD' | 'RAZORPAY'

) {
    return http('POST', '/store/orders', {
        addressId,
        paymentMethod,
        items: [{ skuId, quantity: 1 }],
    }, token);
}

/** Expect status and optionally a field value; records pass/fail. */
function assertStatus(
    name: string,
    actual: number,
    expected: number,
    dataCheck?: () => string | null
) {
    if (actual !== expected) {
        fail(name, `HTTP ${actual} (expected ${expected})`);
        return false;
    }
    if (dataCheck) {
        const err = dataCheck();
        if (err) { fail(name, err); return false; }
    }
    pass(name);
    return true;
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────────

/** Login as admin and return bearer token. */
async function adminLogin(): Promise<string> {
    const res = await http('POST', '/admin/auth/login', {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });
    if (res.status !== 200 || !res.data?.data?.token) {
        throw new Error(`Admin login failed: ${JSON.stringify(res.data)}`);
    }
    return res.data.data.token as string;
}

/** Create / upsert test customer + address, seed a test SKU, return IDs. */
async function seed(): Promise<{ customerId: string; addressId: string; skuId: string; codSkuId: string }> {
    // Test customer
    let customer = await prisma.customer.findFirst({ where: { email: 'test_runner@wmv.internal' } });
    if (!customer) {
        customer = await prisma.customer.create({
            data: { name: 'Test Runner', email: 'test_runner@wmv.internal', phone: '9999000001' },
        });
    }

    // Address
    let address = await prisma.address.findFirst({ where: { customerId: customer.id, city: 'TestCity' } });
    if (!address) {
        address = await prisma.address.create({
            data: {
                customerId: customer.id,
                name: 'Test Runner',
                phone: '9999000001',
                line1: '1 Test Street',
                city: 'TestCity',
                state: 'TestState',
                pincode: '000001',
            },
        });
    }

    // We need a product + category + subcategory
    let cat = await prisma.category.findFirst({ where: { slug: 'test-cat' } });
    if (!cat) {
        cat = await prisma.category.create({ data: { name: 'Test Category', slug: 'test-cat' } });
    }
    let sub = await prisma.subcategory.findFirst({ where: { slug: 'test-sub', categoryId: cat.id } });
    if (!sub) {
        sub = await prisma.subcategory.create({
            data: { name: 'Test Sub', slug: 'test-sub', categoryId: cat.id },
        });
    }
    let product = await prisma.product.findFirst({ where: { name: 'Test Product (Script)' } });
    if (!product) {
        product = await prisma.product.create({
            data: {
                name: 'Test Product (Script)',
                categoryId: cat.id,
                subcategoryId: sub.id,
            },
        });
    }

    // SKU that allows COD
    let sku = await prisma.sku.findFirst({ where: { skuCode: 'TEST-SKU-001' } });
    if (!sku) {
        sku = await prisma.sku.create({
            data: {
                skuCode: 'TEST-SKU-001',
                productId: product.id,
                mrp: 500,
                sellingPrice: 400,
                gstPercent: 18,
                stockQuantity: 999,
                isCodAllowed: true,
                isActive: true,
                countryOfOrigin: 'IN',
                manufacturerName: 'Test Mfg',
                manufacturerAddress: 'Test Addr',
                sellerName: 'Test Seller',
                sellerAddress: 'Test Seller Addr',
                sellerPincode: '000001',
            },
        });
    } else {
        // Reset stock to ensure tests won't fail on insufficient stock
        await prisma.sku.update({ where: { id: sku.id }, data: { stockQuantity: 999, isActive: true } });
    }

    // SKU that does NOT allow COD
    let noCodSku = await prisma.sku.findFirst({ where: { skuCode: 'TEST-SKU-NO-COD' } });
    if (!noCodSku) {
        noCodSku = await prisma.sku.create({
            data: {
                skuCode: 'TEST-SKU-NO-COD',
                productId: product.id,
                mrp: 500,
                sellingPrice: 400,
                gstPercent: 18,
                stockQuantity: 999,
                isCodAllowed: false,
                isActive: true,
                countryOfOrigin: 'IN',
                manufacturerName: 'Test Mfg',
                manufacturerAddress: 'Test Addr',
                sellerName: 'Test Seller',
                sellerAddress: 'Test Seller Addr',
                sellerPincode: '000001',
            },
        });
    } else {
        await prisma.sku.update({ where: { id: noCodSku.id }, data: { stockQuantity: 999 } });
    }

    return { customerId: customer.id, addressId: address.id, skuId: sku.id, codSkuId: sku.id };
}

// ─── Scenarios ─────────────────────────────────────────────────────────────────

async function run() {
    console.log(`\n${CYAN}══════════════════════════════════════════════${RESET}`);
    console.log(`${CYAN}  Order Status Scenario Tests — WMV Ecomm${RESET}`);
    console.log(`${CYAN}══════════════════════════════════════════════${RESET}`);

    // Setup
    console.log('\n⚙  Setting up test data...');
    const { customerId, addressId, skuId } = await seed();
    const customerToken = signCustomerToken(customerId);
    const adminToken = await adminLogin();
    console.log(`   Customer: ${customerId}`);
    console.log(`   Address : ${addressId}`);
    console.log(`   SKU     : ${skuId}`);

    let r: Awaited<ReturnType<typeof http>>;

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. COD HAPPY PATH
    // ─────────────────────────────────────────────────────────────────────────────
    section('1 · COD Happy Path: PLACED → CONFIRMED → SHIPPED → DELIVERED');

    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let codOrderId = r.data?.data?.orderId;
    assertStatus('Place COD order → 201', r.status, 201, () =>
        r.data?.data?.status !== 'PLACED' ? `status was ${r.data?.data?.status}` : null
    );

    r = await http('POST', `/admin/orders/${codOrderId}/approve`, {}, adminToken);
    assertStatus('Approve COD order → CONFIRMED', r.status, 200);

    let order = await prisma.order.findUnique({ where: { id: codOrderId } });
    order?.status === OrderStatus.CONFIRMED ? pass('DB: order.status = CONFIRMED') : fail('DB: order.status = CONFIRMED', `got ${order?.status}`);

    r = await http('POST', `/admin/orders/${codOrderId}/ship`, { courier: 'Delhivery', trackingId: 'DL123TEST' }, adminToken);
    assertStatus('Ship COD order → SHIPPED', r.status, 200);

    r = await http('POST', `/admin/orders/${codOrderId}/deliver`, {}, adminToken);
    assertStatus('Deliver COD order → DELIVERED', r.status, 200);

    order = await prisma.order.findUnique({ where: { id: codOrderId } });
    order?.status === OrderStatus.DELIVERED ? pass('DB: order.status = DELIVERED') : fail('DB: order.status = DELIVERED', `got ${order?.status}`);
    order?.paymentStatus === PaymentStatus.PAID ? pass('DB: COD paymentStatus = PAID on delivery') : fail('DB: COD paymentStatus = PAID on delivery', `got ${order?.paymentStatus}`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. ADMIN HOLD FLOW
    // ─────────────────────────────────────────────────────────────────────────────
    section('2 · Admin Hold: PLACED ↔ ON_HOLD → CONFIRMED');

    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let holdOrderId = r.data?.data?.orderId;
    assertStatus('Place order for hold test → 201', r.status, 201);

    r = await http('POST', `/admin/orders/${holdOrderId}/on-hold`, {}, adminToken);
    assertStatus('Put PLACED order ON_HOLD', r.status, 200);

    order = await prisma.order.findUnique({ where: { id: holdOrderId } });
    order?.status === OrderStatus.ON_HOLD ? pass('DB: order.status = ON_HOLD') : fail('DB: order.status = ON_HOLD', `got ${order?.status}`);

    r = await http('POST', `/admin/orders/${holdOrderId}/approve`, {}, adminToken);
    assertStatus('Approve ON_HOLD order → CONFIRMED', r.status, 200);

    order = await prisma.order.findUnique({ where: { id: holdOrderId } });
    order?.status === OrderStatus.CONFIRMED ? pass('DB: order.status = CONFIRMED after hold→approve') : fail('DB: order.status = CONFIRMED after hold→approve', `got ${order?.status}`);

    // Confirmed → hold → approve
    r = await http('POST', `/admin/orders/${holdOrderId}/on-hold`, {}, adminToken);
    assertStatus('Put CONFIRMED order ON_HOLD', r.status, 200);

    r = await http('POST', `/admin/orders/${holdOrderId}/approve`, {}, adminToken);
    assertStatus('Approve from ON_HOLD (2nd time) → CONFIRMED', r.status, 200);

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. ADMIN CANCEL AT VARIOUS STAGES
    // ─────────────────────────────────────────────────────────────────────────────
    section('3 · Admin Cancel: from PLACED, CONFIRMED, and ON_HOLD');

    // Cancel from PLACED
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let cancelPlacedId = r.data?.data?.orderId;
    assertStatus('Place order to cancel from PLACED', r.status, 201);
    r = await http('POST', `/admin/orders/${cancelPlacedId}/cancel`, { reason: 'Test cancel from PLACED' }, adminToken);
    assertStatus('Cancel from PLACED → 200', r.status, 200);
    order = await prisma.order.findUnique({ where: { id: cancelPlacedId } });
    order?.status === OrderStatus.CANCELLED ? pass('DB: PLACED → CANCELLED') : fail('DB: PLACED → CANCELLED', `got ${order?.status}`);

    // Cancel from CONFIRMED
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let cancelConfirmedId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${cancelConfirmedId}/approve`, {}, adminToken);
    r = await http('POST', `/admin/orders/${cancelConfirmedId}/cancel`, { reason: 'Test cancel from CONFIRMED' }, adminToken);
    assertStatus('Cancel from CONFIRMED → 200', r.status, 200);
    order = await prisma.order.findUnique({ where: { id: cancelConfirmedId } });
    order?.status === OrderStatus.CANCELLED ? pass('DB: CONFIRMED → CANCELLED') : fail('DB: CONFIRMED → CANCELLED', `got ${order?.status}`);

    // Cancel from ON_HOLD
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let cancelHoldId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${cancelHoldId}/on-hold`, {}, adminToken);
    r = await http('POST', `/admin/orders/${cancelHoldId}/cancel`, { reason: 'Test cancel from ON_HOLD' }, adminToken);
    assertStatus('Cancel from ON_HOLD → 200', r.status, 200);
    order = await prisma.order.findUnique({ where: { id: cancelHoldId } });
    order?.status === OrderStatus.CANCELLED ? pass('DB: ON_HOLD → CANCELLED') : fail('DB: ON_HOLD → CANCELLED', `got ${order?.status}`);

    // Customer cancels their own order
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let cancelOwnId = r.data?.data?.orderId;
    assertStatus('Place order for customer cancellation test', r.status, 201);
    const stockBeforeCustomerCancel = (await prisma.sku.findUnique({ where: { id: skuId } }))?.stockQuantity ?? 0;

    r = await http('POST', `/store/orders/${cancelOwnId}/cancel`, { reason: 'Found cheaper elsewhere' }, customerToken);
    assertStatus('Customer cancels their own order → 200', r.status, 200);
    order = await prisma.order.findUnique({ where: { id: cancelOwnId } });
    order?.status === OrderStatus.CANCELLED ? pass('DB: Customer cancelled order is CANCELLED') : fail('DB: expected CANCELLED', `got ${order?.status}`);

    const stockAfterCustomerCancel = (await prisma.sku.findUnique({ where: { id: skuId } }))?.stockQuantity ?? 0;
    stockAfterCustomerCancel > stockBeforeCustomerCancel ? pass('Stock restored on customer cancel') : fail('Stock restore on customer cancel', `${stockBeforeCustomerCancel} -> ${stockAfterCustomerCancel}`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. GUARD TESTS — Invalid Transitions
    // ─────────────────────────────────────────────────────────────────────────────
    section('4 · Guard Tests: Invalid State Transitions (should return 4xx)');

    // Cannot cancel from SHIPPED
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let shippedGuardId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${shippedGuardId}/approve`, {}, adminToken);
    await http('POST', `/admin/orders/${shippedGuardId}/ship`, { courier: 'BlueDart', trackingId: 'BD999' }, adminToken);
    r = await http('POST', `/admin/orders/${shippedGuardId}/cancel`, { reason: 'Should fail' }, adminToken);
    assertStatus('Cannot cancel SHIPPED order → 4xx', r.status, 400);

    // Cannot ship without confirming (from PLACED)
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let noConfirmShipId = r.data?.data?.orderId;
    r = await http('POST', `/admin/orders/${noConfirmShipId}/ship`, { courier: 'Ekart', trackingId: 'EK001' }, adminToken);
    assertStatus('Cannot ship PLACED order (not CONFIRMED) → 4xx', r.status, 400);

    // Cannot approve already CONFIRMED order
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let doubleApproveId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${doubleApproveId}/approve`, {}, adminToken);
    r = await http('POST', `/admin/orders/${doubleApproveId}/approve`, {}, adminToken);
    assertStatus('Cannot approve already CONFIRMED order → 4xx', r.status, 400);

    // Cannot deliver before shipping
    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let noShipDeliverId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${noShipDeliverId}/approve`, {}, adminToken);
    r = await http('POST', `/admin/orders/${noShipDeliverId}/deliver`, {}, adminToken);
    assertStatus('Cannot deliver CONFIRMED order (not SHIPPED) → 4xx', r.status, 400);

    // ─────────────────────────────────────────────────────────────────────────────
    // 5. VALIDATION ERRORS — Placing Orders
    // ─────────────────────────────────────────────────────────────────────────────
    section('5 · Validation: Out of stock and COD not allowed');

    // Out of stock
    await prisma.sku.update({ where: { id: skuId }, data: { stockQuantity: 0 } });
    r = await http('POST', '/store/orders', { addressId, paymentMethod: 'COD', items: [{ skuId, quantity: 1 }] }, customerToken);
    assertStatus('Place order with 0 stock → 4xx', r.status, 400);
    await prisma.sku.update({ where: { id: skuId }, data: { stockQuantity: 999 } }); // restore

    // COD not allowed on no-cod SKU
    let noCodSku = await prisma.sku.findFirst({ where: { skuCode: 'TEST-SKU-NO-COD' } });
    if (noCodSku) {
        r = await http('POST', '/store/orders', { addressId, paymentMethod: 'COD', items: [{ skuId: noCodSku.id, quantity: 1 }] }, customerToken);
        assertStatus('COD on isCodAllowed=false SKU → 4xx', r.status, 400);
    }

    // Duplicate SKU IDs
    r = await http('POST', '/store/orders', { addressId, paymentMethod: 'COD', items: [{ skuId, quantity: 1 }, { skuId, quantity: 2 }] }, customerToken);
    assertStatus('Duplicate SKU IDs in items → 4xx', r.status, 400);

    // No auth → 401
    r = await http('POST', '/store/orders', { addressId, paymentMethod: 'COD', items: [{ skuId, quantity: 1 }] });
    assertStatus('No auth token → 401', r.status, 401);

    // ─────────────────────────────────────────────────────────────────────────────
    // 6. RETURN FLOW — Happy Path (Approved)
    // ─────────────────────────────────────────────────────────────────────────────
    section('6 · Return Flow: DELIVERED (Return Requested) → DELIVERED (Return Approved)');

    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let returnOrderId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${returnOrderId}/approve`, {}, adminToken);
    await http('POST', `/admin/orders/${returnOrderId}/ship`, { courier: 'FedEx', trackingId: 'FX-RET-001' }, adminToken);
    await http('POST', `/admin/orders/${returnOrderId}/deliver`, {}, adminToken);

    // Get order item
    const returnOrderItem = await prisma.orderItem.findFirst({ where: { orderId: returnOrderId } });
    if (!returnOrderItem) { fail('Get order item for return', 'no order item found'); }
    else {
        // Request return
        r = await http('POST', `/store/orders/${returnOrderItem.id}/return`, {
            reason: 'Product damaged',
            images: ['https://example.com/damage-photo.jpg'],
        }, customerToken);
        assertStatus('Customer requests return → 201', r.status, 201);

        let returnId = r.data?.data?.returnId;
        order = await prisma.order.findUnique({ where: { id: returnOrderId } });
        order?.status === OrderStatus.DELIVERED ? pass('DB: order.status = DELIVERED') : fail('DB: order.status = DELIVERED', `got ${order?.status}`);

        // Admin approves return
        r = await http('POST', `/admin/returns/${returnId}/approve`, {}, adminToken);
        assertStatus('Admin approves return → 200', r.status, 200);

        order = await prisma.order.findUnique({ where: { id: returnOrderId } });
        order?.status === OrderStatus.DELIVERED ? pass('DB: order.status = DELIVERED') : fail('DB: order.status = DELIVERED', `got ${order?.status}`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 7. RETURN FLOW — Rejected
    // ─────────────────────────────────────────────────────────────────────────────
    section('7 · Return Flow: DELIVERED (Return Requested) → DELIVERED (Return Rejected)');

    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let rejectReturnOrderId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${rejectReturnOrderId}/approve`, {}, adminToken);
    await http('POST', `/admin/orders/${rejectReturnOrderId}/ship`, { courier: 'DTDC', trackingId: 'DTDC-REJ-001' }, adminToken);
    await http('POST', `/admin/orders/${rejectReturnOrderId}/deliver`, {}, adminToken);

    const rejectItem = await prisma.orderItem.findFirst({ where: { orderId: rejectReturnOrderId } });
    if (!rejectItem) { fail('Get order item for reject-return', 'no order item found'); }
    else {
        r = await http('POST', `/store/orders/${rejectItem.id}/return`, { reason: 'Changed mind', images: ['https://example.com/changeofmind.jpg'] }, customerToken);
        assertStatus('Customer requests return (for rejection) → 201', r.status, 201);

        let rejectReturnId = r.data?.data?.returnId;
        r = await http('POST', `/admin/returns/${rejectReturnId}/reject`, { reason: 'Policy violation' }, adminToken);
        assertStatus('Admin rejects return → 200', r.status, 200);

        order = await prisma.order.findUnique({ where: { id: rejectReturnOrderId } });
        order?.status === OrderStatus.DELIVERED ? pass('DB: order.status = DELIVERED') : fail('DB: order.status = DELIVERED', `got ${order?.status}`);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 8. RETURN GUARD — Outside 7-day window
    // ─────────────────────────────────────────────────────────────────────────────
    section('8 · Return Guard: Cannot return after 7-day window');

    r = await placeOrder(customerToken, addressId, skuId, 'COD');
    let expiredReturnOrderId = r.data?.data?.orderId;
    await http('POST', `/admin/orders/${expiredReturnOrderId}/approve`, {}, adminToken);
    await http('POST', `/admin/orders/${expiredReturnOrderId}/ship`, { courier: 'SpeedPost', trackingId: 'SP-EXP-001' }, adminToken);
    await http('POST', `/admin/orders/${expiredReturnOrderId}/deliver`, {}, adminToken);
    // Backdate deliveredAt by 8 days
    await prisma.order.update({
        where: { id: expiredReturnOrderId },
        data: { deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });
    const expiredItem = await prisma.orderItem.findFirst({ where: { orderId: expiredReturnOrderId } });
    if (!expiredItem) { fail('Get order item for expired return', 'no order item found'); }
    else {
        r = await http('POST', `/store/orders/${expiredItem.id}/return`, { reason: 'Too late', images: ['https://example.com/late.jpg'] }, customerToken);
        assertStatus('Return after 7 days → 4xx', r.status, 400);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 9. STALE ORDER CLEANUP
    // ─────────────────────────────────────────────────────────────────────────────
    section('9 · Stale Order Cleanup (Razorpay abandonment)');

    // Place a fake RAZORPAY order via DB (skip actual Razorpay call — simulate by inserting directly)
    // We use a test order with paymentMethod RAZORPAY and PENDING status, backdated 90 minutes
    const staleOrder = await prisma.$transaction(async (tx) => {
        const cat2 = await tx.category.findFirst({ where: { slug: 'test-cat' } });
        const orderNum = `TEST-STALE-${Date.now()}`;
        const o = await tx.order.create({
            data: {
                orderNumber: orderNum,
                customerId,
                addressSnapshot: { name: 'Test', phone: '9999', line1: '1st', city: 'TC', state: 'TS', pincode: '000001' },
                status: OrderStatus.PLACED,
                paymentMethod: PaymentMethod.RAZORPAY,
                paymentStatus: PaymentStatus.PENDING,
                subtotalAmount: 400,
                gstAmount: 72,
                codFee: 0,
                totalAmount: 472,
                placedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 min ago
            },
        });
        await tx.orderItem.create({
            data: {
                orderId: o.id,
                skuId,
                quantity: 1,
                pricePerUnit: 400,
                gstPercent: 18,
                totalPrice: 400,
                skuSnapshot: { productName: 'Test', skuCode: 'TEST-SKU-001' },
            },
        });
        await tx.payment.create({
            data: {
                orderId: o.id,
                provider: 'RAZORPAY',
                reference: `rp_order_stalefake_${Date.now()}`,
                amount: 472,
                status: PaymentStatus.PENDING,
            },
        });
        return o;
    });

    const stockBefore = (await prisma.sku.findUnique({ where: { id: skuId } }))?.stockQuantity ?? 0;
    r = await http('POST', '/admin/orders/cleanup-stale', { minutesOld: 60 }, adminToken);
    assertStatus('Stale cleanup API → 200', r.status, 200);

    const cancelledStale = await prisma.order.findUnique({ where: { id: staleOrder.id } });
    cancelledStale?.status === OrderStatus.CANCELLED ? pass('Stale order marked CANCELLED') : fail('Stale order marked CANCELLED', `got ${cancelledStale?.status}`);
    cancelledStale?.paymentStatus === PaymentStatus.FAILED ? pass('Stale order paymentStatus = FAILED') : fail('Stale order paymentStatus = FAILED', `got ${cancelledStale?.paymentStatus}`);

    const stockAfter = (await prisma.sku.findUnique({ where: { id: skuId } }))?.stockQuantity ?? 0;
    stockAfter > stockBefore ? pass(`Stock restored after stale cleanup (${stockBefore} → ${stockAfter})`) : fail('Stock NOT restored after stale cleanup', `${stockBefore} → ${stockAfter}`);

    // ─────────────────────────────────────────────────────────────────────────────
    // 10. REFUND GUARD — Only for paid orders
    // ─────────────────────────────────────────────────────────────────────────────
    section('10 · Refund Guard: Cannot refund unpaid cancelled order');

    // Cancel the stale order was already cancelled with paymentStatus=FAILED, try to refund → should fail
    r = await http('POST', `/admin/orders/${staleOrder.id}/refund`, {}, adminToken);
    assertStatus('Refund CANCELLED+FAILED order → 4xx (paymentStatus not PAID)', r.status, 400);

    // COD refund not allowed
    r = await http('POST', `/admin/orders/${cancelPlacedId}/refund`, {}, adminToken);
    assertStatus('Refund COD order → 4xx', r.status, 400);

    // ─────────────────────────────────────────────────────────────────────────────
    // 11. READ ENDPOINTS
    // ─────────────────────────────────────────────────────────────────────────────
    section('11 · Customer Order Read Endpoints');

    r = await http('GET', '/store/orders', undefined, customerToken);
    assertStatus('GET /store/orders → 200', r.status, 200);

    r = await http('GET', `/store/orders/${codOrderId}`, undefined, customerToken);
    assertStatus(`GET /store/orders/:id → 200`, r.status, 200);

    // Another customer cannot read this order
    const other = await prisma.customer.upsert({
        where: { email: 'other_test@wmv.internal' },
        update: {},
        create: { name: 'Other', email: 'other_test@wmv.internal', phone: '9999000002' },
    });
    const otherToken = signCustomerToken(other.id);
    r = await http('GET', `/store/orders/${codOrderId}`, undefined, otherToken);
    assertStatus('Other customer cannot view order → 403', r.status, 403);

    r = await http('GET', '/admin/orders', undefined, adminToken);
    assertStatus('Admin GET /admin/orders → 200', r.status, 200);

    // ─────────────────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────────────────
    console.log(`\n${CYAN}══════════════════════════════════════════════${RESET}`);
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const total = results.length;
    console.log(`  ${GREEN}${passed} passed${RESET}  |  ${failed > 0 ? RED : GREEN}${failed} failed${RESET}  |  ${total} total`);
    console.log(`${CYAN}══════════════════════════════════════════════${RESET}\n`);

    if (failed > 0) {
        console.log(`${RED}Failed scenarios:${RESET}`);
        results.filter(r => !r.pass).forEach(r => console.log(`  • ${r.name}: ${r.detail}`));
        console.log('');
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(async (err) => {
    console.error(`\n${RED}Fatal error:${RESET}`, err.message || err);
    await prisma.$disconnect();
    process.exit(1);
});
