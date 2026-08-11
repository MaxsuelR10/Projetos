CREATE TYPE "CardType" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

ALTER TABLE "Transaction" ADD COLUMN "creditCardInvoiceId" UUID;

CREATE TABLE "CreditCard" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "name" VARCHAR(100) NOT NULL, "normalizedName" VARCHAR(100) NOT NULL,
  "institution" VARCHAR(120), "brand" VARCHAR(60), "type" "CardType" NOT NULL, "creditLimit" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "closingDay" INTEGER, "dueDay" INTEGER, "color" VARCHAR(20), "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardInvoice" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "creditCardId" UUID NOT NULL, "referenceYear" INTEGER NOT NULL, "referenceMonth" INTEGER NOT NULL,
  "closingDate" DATE NOT NULL, "dueDate" DATE NOT NULL, "totalAmount" DECIMAL(19,4) NOT NULL DEFAULT 0, "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN', "paidAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardPurchase" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "creditCardId" UUID NOT NULL, "categoryId" UUID NOT NULL, "subcategoryId" UUID,
  "description" VARCHAR(180) NOT NULL, "merchant" VARCHAR(180), "totalAmount" DECIMAL(19,4) NOT NULL, "purchaseDate" DATE NOT NULL, "installmentsCount" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT, "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CardPurchase_pkey" PRIMARY KEY ("id"), CONSTRAINT "CardPurchase_amount_positive_check" CHECK ("totalAmount" > 0), CONSTRAINT "CardPurchase_installments_positive_check" CHECK ("installmentsCount" > 0)
);

CREATE TABLE "CardInstallment" (
  "id" UUID NOT NULL, "userId" UUID NOT NULL, "creditCardId" UUID NOT NULL, "purchaseId" UUID NOT NULL, "invoiceId" UUID NOT NULL,
  "number" INTEGER NOT NULL, "amount" DECIMAL(19,4) NOT NULL, "dueDate" DATE NOT NULL, "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CardInstallment_pkey" PRIMARY KEY ("id"), CONSTRAINT "CardInstallment_amount_positive_check" CHECK ("amount" > 0), CONSTRAINT "CardInstallment_number_positive_check" CHECK ("number" > 0)
);

CREATE INDEX "CreditCard_userId_isActive_idx" ON "CreditCard"("userId", "isActive");
CREATE UNIQUE INDEX "CreditCard_userId_normalizedName_key" ON "CreditCard"("userId", "normalizedName");
CREATE UNIQUE INDEX "CreditCard_id_userId_key" ON "CreditCard"("id", "userId");
CREATE INDEX "CreditCardInvoice_userId_status_dueDate_idx" ON "CreditCardInvoice"("userId", "status", "dueDate");
CREATE UNIQUE INDEX "CreditCardInvoice_creditCardId_referenceYear_referenceMonth_key" ON "CreditCardInvoice"("creditCardId", "referenceYear", "referenceMonth");
CREATE UNIQUE INDEX "CreditCardInvoice_id_userId_key" ON "CreditCardInvoice"("id", "userId");
CREATE INDEX "CardPurchase_userId_creditCardId_purchaseDate_idx" ON "CardPurchase"("userId", "creditCardId", "purchaseDate");
CREATE INDEX "CardPurchase_categoryId_purchaseDate_idx" ON "CardPurchase"("categoryId", "purchaseDate");
CREATE UNIQUE INDEX "CardPurchase_id_userId_key" ON "CardPurchase"("id", "userId");
CREATE INDEX "CardInstallment_invoiceId_status_idx" ON "CardInstallment"("invoiceId", "status");
CREATE INDEX "CardInstallment_creditCardId_status_idx" ON "CardInstallment"("creditCardId", "status");
CREATE UNIQUE INDEX "CardInstallment_purchaseId_number_key" ON "CardInstallment"("purchaseId", "number");
CREATE UNIQUE INDEX "Transaction_creditCardInvoiceId_userId_key" ON "Transaction"("creditCardInvoiceId", "userId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardInvoiceId_userId_fkey" FOREIGN KEY ("creditCardInvoiceId", "userId") REFERENCES "CreditCardInvoice"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardPurchase" ADD CONSTRAINT "CardPurchase_subcategoryId_userId_fkey" FOREIGN KEY ("subcategoryId", "userId") REFERENCES "Subcategory"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_creditCardId_userId_fkey" FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_purchaseId_userId_fkey" FOREIGN KEY ("purchaseId", "userId") REFERENCES "CardPurchase"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CardInstallment" ADD CONSTRAINT "CardInstallment_invoiceId_userId_fkey" FOREIGN KEY ("invoiceId", "userId") REFERENCES "CreditCardInvoice"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
