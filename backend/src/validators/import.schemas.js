import { z } from "zod";
import { idSchema, paymentMethodSchema, positiveMoneySchema, transactionTypeSchema } from "./common.schemas.js";

const importRowSchema = z.object({
  importKey: z.uuid("Identificador da linha inválido"),
  date: z.iso.date("Data inválida"),
  description: z.string().trim().min(2).max(180),
  amount: positiveMoneySchema,
  type: transactionTypeSchema,
  categoryId: idSchema,
  allowDuplicate: z.boolean().default(false),
  saveRule: z.boolean().default(false),
  ruleMatchType: z.enum(["EXACT", "CONTAINS"]).default("EXACT"),
  rulePattern: z.string().trim().min(2).max(180).optional(),
  ruleAccountScoped: z.boolean().default(true),
}).superRefine((row, context) => {
  if (row.saveRule && !row.rulePattern) {
    context.addIssue({ code: "custom", path: ["rulePattern"], message: "Informe o texto da regra" });
  }
});

export const previewCsvImportSchema = z.object({
  body: z.object({ accountId: idSchema, content: z.string().min(1).max(1_000_000), type: transactionTypeSchema.optional() }).strict(),
});

export const commitCsvImportSchema = z.object({
  body: z.object({
    importId: z.uuid("Identificador da importação inválido"),
    accountId: idSchema,
    paymentMethod: paymentMethodSchema.default("OTHER"),
    creditCardId: idSchema.nullable().optional(),
    ignoredCount: z.number().int().min(0).max(500).default(0),
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
