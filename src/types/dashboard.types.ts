export interface DashboardMetricsResponse {
    ordersToday: number;
    revenueToday: number;
    pendingApprovals: number;
    pendingReturns: number;
    refundsToday: number;
    statusCounts: {
        PLACED: number;
        CONFIRMED: number;
        SHIPPED: number;
        DELIVERED: number;
        RETURN_REQUESTED: number;
    };
    inventory: {
        lowStock: number;
        outOfStock: number;
    };
}
