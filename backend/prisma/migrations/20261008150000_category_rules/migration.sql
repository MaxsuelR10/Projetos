CREATE TYPE "CategoryRuleMatchType" AS ENUM ('EXACT', 'CONTAINS');

CREATE TABLE "CategoryRule" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID,
    "categoryId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "matchType" "CategoryRuleMatchType" NOT NULL,
    "pattern" VARCHAR(180) NOT NULL,
    "normalizedPattern" VARCHAR(180) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceImportId" UUID,
    "sourceImportRowKey" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryRule_userId_sourceImportId_sourceImportRowKey_key"
ON "CategoryRule"("userId", "sourceImportId", "sourceImportRowKey");

CREATE INDEX "CategoryRule_userId_isActive_type_idx"
ON "CategoryRule"("userId", "isActive", "type");

CREATE INDEX "CategoryRule_userId_accountId_matchType_normalizedPattern_idx"
ON "CategoryRule"("userId", "accountId", "matchType", "normalizedPattern");

ALTER TABLE "CategoryRule"
ADD CONSTRAINT "CategoryRule_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryRule"
ADD CONSTRAINT "CategoryRule_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryRule"
ADD CONSTRAINT "CategoryRule_categoryId_userId_fkey"
FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
