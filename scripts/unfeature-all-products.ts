import { prisma } from '../src/config/prisma.js';

async function main() {
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
  `;
  const columnSet = new Set(columns.map((c) => c.column_name));

  const before = await prisma.product.count({
    where: {
      isFeatured: true,
    },
  });

  console.log(`Featured products (before): ${before}`);

  // Always clear featured flag via Prisma.
  // Featured image URL column name may vary across DBs; handle both camelCase and snake_case.
  let updatedCount = 0;
  if (columnSet.has('featuredImageUrl')) {
    const result = await prisma.product.updateMany({
      where: { isFeatured: true },
      data: { isFeatured: false, featuredImageUrl: null },
    });
    updatedCount = result.count;
  } else if (columnSet.has('featured_image_url')) {
    const result = await prisma.product.updateMany({
      where: { isFeatured: true },
      data: { isFeatured: false },
    });
    updatedCount = result.count;

    await prisma.$executeRawUnsafe(
      `UPDATE "public"."products" SET "featured_image_url" = NULL WHERE "isFeatured" = false AND "featured_image_url" IS NOT NULL`
    );
  } else {
    const result = await prisma.product.updateMany({
      where: { isFeatured: true },
      data: { isFeatured: false },
    });
    updatedCount = result.count;
    console.warn(
      '⚠️  No featured image URL column found on public.products (expected featuredImageUrl or featured_image_url). Only cleared isFeatured.'
    );
  }

  const after = await prisma.product.count({
    where: {
      isFeatured: true,
    },
  });

  console.log(`Updated products: ${updatedCount}`);
  console.log(`Featured products (after): ${after}`);
}

main()
  .catch((err) => {
    console.error('Failed to unfeature products:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

