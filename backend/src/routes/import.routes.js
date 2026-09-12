import { Router } from "express";
import { commitCsv, previewCsv } from "../controllers/import.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { commitCsvImportSchema, previewCsvImportSchema } from "../validators/import.schemas.js";

export const importRouter = Router();
importRouter.use(requireAuth);
importRouter.post("/csv/preview", validate(previewCsvImportSchema), asyncHandler(previewCsv));
importRouter.post("/csv/commit", validate(commitCsvImportSchema), asyncHandler(commitCsv));
