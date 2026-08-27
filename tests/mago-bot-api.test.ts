import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MagoBotApiClient, MagoBotApiError } from "@/services/magoBotApi.server";
import {
  isMagoBotTimestampFresh,
  parseMagoBotSignature,
  verifyMagoBotSignature,
} from "@/services/magoBotWebhook.server";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MagoBotApiClient", () => {
  it("injeta API key, idempotência e recurso no envio", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            id: "api-message-1",
            status: "sent",
            provider: "evolution",
            provider_message_id: "provider-message-1",
          },
          idempotent_replay: false,
        }),
        { status: 201, headers: { "content-type": "application/json", "x-request-id": "req-1" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new MagoBotApiClient({
      baseUrl: "https://app.mago-bot.com/",
      apiKey: "mb_test_key",
    });
    const result = await client.sendMessage(
      "project-uuid-1",
      { to: "5511999999999", type: "text", text: { body: "Olá" } },
      "message-idempotency-001",
      { resourceId: "7" },
    );

    expect(result.message).toMatchObject({
      id: "api-message-1",
      status: "sent",
      providerMessageId: "provider-message-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://app.mago-bot.com/v1/projects/project-uuid-1/messages");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-api-key")).toBe("mb_test_key");
    expect(headers.get("x-idempotency-key")).toBe("message-idempotency-001");
    expect(headers.get("x-resource-id")).toBe("7");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      to: "5511999999999",
      type: "text",
      text: { body: "Olá" },
    });
  });

  it("normaliza erro de quota e preserva Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: { code: "quota_exceeded", message: "limite atingido", retryable: true },
          }),
          { status: 429, headers: { "content-type": "application/json", "retry-after": "12" } },
        ),
      ),
    );

    const client = new MagoBotApiClient({
      baseUrl: "https://app.mago-bot.com",
      apiKey: "mb_test_key",
    });
    const promise = client.sendMessage(
      "project-uuid-1",
      { to: "5511999999999", text: { body: "Olá" } },
      "message-idempotency-002",
    );

    await expect(promise).rejects.toMatchObject<MagoBotApiError>({
      status: 429,
      code: "quota_exceeded",
      retryable: true,
      retryAfterSeconds: 12,
    });
  });
});

describe("assinatura do webhook Mago Bot", () => {
  it("valida HMAC-SHA256 com timestamp e rejeita corpo adulterado", () => {
    const secret = "webhook-secret-for-tests";
    const rawBody = JSON.stringify({ event_id: "evt-1", channel_id: "channel-1" });
    const timestamp = 1_800_000_000;
    const digest = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex");
    const request = new Request("https://mago-bot.com/api/webhooks/mago-bot", {
      headers: {
        "x-mago-timestamp": String(timestamp),
        "x-mago-signature": `sha256=${digest}`,
      },
    });

    const parsed = parseMagoBotSignature(request);
    expect(parsed).toEqual({ timestamp, signature: digest });
    expect(isMagoBotTimestampFresh(timestamp, 300, timestamp)).toBe(true);
    expect(isMagoBotTimestampFresh(timestamp - 301, 300, timestamp)).toBe(false);
    expect(verifyMagoBotSignature(rawBody, timestamp, digest, secret)).toBe(true);
    expect(verifyMagoBotSignature(`${rawBody} altered`, timestamp, digest, secret)).toBe(false);
  });
});
