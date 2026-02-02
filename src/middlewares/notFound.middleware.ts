import { Request, Response } from 'express';
import { createErrorResponse } from '../types/api-response.js';

/**
 * 404 Not Found middleware
 * Handles cases where no route matches the request
 * Returns standardized error response
 */
export function notFoundMiddleware(_req: Request, res: Response): void {
  const response = createErrorResponse('NOT_FOUND', 'The requested resource was not found.');
  res.status(404).json(response);
}

