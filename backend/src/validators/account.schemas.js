import { z } from "zod";
import { accountTypeSchema, idSchema } from "./common.schemas.js";

const moneySchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,15}(?:\.\d{1,4})?$/, "Informe um saldo válido");

const colorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Informe uma cor hexadecimal válida")
  .nullable()
  .optional();

const optionalText = (maxLength) => z.string().trim().max(maxLength).nullable().optional();

const accountFields = {
  name: z.string().trim().min(2, "Informe o nome da conta").max(100),
  institution: optionalText(120),
  type: accountTypeSchema,
  color: colorSchema,
  icon: optionalText(60),
  isActive: z.boolean().optional(),
};

export const accountIdSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const listAccountsSchema = z.object({
  query: z.object({
    status: z.enum(["active", "inactive", "all"]).default("active"),
  }),
});

export const createAccountSchema = z.object({
  body: z
    .object({
      ...accountFields,
      initialBalance: moneySchema.default("0"),
    })
    .strict(),
});

export const updateAccountSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z
    .object({
      name: accountFields.name.optional(),
      institution: accountFields.institution,
      type: accountFields.type.optional(),
      color: accountFields.color,
      icon: accountFields.icon,
      isActive: accountFields.isActive,
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});

export const adjustAccountBalanceSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({ currentBalance: moneySchema }).strict(),
});
