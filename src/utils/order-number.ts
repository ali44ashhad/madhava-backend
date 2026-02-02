import { prisma } from '../config/prisma.js';
import { logger } from './logger.js';

/**
 * Transaction client type (from Prisma transaction)
 */
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Generate unique order number in format: ORD + YYYYMMDD + 4-digit sequence
 * Example: ORD202501090001
 * 
 * The sequence resets daily, starting from 0001 each day.
 * 
 * @param tx - Optional transaction client. If provided, uses transaction context.
 *             If not provided, uses default prisma client.
 */
export async function generateOrderNumber(tx?: TransactionClient): Promise<string> {
  const client = tx || prisma;
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const prefix = `ORD${dateStr}`;

  logger.info('Generating order number', { prefix });

  // Find the latest order number for today
  // If inside transaction, this will see uncommitted orders from the same transaction
  const latestOrder = await client.order.findFirst({
    where: {
      orderNumber: {
        startsWith: prefix,
      },
    },
    orderBy: {
      orderNumber: 'desc',
    },
    select: {
      orderNumber: true,
    },
  });

  let sequence = 1;

  if (latestOrder) {
    // Extract sequence from latest order number
    // Format: ORD202501090001 -> extract "0001"
    const sequenceStr = latestOrder.orderNumber.slice(prefix.length);
    const lastSequence = parseInt(sequenceStr, 10);
    
    if (!isNaN(lastSequence)) {
      sequence = lastSequence + 1;
    }
  }

  // Format sequence as 4-digit string (0001, 0002, etc.)
  const sequenceStr = sequence.toString().padStart(4, '0');
  const orderNumber = `${prefix}${sequenceStr}`;

  // If inside transaction, uniqueness is guaranteed by transaction isolation
  // If outside transaction, verify uniqueness (handle race condition)
  if (!tx) {
    const existing = await prisma.order.findUnique({
      where: {
        orderNumber,
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      // Race condition: another order was created with same number
      // Retry with incremented sequence
      logger.warn('Order number collision detected, retrying', { orderNumber });
      return generateOrderNumber();
    }
  }

  logger.info('Order number generated', { orderNumber });
  return orderNumber;
}

