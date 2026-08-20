import { Router } from "express";
import { adjustBalance, create, getById, list, remove, update } from "../controllers/account.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  accountIdSchema,
  adjustAccountBalanceSchema,
  createAccountSchema,
  listAccountsSchema,
  updateAccountSchema,
} from "../validators/account.schemas.js";

export const accountRouter = Router();

accountRouter.use(requireAuth);
accountRouter.get("/", validate(listAccountsSchema), asyncHandler(list));
accountRouter.post("/", validate(createAccountSchema), asyncHandler(create));
accountRouter.get("/:id", validate(accountIdSchema), asyncHandler(getById));
accountRouter.patch("/:id", validate(updateAccountSchema), asyncHandler(update));
accountRouter.patch("/:id/balance", validate(adjustAccountBalanceSchema), asyncHandler(adjustBalance));
accountRouter.delete("/:id", validate(accountIdSchema), asyncHandler(remove));
