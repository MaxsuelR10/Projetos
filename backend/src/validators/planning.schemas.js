import { z } from "zod";
import { idSchema, positiveMoneySchema } from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data válida");
const nonNegativeMoneySchema = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido");
const yearSchema = z.coerce.number().int().min(2000).max(2200);
const monthSchema = z.coerce.number().int().min(1).max(12);

export const listBudgetsSchema = z.object({ query: z.object({ year: yearSchema, month: monthSchema }) });
export const saveBudgetSchema = z.object({ body: z.object({ categoryId: idSchema, year: yearSchema, month: monthSchema, limitAmount: positiveMoneySchema }).strict() });
export const createGoalSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(120), targetAmount: positiveMoneySchema,
  currentAmount: nonNegativeMoneySchema.default("0"), deadline: dateSchema.nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(), accountId: idSchema.nullable().optional(),
}).strict() });
