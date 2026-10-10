import { Router } from "express";
import { commitCsv, previewCsv } from "../controllers/import.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { commitCsvImportSchema, previewCsvImportSchema, inspectCsvSchema, saveImportProfileSchema, importProfileIdSchema } from "../validators/import.schemas.js";
import { inspectCsvImport, listImportProfiles, saveImportProfile, deleteImportProfile } from "../services/import.service.js";

export const importRouter = Router();
importRouter.use(requireAuth);
importRouter.post("/csv/inspect", validate(inspectCsvSchema), asyncHandler(async (req, res) => res.json(await inspectCsvImport(req.auth.userId, req.validated.body))));
importRouter.get("/profiles", asyncHandler(async (req, res) => res.json({ profiles: await listImportProfiles(req.auth.userId) })));
importRouter.post("/profiles", validate(saveImportProfileSchema), asyncHandler(async (req, res) => res.status(201).json(await saveImportProfile(req.auth.userId, req.validated.body))));
importRouter.delete("/profiles/:id", validate(importProfileIdSchema), asyncHandler(async (req, res) => { await deleteImportProfile(req.auth.userId, req.validated.params.id); res.status(204).end(); }));
importRouter.post("/csv/preview", validate(previewCsvImportSchema), asyncHandler(previewCsv));
importRouter.post("/csv/commit", validate(commitCsvImportSchema), asyncHandler(commitCsv));
