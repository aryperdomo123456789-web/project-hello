import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
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
