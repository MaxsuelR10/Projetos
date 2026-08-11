import { Router } from "express";
import { createRecurrenceHandler, createSubscriptionHandler, generateHandler, listRecurrence, listSubscription, updateRecurrenceHandler, updateSubscriptionHandler } from "../controllers/recurrence.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createRecurrenceSchema, createSubscriptionSchema, generateRecurrencesSchema, listRecurrencesSchema, listSubscriptionsSchema, recurrenceIdSchema, updateRecurrenceSchema, updateSubscriptionSchema, subscriptionIdSchema } from "../validators/recurrence.schemas.js";
export const recurrenceRouter = Router(); export const subscriptionRouter = Router();
recurrenceRouter.use(requireAuth); recurrenceRouter.get("/", validate(listRecurrencesSchema), asyncHandler(listRecurrence)); recurrenceRouter.post("/", validate(createRecurrenceSchema), asyncHandler(createRecurrenceHandler)); recurrenceRouter.post("/generate", validate(generateRecurrencesSchema), asyncHandler(generateHandler)); recurrenceRouter.patch("/:id", validate(updateRecurrenceSchema), asyncHandler(updateRecurrenceHandler));
subscriptionRouter.use(requireAuth); subscriptionRouter.get("/", validate(listSubscriptionsSchema), asyncHandler(listSubscription)); subscriptionRouter.post("/", validate(createSubscriptionSchema), asyncHandler(createSubscriptionHandler)); subscriptionRouter.patch("/:id", validate(updateSubscriptionSchema), asyncHandler(updateSubscriptionHandler));
