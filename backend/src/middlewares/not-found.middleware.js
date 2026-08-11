import { AppError } from "../utils/app-error.js";

export function notFound(request, _response, next) {
  next(new AppError(`Rota não encontrada: ${request.method} ${request.path}`, 404, "NOT_FOUND"));
}
