import { z } from "zod";
import { idSchema, positiveMoneySchema } from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data válida");
const moneySchema = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido");
const signedMoneySchema = z.string().trim().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido");
const rateSchema = z.string().trim().regex(/^\d{1,4}(?:\.\d{1,6})?$/, "Informe uma taxa válida").nullable().optional();
const optionalText = (maxLength) => z.string().trim().max(maxLength).nullable().optional();
const investmentType = z.enum(["CDB", "TESOURO", "LCI", "LCA", "STOCK", "ETF", "FII", "FUND", "CRYPTO", "SAVINGS", "FIXED_INCOME", "OTHER"]);
const yieldType = z.enum(["CDI_PERCENT", "SELIC", "IPCA", "ANNUAL_RATE", "MONTHLY_RATE", "CUSTOM"]);

const investmentFields = {
  name: z.string().trim().min(2).max(120), institution: optionalText(120), accountId: idSchema.nullable().optional(), type: investmentType,
  applicationDate: dateSchema, maturityDate: dateSchema.nullable().optional(), liquidity: optionalText(120), yieldType,
  referenceIndex: optionalText(60), indexPercentage: z.string().trim().regex(/^\d{1,3}(?:\.\d{1,4})?$/, "Informe um percentual válido").nullable().optional(),
  manualRate: rateSchema, manualEarnings: signedMoneySchema.optional(), notes: optionalText(5000), isActive: z.boolean().optional(),
  targetAmount: positiveMoneySchema.nullable().optional(), goalDeadline: dateSchema.nullable().optional(), goalNotes: optionalText(5000),
};
function yieldRule(data, context) {
  if (data.yieldType === "CDI_PERCENT" && !data.indexPercentage) context.addIssue({ code: "custom", path: ["indexPercentage"], message: "Informe o percentual do CDI" });
  if (["ANNUAL_RATE", "MONTHLY_RATE"].includes(data.yieldType) && !data.manualRate) context.addIssue({ code: "custom", path: ["manualRate"], message: "Informe a taxa manual" });
}

export const investmentIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const createInvestmentSchema = z.object({
  body: z.object({ ...investmentFields, initialAmount: positiveMoneySchema, initialContributionNotes: optionalText(5000) }).strict().superRefine(yieldRule),
});
export const updateInvestmentSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    name: investmentFields.name.optional(), institution: investmentFields.institution, accountId: investmentFields.accountId, type: investmentFields.type.optional(),
    applicationDate: investmentFields.applicationDate.optional(), maturityDate: investmentFields.maturityDate, liquidity: investmentFields.liquidity, yieldType: investmentFields.yieldType.optional(),
    referenceIndex: investmentFields.referenceIndex, indexPercentage: investmentFields.indexPercentage, manualRate: investmentFields.manualRate, manualEarnings: signedMoneySchema.optional(), notes: investmentFields.notes,
    isActive: investmentFields.isActive, targetAmount: investmentFields.targetAmount, goalDeadline: investmentFields.goalDeadline, goalNotes: investmentFields.goalNotes,
  }).strict().superRefine(yieldRule).refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});

export const createContributionSchema = z.object({ params: z.object({ id: idSchema }), body: z.object({ amount: positiveMoneySchema, date: dateSchema, notes: optionalText(5000) }).strict() });
export const contributionIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const updateContributionSchema = z.object({ params: z.object({ id: idSchema }), body: z.object({ amount: positiveMoneySchema.optional(), date: dateSchema.optional(), notes: optionalText(5000) }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar") });
export const adoptLegacyGoalSchema = z.object({ params: z.object({ id: idSchema, goalId: idSchema }) });
