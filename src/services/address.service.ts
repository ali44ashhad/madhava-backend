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

/**
 * Update address input
 */
export interface UpdateAddressInput {
  addressId: string;
  customerId: string;
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  isDefault?: boolean;
}

/**
 * Update address result
 */
export interface UpdateAddressResult {
  addressId: string;
}

/**
 * Update address service
 * Handles address update with ownership validation
 */
export async function updateAddress(input: UpdateAddressInput): Promise<UpdateAddressResult> {
  logger.info('Updating address', {
    addressId: input.addressId,
    customerId: input.customerId,
  });

  // Verify address exists and belongs to customer
  const existingAddress = await prisma.address.findFirst({
    where: {
      id: input.addressId,
      customerId: input.customerId
    },
  });

  if (!existingAddress) {
    throw new AppError('NOT_FOUND', `Address not found or does not belong to the user`, 404);
  }

  // Handle setting as default
  if (input.isDefault === true && !existingAddress.isDefault) {
    // Unset current default
    await prisma.address.updateMany({
      where: {
        customerId: input.customerId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });
  }

  // Update address
  const updatedAddress = await prisma.address.update({
    where: { id: input.addressId },
    data: {
      name: input.name?.trim(),
      phone: input.phone?.trim(),
      line1: input.line1?.trim(),
      line2: input.line2?.trim() !== undefined ? input.line2?.trim() || null : undefined,
      city: input.city?.trim(),
      state: input.state?.trim(),
      pincode: input.pincode?.trim(),
      isDefault: input.isDefault,
    },
    select: {
      id: true,
    },
  });

  logger.info('Address updated successfully', {
    addressId: updatedAddress.id,
    customerId: input.customerId,
  });

  return {
    addressId: updatedAddress.id,
  };
}

/**
 * Delete address service
 * Handles address deletion with ownership validation
 */
export async function deleteAddress(addressId: string, customerId: string): Promise<void> {
  logger.info('Deleting address', {
    addressId,
    customerId,
  });

  // Verify address exists and belongs to customer
  const existingAddress = await prisma.address.findFirst({
    where: {
      id: addressId,
      customerId,
    },
  });

  if (!existingAddress) {
    throw new AppError('NOT_FOUND', `Address not found or does not belong to the user`, 404);
  }

  // Delete the address
  await prisma.address.delete({
    where: { id: addressId },
  });

  // If the deleted address was the default, make another address the default (if any exist)
  if (existingAddress.isDefault) {
    const fallbackAddress = await prisma.address.findFirst({
      where: { customerId },
      orderBy: { id: 'asc' }, // Get the oldest remaining address
    });

    if (fallbackAddress) {
      await prisma.address.update({
        where: { id: fallbackAddress.id },
        data: { isDefault: true },
      });

      logger.info('Fallback default address set', {
        newDefaultAddressId: fallbackAddress.id,
        customerId,
      });
    }
  }

  logger.info('Address deleted successfully', {
    addressId,
    customerId,
  });
}

