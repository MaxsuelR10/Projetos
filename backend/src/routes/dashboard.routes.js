import { Router } from "express";
import { get } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { dashboardSchema } from "../validators/dashboard.schemas.js";
export const dashboardRouter = Router(); dashboardRouter.use(requireAuth); dashboardRouter.get("/", validate(dashboardSchema), asyncHandler(get));
