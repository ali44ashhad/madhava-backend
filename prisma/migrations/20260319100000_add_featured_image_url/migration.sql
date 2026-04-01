-- Add featured image url column (nullable)
ALTER TABLE "products" ADD COLUMN "featuredImageUrl" TEXT;

-- Reset all existing products to not featured
UPDATE "products" SET "isFeatured" = false;

-- Enforce: if product is featured, it must have a featured image URL
ALTER TABLE "products"
ADD CONSTRAINT "products_featured_requires_featuredImageUrl"
CHECK (NOT "isFeatured" OR "featuredImageUrl" IS NOT NULL);

