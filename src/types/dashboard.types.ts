export type DashboardPreset = 'today' | '7d' | '30d';

export type DashboardSeriesPoint = {
    date: string; // YYYY-MM-DD (server time)
    value: number;
};

export type DashboardCountByKey<K extends string> = {
    key: K;
    count: number;
};

export type DashboardTopProduct = {
    productId: string;
    productName: string;
    units: number;
};

export interface DashboardMetricsResponse {
    // Backward compatible fields (already used by current UI)
    ordersToday: number;
    revenueToday: number;
    pendingApprovals: number;
    pendingReturns: number;
    refundsToday: number;
    /** Order counts by status for orders placed in the selected dashboard range (same window as `range` / breakdowns). */
    statusCounts: {
        PLACED: number;
        CONFIRMED: number;
        SHIPPED: number;
        DELIVERED: number;
    };
    inventory: {
        lowStock: number;
        outOfStock: number;
    };

    // New chart-ready fields
    range: {
        preset: DashboardPreset;
        from: string; // ISO string
        to: string;   // ISO string
    };
    series: {
        revenueByDay: DashboardSeriesPoint[];
        ordersByDay: DashboardSeriesPoint[];
        refundsByDay: DashboardSeriesPoint[];
    };
    breakdowns: {
        orderStatus: Array<DashboardCountByKey<string>>;
        paymentStatus: Array<DashboardCountByKey<string>>;
        paymentMethod: Array<DashboardCountByKey<string>>;
    };
    topProducts: DashboardTopProduct[];
    inventoryBuckets: {
        outOfStock: number; // 0
        low: number;        // 1-10
        medium: number;     // 11-50
        healthy: number;    // 51+
    };
}
