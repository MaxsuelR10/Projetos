import { z } from "zod";
import { idSchema, positiveMoneySchema } from "./common.schemas.js";

const dateSchema = z.iso.date("Informe uma data válida");
const optionalMoneySchema = z.string().trim().regex(/^\d{1,15}(?:\.\d{1,4})?$/, "Informe um valor monetário válido").nullable().optional();
const optionalUrlSchema = z.string().trim().url("Informe um link válido").max(2048).nullable().optional();

export const createWishSchema = z.object({ body: z.object({
  name: z.string().trim().min(2).max(160),
  amount: positiveMoneySchema,
  url: optionalUrlSchema,
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict() });

export const updateWishSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({ status: z.enum(["ACTIVE", "PURCHASED", "ARCHIVED"]) }).strict(),
});

export const deleteWishSchema = z.object({ params: z.object({ id: idSchema }) });

export const createReminderSchema = z.object({ body: z.object({
  title: z.string().trim().min(2).max(160),
  dueDate: dateSchema.nullable().optional(),
  amount: optionalMoneySchema,
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict() });

export const updateReminderSchema = z.object({
  params: z.object({ id: idSchema }),
  body: z.object({ isDone: z.boolean() }).strict(),
});

export const deleteReminderSchema = z.object({ params: z.object({ id: idSchema }) });
