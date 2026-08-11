-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'DIGITAL', 'SAVINGS', 'CASH', 'WALLET', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO', 'CASH', 'BANK_TRANSFER', 'AUTOMATIC_DEBIT', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "institution" VARCHAR(120),
    "type" "AccountType" NOT NULL,
    "initialBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "color" VARCHAR(20),
    "icon" VARCHAR(60),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "type" "CategoryType" NOT NULL,
    "color" VARCHAR(20),
    "icon" VARCHAR(60),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" VARCHAR(180) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "settledAt" TIMESTAMPTZ(3),
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod",
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(180),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_isActive_idx" ON "Account"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_name_key" ON "Account"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE INDEX "Category_userId_type_isActive_idx" ON "Category"("userId", "type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_type_normalizedName_key" ON "Category"("userId", "type", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_userId_status_dueDate_idx" ON "Transaction"("userId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_date_idx" ON "Transaction"("categoryId", "date");

-- CreateIndex
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");

-- CreateIndex
CREATE INDEX "Transfer_fromAccountId_date_idx" ON "Transfer"("fromAccountId", "date");

-- CreateIndex
CREATE INDEX "Transfer_toAccountId_date_idx" ON "Transfer"("toAccountId", "date");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_userId_fkey" FOREIGN KEY ("fromAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_userId_fkey" FOREIGN KEY ("toAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants not expressible in Prisma Schema Language
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_amount_positive_check" CHECK ("amount" > 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_distinct_accounts_check" CHECK ("fromAccountId" <> "toAccountId");
