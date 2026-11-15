BEGIN;

ALTER TABLE "CreditCardInvoice" ADD COLUMN "paidAmount" DECIMAL(19, 4) NOT NULL DEFAULT 0;

CREATE INDEX "Transaction_creditCardInvoiceId_userId_idx" ON "Transaction"("creditCardInvoiceId", "userId");
DROP INDEX "Transaction_creditCardInvoiceId_userId_key";

COMMIT;
