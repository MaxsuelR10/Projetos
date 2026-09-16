import { z } from "zod";

export const assistantChatSchema = z.object({
  body: z
    .object({
      message: z
        .string()
        .trim()
        .min(1, "Escreva uma pergunta para o assistente")
        .max(2_000, "A mensagem pode ter no máximo 2.000 caracteres"),
    })
    .strict(),
});
