import { prisma } from '../config/prisma.js';
import { DashboardMetricsResponse } from '../types/dashboard.types.js';
import { OrderStatus, PaymentStatus } from '@prisma/client';

/**
 * Get aggregated dashboard metrics
 * Read-only operations. No mutations.
 */
export async function getDashboardMetrics(): Promise<DashboardMetricsResponse> {
    // 1. Define start of today (Server Time)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 2. Execute independent queries in parallel
    const [
        ordersToday,
        revenueAggregation,
        pendingApprovals,
        pendingReturns,
        refundsToday,
        statusGroups,
        lowStock,
        outOfStock
    ] = await Promise.all([
        // 4.1 ordersToday
        prisma.order.count({
            where: {
                placedAt: {
                    gte: startOfToday
                }
            }
        }),

        // 4.2 revenueToday
        prisma.order.aggregate({
            _sum: {
                totalAmount: true
            },
            where: {
                placedAt: {
                    gte: startOfToday
                },
                paymentStatus: PaymentStatus.PAID
            }
        }),

        // 4.3 pendingApprovals
        prisma.order.count({
            where: {
                status: OrderStatus.PLACED
            }
        }),

        // 4.4 pendingReturns
        prisma.order.count({
            where: {
                status: OrderStatus.RETURN_REQUESTED
            }
        }),

        // 4.5 refundsToday
        prisma.refund.count({
            where: {
                createdAt: {
                    gte: startOfToday
                }
            }
        }),

        // 4.6 statusCounts (Group By)
        prisma.order.groupBy({
            by: ['status'],
            _count: {
                status: true
            }
        }),

        // 4.7 inventory.lowStock
        prisma.sku.count({
            where: {
                stockQuantity: {
                    gt: 0,
                    lte: 5
                }
            }
        }),

        // 4.8 inventory.outOfStock
        prisma.sku.count({
            where: {
                stockQuantity: 0
            }
        })
    ]);

    // 3. Process Status Counts
    const statusMap = statusGroups.reduce((acc, curr) => {
        acc[curr.status] = curr._count.status;
        return acc;
    }, {} as Record<string, number>);

    // 4. Format Response
    const response: DashboardMetricsResponse = {
        ordersToday,
        revenueToday: Number(revenueAggregation._sum.totalAmount || 0),
        pendingApprovals,
        pendingReturns,
        refundsToday,
        statusCounts: {
            PLACED: statusMap[OrderStatus.PLACED] || 0,
            CONFIRMED: statusMap[OrderStatus.CONFIRMED] || 0,
            SHIPPED: statusMap[OrderStatus.SHIPPED] || 0,
            DELIVERED: statusMap[OrderStatus.DELIVERED] || 0,
            RETURN_REQUESTED: statusMap[OrderStatus.RETURN_REQUESTED] || 0
        },
        inventory: {
            lowStock,
            outOfStock
        }
    };

    return response;
}
