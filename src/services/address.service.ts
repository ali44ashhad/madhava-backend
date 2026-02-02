import { prisma } from '../config/prisma.js';
import { AppError } from '../middlewares/error.middleware.js';
import { logger } from '../utils/logger.js';
import { Address } from '@prisma/client';

/**
 * Create address input
 */
export interface CreateAddressInput {
  customerId: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

/**
 * Create address result
 */
export interface CreateAddressResult {
  addressId: string;
}

/**
 * Create address service
 * Handles address creation with validation
 * 
 * Validations:
 * - Customer must exist
 * - First address for customer automatically becomes default
 * - Address ownership is enforced by foreign key
 */
export async function createAddress(input: CreateAddressInput): Promise<CreateAddressResult> {
  logger.info('Creating address', {
    customerId: input.customerId,
    city: input.city,
    state: input.state,
  });

  // Validate customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError('NOT_FOUND', `Customer with id '${input.customerId}' not found`, 404);
  }

  // Check if this is the first address for the customer
  const existingAddressesCount = await prisma.address.count({
    where: { customerId: input.customerId },
  });

  const isDefault = existingAddressesCount === 0;

  // Create address
  const address = await prisma.address.create({
    data: {
      customerId: input.customerId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      line1: input.line1.trim(),
      line2: input.line2?.trim() || null,
      city: input.city.trim(),
      state: input.state.trim(),
      pincode: input.pincode.trim(),
      isDefault,
    },
    select: {
      id: true,
    },
  });

  logger.info('Address created successfully', {
    addressId: address.id,
    customerId: input.customerId,
    isDefault,
  });

  return {
    addressId: address.id,
  };
}

/**
 * Get customer addresses service
 * Returns all addresses for a customer, ordered by isDefault DESC, createdAt ASC
 * 
 * Note: Address model doesn't have createdAt field in schema,
 * so we'll order by id (which is UUID and roughly chronological)
 */
export async function getCustomerAddresses(customerId: string): Promise<Address[]> {
  logger.info('Fetching customer addresses', {
    customerId,
  });

  // Validate customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });

  if (!customer) {
    throw new AppError('NOT_FOUND', `Customer with id '${customerId}' not found`, 404);
  }

  // Fetch addresses ordered by isDefault DESC, then by id ASC (since no createdAt)
  const addresses = await prisma.address.findMany({
    where: { customerId },
    orderBy: [
      { isDefault: 'desc' },
      { id: 'asc' },
    ],
  });

  logger.info('Customer addresses fetched successfully', {
    customerId,
    count: addresses.length,
  });

  return addresses;
}

