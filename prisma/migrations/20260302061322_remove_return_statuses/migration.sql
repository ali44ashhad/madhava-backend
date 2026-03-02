/*
  Warnings:

  - The values [RETURN_REQUESTED,RETURN_APPROVED,RETURN_REJECTED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
-- Backfill: move orders off return statuses before dropping enum values
UPDATE "orders" SET "status" = 'DELIVERED' WHERE "status" IN ('RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED');

CREATE TYPE "OrderStatus_new" AS ENUM ('PLACED', 'CONFIRMED', 'ON_HOLD', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
COMMIT;
