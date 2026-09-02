import { Router } from "express";
import { createGoalHandler, listBudgetHandler, listGoalHandler, saveBudgetHandler } from "../controllers/planning.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createGoalSchema, listBudgetsSchema, saveBudgetSchema } from "../validators/planning.schemas.js";

export const planningRouter = Router();
planningRouter.use(requireAuth);
planningRouter.get("/budgets", validate(listBudgetsSchema), asyncHandler(listBudgetHandler));
planningRouter.post("/budgets", validate(saveBudgetSchema), asyncHandler(saveBudgetHandler));
planningRouter.get("/goals", asyncHandler(listGoalHandler));
planningRouter.post("/goals", validate(createGoalSchema), asyncHandler(createGoalHandler));
