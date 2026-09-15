import { z } from "zod";

const referenceMonth = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Informe o mes no formato AAAA-MM");
const referenceDate = z.iso.date("Informe uma data válida");

export const dashboardSchema = z.object({
  query: z
    .object({
    month: referenceMonth.optional(),
    startMonth: referenceMonth.optional(),
    endMonth: referenceMonth.optional(),
    expenseFrom: referenceDate.optional(),
    expenseTo: referenceDate.optional(),
    months: z.coerce.number().int().min(1).max(12).default(6),
    })
    .superRefine((value, context) => {
      const start = value.startMonth ?? value.month;
      const end = value.endMonth ?? start;
      if (start && end && end < start) {
        context.addIssue({
          code: "custom",
          path: ["endMonth"],
          message: "O mês final deve ser igual ou posterior ao mês inicial",
        });
      }
      if (value.expenseFrom && value.expenseTo && value.expenseTo < value.expenseFrom) {
        context.addIssue({
          code: "custom",
          path: ["expenseTo"],
          message: "A data final deve ser igual ou posterior à data inicial",
        });
      }
    }),
});
