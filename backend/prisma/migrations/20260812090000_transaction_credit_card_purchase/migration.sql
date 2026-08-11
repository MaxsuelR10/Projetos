ALTER TABLE "Transaction" ADD COLUMN "creditCardId" UUID;
ALTER TABLE "Transaction" ADD COLUMN "cardPurchaseId" UUID;

CREATE INDEX "Transaction_creditCardId_date_idx" ON "Transaction"("creditCardId", "date");
CREATE UNIQUE INDEX "Transaction_cardPurchaseId_userId_key" ON "Transaction"("cardPurchaseId", "userId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardId_userId_fkey"
  FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_cardPurchaseId_userId_fkey"
  FOREIGN KEY ("cardPurchaseId", "userId") REFERENCES "CardPurchase"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
