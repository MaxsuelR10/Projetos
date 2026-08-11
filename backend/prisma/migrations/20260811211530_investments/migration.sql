-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('CDB', 'TESOURO', 'LCI', 'LCA', 'STOCK', 'ETF', 'FII', 'FUND', 'CRYPTO', 'SAVINGS', 'FIXED_INCOME', 'OTHER');

-- CreateEnum
CREATE TYPE "YieldType" AS ENUM ('CDI_PERCENT', 'SELIC', 'IPCA', 'ANNUAL_RATE', 'MONTHLY_RATE', 'CUSTOM');

-- CreateTable
CREATE TABLE "Investment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "normalizedName" VARCHAR(120) NOT NULL,
    "institution" VARCHAR(120),
    "type" "InvestmentType" NOT NULL,
    "investedAmount" DECIMAL(19,4) NOT NULL,
    "currentAmount" DECIMAL(19,4) NOT NULL,
    "quantity" DECIMAL(19,4),
    "averagePrice" DECIMAL(19,4),
    "applicationDate" DATE NOT NULL,
    "maturityDate" DATE,
    "liquidity" VARCHAR(120),
    "yieldType" "YieldType" NOT NULL DEFAULT 'CUSTOM',
    "referenceIndex" VARCHAR(60),
    "indexPercentage" DECIMAL(10,4),
    "manualRate" DECIMAL(10,4),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Investment_userId_type_isActive_idx" ON "Investment"("userId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_userId_normalizedName_key" ON "Investment"("userId", "normalizedName");

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
