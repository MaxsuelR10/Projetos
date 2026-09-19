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

const updateWishBodySchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  amount: positiveMoneySchema.optional(),
  url: optionalUrlSchema,
  notes: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["ACTIVE", "PURCHASED", "ARCHIVED"]).optional(),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo para atualizar");

export const updateWishSchema = z.object({ params: z.object({ id: idSchema }), body: updateWishBodySchema });

export const deleteWishSchema = z.object({ params: z.object({ id: idSchema }) });

export const createReminderSchema = z.object({ body: z.object({
  title: z.string().trim().min(2).max(160),
  dueDate: dateSchema.nullable().optional(),
  amount: optionalMoneySchema,
  notes: z.string().trim().max(5000).nullable().optional(),
}).strict() });

const updateReminderBodySchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  dueDate: dateSchema.nullable().optional(),
  amount: optionalMoneySchema,
  notes: z.string().trim().max(5000).nullable().optional(),
  isDone: z.boolean().optional(),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), "Informe ao menos um campo para atualizar");

export const updateReminderSchema = z.object({ params: z.object({ id: idSchema }), body: updateReminderBodySchema });

export const deleteReminderSchema = z.object({ params: z.object({ id: idSchema }) });
