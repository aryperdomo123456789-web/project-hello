import { describe, expect, it } from "vitest";

import { buildLangfuseOtelPayload, resetLangfuseConfigCache } from "@/services/aiTelemetry.server";

describe("Langfuse OTLP telemetry", () => {
  it("creates an OTLP generation span without prompt or response content", () => {
    const payload = buildLangfuseOtelPayload(
      {
        organizationId: "org-secret-123",
        purpose: "copilot_reply",
        provider: "groq",
        model: "llama-3",
        latencyMs: 250,
        fallbackUsed: false,
        success: true,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        error: "Bearer should-never-be-exported",
      },
      1_700_000_000_000,
    );
    const span = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(span).toBeDefined();
    expect(span?.traceId).toHaveLength(32);
    expect(span?.spanId).toHaveLength(16);
    expect(JSON.stringify(payload)).not.toContain("org-secret-123");
    expect(JSON.stringify(payload)).not.toContain("should-never-be-exported");
    expect(JSON.stringify(payload)).not.toContain("prompt");
    expect(JSON.stringify(payload)).not.toContain("response");
    expect(JSON.stringify(payload)).toContain("mago.organization_ref");
    expect(JSON.stringify(payload)).toContain("mago.fallback_used");
  });

  it("marks failed calls with OTLP error status and sanitized error", () => {
    const payload = buildLangfuseOtelPayload({
      purpose: "classification",
      provider: "deepseek",
      model: "deepseek-chat",
      latencyMs: 100,
      fallbackUsed: true,
      success: false,
      error: "apiKey=super-secret-value",
    });
    const span = payload.resourceSpans[0]?.scopeSpans[0]?.spans[0];
    expect(span?.status.code).toBe(2);
    expect(span?.status.message).toContain("[REDACTED]");
    expect(span?.status.message).not.toContain("super-secret-value");
  });

  it("exposes a cache reset for tenant configuration changes", () => {
    expect(() => resetLangfuseConfigCache()).not.toThrow();
  });
});
