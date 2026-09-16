import { answerFinancialQuestion } from "../services/financial-assistant.service.js";

export async function chat(request, response) {
  const result = await answerFinancialQuestion({
    userId: request.auth.userId,
    message: request.validated.body.message,
  });

  return response.status(200).json(result);
}
