import { z } from "zod";

export const idSchema = z.uuid("Identificador inválido");

export const positiveMoneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido")
  .refine((value) => /[1-9]/.test(value), "O valor deve ser maior que zero");

export const accountTypeSchema = z.enum([
  "CHECKING",
  "DIGITAL",
  "SAVINGS",
  "CASH",
  "WALLET",
  "INVESTMENT",
  "OTHER",
]);

export const categoryTypeSchema = z.enum(["INCOME", "EXPENSE"]);
export const transactionTypeSchema = z.enum(["INCOME", "EXPENSE"]);
export const transactionStatusSchema = z.enum([
  "PENDING",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
]);
export const paymentMethodSchema = z.enum([
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BOLETO",
  "CASH",
  "BANK_TRANSFER",
  "AUTOMATIC_DEBIT",
  "OTHER",
]);
