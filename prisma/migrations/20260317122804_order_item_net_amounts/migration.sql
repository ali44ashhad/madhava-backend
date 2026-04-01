-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "netPricePerUnit" DECIMAL(65,30),
ADD COLUMN     "netTotalPrice" DECIMAL(65,30);
