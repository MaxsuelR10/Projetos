CREATE TABLE "AccountBalanceAdjustment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "previousBalance" DECIMAL(19,4) NOT NULL,
    "newBalance" DECIMAL(19,4) NOT NULL,
    "difference" DECIMAL(19,4) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountBalanceAdjustment_userId_accountId_createdAt_idx"
  ON "AccountBalanceAdjustment"("userId", "accountId", "createdAt");

ALTER TABLE "AccountBalanceAdjustment"
  ADD CONSTRAINT "AccountBalanceAdjustment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountBalanceAdjustment"
  ADD CONSTRAINT "AccountBalanceAdjustment_accountId_userId_fkey"
  FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
