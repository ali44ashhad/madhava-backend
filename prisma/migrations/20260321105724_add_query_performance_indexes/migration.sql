-- CreateIndex
CREATE INDEX "addresses_customerId_idx" ON "addresses"("customerId");

-- CreateIndex
CREATE INDEX "categories_isActive_idx" ON "categories"("isActive");

-- CreateIndex
CREATE INDEX "coupons_createdAt_idx" ON "coupons"("createdAt");

-- CreateIndex
CREATE INDEX "customer_sessions_tokenHash_idx" ON "customer_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_skuId_idx" ON "order_items"("skuId");

-- CreateIndex
CREATE INDEX "orders_placedAt_idx" ON "orders"("placedAt");

-- CreateIndex
CREATE INDEX "orders_customerId_placedAt_idx" ON "orders"("customerId", "placedAt");

-- CreateIndex
CREATE INDEX "otp_verifications_phone_purpose_createdAt_idx" ON "otp_verifications"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "payments_reference_idx" ON "payments"("reference");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "payments"("orderId");

-- CreateIndex
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_subcategoryId_idx" ON "products"("subcategoryId");

-- CreateIndex
CREATE INDEX "products_isActive_isFeatured_idx" ON "products"("isActive", "isFeatured");

-- CreateIndex
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_reference_idx" ON "refunds"("reference");

-- CreateIndex
CREATE INDEX "return_images_returnId_idx" ON "return_images"("returnId");

-- CreateIndex
CREATE INDEX "returns_status_idx" ON "returns"("status");

-- CreateIndex
CREATE INDEX "returns_requestedAt_idx" ON "returns"("requestedAt");

-- CreateIndex
CREATE INDEX "sku_images_skuId_idx" ON "sku_images"("skuId");

-- CreateIndex
CREATE INDEX "skus_productId_idx" ON "skus"("productId");
