-- Integra metas aos investimentos, preservando a tabela legada para metas ainda sem vínculo.
ALTER TABLE "FinancialGoal" ADD COLUMN "investmentId" UUID;
ALTER TABLE "Investment" ADD COLUMN "manualEarnings" DECIMAL(19,4) NOT NULL DEFAULT 0;

CREATE TABLE "InvestmentContribution" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "investmentId" UUID NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "date" DATE NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "InvestmentContribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvestmentContribution_amount_positive_check" CHECK ("amount" > 0)
);

CREATE TABLE "FinancialIndex" (
  "code" VARCHAR(20) NOT NULL,
  "rate" DECIMAL(10,6) NOT NULL,
  "period" VARCHAR(20) NOT NULL,
  "source" VARCHAR(255) NOT NULL,
  "referenceDate" DATE NOT NULL,
  "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "FinancialIndex_pkey" PRIMARY KEY ("code")
);

-- O investimento existente vira o primeiro aporte. O id do investimento é reutilizado para evitar depender de extensões de UUID no banco.
INSERT INTO "InvestmentContribution" ("id", "userId", "investmentId", "amount", "date", "createdAt", "updatedAt")
SELECT "id", "userId", "id", "investedAmount", "applicationDate", "createdAt", "updatedAt"
FROM "Investment"
WHERE "investedAmount" > 0;

-- Mantém o valor atual legado como ajuste de rendimento, sem perder ganhos ou perdas já informados manualmente.
UPDATE "Investment"
SET "manualEarnings" = "currentAmount" - "investedAmount";

-- Metas antigas com o mesmo nome normalizado passam a pertencer ao investimento correspondente.
UPDATE "FinancialGoal" AS goal
SET "investmentId" = investment."id"
FROM "Investment" AS investment
WHERE goal."userId" = investment."userId"
  AND goal."normalizedName" = investment."normalizedName"
  AND goal."investmentId" IS NULL;

CREATE UNIQUE INDEX "FinancialGoal_investmentId_key" ON "FinancialGoal"("investmentId");
CREATE UNIQUE INDEX "FinancialGoal_investmentId_userId_key" ON "FinancialGoal"("investmentId", "userId");
CREATE UNIQUE INDEX "Investment_id_userId_key" ON "Investment"("id", "userId");
CREATE INDEX "InvestmentContribution_userId_investmentId_date_idx" ON "InvestmentContribution"("userId", "investmentId", "date");
CREATE UNIQUE INDEX "InvestmentContribution_id_userId_key" ON "InvestmentContribution"("id", "userId");

ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_investmentId_userId_fkey"
  FOREIGN KEY ("investmentId", "userId") REFERENCES "Investment"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestmentContribution" ADD CONSTRAINT "InvestmentContribution_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestmentContribution" ADD CONSTRAINT "InvestmentContribution_investmentId_userId_fkey"
  FOREIGN KEY ("investmentId", "userId") REFERENCES "Investment"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
