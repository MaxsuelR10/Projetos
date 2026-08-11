import { z } from "zod";

const email = z
  .email("Informe um email válido")
  .max(255)
  .transform((value) => value.trim().toLowerCase());

const password = z
  .string()
  .min(8, "A senha deve possuir pelo menos 8 caracteres")
  .max(72, "A senha deve possuir no máximo 72 caracteres")
  .regex(/[a-zA-Z]/, "A senha deve possuir pelo menos uma letra")
  .regex(/[0-9]/, "A senha deve possuir pelo menos um número");

export const registerSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2, "Informe seu nome").max(120),
      email,
      password,
      currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("BRL"),
    })
    .strict(),
});

export const loginSchema = z.object({
  body: z
    .object({
      email,
      password: z.string().min(1, "Informe sua senha").max(72),
    })
    .strict(),
});
