import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, logout, me, register } from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { loginSchema, registerSchema } from "../validators/auth.schemas.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    },
  },
});

authRouter.post("/register", authLimiter, validate(registerSchema), asyncHandler(register));
authRouter.post("/login", authLimiter, validate(loginSchema), asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(me));
authRouter.post("/logout", requireAuth, logout);
