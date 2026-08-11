import { Router } from "express";
import {
  create,
  createChild,
  list,
  remove,
  removeChild,
  update,
  updateChild,
} from "../controllers/category.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  categoryIdSchema,
  createCategorySchema,
  createSubcategorySchema,
  listCategoriesSchema,
  subcategoryParamsSchema,
  updateCategorySchema,
  updateSubcategorySchema,
} from "../validators/category.schemas.js";

export const categoryRouter = Router();

categoryRouter.use(requireAuth);
categoryRouter.get("/", validate(listCategoriesSchema), asyncHandler(list));
categoryRouter.post("/", validate(createCategorySchema), asyncHandler(create));
categoryRouter.patch("/:id", validate(updateCategorySchema), asyncHandler(update));
categoryRouter.delete("/:id", validate(categoryIdSchema), asyncHandler(remove));
categoryRouter.post(
  "/:categoryId/subcategories",
  validate(createSubcategorySchema),
  asyncHandler(createChild),
);
categoryRouter.patch(
  "/:categoryId/subcategories/:id",
  validate(updateSubcategorySchema),
  asyncHandler(updateChild),
);
categoryRouter.delete(
  "/:categoryId/subcategories/:id",
  validate(subcategoryParamsSchema),
  asyncHandler(removeChild),
);
