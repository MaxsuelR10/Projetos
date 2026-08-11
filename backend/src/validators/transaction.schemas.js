import { z } from "zod";
import {
  idSchema,
  paymentMethodSchema,
  positiveMoneySchema,
  transactionStatusSchema,
  transactionTypeSchema,
} from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data v\u00e1lida");
const optionalDateSchema = dateSchema.nullable().optional();
const optionalText = (maxLength) => z.string().trim().max(maxLength).nullable().optional();

const transactionFields = {
  accountId: idSchema,
  categoryId: idSchema,
  subcategoryId: idSchema.nullable().optional(),
  type: transactionTypeSchema,
  description: z.string().trim().min(2, "Informe uma descri\u00e7\u00e3o").max(180),
  amount: positiveMoneySchema,
  date: dateSchema,
  dueDate: optionalDateSchema,
  status: transactionStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.nullable().optional(),
  notes: optionalText(5000),
};

export const transactionIdSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const createTransactionSchema = z.object({
  body: z.object(transactionFields).strict(),
});

export const updateTransactionSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({
    accountId: transactionFields.accountId.optional(),
    categoryId: transactionFields.categoryId.optional(),
    subcategoryId: transactionFields.subcategoryId,
    type: transactionFields.type.optional(),
    description: transactionFields.description.optional(),
    amount: transactionFields.amount.optional(),
    date: transactionFields.date.optional(),
    dueDate: transactionFields.dueDate,
    status: transactionFields.status,
    paymentMethod: transactionFields.paymentMethod,
    notes: transactionFields.notes,
  }).strict().refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});

export const listTransactionsSchema = z.object({
  query: z.object({
    type: transactionTypeSchema.optional(),
    status: transactionStatusSchema.optional(),
    accountId: idSchema.optional(),
    categoryId: idSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  }).refine((data) => !data.from || !data.to || data.from <= data.to, "O per\u00edodo informado \u00e9 inv\u00e1lido"),
});

export const createTransferSchema = z.object({
  body: z.object({
    fromAccountId: idSchema,
    toAccountId: idSchema,
    amount: positiveMoneySchema,
    date: dateSchema,
    description: optionalText(180),
    idempotencyKey: z.uuid("Chave de requisi\u00e7\u00e3o inv\u00e1lida").optional(),
  }).strict().refine((data) => data.fromAccountId !== data.toAccountId, {
    message: "A conta de origem deve ser diferente da conta de destino",
    path: ["toAccountId"],
  }),
});

export const listTransfersSchema = z.object({
  query: z.object({
    accountId: idSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    includeReversed: z.enum(["true", "false"]).default("false"),
  }).refine((data) => !data.from || !data.to || data.from <= data.to, "O per\u00edodo informado \u00e9 inv\u00e1lido"),
});
