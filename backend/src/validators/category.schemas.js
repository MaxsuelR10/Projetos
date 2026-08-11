import { z } from "zod";
import { categoryTypeSchema, idSchema } from "./common.schemas.js";

const colorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Informe uma cor hexadecimal válida")
  .nullable()
  .optional();

const optionalIcon = z.string().trim().max(60).nullable().optional();
const name = z.string().trim().min(2, "Informe um nome").max(100);

const updateFields = {
  name: name.optional(),
  color: colorSchema,
  icon: optionalIcon,
  isActive: z.boolean().optional(),
};

export const listCategoriesSchema = z.object({
  query: z.object({
    type: categoryTypeSchema.optional(),
    status: z.enum(["active", "inactive", "all"]).default("active"),
  }),
});

export const categoryIdSchema = z.object({
  params: z.object({ id: idSchema }),
});

export const createCategorySchema = z.object({
  body: z
    .object({
      name,
      type: categoryTypeSchema,
      color: colorSchema,
      icon: optionalIcon,
    })
    .strict(),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: idSchema }),
  body: z
    .object({
      ...updateFields,
      type: categoryTypeSchema.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});

export const subcategoryParamsSchema = z.object({
  params: z.object({
    categoryId: idSchema,
    id: idSchema,
  }),
});

export const createSubcategorySchema = z.object({
  params: z.object({ categoryId: idSchema }),
  body: z
    .object({
      name,
      color: colorSchema,
      icon: optionalIcon,
    })
    .strict(),
});

export const updateSubcategorySchema = z.object({
  params: z.object({
    categoryId: idSchema,
    id: idSchema,
  }),
  body: z
    .object(updateFields)
    .strict()
    .refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar"),
});
