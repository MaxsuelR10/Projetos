import { Router } from "express";
import {
  cancelPurchaseHandler,
  create,
  createPurchaseHandler,
  getById,
  list,
  listInvoicesHandler,
  listPurchasesHandler,
  payInvoiceHandler,
  remove,
  update,
  updatePurchaseHandler,
} from "../controllers/card.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  cardIdSchema,
  createCardSchema,
  createPurchaseSchema,
  invoiceIdSchema,
  listCardsSchema,
  listInvoicesSchema,
  listPurchasesSchema,
  payInvoiceSchema,
  purchaseIdSchema,
  updateCardSchema,
  updatePurchaseSchema,
} from "../validators/card.schemas.js";

export const cardRouter = Router();
export const invoiceRouter = Router();
export const purchaseRouter = Router();

cardRouter.use(requireAuth);
cardRouter.get("/", validate(listCardsSchema), asyncHandler(list));
cardRouter.post("/", validate(createCardSchema), asyncHandler(create));
cardRouter.get("/:id", validate(cardIdSchema), asyncHandler(getById));
cardRouter.patch("/:id", validate(updateCardSchema), asyncHandler(update));
cardRouter.delete("/:id", validate(cardIdSchema), asyncHandler(remove));
cardRouter.get("/:id/invoices", validate(listInvoicesSchema), asyncHandler(listInvoicesHandler));
cardRouter.get("/:id/purchases", validate(listPurchasesSchema), asyncHandler(listPurchasesHandler));
cardRouter.post("/:id/purchases", validate(createPurchaseSchema), asyncHandler(createPurchaseHandler));

invoiceRouter.use(requireAuth);
invoiceRouter.post("/:id/pay", validate(payInvoiceSchema), asyncHandler(payInvoiceHandler));

purchaseRouter.use(requireAuth);
purchaseRouter.patch("/:id", validate(updatePurchaseSchema), asyncHandler(updatePurchaseHandler));
purchaseRouter.delete("/:id", validate(purchaseIdSchema), asyncHandler(cancelPurchaseHandler));
