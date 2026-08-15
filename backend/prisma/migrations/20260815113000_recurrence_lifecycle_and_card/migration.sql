CREATE TYPE "RecurrenceEndMode" AS ENUM ('NO_END_DATE', 'END_DATE', 'DURATION');
CREATE TYPE "RecurrenceDurationUnit" AS ENUM ('DAYS', 'WEEKS', 'MONTHS', 'YEARS');

ALTER TABLE "RecurringTransaction"
  ADD COLUMN "creditCardId" UUID,
  ADD COLUMN "endMode" "RecurrenceEndMode" NOT NULL DEFAULT 'NO_END_DATE',
  ADD COLUMN "durationValue" INTEGER,
  ADD COLUMN "durationUnit" "RecurrenceDurationUnit",
  ADD COLUMN "endedAt" TIMESTAMPTZ(3);

UPDATE "RecurringTransaction"
SET "endMode" = CASE
  WHEN "endDate" IS NOT NULL THEN 'END_DATE'::"RecurrenceEndMode"
  WHEN "occurrencesLimit" IS NOT NULL THEN 'DURATION'::"RecurrenceEndMode"
  ELSE 'NO_END_DATE'::"RecurrenceEndMode"
END;

ALTER TABLE "RecurringTransaction"
  ADD CONSTRAINT "RecurringTransaction_creditCardId_userId_fkey"
  FOREIGN KEY ("creditCardId", "userId") REFERENCES "CreditCard"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "RecurringTransaction_creditCardId_idx" ON "RecurringTransaction"("creditCardId");
