/*
  Warnings:

  - A unique constraint covering the columns `[categoryId,slug]` on the table `subcategories` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "subcategories_categoryId_slug_key" ON "subcategories"("categoryId", "slug");
