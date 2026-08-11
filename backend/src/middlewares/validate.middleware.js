import { AppError } from "../utils/app-error.js";

export function validate(schema) {
  return function validationMiddleware(request, _response, next) {
    const result = schema.safeParse({
      body: request.body,
      params: request.params,
      query: request.query,
    });

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.slice(1).join("."),
        message: issue.message,
      }));

      return next(new AppError("Dados inválidos", 400, "VALIDATION_ERROR", details));
    }

    request.validated = result.data;
    return next();
  };
}
