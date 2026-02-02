-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PLACED', 'CONFIRMED', 'ON_HOLD', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('RAZORPAY', 'COD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PENDING', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skus" (
    "id" TEXT NOT NULL,
    "skuCode" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT,
    "weight" TEXT,
    "material" TEXT,
    "color" TEXT,
    "mrp" DECIMAL(65,30) NOT NULL,
    "sellingPrice" DECIMAL(65,30) NOT NULL,
    "festivePrice" DECIMAL(65,30),
    "gstPercent" DECIMAL(65,30) NOT NULL,
    "stockQuantity" INTEGER NOT NULL,
    "isCodAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "countryOfOrigin" TEXT NOT NULL,
    "manufacturerName" TEXT NOT NULL,
    "manufacturerAddress" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "sellerPincode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_images" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "skuId" TEXT NOT NULL,

    CONSTRAINT "sku_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL,
    "subtotalAmount" DECIMAL(65,30) NOT NULL,
    "gstAmount" DECIMAL(65,30) NOT NULL,
    "codFee" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "skuSnapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "pricePerUnit" DECIMAL(65,30) NOT NULL,
    "gstPercent" DECIMAL(65,30) NOT NULL,
    "totalPrice" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "customerNote" TEXT,
    "status" "ReturnStatus" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_images" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,

    CONSTRAINT "return_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" "RefundStatus" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skus_skuCode_key" ON "skus"("skuCode");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "returns_orderItemId_key" ON "returns"("orderItemId");

-- AddForeignKey
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skus" ADD CONSTRAINT "skus_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_images" ADD CONSTRAINT "sku_images_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_images" ADD CONSTRAINT "return_images_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
