import { z } from "zod";
import { idSchema, paymentMethodSchema, positiveMoneySchema, transactionTypeSchema } from "./common.schemas.js";

const importRowSchema = z.object({
  date: z.iso.date("Data inválida"),
  description: z.string().trim().min(2).max(180),
  amount: positiveMoneySchema,
  type: transactionTypeSchema,
  categoryId: idSchema,
  duplicate: z.boolean().optional(),
});

export const previewCsvImportSchema = z.object({
  body: z.object({ accountId: idSchema, content: z.string().min(1).max(1_000_000), type: transactionTypeSchema.optional() }).strict(),
});

export const commitCsvImportSchema = z.object({
  body: z.object({
    accountId: idSchema,
    paymentMethod: paymentMethodSchema.default("OTHER"),
    creditCardId: idSchema.nullable().optional(),
    rows: z.array(importRowSchema).min(1).max(500),
  }).strict(),
}).superRefine(({ body }, context) => {
  if (body.paymentMethod === "CREDIT_CARD" && !body.creditCardId) {
    context.addIssue({ code: "custom", path: ["body", "creditCardId"], message: "Selecione o cartão de crédito utilizado" });
  }
  if (body.paymentMethod !== "CREDIT_CARD" && body.creditCardId) {
    context.addIssue({ code: "custom", path: ["body", "creditCardId"], message: "Cartão informado para uma forma de pagamento diferente" });
  }
});
