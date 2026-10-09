import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { previewReconciliationSchema, saveReconciliationSchema } from "../validators/reconciliation.schemas.js";
import { previewReconciliation, saveReconciliation } from "../services/reconciliation.service.js";

export const reconciliationRouter = Router();
reconciliationRouter.use(requireAuth);
reconciliationRouter.get("/", validate(previewReconciliationSchema), asyncHandler(async (request, response) => {
  response.json(await previewReconciliation(request.auth.userId, request.validated.query));
}));
reconciliationRouter.post("/", validate(saveReconciliationSchema), asyncHandler(async (request, response) => {
  const result = await saveReconciliation(request.auth.userId, request.validated.body);
  response.status(result.idempotent ? 200 : 201).json(result);
}));
