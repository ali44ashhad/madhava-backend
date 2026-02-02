import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/admin-auth.service.js';
import { prisma } from '../config/prisma.js';
import { AppError } from './error.middleware.js';

/**
 * Admin authentication middleware
 * Verifies JWT token and attaches admin info to request
 * Rejects requests with invalid, expired, or missing tokens
 */
export async function adminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new AppError('UNAUTHORIZED', 'Authorization header is missing', 401);
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Invalid authorization format. Expected: Bearer <token>', 401);
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix
    if (!token || token.trim().length === 0) {
      throw new AppError('UNAUTHORIZED', 'Token is missing', 401);
    }

    // Verify JWT token
    const decoded = verifyToken(token);

    // Fetch admin from database to ensure still active
    const admin = await prisma.admin.findUnique({
      where: { id: decoded.adminId },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    // Check if admin exists and is active
    if (!admin || !admin.isActive) {
      throw new AppError('UNAUTHORIZED', 'Admin account is inactive or does not exist', 401);
    }

    // Attach admin info to request
    req.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };

    next();
  } catch (error) {
    // If it's already an AppError, pass it through
    if (error instanceof AppError) {
      next(error);
      return;
    }
    // Otherwise, wrap in UNAUTHORIZED error
    next(new AppError('UNAUTHORIZED', 'Authentication failed', 401));
  }
}

