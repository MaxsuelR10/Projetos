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

const column = z.number().int().min(0).max(99).nullable();
export const csvMappingSchema = z.object({
  delimiter: z.enum([";", ",", "\t"]),
  dateFormat: z.enum(["AUTO", "ISO", "DMY", "MDY"]),
  decimalSeparator: z.enum(["AUTO", "COMMA", "DOT"]),
  amountMode: z.enum(["SIGNED", "SPLIT"]),
  date: column, description: column, amount: column, debit: column, credit: column,
}).strict().superRefine((mapping, context) => {
  const required = [mapping.date, mapping.description, ...(mapping.amountMode === "SIGNED" ? [mapping.amount] : [mapping.debit, mapping.credit].filter((value) => value !== null))];
  if (required.some((value) => value === null) || required.length < 3) context.addIssue({ code: "custom", message: "Escolha as colunas de data, descrição e valores" });
  if (new Set(required).size !== required.length) context.addIssue({ code: "custom", message: "Cada campo deve usar uma coluna diferente" });
});

export const inspectCsvSchema = z.object({ body: z.object({ accountId: idSchema, content: z.string().min(1).max(1_000_000), delimiter: z.enum([";", ",", "\t"]).optional() }).strict() });
export const saveImportProfileSchema = z.object({ body: z.object({ name: z.string().trim().min(2).max(100), headers: z.array(z.string().max(500)).min(3).max(100), mapping: csvMappingSchema }).strict() });
export const importProfileIdSchema = z.object({ params: z.object({ id: idSchema }) });

export const previewCsvImportSchema = z.object({
  body: z.object({ accountId: idSchema, content: z.string().min(1).max(1_000_000), type: transactionTypeSchema.optional(), mapping: csvMappingSchema.optional(), profileId: idSchema.optional() }).strict().refine((data) => !(data.mapping && data.profileId), "Escolha um perfil ou um mapeamento"),
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
