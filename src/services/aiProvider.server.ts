import { consumeRateLimit } from "@/server/rate-limit.server";
import { getServerEnv } from "@/server/env.server";

export type AiProvider = "stub" | "openrouter" | "groq" | "deepseek" | "gemini";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiRequest = {
  system: string;
  messages: ChatMessage[];
  purpose: "classify" | "suggest" | "summarize" | "extract";
  organizationId?: string;
  userId?: string;
};

export type AiResponse = {
  provider: AiProvider;
  model: string;
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  fallbackUsed: boolean;
};

function providerKey(provider: AiProvider) {
  const env = getServerEnv();
  if (provider === "openrouter") return env.OPENROUTER_API_KEY;
  if (provider === "groq") return env.GROQ_API_KEY;
  if (provider === "deepseek") return env.DEEPSEEK_API_KEY;
  if (provider === "gemini") return env.GEMINI_API_KEY;
  return undefined;
}

function endpoint(provider: AiProvider) {
  if (provider === "openrouter") return "https://openrouter.ai/api/v1/chat/completions";
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "deepseek") return "https://api.deepseek.com/chat/completions";
  return undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requestOpenAiCompatible(provider: AiProvider, model: string, request: AiRequest) {
  const key = providerKey(provider);
  const url = endpoint(provider);
  if (!key || !url) throw new Error(`AI provider ${provider} is not configured`);
  const env = getServerEnv();
  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(provider === "openrouter"
          ? { "HTTP-Referer": env.APP_URL, "X-OpenRouter-Title": "Mago Bot" }
          : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: request.system }, ...request.messages],
        temperature: request.purpose === "classify" || request.purpose === "extract" ? 0 : 0.2,
        max_tokens: env.AI_MAX_OUTPUT_TOKENS,
        user: request.userId,
      }),
    },
    env.AI_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`AI provider ${provider} returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const text = safeText(body.choices?.[0]?.message?.content);
  if (!text) throw new Error(`AI provider ${provider} returned an empty response`);
  const usage: NonNullable<AiResponse["usage"]> = {};
  if (body.usage?.prompt_tokens !== undefined) usage.inputTokens = body.usage.prompt_tokens;
  if (body.usage?.completion_tokens !== undefined)
    usage.outputTokens = body.usage.completion_tokens;
  if (body.usage?.total_tokens !== undefined) usage.totalTokens = body.usage.total_tokens;
  return {
    provider,
    model,
    text,
    ...(Object.keys(usage).length > 0 ? { usage } : {}),
  };
}

async function requestGemini(model: string, request: AiRequest) {
  const env = getServerEnv();
  if (!env.GEMINI_API_KEY) throw new Error("AI provider gemini is not configured");
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/interactions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        model,
        input: [{ role: "system", content: request.system }, ...request.messages],
        generation_config: { temperature: 0.2, max_output_tokens: env.AI_MAX_OUTPUT_TOKENS },
      }),
    },
    env.AI_TIMEOUT_MS,
  );
  if (!response.ok) throw new Error(`AI provider gemini returned HTTP ${response.status}`);
  const body = (await response.json()) as {
    output_text?: unknown;
    usage?: { total_tokens?: number };
  };
  const text = safeText(body.output_text);
  if (!text) throw new Error("AI provider gemini returned an empty response");
  return {
    provider: "gemini" as const,
    model,
    text,
    ...(body.usage?.total_tokens !== undefined
      ? { usage: { totalTokens: body.usage.total_tokens } }
      : {}),
  };
}

export async function generateWithFallback(request: AiRequest): Promise<AiResponse> {
  const env = getServerEnv();
  const rate = await consumeRateLimit(
    `ai:${request.organizationId ?? "global"}`,
    env.AI_REQUESTS_PER_MINUTE,
    60,
  );
  if (!rate.allowed) throw new Error("AI request rate limit exceeded");
  const candidates: Array<{ provider: AiProvider; model: string; fallbackUsed: boolean }> = [
    { provider: env.AI_PRIMARY_PROVIDER, model: env.AI_PRIMARY_MODEL, fallbackUsed: false },
    { provider: env.AI_FALLBACK_PROVIDER, model: env.AI_FALLBACK_MODEL, fallbackUsed: true },
  ];
  const errors: string[] = [];
  for (const candidate of candidates) {
    if (candidate.provider === "stub") continue;
    try {
      const response =
        candidate.provider === "gemini"
          ? await requestGemini(candidate.model, request)
          : await requestOpenAiCompatible(candidate.provider, candidate.model, request);
      return { ...response, fallbackUsed: candidate.fallbackUsed };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "unknown AI provider error");
    }
  }
  throw new Error(`No AI provider available: ${errors.join("; ") || "stub mode only"}`);
}
