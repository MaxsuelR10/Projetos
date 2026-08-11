import { Router } from "express";
import {
  cancel,
  create,
  createTransferHandler,
  list,
  listTransfersHandler,
  remove,
  reverseTransferHandler,
  update,
} from "../controllers/transaction.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  createTransactionSchema,
  createTransferSchema,
  listTransactionsSchema,
  listTransfersSchema,
  transactionIdSchema,
  updateTransactionSchema,
} from "../validators/transaction.schemas.js";

export const transactionRouter = Router();
export const transferRouter = Router();

transactionRouter.use(requireAuth);
transactionRouter.get("/", validate(listTransactionsSchema), asyncHandler(list));
transactionRouter.post("/", validate(createTransactionSchema), asyncHandler(create));
transactionRouter.patch("/:id", validate(updateTransactionSchema), asyncHandler(update));
transactionRouter.patch("/:id/cancel", validate(transactionIdSchema), asyncHandler(cancel));
transactionRouter.delete("/:id", validate(transactionIdSchema), asyncHandler(remove));

transferRouter.use(requireAuth);
transferRouter.get("/", validate(listTransfersSchema), asyncHandler(listTransfersHandler));
transferRouter.post("/", validate(createTransferSchema), asyncHandler(createTransferHandler));
transferRouter.delete("/:id", validate(transactionIdSchema), asyncHandler(reverseTransferHandler));
