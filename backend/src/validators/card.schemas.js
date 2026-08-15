import { z } from "zod";
import { idSchema, paymentMethodSchema, positiveMoneySchema } from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data válida");
const optionalText = (maxLength) => z.string().trim().max(maxLength).nullable().optional();
const nonNegativeMoney = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido");
const cardPurchaseMoney = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,2})?$/, "Informe um valor monetário com no máximo dois centavos").refine((value) => Number(value) > 0, "Informe um valor maior que zero");
const daySchema = z.coerce.number().int().min(1).max(31);
const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Informe uma cor hexadecimal válida").nullable().optional();

const cardFields = {
  name: z.string().trim().min(2).max(100),
  institution: optionalText(120),
  brand: optionalText(60),
  type: z.enum(["CREDIT", "DEBIT"]),
  creditLimit: nonNegativeMoney.optional(),
  closingDay: daySchema.nullable().optional(),
  dueDay: daySchema.nullable().optional(),
  color: colorSchema,
  isActive: z.boolean().optional(),
};

function validateCreditCard(data, context) {
  const type = data.type;
  if (type === "CREDIT" && (data.closingDay == null || data.dueDay == null || !data.creditLimit || data.creditLimit === "0")) {
    context.addIssue({ code: "custom", message: "Cartão de crédito exige limite, fechamento e vencimento", path: ["creditLimit"] });
  }
}

export const cardIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const createCardSchema = z.object({ body: z.object(cardFields).strict().superRefine(validateCreditCard) });
export const updateCardSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    name: cardFields.name.optional(), institution: cardFields.institution, brand: cardFields.brand,
    type: cardFields.type.optional(), creditLimit: cardFields.creditLimit, closingDay: cardFields.closingDay,
    dueDay: cardFields.dueDay, color: cardFields.color, isActive: cardFields.isActive,
  }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});
export const listCardsSchema = z.object({ query: z.object({ status: z.enum(["active", "inactive", "all"]).default("active") }) });

export const createPurchaseSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    categoryId: idSchema, subcategoryId: idSchema.nullable().optional(), description: z.string().trim().min(2).max(180),
    merchant: optionalText(180), totalAmount: cardPurchaseMoney, purchaseDate: dateSchema,
    installmentsCount: z.coerce.number().int().min(1).max(120).default(1), notes: optionalText(5000),
  }).strict(),
});

export const listPurchasesSchema = z.object({
  params: z.object({ id: idSchema }),
  query: z.object({ includeCancelled: z.enum(["true", "false"]).default("false") }),
});

export const purchaseIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const updatePurchaseSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({ description: z.string().trim().min(2).max(180).optional(), merchant: optionalText(180), notes: optionalText(5000) }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});

export const listInvoicesSchema = z.object({ params: z.object({ id: idSchema }) });
export const invoiceIdSchema = z.object({ params: z.object({ id: idSchema }) });
export const payInvoiceSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({ accountId: idSchema, categoryId: idSchema, date: dateSchema, paymentMethod: paymentMethodSchema.optional(), notes: optionalText(5000) }).strict(),
});
