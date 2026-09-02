ALTER TABLE "RecurringTransaction"
  ADD COLUMN "lastGeneratedAt" TIMESTAMPTZ(3);

CREATE INDEX "Transaction_userId_status_settledAt_idx"
  ON "Transaction"("userId", "status", "settledAt");
