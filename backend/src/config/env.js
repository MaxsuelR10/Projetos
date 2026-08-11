import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "deve ser uma URL PostgreSQL",
    ),
  JWT_SECRET: z.string().min(32, "deve possuir pelo menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  JWT_COOKIE_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.url().default("http://localhost:5173"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const messages = result.error.issues.map(
    (issue) => `${issue.path.join(".") || "ambiente"}: ${issue.message}`,
  );

  throw new Error(`Configuração inválida: ${messages.join("; ")}`);
}

export const env = result.data;
