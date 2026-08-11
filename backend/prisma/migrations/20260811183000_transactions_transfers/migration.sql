-- Transferências podem ser idempotentes e reversíveis sem apagar o histórico.
ALTER TABLE "Transfer"
  ADD COLUMN "idempotencyKey" VARCHAR(100),
  ADD COLUMN "isReversed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reversedAt" TIMESTAMPTZ(3);

CREATE UNIQUE INDEX "Transfer_userId_idempotencyKey_key"
  ON "Transfer"("userId", "idempotencyKey");
