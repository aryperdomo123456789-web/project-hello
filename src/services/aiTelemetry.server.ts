import { createHash, randomUUID } from "node:crypto";

import { getServerEnv } from "@/server/env.server";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";

export type AiTraceInput = {
  organizationId?: string;
  purpose: string;
  provider: string;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  success: boolean;
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};

type LangfuseConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

type CachedConfig = {
  expiresAt: number;
  value: LangfuseConfig | null;
};

const CONFIG_CACHE_TTL_MS = 60_000;
const configCache = new Map<string, CachedConfig>();

function safeError(error: string | undefined) {
  return error?.replace(/(bearer\s+|api[_-]?key[=:]?\s*)\S+/gi, "$1[REDACTED]").slice(0, 240);
}

function organizationRef(organizationId: string | undefined) {
  if (!organizationId) return undefined;
  return createHash("sha256").update(organizationId).digest("hex").slice(0, 16);
}

function resolveOtelUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  if (normalized.endsWith("/api/public")) return `${normalized}/otel/v1/traces`;
  return `${normalized}/api/public/otel/v1/traces`;
}

async function resolveLangfuseConfig(organizationId: string | undefined) {
  const cacheKey = organizationId ?? "__global__";
  const cached = configCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const env = getServerEnv();
  let value: LangfuseConfig | null = null;
  if (organizationId) {
    const runtime = await getOrganizationIntegrationRuntime(organizationId, "langfuse");
    const publicKey = runtime?.credentials["publicKey"];
    const secretKey = runtime?.credentials["secretKey"];
    const baseUrl = runtime?.endpointUrl ?? runtime?.credentials["baseUrl"];
    if (publicKey && secretKey && baseUrl) {
      value = { publicKey, secretKey, baseUrl };
    }
  }
  if (!value && env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY && env.LANGFUSE_BASE_URL) {
    value = {
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
    };
  }

  configCache.set(cacheKey, { expiresAt: Date.now() + CONFIG_CACHE_TTL_MS, value });
  return value;
}

function stringAttribute(key: string, value: string | undefined) {
  return value ? { key, value: { stringValue: value } } : null;
}

function boolAttribute(key: string, value: boolean) {
  return { key, value: { boolValue: value } };
}

function intAttribute(key: string, value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? { key, value: { intValue: String(Math.max(0, Math.trunc(value))) } }
    : null;
}

export function buildLangfuseOtelPayload(input: AiTraceInput, now = Date.now()) {
  const traceId = randomUUID().replaceAll("-", "");
  const spanId = randomUUID().replaceAll("-", "").slice(0, 16);
  const startTimeUnixNano = String(Math.max(0, now - Math.max(0, input.latencyMs)) * 1_000_000);
  const endTimeUnixNano = String(now * 1_000_000);
  const attributes = [
    stringAttribute("mago.purpose", input.purpose.slice(0, 120)),
    stringAttribute("mago.provider", input.provider.slice(0, 80)),
    stringAttribute("mago.model", input.model.slice(0, 160)),
    stringAttribute("mago.organization_ref", organizationRef(input.organizationId)),
    boolAttribute("mago.success", input.success),
    boolAttribute("mago.fallback_used", input.fallbackUsed),
    intAttribute("gen_ai.usage.input_tokens", input.usage?.inputTokens),
    intAttribute("gen_ai.usage.output_tokens", input.usage?.outputTokens),
    intAttribute("gen_ai.usage.total_tokens", input.usage?.totalTokens),
    stringAttribute("mago.error", safeError(input.error)),
  ].filter((attribute): attribute is NonNullable<typeof attribute> => Boolean(attribute));

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "mago-bot" } },
            { key: "service.version", value: { stringValue: "1" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "mago-bot.ai", version: "1" },
            spans: [
              {
                traceId,
                spanId,
                name: `mago-${input.purpose.slice(0, 80)}`,
                kind: 3,
                startTimeUnixNano,
                endTimeUnixNano,
                attributes,
                status: {
                  code: input.success ? 1 : 2,
                  ...(input.success ? {} : { message: safeError(input.error) ?? "AI call failed" }),
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

export function resetLangfuseConfigCache() {
  configCache.clear();
}

export async function traceAiCall(input: AiTraceInput) {
  const config = await resolveLangfuseConfig(input.organizationId);
  if (!config) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const auth = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64");
    await fetch(resolveOtelUrl(config.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildLangfuseOtelPayload(input)),
      signal: controller.signal,
    });
  } catch {
    // Telemetria nunca pode derrubar o atendimento.
  } finally {
    clearTimeout(timer);
  }
}
