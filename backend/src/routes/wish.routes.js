import { Router } from "express";
import { createReminderHandler, createWishHandler, deleteReminderHandler, deleteWishHandler, listHandler, updateReminderHandler, updateWishHandler } from "../controllers/wish.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { createReminderSchema, createWishSchema, deleteReminderSchema, deleteWishSchema, updateReminderSchema, updateWishSchema } from "../validators/wish.schemas.js";

export const wishRouter = Router();
wishRouter.use(requireAuth);
wishRouter.get("/", asyncHandler(listHandler));
wishRouter.post("/items", validate(createWishSchema), asyncHandler(createWishHandler));
wishRouter.patch("/items/:id", validate(updateWishSchema), asyncHandler(updateWishHandler));
wishRouter.delete("/items/:id", validate(deleteWishSchema), asyncHandler(deleteWishHandler));
wishRouter.post("/reminders", validate(createReminderSchema), asyncHandler(createReminderHandler));
wishRouter.patch("/reminders/:id", validate(updateReminderSchema), asyncHandler(updateReminderHandler));
wishRouter.delete("/reminders/:id", validate(deleteReminderSchema), asyncHandler(deleteReminderHandler));
