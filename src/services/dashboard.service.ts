import { prisma } from '../config/prisma.js';
import { DashboardMetricsResponse, DashboardPreset } from '../types/dashboard.types.js';
import { OrderStatus, PaymentStatus, Prisma, ReturnStatus } from '@prisma/client';

/**
 * Get aggregated dashboard metrics
 * Read-only operations. No mutations.
 */
function startOfDayServerTime(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatYYYYMMDD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function normalizePreset(input: unknown): DashboardPreset {
    if (input === 'today' || input === '7d' || input === '30d') return input;
    return 'today';
}

function getRangeFromPreset(preset: DashboardPreset): { preset: DashboardPreset; from: Date; to: Date; dayCount: number } {
    const now = new Date();
    const to = now;

    if (preset === 'today') {
        return { preset, from: startOfDayServerTime(now), to, dayCount: 1 };
    }

    const dayCount = preset === '7d' ? 7 : 30;
    const from = startOfDayServerTime(now);
    from.setDate(from.getDate() - (dayCount - 1)); // include today
    return { preset, from, to, dayCount };
}

export async function getDashboardMetrics(params?: { preset?: DashboardPreset | string }): Promise<DashboardMetricsResponse> {
    const preset = normalizePreset(params?.preset);
    const range = getRangeFromPreset(preset);

    const startOfToday = startOfDayServerTime(new Date());

    const rangeOrderWhere = {
        placedAt: { gte: range.from, lte: range.to },
    } satisfies Prisma.OrderWhereInput;

    const [
        todayMetricsRow,
        pendingApprovals,
        pendingReturns,
        refundsToday,
        orderStatusBreakdown,
        paymentStatusBreakdown,
        paymentMethodBreakdown,
        ordersAndRevenueByDayRows,
        refundsByDayRows,
        topProductsRows,
        inventoryBucketsRows,
    ] = await Promise.all([
        prisma.$queryRaw<Array<{ ordersToday: bigint; revenueToday: Prisma.Decimal | null }>>`
            SELECT COUNT(*)::bigint AS "ordersToday",
                   COALESCE(
                       SUM(o."totalAmount") FILTER (WHERE o."paymentStatus" = ${PaymentStatus.PAID}::"PaymentStatus"),
                       0
                   ) AS "revenueToday"
            FROM "orders" o
            WHERE o."placedAt" >= ${startOfToday}
        `,

        prisma.order.count({
            where: {
                status: OrderStatus.PLACED,
            },
        }),

        prisma.return.count({
            where: {
                status: ReturnStatus.REQUESTED,
            },
        }),

        prisma.refund.count({
            where: {
                createdAt: {
                    gte: startOfToday,
                },
            },
        }),

        prisma.order.groupBy({
            by: ['status'],
            _count: { status: true },
            where: rangeOrderWhere,
        }),

        prisma.order.groupBy({
            by: ['paymentStatus'],
            _count: { paymentStatus: true },
            where: rangeOrderWhere,
        }),

        prisma.order.groupBy({
            by: ['paymentMethod'],
            _count: { paymentMethod: true },
            where: rangeOrderWhere,
        }),

        prisma.$queryRaw<Array<{ day: string; orders: bigint; revenue: Prisma.Decimal | null }>>`
            SELECT to_char(date_trunc('day', o."placedAt"), 'YYYY-MM-DD') AS day,
                   COUNT(*)::bigint AS orders,
                   COALESCE(
                       SUM(o."totalAmount") FILTER (WHERE o."paymentStatus" = ${PaymentStatus.PAID}::"PaymentStatus"),
                       0
                   ) AS revenue
            FROM "orders" o
            WHERE o."placedAt" >= ${range.from}
              AND o."placedAt" <= ${range.to}
            GROUP BY 1
            ORDER BY 1 ASC
        `,

        prisma.$queryRaw<Array<{ day: string; refunds: bigint }>>`
            SELECT to_char(date_trunc('day', r."createdAt"), 'YYYY-MM-DD') AS day,
                   COUNT(*)::bigint AS refunds
            FROM "refunds" r
            WHERE r."createdAt" >= ${range.from}
              AND r."createdAt" <= ${range.to}
            GROUP BY 1
            ORDER BY 1 ASC
        `,

        prisma.$queryRaw<Array<{ productId: string; productName: string; units: bigint }>>`
            SELECT p.id AS "productId",
                   p.name AS "productName",
                   COALESCE(SUM(oi.quantity), 0) AS units
            FROM "order_items" oi
            JOIN "orders" o ON o.id = oi."orderId"
            JOIN "skus" s ON s.id = oi."skuId"
            JOIN "products" p ON p.id = s."productId"
            WHERE o."placedAt" >= ${range.from}
              AND o."placedAt" <= ${range.to}
              AND o."paymentStatus" = ${PaymentStatus.PAID}::"PaymentStatus"
            GROUP BY p.id, p.name
            ORDER BY units DESC
            LIMIT 10
        `,

        prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
            SELECT
              CASE
                WHEN s."stockQuantity" = 0 THEN 'outOfStock'
                WHEN s."stockQuantity" BETWEEN 1 AND 10 THEN 'low'
                WHEN s."stockQuantity" BETWEEN 11 AND 50 THEN 'medium'
                ELSE 'healthy'
              END AS bucket,
              COUNT(*)::bigint AS count
            FROM "skus" s
            GROUP BY 1
        `,
    ]);

    const todayRow = todayMetricsRow[0];
    const ordersToday = Number(todayRow?.ordersToday ?? 0);
    const revenueToday = Number(todayRow?.revenueToday ?? 0);

    const statusInRangeMap = orderStatusBreakdown.reduce((acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
    }, {} as Record<string, number>);

    const days: string[] = [];
    const cursor = startOfDayServerTime(range.from);
    for (let i = 0; i < range.dayCount; i++) {
        days.push(formatYYYYMMDD(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }

    const revenueMap = new Map<string, number>(
        ordersAndRevenueByDayRows.map((r) => [r.day, Number(r.revenue ?? 0)]),
    );
    const ordersMap = new Map<string, number>(
        ordersAndRevenueByDayRows.map((r) => [r.day, Number(r.orders)]),
    );
    const refundsMap = new Map<string, number>(refundsByDayRows.map((r) => [r.day, Number(r.refunds)]));

    const inventoryBuckets = inventoryBucketsRows.reduce(
        (acc, row) => {
            const c = Number(row.count);
            if (row.bucket === 'outOfStock') acc.outOfStock = c;
            if (row.bucket === 'low') acc.low = c;
            if (row.bucket === 'medium') acc.medium = c;
            if (row.bucket === 'healthy') acc.healthy = c;
            return acc;
        },
        { outOfStock: 0, low: 0, medium: 0, healthy: 0 },
    );

    const response: DashboardMetricsResponse = {
        ordersToday,
        revenueToday,
        pendingApprovals,
        pendingReturns,
        refundsToday,
        statusCounts: {
            PLACED: statusInRangeMap[OrderStatus.PLACED] || 0,
            CONFIRMED: statusInRangeMap[OrderStatus.CONFIRMED] || 0,
            SHIPPED: statusInRangeMap[OrderStatus.SHIPPED] || 0,
            DELIVERED: statusInRangeMap[OrderStatus.DELIVERED] || 0,
        },
        inventory: {
            lowStock: inventoryBuckets.low,
            outOfStock: inventoryBuckets.outOfStock,
        },
        range: {
            preset,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
        },
        series: {
            revenueByDay: days.map((d) => ({ date: d, value: revenueMap.get(d) ?? 0 })),
            ordersByDay: days.map((d) => ({ date: d, value: ordersMap.get(d) ?? 0 })),
            refundsByDay: days.map((d) => ({ date: d, value: refundsMap.get(d) ?? 0 })),
        },
        breakdowns: {
            orderStatus: orderStatusBreakdown.map((r) => ({ key: String(r.status), count: r._count.status })),
            paymentStatus: paymentStatusBreakdown.map((r) => ({ key: String(r.paymentStatus), count: r._count.paymentStatus })),
            paymentMethod: paymentMethodBreakdown.map((r) => ({ key: String(r.paymentMethod), count: r._count.paymentMethod })),
        },
        topProducts: topProductsRows.map((r) => ({
            productId: r.productId,
            productName: r.productName,
            units: Number(r.units),
        })),
        inventoryBuckets,
    };

    return response;
}
