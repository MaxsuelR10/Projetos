import { z } from "zod";
import { idSchema, positiveMoneySchema, transactionTypeSchema } from "./common.schemas.js";

const importRowSchema = z.object({
  date: z.iso.date("Data inválida"),
  description: z.string().trim().min(2).max(180),
  amount: positiveMoneySchema,
  type: transactionTypeSchema,
  categoryId: idSchema,
  duplicate: z.boolean().optional(),
});

export const previewCsvImportSchema = z.object({
  body: z.object({ accountId: idSchema, content: z.string().min(1).max(1_000_000) }).strict(),
});

export const commitCsvImportSchema = z.object({
  body: z.object({ accountId: idSchema, rows: z.array(importRowSchema).min(1).max(500) }).strict(),
});
