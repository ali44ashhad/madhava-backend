import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createAddress, getCustomerAddresses } from '../services/address.service.js';
import { createSuccessResponse } from '../types/api-response.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Zod schema for create address request body
 */
const createAddressSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  name: z.string().min(1, 'Name is required and cannot be empty').trim(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/, 'Phone must be 10-15 digits (optionally prefixed with +)')
    .trim(),
  line1: z.string().min(1, 'Line 1 is required and cannot be empty').trim(),
  line2: z.string().trim().nullable().optional(),
  city: z.string().min(1, 'City is required and cannot be empty').trim(),
  state: z.string().min(1, 'State is required and cannot be empty').trim(),
  pincode: z
    .string()
    .min(5, 'Pincode must be at least 5 characters')
    .max(10, 'Pincode must be at most 10 characters')
    .trim(),
});

/**
 * Zod schema for get addresses query params
 */
const getAddressesQuerySchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
});

/**
 * Create address controller
 * POST /api/v1/store/addresses
 * 
 * Validates request body and calls address service to create address
 */
export async function createAddressController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Create address request received', {
      customerId: req.body?.customerId,
    });

    // Validate request body
    const validationResult = createAddressSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { customerId, name, phone, line1, line2, city, state, pincode } = validationResult.data;

    logger.info('Validation passed, calling create address service', {
      customerId,
      city,
      state,
    });

    // Call service to create address
    const result = await createAddress({
      customerId,
      name,
      phone,
      line1,
      line2: line2 || null,
      city,
      state,
      pincode,
    });

    logger.info('Address created successfully', {
      addressId: result.addressId,
    });

    // Return success response
    const response = createSuccessResponse({
      addressId: result.addressId,
    });

    res.status(201).json(response);
    return;
  } catch (error) {
    logger.error('Error in create address controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error); // Pass error to error middleware
  }
}

/**
 * Get customer addresses controller
 * GET /api/v1/store/addresses?customerId=
 * 
 * Validates query params and calls address service to fetch addresses
 */
export async function getCustomerAddressesController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    logger.info('Get customer addresses request received', {
      customerId: req.query?.customerId,
    });

    // Validate query params
    const validationResult = getAddressesQuerySchema.safeParse(req.query);
    if (!validationResult.success) {
      const errorMessages = validationResult.error.issues.map((issue) => issue.message).join(', ');
      throw new AppError('VALIDATION_ERROR', errorMessages, 400);
    }

    const { customerId } = validationResult.data;

    logger.info('Validation passed, calling get customer addresses service', {
      customerId,
    });

    // Call service to get addresses
    const addresses = await getCustomerAddresses(customerId);

    logger.info('Customer addresses fetched successfully', {
      customerId,
      count: addresses.length,
    });

    // Return success response
    const response = createSuccessResponse(addresses);

    res.status(200).json(response);
    return;
  } catch (error) {
    logger.error('Error in get customer addresses controller', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return next(error); // Pass error to error middleware
  }
}

