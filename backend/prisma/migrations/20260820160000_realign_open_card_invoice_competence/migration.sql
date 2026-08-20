-- Recalculate only unpaid installments. Paid invoices are immutable financial history.
WITH installment_targets AS (
  SELECT
    installment."id" AS "installmentId",
    installment."userId",
    installment."creditCardId",
    date_trunc('month', purchase."purchaseDate")
      + make_interval(months =>
          CASE WHEN EXTRACT(DAY FROM purchase."purchaseDate") > card."closingDay" THEN 1 ELSE 0 END
          + installment."number" - 1
        ) AS "closingMonth",
    date_trunc('month', purchase."purchaseDate")
      + make_interval(months =>
          CASE WHEN EXTRACT(DAY FROM purchase."purchaseDate") > card."closingDay" THEN 1 ELSE 0 END
          + CASE WHEN card."dueDay" <= card."closingDay" THEN 1 ELSE 0 END
          + installment."number" - 1
        ) AS "referenceMonth",
    card."closingDay",
    card."dueDay"
  FROM "CardInstallment" installment
  JOIN "CardPurchase" purchase ON purchase."id" = installment."purchaseId"
  JOIN "CreditCard" card ON card."id" = installment."creditCardId"
  JOIN "CreditCardInvoice" source_invoice ON source_invoice."id" = installment."invoiceId"
  WHERE source_invoice."status" <> 'PAID'
), target_invoices AS (
  SELECT DISTINCT
    "userId",
    "creditCardId",
    EXTRACT(YEAR FROM "referenceMonth")::INTEGER AS "referenceYear",
    EXTRACT(MONTH FROM "referenceMonth")::INTEGER AS "referenceMonthNumber",
    (
      "closingMonth"
      + (LEAST(
          "closingDay",
          EXTRACT(DAY FROM ("closingMonth" + INTERVAL '1 month - 1 day'))::INTEGER
        ) - 1) * INTERVAL '1 day'
    )::DATE AS "closingDate",
    (
      "referenceMonth"
      + (LEAST(
          "dueDay",
          EXTRACT(DAY FROM ("referenceMonth" + INTERVAL '1 month - 1 day'))::INTEGER
        ) - 1) * INTERVAL '1 day'
    )::DATE AS "dueDate"
  FROM installment_targets
)
INSERT INTO "CreditCardInvoice" (
  "id", "userId", "creditCardId", "referenceYear", "referenceMonth",
  "closingDate", "dueDate", "totalAmount", "status", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), "userId", "creditCardId", "referenceYear", "referenceMonthNumber",
  "closingDate", "dueDate", 0, 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM target_invoices
ON CONFLICT ("creditCardId", "referenceYear", "referenceMonth") DO NOTHING;

WITH installment_targets AS (
  SELECT
    installment."id" AS "installmentId",
    installment."creditCardId",
    date_trunc('month', purchase."purchaseDate")
      + make_interval(months =>
          CASE WHEN EXTRACT(DAY FROM purchase."purchaseDate") > card."closingDay" THEN 1 ELSE 0 END
          + CASE WHEN card."dueDay" <= card."closingDay" THEN 1 ELSE 0 END
          + installment."number" - 1
        ) AS "referenceMonth",
    card."dueDay"
  FROM "CardInstallment" installment
  JOIN "CardPurchase" purchase ON purchase."id" = installment."purchaseId"
  JOIN "CreditCard" card ON card."id" = installment."creditCardId"
  JOIN "CreditCardInvoice" source_invoice ON source_invoice."id" = installment."invoiceId"
  WHERE source_invoice."status" <> 'PAID'
)
UPDATE "CardInstallment" installment
SET
  "invoiceId" = target_invoice."id",
  "dueDate" = (
    targets."referenceMonth"
    + (LEAST(
        targets."dueDay",
        EXTRACT(DAY FROM (targets."referenceMonth" + INTERVAL '1 month - 1 day'))::INTEGER
      ) - 1) * INTERVAL '1 day'
  )::DATE,
  "updatedAt" = CURRENT_TIMESTAMP
FROM installment_targets targets
JOIN "CreditCardInvoice" target_invoice
  ON target_invoice."creditCardId" = targets."creditCardId"
  AND target_invoice."referenceYear" = EXTRACT(YEAR FROM targets."referenceMonth")::INTEGER
  AND target_invoice."referenceMonth" = EXTRACT(MONTH FROM targets."referenceMonth")::INTEGER
  AND target_invoice."status" <> 'PAID'
WHERE installment."id" = targets."installmentId";

UPDATE "CreditCardInvoice" invoice
SET
  "totalAmount" = COALESCE((
    SELECT SUM(installment."amount")
    FROM "CardInstallment" installment
    WHERE installment."invoiceId" = invoice."id"
      AND installment."status" <> 'CANCELLED'
  ), 0),
  "closingDate" = (
    date_trunc('month', make_date(invoice."referenceYear", invoice."referenceMonth", 1))
    - make_interval(months => CASE WHEN card."dueDay" <= card."closingDay" THEN 1 ELSE 0 END)
    + (LEAST(
        card."closingDay",
        EXTRACT(DAY FROM (
          date_trunc('month', make_date(invoice."referenceYear", invoice."referenceMonth", 1))
          - make_interval(months => CASE WHEN card."dueDay" <= card."closingDay" THEN 1 ELSE 0 END)
          + INTERVAL '1 month - 1 day'
        ))::INTEGER
      ) - 1) * INTERVAL '1 day'
  )::DATE,
  "dueDate" = (
    make_date(invoice."referenceYear", invoice."referenceMonth", 1)
    + (LEAST(
        card."dueDay",
        EXTRACT(DAY FROM (make_date(invoice."referenceYear", invoice."referenceMonth", 1) + INTERVAL '1 month - 1 day'))::INTEGER
      ) - 1) * INTERVAL '1 day'
  )::DATE,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "CreditCard" card
WHERE invoice."creditCardId" = card."id"
  AND invoice."status" <> 'PAID';

DELETE FROM "CreditCardInvoice" invoice
WHERE invoice."status" <> 'PAID'
  AND NOT EXISTS (
    SELECT 1 FROM "CardInstallment" installment WHERE installment."invoiceId" = invoice."id"
  );
