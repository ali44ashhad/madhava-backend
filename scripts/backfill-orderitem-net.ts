/**
 * Backfill per-item coupon allocations on historical orders.
 *
 * Goal:
 * - Populate OrderItem.discountAmount, OrderItem.netTotalPrice, OrderItem.netPricePerUnit
 *   so refunds/returns can refund what the customer actually paid per item.
 *
 * Notes:
 * - Coupon is treated as post-tax discount (does not affect GST).
 * - Allocation is proportional to OrderItem.totalPrice, with deterministic rounding and remainder fix.
 *
 * Run:
 *   npm run backfill:orderitem-net
 *
 * Optional env:
 *   DRY_RUN=1   (default: 1) - only prints what would change
 *   TAKE=100    (default: 100) - max orders to process per run
 */

import 'dotenv/config';
import { prisma } from '../src/config/prisma.ts';

function roundToPaise(amount: number) {
  return Math.round(amount * 100) / 100;
}

type Line = { id: string; totalPrice: number; quantity: number; pricePerUnit: number };
type Allocation = { discountAmount: number; netTotalPrice: number; netPricePerUnit: number };

function allocateOrderDiscountToLines(orderDiscount: number, lines: Line[]): Allocation[] {
  if (lines.length === 0) return [];
  if (!orderDiscount || orderDiscount <= 0) {
    return lines.map((l) => ({
      discountAmount: 0,
      netTotalPrice: roundToPaise(l.totalPrice),
      netPricePerUnit: roundToPaise(l.pricePerUnit),
    }));
  }

  const orderSubtotal = lines.reduce((sum, l) => sum + l.totalPrice, 0);
  if (orderSubtotal <= 0) {
    return lines.map((l) => ({
      discountAmount: 0,
      netTotalPrice: roundToPaise(l.totalPrice),
      netPricePerUnit: roundToPaise(l.pricePerUnit),
    }));
  }

  const allocations: Allocation[] = lines.map((l) => {
    const raw = (orderDiscount * l.totalPrice) / orderSubtotal;
    const rounded = roundToPaise(raw);
    const clamped = Math.min(l.totalPrice, Math.max(0, rounded));
    const netTotalPrice = roundToPaise(Math.max(0, l.totalPrice - clamped));
    const netPricePerUnit = l.quantity > 0 ? roundToPaise(netTotalPrice / l.quantity) : roundToPaise(l.pricePerUnit);
    return { discountAmount: clamped, netTotalPrice, netPricePerUnit };
  });

  const allocated = roundToPaise(allocations.reduce((sum, a) => sum + a.discountAmount, 0));
  let remainder = roundToPaise(orderDiscount - allocated);

  if (remainder !== 0) {
    let targetIdx = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].totalPrice > lines[targetIdx].totalPrice) targetIdx = i;
    }

    const lineTotal = lines[targetIdx].totalPrice;
    const cur = allocations[targetIdx].discountAmount;
    const next = roundToPaise(Math.min(lineTotal, Math.max(0, cur + remainder)));
    const appliedDelta = roundToPaise(next - cur);
    allocations[targetIdx].discountAmount = next;
    allocations[targetIdx].netTotalPrice = roundToPaise(Math.max(0, lineTotal - next));
    allocations[targetIdx].netPricePerUnit =
      lines[targetIdx].quantity > 0
        ? roundToPaise(allocations[targetIdx].netTotalPrice / lines[targetIdx].quantity)
        : roundToPaise(lines[targetIdx].pricePerUnit);
    remainder = roundToPaise(remainder - appliedDelta);
  }

  if (remainder !== 0) {
    const direction = remainder > 0 ? 1 : -1;
    let remaining = remainder;
    const indices = lines
      .map((_, i) => i)
      .sort((a, b) => lines[b].totalPrice - lines[a].totalPrice);

    for (const idx of indices) {
      if (remaining === 0) break;
      const lineTotal = lines[idx].totalPrice;
      const cur = allocations[idx].discountAmount;
      const capacity = direction > 0 ? roundToPaise(lineTotal - cur) : roundToPaise(cur);
      if (capacity <= 0) continue;

      const delta = roundToPaise(Math.min(Math.abs(remaining), capacity)) * direction;
      const next = roundToPaise(cur + delta);
      allocations[idx].discountAmount = next;
      allocations[idx].netTotalPrice = roundToPaise(Math.max(0, lineTotal - next));
      allocations[idx].netPricePerUnit =
        lines[idx].quantity > 0 ? roundToPaise(allocations[idx].netTotalPrice / lines[idx].quantity) : roundToPaise(lines[idx].pricePerUnit);
      remaining = roundToPaise(remaining - delta);
    }
  }

  return allocations;
}

async function run() {
  const dryRun = (process.env.DRY_RUN ?? '1') !== '0';
  const take = Number(process.env.TAKE ?? '100');

  console.log(`Backfill OrderItem net amounts`);
  console.log(`- DRY_RUN: ${dryRun ? '1' : '0'}`);
  console.log(`- TAKE   : ${take}`);

  const orders = await prisma.order.findMany({
    where: {
      discountAmount: { gt: 0 },
      orderItems: {
        some: {
          netTotalPrice: null,
        },
      },
    },
    select: {
      id: true,
      orderNumber: true,
      discountAmount: true,
      subtotalAmount: true,
      orderItems: {
        select: {
          id: true,
          quantity: true,
          pricePerUnit: true,
          totalPrice: true,
          netTotalPrice: true,
        },
      },
    },
    orderBy: { placedAt: 'asc' },
    take,
  });

  console.log(`Found ${orders.length} order(s) needing backfill`);

  let updatedOrders = 0;
  let updatedItems = 0;

  for (const order of orders) {
    const discount = roundToPaise(Number(order.discountAmount));
    const lines: Line[] = order.orderItems.map((i) => ({
      id: i.id,
      totalPrice: Number(i.totalPrice),
      quantity: i.quantity,
      pricePerUnit: Number(i.pricePerUnit),
    }));

    const allocations = allocateOrderDiscountToLines(discount, lines);

    const sumDiscount = roundToPaise(allocations.reduce((s, a) => s + a.discountAmount, 0));
    const sumNet = roundToPaise(allocations.reduce((s, a) => s + a.netTotalPrice, 0));

    if (sumDiscount !== discount) {
      console.warn(
        `WARN: order ${order.orderNumber} (${order.id}) allocation mismatch: orderDiscount=${discount} sumLineDiscount=${sumDiscount}`
      );
    }

    const changes = order.orderItems.filter((it) => it.netTotalPrice === null).length;
    if (changes === 0) continue;

    if (dryRun) {
      console.log(
        `DRY_RUN: would update order ${order.orderNumber} items=${changes} orderDiscount=${discount} netSum=${sumNet}`
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (let idx = 0; idx < order.orderItems.length; idx++) {
        const item = order.orderItems[idx];
        const alloc = allocations[idx];

        // Only backfill if missing (avoid rewriting already backfilled rows)
        if (item.netTotalPrice !== null) continue;

        await tx.orderItem.update({
          where: { id: item.id },
          data: {
            discountAmount: alloc.discountAmount,
            netTotalPrice: alloc.netTotalPrice,
            netPricePerUnit: alloc.netPricePerUnit,
          },
        });
        updatedItems++;
      }
    });

    updatedOrders++;
    console.log(`Updated order ${order.orderNumber} (${order.id}) items=${changes}`);
  }

  console.log(`Done.`);
  console.log(`- Updated orders: ${updatedOrders}`);
  console.log(`- Updated items : ${updatedItems}`);
}

run()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

