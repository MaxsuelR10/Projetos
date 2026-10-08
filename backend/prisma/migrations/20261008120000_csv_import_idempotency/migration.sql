ALTER TABLE "Transaction"
ADD COLUMN "importId" UUID,
ADD COLUMN "importRowKey" VARCHAR(64);

CREATE UNIQUE INDEX "Transaction_userId_importId_importRowKey_key"
ON "Transaction"("userId", "importId", "importRowKey");
