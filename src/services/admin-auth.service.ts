import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * JWT payload structure
 */
export interface JwtPayload {
  adminId: string;
  role: string;
}

/**
 * Login response structure
 */
export interface LoginResponse {
  token: string;
}

/**
 * Admin login service
 * Validates credentials and issues JWT token
 *
 * @param email - Admin email
 * @param password - Plaintext password
 * @returns Promise resolving to login response with JWT token
 * @throws AppError with code INVALID_CREDENTIALS if credentials are invalid
 * @throws AppError with code UNAUTHORIZED if admin is inactive
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  logger.info('Login service: Finding admin by email', { email });
  
  // Find admin by email
  const admin = await prisma.admin.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      isActive: true,
    },
  });

  logger.info('Login service: Admin query completed', { found: !!admin });

  // Check if admin exists
  if (!admin) {
    logger.warn('Login service: Admin not found', { email });
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  // Check if admin is active
  if (!admin.isActive) {
    logger.warn('Login service: Admin account is inactive', { email, adminId: admin.id });
    throw new AppError('UNAUTHORIZED', 'Admin account is inactive', 401);
  }

  logger.info('Login service: Comparing password', { 
    passwordLength: password.length,
    hashLength: admin.passwordHash?.length,
    hashPrefix: admin.passwordHash?.substring(0, 7)
  });
  
  // Validate password hash format before comparing
  if (!admin.passwordHash || typeof admin.passwordHash !== 'string') {
    logger.error('Login service: Password hash is missing or invalid', { 
      email,
      hashType: typeof admin.passwordHash
    });
    throw new AppError('INTERNAL_SERVER_ERROR', 'Invalid password hash', 500);
  }

  if (!admin.passwordHash.startsWith('$2')) {
    logger.error('Login service: Invalid password hash format', { 
      email,
      hashPrefix: admin.passwordHash.substring(0, 10)
    });
    throw new AppError('INTERNAL_SERVER_ERROR', 'Invalid password hash format', 500);
  }

  // Compare password using bcryptjs (pure JavaScript, no native module issues)
  let isPasswordValid: boolean;
  try {
    logger.info('Login service: Comparing password with bcryptjs');
    // bcryptjs.compare returns a Promise, works reliably with async/await
    isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    logger.info('Login service: Password comparison completed', { isValid: isPasswordValid });
  } catch (error) {
    logger.error('Login service: Password comparison threw an error', {
      error: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      email
    });
    throw new AppError('INTERNAL_SERVER_ERROR', 'Password verification failed', 500);
  }
  
  if (!isPasswordValid) {
    logger.warn('Login service: Invalid password', { email, adminId: admin.id });
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  logger.info('Login service: Generating JWT token', { adminId: admin.id, role: admin.role });
  // Generate JWT token
  const payload: JwtPayload = {
    adminId: admin.id,
    role: admin.role,
  };

  const token = jwt.sign(payload, env.adminJwtSecret, {
    expiresIn: env.adminJwtExpiresIn,
  } as jwt.SignOptions);

  logger.info('Login service: JWT token generated successfully');
  return { token };
}

/**
 * Verify JWT token
 * Validates token signature and expiration
 *
 * @param token - JWT token string
 * @returns Promise resolving to decoded JWT payload
 * @throws AppError with code UNAUTHORIZED if token is invalid or expired
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, env.adminJwtSecret) as JwtPayload;

    // Validate payload structure
    if (!decoded.adminId || !decoded.role) {
      throw new AppError('UNAUTHORIZED', 'Invalid token payload', 401);
    }

    return decoded;
  } catch (error) {
    // Handle JWT verification errors
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('UNAUTHORIZED', 'Token has expired', 401);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('UNAUTHORIZED', 'Invalid token', 401);
    }
    // Re-throw AppError if it's already one
    if (error instanceof AppError) {
      throw error;
    }
    // Unknown error
    throw new AppError('UNAUTHORIZED', 'Token verification failed', 401);
  }
}

