-- AlterTable
ALTER TABLE "Account" ADD COLUMN "normalizedName" VARCHAR(100) NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "subcategoryId" UUID;

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "icon" VARCHAR(60),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subcategory_userId_categoryId_isActive_idx" ON "Subcategory"("userId", "categoryId", "isActive");
CREATE UNIQUE INDEX "Subcategory_categoryId_normalizedName_key" ON "Subcategory"("categoryId", "normalizedName");
CREATE UNIQUE INDEX "Subcategory_id_userId_key" ON "Subcategory"("id", "userId");
CREATE UNIQUE INDEX "Account_userId_normalizedName_key" ON "Account"("userId", "normalizedName");
CREATE INDEX "Transaction_subcategoryId_date_idx" ON "Transaction"("subcategoryId", "date");

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subcategoryId_userId_fkey" FOREIGN KEY ("subcategoryId", "userId") REFERENCES "Subcategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
