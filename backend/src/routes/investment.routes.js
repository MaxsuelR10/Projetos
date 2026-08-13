import { Router } from "express";
import {
  adoptLegacyGoalHandler,
  create,
  createContributionHandler,
  getById,
  list,
  refreshIndicesHandler,
  remove,
  removeContributionHandler,
  update,
  updateContributionHandler,
} from "../controllers/investment.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  adoptLegacyGoalSchema,
  contributionIdSchema,
  createContributionSchema,
  createInvestmentSchema,
  investmentIdSchema,
  updateContributionSchema,
  updateInvestmentSchema,
} from "../validators/investment.schemas.js";

export const investmentRouter = Router();
investmentRouter.use(requireAuth);
investmentRouter.get("/", asyncHandler(list));
investmentRouter.post("/", validate(createInvestmentSchema), asyncHandler(create));
investmentRouter.post("/indices/refresh", asyncHandler(refreshIndicesHandler));
investmentRouter.patch("/contributions/:id", validate(updateContributionSchema), asyncHandler(updateContributionHandler));
investmentRouter.delete("/contributions/:id", validate(contributionIdSchema), asyncHandler(removeContributionHandler));
investmentRouter.get("/:id", validate(investmentIdSchema), asyncHandler(getById));
investmentRouter.patch("/:id", validate(updateInvestmentSchema), asyncHandler(update));
investmentRouter.delete("/:id", validate(investmentIdSchema), asyncHandler(remove));
investmentRouter.post("/:id/contributions", validate(createContributionSchema), asyncHandler(createContributionHandler));
investmentRouter.post("/:id/legacy-goals/:goalId", validate(adoptLegacyGoalSchema), asyncHandler(adoptLegacyGoalHandler));
