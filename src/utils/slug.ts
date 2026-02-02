import { prisma } from '../config/prisma.js';
import { logger } from './logger.js';

/**
 * Generate a slug from a name
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove special characters (keep only alphanumeric and hyphens)
 * - Trim leading/trailing hyphens
 * - Collapse multiple consecutive hyphens
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}

/**
 * Generate a unique slug for a subcategory within a category
 * If the base slug exists, appends -2, -3, etc. until unique
 */
export async function generateUniqueSubcategorySlug(
  name: string,
  categoryId: string,
  existingSlug?: string
): Promise<string> {
  const baseSlug = generateSlug(name);

  // If existingSlug is provided and matches baseSlug, return it
  if (existingSlug && existingSlug === baseSlug) {
    return baseSlug;
  }

  // Check if base slug exists for this category
  const existing = await prisma.subcategory.findFirst({
    where: {
      categoryId,
      slug: baseSlug,
    },
  });

  // If base slug doesn't exist, return it
  if (!existing) {
    logger.info('Generated unique slug', { baseSlug, categoryId });
    return baseSlug;
  }

  // If base slug exists, try with suffix
  let counter = 2;
  let candidateSlug = `${baseSlug}-${counter}`;

  while (true) {
    const exists = await prisma.subcategory.findFirst({
      where: {
        categoryId,
        slug: candidateSlug,
      },
    });

    if (!exists) {
      logger.info('Generated unique slug with suffix', { candidateSlug, categoryId, counter });
      return candidateSlug;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
  }
}

/**
 * Generate a unique slug for a category (globally unique)
 * If the base slug exists, appends -2, -3, etc. until unique
 */
export async function generateUniqueCategorySlug(
  name: string,
  existingSlug?: string
): Promise<string> {
  const baseSlug = generateSlug(name);

  // If existingSlug is provided and matches baseSlug, return it
  if (existingSlug && existingSlug === baseSlug) {
    return baseSlug;
  }

  // Check if base slug exists globally (Category.slug is @unique)
  const existing = await prisma.category.findUnique({
    where: { slug: baseSlug },
  });

  // If base slug doesn't exist, return it
  if (!existing) {
    logger.info('Generated unique category slug', { baseSlug });
    return baseSlug;
  }

  // If base slug exists, try with suffix
  let counter = 2;
  let candidateSlug = `${baseSlug}-${counter}`;

  while (true) {
    const exists = await prisma.category.findUnique({
      where: { slug: candidateSlug },
    });

    if (!exists) {
      logger.info('Generated unique category slug with suffix', { candidateSlug, counter });
      return candidateSlug;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
  }
}

