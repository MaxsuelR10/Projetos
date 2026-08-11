import { z } from "zod";
import { idSchema, paymentMethodSchema, positiveMoneySchema, transactionTypeSchema } from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data válida");
const frequency = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY", "CUSTOM_DAYS"]);
const optionalText = (length) => z.string().trim().max(length).nullable().optional();
const schedule = {
  frequency,
  intervalDays: z.coerce.number().int().min(1).max(3650).nullable().optional(),
};
function intervalRule(data, context) { if (data.frequency === "CUSTOM_DAYS" && !data.intervalDays) context.addIssue({ code: "custom", path: ["intervalDays"], message: "Informe o intervalo em dias" }); }

const recurringFields = {
  accountId: idSchema, categoryId: idSchema, subcategoryId: idSchema.nullable().optional(), type: transactionTypeSchema,
  description: z.string().trim().min(2).max(180), amount: positiveMoneySchema, paymentMethod: paymentMethodSchema.nullable().optional(), notes: optionalText(5000),
  ...schedule, startDate: dateSchema, endDate: dateSchema.nullable().optional(), occurrencesLimit: z.coerce.number().int().min(1).max(10000).nullable().optional(), status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
};
export const recurrenceIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const createRecurrenceSchema = z.object({ body: z.object(recurringFields).strict().superRefine(intervalRule).refine((data) => !data.endDate || data.endDate >= data.startDate, "A data final deve ser posterior à inicial") });
export const updateRecurrenceSchema = z.object({ params: z.object({ id: idSchema }), body: z.object({ description: recurringFields.description.optional(), paymentMethod: recurringFields.paymentMethod, notes: recurringFields.notes, status: recurringFields.status, endDate: recurringFields.endDate, occurrencesLimit: recurringFields.occurrencesLimit }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar") });
export const listRecurrencesSchema = z.object({ query: z.object({ status: z.enum(["active", "paused", "completed", "all"]).default("active") }) });
export const generateRecurrencesSchema = z.object({ body: z.object({ through: dateSchema }).strict() });

const subscriptionFields = {
  serviceName: z.string().trim().min(2).max(120), categoryId: idSchema, accountId: idSchema.nullable().optional(), creditCardId: idSchema.nullable().optional(), amount: positiveMoneySchema,
  ...schedule, nextBillingDate: dateSchema, paymentMethod: paymentMethodSchema.nullable().optional(), notes: optionalText(5000), isActive: z.boolean().optional(),
};
function targetRule(data, context) { intervalRule(data, context); if (data.accountId && data.creditCardId) context.addIssue({ code: "custom", path: ["creditCardId"], message: "Escolha conta ou cartão, não ambos" }); }
export const subscriptionIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const createSubscriptionSchema = z.object({ body: z.object(subscriptionFields).strict().superRefine(targetRule) });
export const updateSubscriptionSchema = z.object({ params: z.object({ id: idSchema }), body: z.object({ serviceName: subscriptionFields.serviceName.optional(), categoryId: subscriptionFields.categoryId.optional(), accountId: subscriptionFields.accountId, creditCardId: subscriptionFields.creditCardId, amount: subscriptionFields.amount.optional(), frequency: frequency.optional(), intervalDays: subscriptionFields.intervalDays, nextBillingDate: subscriptionFields.nextBillingDate.optional(), paymentMethod: subscriptionFields.paymentMethod, notes: subscriptionFields.notes, isActive: subscriptionFields.isActive }).strict().superRefine(targetRule).refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar") });
export const listSubscriptionsSchema = z.object({ query: z.object({ status: z.enum(["active", "inactive", "all"]).default("active") }) });
