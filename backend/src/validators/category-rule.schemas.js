import { z } from "zod";
import { idSchema, transactionTypeSchema } from "./common.schemas.js";

const matchTypeSchema = z.enum(["EXACT", "CONTAINS"]);
const patternSchema = z.string().trim().min(2, "Informe ao menos 2 caracteres").max(180);
const prioritySchema = z.number().int().min(-100).max(100);

export const listCategoryRulesSchema = z.object({
  query: z.object({
    status: z.enum(["active", "inactive", "all"]).default("all"),
    type: transactionTypeSchema.optional(),
    accountId: idSchema.optional(),
  }),
});

export const categoryRuleIdSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const createCategoryRuleSchema = z.object({
  body: z.object({
    accountId: idSchema.nullable().optional(),
    categoryId: idSchema,
    type: transactionTypeSchema,
    matchType: matchTypeSchema,
    pattern: patternSchema,
    priority: prioritySchema.default(0),
  }).strict(),
});

export const updateCategoryRuleSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    accountId: idSchema.nullable().optional(),
    categoryId: idSchema.optional(),
    type: transactionTypeSchema.optional(),
    matchType: matchTypeSchema.optional(),
    pattern: patternSchema.optional(),
    priority: prioritySchema.optional(),
    isActive: z.boolean().optional(),
  }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});
