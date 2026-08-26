import { randomUUID } from "node:crypto";

import { getServerEnv } from "@/server/env.server";

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

function safeError(error: string | undefined) {
  return error?.replace(/(bearer\s+|api[_-]?key[=:]?\s*)\S+/gi, "$1[REDACTED]").slice(0, 240);
}

export async function traceAiCall(input: AiTraceInput) {
  const env = getServerEnv();
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !env.LANGFUSE_BASE_URL) return;
  const payload = {
    batch: [
      {
        id: randomUUID(),
        type: "generation-create",
        body: {
          id: randomUUID(),
          name: `mago-${input.purpose}`,
          startTime: new Date(Date.now() - input.latencyMs).toISOString(),
          endTime: new Date().toISOString(),
          model: input.model,
          input: { purpose: input.purpose },
          output: { success: input.success, fallbackUsed: input.fallbackUsed },
          usage: input.usage,
          metadata: {
            organizationId: input.organizationId,
            provider: input.provider,
            error: safeError(input.error),
          },
        },
      },
    ],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const auth = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString(
      "base64",
    );
    await fetch(`${env.LANGFUSE_BASE_URL.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Telemetria nunca pode derrubar o atendimento.
  } finally {
    clearTimeout(timer);
  }
}
