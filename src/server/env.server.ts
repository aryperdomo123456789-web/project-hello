import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  LICENSE_MODE: z.enum(["local", "remote"]).default("local"),
  LICENSE_API_BASE_URL: z.string().url().default("https://app.mago-bot.com"),
  LICENSE_PROJECT_SLUG: z.string().min(1).default("mago-bot"),
  LICENSE_DOMAIN: z.string().min(1).default("mago-bot.com"),
  LICENSE_ADMIN_TOKEN: z.string().optional(),
  WHATSAPP_LICENSE_TOKEN: z.string().optional(),
  WHATSAPP_PROVIDER: z.enum(["stub", "evolution", "custom"]).default("stub"),
  WHATSAPP_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  WHATSAPP_API_KEY: z.string().optional(),
  EVOLUTION_INSTANCES_PATH: z.string().default("/instance/fetchInstances"),
  EVOLUTION_CREATE_PATH: z.string().default("/instance/create"),
  EVOLUTION_CONNECT_PATH: z.string().default("/instance/connect/{instance}"),
  EVOLUTION_LOGOUT_PATH: z.string().default("/instance/logout/{instance}"),
  EVOLUTION_SEND_TEXT_PATH: z.string().default("/message/sendText/{instance}"),
  WHATSAPP_WEBHOOK_SECRET: z.string().min(16),
  RATE_LIMIT_WEBHOOK_PER_MINUTE: z.coerce.number().int().min(10).max(10000).default(120),
  RATE_LIMIT_LOGIN_PER_MINUTE: z.coerce.number().int().min(3).max(1000).default(10),
  RATE_LIMIT_SIGNUP_PER_HOUR: z.coerce.number().int().min(1).max(20).default(3),
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
  AI_PRIMARY_PROVIDER: z.enum(["stub", "openrouter", "groq", "deepseek", "gemini"]).default("stub"),
  AI_FALLBACK_PROVIDER: z
    .enum(["stub", "openrouter", "groq", "deepseek", "gemini"])
    .default("stub"),
  AI_PRIMARY_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  AI_FALLBACK_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(12000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(32).max(4096).default(512),
  AI_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(10000).default(60),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  WHISPER_API_KEY: z.string().optional(),
  WHISPER_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  WHISPER_MODEL: z.string().min(1).default("whisper-1"),
  GROQ_TRANSCRIPTION_MODEL: z.string().min(1).default("whisper-large-v3-turbo"),
  JINA_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["none", "jina", "openai-compatible"]).default("none"),
  EMBEDDING_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default("jina-embeddings-v3"),
  RERANK_PROVIDER: z.enum(["none", "jina"]).default("none"),
  RERANK_MODEL: z.string().min(1).default("jina-reranker-v2-base-multilingual"),
  FIRECRAWL_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),
  RETENTION_CLEANUP_ENABLED: z.coerce.boolean().default(false),
  MP_ENVIRONMENT: z.enum(["test", "production"]).default("test"),
  MP_API_BASE_URL: z.string().url().default("https://api.mercadopago.com"),
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_WEBHOOK_MAX_AGE_SECONDS: z.coerce.number().int().min(60).max(172800).default(86400),
  MP_LIVE_ENABLED: z.coerce.boolean().default(false),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const nodeEnv = process.env["NODE_ENV"] ?? "development";
  const developmentDefaults =
    nodeEnv === "production"
      ? {}
      : {
          SESSION_SECRET: "development-session-secret-change-me-32chars",
          DATABASE_URL: "postgres://mago_bot:mago_bot@127.0.0.1:5432/mago_bot",
          WHATSAPP_WEBHOOK_SECRET: "development-webhook-secret",
        };

  cachedEnv = envSchema.parse({
    ...developmentDefaults,
    ...process.env,
    NODE_ENV: nodeEnv,
  });

  return cachedEnv;
}
