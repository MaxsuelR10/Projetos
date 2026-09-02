import { z } from "zod";
import { idSchema, positiveMoneySchema } from "./common.schemas.js";

const nonNegativeMoneySchema = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido");
const optionalRate = z.string().trim().regex(/^-?\d{1,7}(?:\.\d{1,4})?$/).nullable().optional();
const investmentType = z.enum(["CDB", "TESOURO", "LCI", "LCA", "STOCK", "ETF", "FII", "FUND", "CRYPTO", "SAVINGS", "FIXED_INCOME", "OTHER"]);
const yieldType = z.enum(["CDI_PERCENT", "SELIC", "IPCA", "ANNUAL_RATE", "MONTHLY_RATE", "CUSTOM"]);
const dateSchema = z.iso.date("Informe uma data válida");

export const createInvestmentSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(120), accountId: idSchema.nullable().optional(), institution: z.string().trim().max(120).nullable().optional(),
  type: investmentType, investedAmount: positiveMoneySchema, currentAmount: nonNegativeMoneySchema, applicationDate: dateSchema,
  maturityDate: dateSchema.nullable().optional(), yieldType: yieldType.default("CUSTOM"), manualRate: optionalRate,
  referenceIndex: z.string().trim().max(60).nullable().optional(), notes: z.string().trim().max(5000).nullable().optional(),
}).strict().refine((data) => !data.maturityDate || data.maturityDate >= data.applicationDate, { path: ["maturityDate"], message: "O vencimento não pode ser anterior à aplicação" }) });
export const updateInvestmentSchema = z.object({ params: z.object({ id: idSchema }), body: z.object({ currentAmount: nonNegativeMoneySchema.optional(), manualRate: optionalRate, isActive: z.boolean().optional() }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar") });
