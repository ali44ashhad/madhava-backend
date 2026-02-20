import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Create customer input
 */
export interface CreateCustomerInput {
  name: string;
  email: string;
  phone: string;
}

/**
 * Create customer result
 */
export interface CreateCustomerResult {
  customerId: string;
}

/**
 * Create customer service
 * Handles customer creation with validation
 * 
 * Validations:
 * - Email must be unique (case-insensitive)
 * - Email format validation (handled in controller)
 * - Name must be non-empty (handled in controller)
 * - Phone validation (handled in controller)
 */
export async function createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
  logger.info('Creating customer', {
    email: input.email,
    name: input.name,
  });

  // Check for existing customer with case-insensitive email
  const existingCustomer = await prisma.customer.findFirst({
    where: {
      email: {
        equals: input.email,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (existingCustomer) {
    throw new AppError(
      'BAD_REQUEST',
      `Customer with email '${input.email}' already exists`,
      400
    );
  }

  try {
    // Create customer (normalize email to lowercase for consistency)
    const customer = await prisma.customer.create({
      data: {
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        phone: input.phone.trim(),
      },
      select: {
        id: true,
      },
    });

    logger.info('Customer created successfully', {
      customerId: customer.id,
      email: input.email,
    });

    return {
      customerId: customer.id,
    };
  } catch (error) {
    // Handle unique constraint violation (fallback, though we check above)
    if (error instanceof PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.warn('Customer creation failed due to unique constraint', {
        email: input.email,
        code: error.code,
      });
      throw new AppError(
        'BAD_REQUEST',
        `Customer with email '${input.email}' already exists`,
        400
      );
    }

    logger.error('Error creating customer', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw error;
  }
}

/**
 * Get customer by ID
 */
export async function getCustomerById(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      createdAt: true,
    },
  });

  if (!customer) {
    throw new AppError('NOT_FOUND', 'Customer not found', 404);
  }

  return customer;
}

