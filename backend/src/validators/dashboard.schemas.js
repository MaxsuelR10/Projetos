import { z } from "zod";
export const dashboardSchema = z.object({ query: z.object({ month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Informe o mês no formato AAAA-MM").optional() }) });
