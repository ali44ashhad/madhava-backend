import { Request, Response, NextFunction } from 'express';
import { createSuccessResponse } from '../types/api-response.js';
import { logger } from '../utils/logger.js';
import { getDashboardMetrics } from '../services/dashboard.service.js';

/**
 * GET /api/v1/admin/dashboard
 * Protected by admin auth middleware
 */
export async function getDashboard(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        // Service call to get metrics
        const metrics = await getDashboardMetrics();

        // Standardized response
        const response = createSuccessResponse(metrics);

        res.status(200).json(response);
    } catch (error) {
        logger.error('Error in getDashboard controller', error);
        next(error);
    }
}
