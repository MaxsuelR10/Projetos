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
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  // The rest of the application stays available while the assistant is not
  // configured in the deploy environment.
  GEMINI_API_KEY: z.string().min(1).optional(),
  // Compatibility with deployments that configure one model in the provider
  // dashboard. GEMINI_MODELS takes precedence when both are present.
  GEMINI_MODEL: z.string().trim().min(1).optional(),
  GEMINI_MODELS: z.string().trim().min(1).optional(),
  GEMINI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(60_000).default(25_000),
  GEMINI_CHAT_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(120_000).default(55_000),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1_024).max(16_384).default(4_096),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const messages = result.error.issues.map(
    (issue) => `${issue.path.join(".") || "ambiente"}: ${issue.message}`,
  );

  throw new Error(`Configuração inválida: ${messages.join("; ")}`);
}

export const env = result.data;

export function hasGeminiConfiguration() {
  const key = env.GEMINI_API_KEY?.trim();
  return Boolean(key && !/^(sua[-_ ]?chave|sua[-_ ]?api[-_ ]?key|changeme|placeholder)/i.test(key));
}

export function geminiModels() {
  const configured = env.GEMINI_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  if (configured?.length) return [...new Set(configured)];
  if (env.GEMINI_MODEL) return [env.GEMINI_MODEL];

  // Gemini 2.5 access is restricted for some new projects. Prefer models that
  // are available to current projects by default.
  return ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
}
