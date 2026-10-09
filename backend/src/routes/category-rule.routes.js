import { Router } from "express";
import { create, list, remove, update } from "../controllers/category-rule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  categoryRuleIdSchema,
  createCategoryRuleSchema,
  listCategoryRulesSchema,
  updateCategoryRuleSchema,
} from "../validators/category-rule.schemas.js";

export const categoryRuleRouter = Router();

categoryRuleRouter.use(requireAuth);
categoryRuleRouter.get("/", validate(listCategoryRulesSchema), asyncHandler(list));
categoryRuleRouter.post("/", validate(createCategoryRuleSchema), asyncHandler(create));
categoryRuleRouter.patch("/:id", validate(updateCategoryRuleSchema), asyncHandler(update));
categoryRuleRouter.delete("/:id", validate(categoryRuleIdSchema), asyncHandler(remove));
