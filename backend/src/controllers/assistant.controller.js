import { answerFinancialQuestion, getLatestAssistantConversation } from "../services/financial-assistant.service.js";

export async function chat(request, response) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.once("aborted", abort);
  response.once("close", () => {
    if (!response.writableEnded) abort();
  });

  const result = await answerFinancialQuestion({
    userId: request.auth.userId,
    message: request.validated.body.message,
    conversationId: request.validated.body.conversationId,
    signal: controller.signal,
  });

  return response.status(200).json(result);
}

export async function getLatestConversation(request, response) {
  return response.status(200).json({
    conversation: await getLatestAssistantConversation(request.auth.userId),
  });
}
