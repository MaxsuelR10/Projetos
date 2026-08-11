import { z } from "zod";
import { AUTH_COOKIE_NAME } from "../utils/auth-cookie.js";
import { AppError } from "../utils/app-error.js";
import { verifyAccessToken } from "../utils/jwt.js";

const userIdSchema = z.uuid();

export function requireAuth(request, _response, next) {
  const token = request.cookies[AUTH_COOKIE_NAME];

  if (!token) {
    return next(new AppError("Autenticação necessária", 401, "UNAUTHENTICATED"));
  }

  try {
    const payload = verifyAccessToken(token);
    const userId = userIdSchema.parse(payload.sub);
    request.auth = { userId };
    return next();
  } catch {
    return next(new AppError("Sessão inválida ou expirada", 401, "INVALID_SESSION"));
  }
}
