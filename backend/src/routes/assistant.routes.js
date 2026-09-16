import rateLimit from "express-rate-limit";
import { Router } from "express";
import { chat } from "../controllers/assistant.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { assistantChatSchema } from "../validators/assistant.schemas.js";

export const assistantRouter = Router();

const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "ASSISTANT_RATE_LIMITED",
      message: "Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente novamente.",
    },
  },
});

assistantRouter.use(requireAuth);
assistantRouter.post("/chat", assistantLimiter, validate(assistantChatSchema), asyncHandler(chat));
