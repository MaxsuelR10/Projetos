import { z } from "zod";
import { idSchema } from "./common.schemas.js";

const month = z.string().regex(/^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])$/, "Informe um mês válido");
const balance = z.string().trim().regex(/^-?\d{1,15}(?:\.\d{1,4})?$/, "Informe um saldo válido");
export const previewReconciliationSchema = z.object({
  query: z.object({ accountId: idSchema, month, bankBalance: balance.optional() }).strict(),
});
export const saveReconciliationSchema = z.object({
  body: z.object({
    accountId: idSchema, month, bankBalance: balance,
    requestId: idSchema,
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    justification: z.string().trim().max(2000).default(""),
  }).strict(),
});
