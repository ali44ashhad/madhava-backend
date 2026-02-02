import { Request, Response, NextFunction } from 'express';
import { getHealthStatus } from '../services/health.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { logger } from '../utils/logger.js';

/**
 * Health check controller
 * Calls health service and returns standardized API response
 */
export async function getHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const healthStatus = getHealthStatus();
    const response = createSuccessResponse(healthStatus);
    res.status(200).json(response);
  } catch (error) {
    logger.error('Error in health check controller', error);
    next(error); // Pass error to error middleware
  }
}

