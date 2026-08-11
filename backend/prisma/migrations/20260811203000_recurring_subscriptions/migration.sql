CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM_DAYS');
CREATE TYPE "RecurrenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

ALTER TABLE "Transaction" ADD COLUMN "recurringTransactionId" UUID;

CREATE TABLE "RecurringTransaction" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "accountId" UUID NOT NULL, "categoryId" UUID NOT NULL, "subcategoryId" UUID,
  "type" "TransactionType" NOT NULL, "description" VARCHAR(180) NOT NULL, "amount" DECIMAL(19,4) NOT NULL, "paymentMethod" "PaymentMethod", "notes" TEXT,
  "frequency" "RecurrenceFrequency" NOT NULL, "intervalDays" INTEGER, "startDate" DATE NOT NULL, "endDate" DATE, "occurrencesLimit" INTEGER,
  "occurrencesGenerated" INTEGER NOT NULL DEFAULT 0, "nextOccurrenceDate" DATE NOT NULL, "status" "RecurrenceStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id"), CONSTRAINT "RecurringTransaction_amount_positive_check" CHECK ("amount" > 0), CONSTRAINT "RecurringTransaction_interval_positive_check" CHECK ("intervalDays" IS NULL OR "intervalDays" > 0)
);

CREATE TABLE "Subscription" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "categoryId" UUID NOT NULL, "accountId" UUID, "creditCardId" UUID,
  "serviceName" VARCHAR(120) NOT NULL, "normalizedName" VARCHAR(120) NOT NULL, "amount" DECIMAL(19,4) NOT NULL,
  "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY', "intervalDays" INTEGER, "nextBillingDate" DATE NOT NULL,
  "paymentMethod" "PaymentMethod", "notes" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id"), CONSTRAINT "Subscription_amount_positive_check" CHECK ("amount" > 0), CONSTRAINT "Subscription_interval_positive_check" CHECK ("intervalDays" IS NULL OR "intervalDays" > 0), CONSTRAINT "Subscription_payment_target_check" CHECK (NOT ("accountId" IS NOT NULL AND "creditCardId" IS NOT NULL))
);

CREATE INDEX "RecurringTransaction_userId_status_nextOccurrenceDate_idx" ON "RecurringTransaction"("userId", "status", "nextOccurrenceDate");
CREATE UNIQUE INDEX "RecurringTransaction_id_userId_key" ON "RecurringTransaction"("id", "userId");
CREATE INDEX "Subscription_userId_isActive_nextBillingDate_idx" ON "Subscription"("userId", "isActive", "nextBillingDate");
CREATE UNIQUE INDEX "Subscription_userId_normalizedName_key" ON "Subscription"("userId", "normalizedName");
CREATE UNIQUE INDEX "Subscription_id_userId_key" ON "Subscription"("id", "userId");
CREATE UNIQUE INDEX "Transaction_recurringTransactionId_date_key" ON "Transaction"("recurringTransactionId", "date");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringTransactionId_userId_fkey" FOREIGN KEY ("recurringTransactionId", "userId") REFERENCES "RecurringTransaction"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_subcategoryId_userId_fkey" FOREIGN KEY ("subcategoryId", "userId") REFERENCES "Subcategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
