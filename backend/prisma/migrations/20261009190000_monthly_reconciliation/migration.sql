CREATE TABLE "AccountReconciliation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "month" VARCHAR(7) NOT NULL,
  "requestId" UUID NOT NULL,
  "snapshotHash" VARCHAR(64) NOT NULL,
  "bankBalance" DECIMAL(19,4) NOT NULL,
  "closingBalance" DECIMAL(19,4) NOT NULL,
  "difference" DECIMAL(19,4) NOT NULL,
  "justification" VARCHAR(2000),
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountReconciliation_userId_requestId_key" ON "AccountReconciliation"("userId", "requestId");
CREATE INDEX "AccountReconciliation_userId_accountId_month_createdAt_idx" ON "AccountReconciliation"("userId", "accountId", "month", "createdAt");
ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
