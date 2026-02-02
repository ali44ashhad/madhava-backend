import { Request, Response, NextFunction } from 'express';
import { createErrorResponse } from '../types/api-response.js';
import { logger } from '../utils/logger.js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error handling middleware
 * Catches all errors and returns standardized error response
 * Errors are logged appropriately and safe messages are returned to users
 */
export function errorMiddleware(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Check if response has already been sent
  if (res.headersSent) {
    logger.error('Error occurred but response already sent:', {
      name: err.name,
      message: err.message,
    });
    return;
  }

  // Log the error
  logger.error('Error occurred:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  // Handle known application errors
  if (err instanceof AppError) {
    const response = createErrorResponse(err.code, err.message);
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors - return safe message to user
  const response = createErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.'
  );
  res.status(500).json(response);
}

