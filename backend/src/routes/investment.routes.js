import { Router } from "express";
import { createInvestmentHandler, listInvestmentHandler, updateInvestmentHandler } from "../controllers/investment.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createInvestmentSchema, updateInvestmentSchema } from "../validators/investment.schemas.js";

export const investmentRouter = Router();
investmentRouter.use(requireAuth);
investmentRouter.get("/", asyncHandler(listInvestmentHandler));
investmentRouter.post("/", validate(createInvestmentSchema), asyncHandler(createInvestmentHandler));
investmentRouter.patch("/:id", validate(updateInvestmentSchema), asyncHandler(updateInvestmentHandler));
