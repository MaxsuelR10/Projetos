import { AppError } from "../utils/app-error.js";

export function errorHandler(error, request, response, _next) {
  const knownError = error instanceof AppError;
  const statusCode = knownError ? error.statusCode : 500;

  if (!knownError) {
    console.error("Erro interno não tratado", {
      name: error?.name || "Error",
      code: error?.code || "UNKNOWN",
      message: error?.message || "Erro sem mensagem",
      stack: error?.stack,
      method: request.method,
      path: request.originalUrl,
      userId: request.auth?.userId,
    });
  }

  const payload = {
    error: {
      code: knownError ? error.code : "INTERNAL_ERROR",
      message: knownError ? error.message : "Ocorreu um erro interno",
    },
  };

  if (knownError && error.details) {
    payload.error.details = error.details;
  }

  return response.status(statusCode).json(payload);
}
