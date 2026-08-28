import { createHmac } from "node:crypto";

import { parseMagoBotSignature, verifyMagoBotSignature } from "@/services/magoBotWebhook.server";
import { parseMagoBotWebhookPayload } from "@/services/magoBotWebhookParser.server";
import { mapWithConcurrency } from "@/services/webhookProcessor.server";

export type MockWebhookEventType =
  "message.inbound" | "message.status" | "connection.updated" | "qrcode.updated";

export type SignedMockWebhook = {
  payload: Record<string, unknown>;
  rawBody: string;
  timestamp: number;
  headers: Record<string, string>;
  request: Request;
};

export function createSignedMagoBotWebhook(
  eventType: MockWebhookEventType,
  data: Record<string, unknown>,
  secret: string,
  options: { eventId?: string; timestamp?: number; channelId?: string } = {},
): SignedMockWebhook {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    type: eventType,
    event_id: options.eventId ?? `mock-${eventType}-${crypto.randomUUID()}`,
    channel_id: options.channelId ?? "mock-channel-1",
    tenant_id: "mock-tenant-1",
    project_id: "mock-project-1",
    request_id: `mock-request-${crypto.randomUUID()}`,
    occurred_at: new Date(timestamp * 1000).toISOString(),
    data,
  };
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const headers = {
    "content-type": "application/json",
    "x-mago-timestamp": String(timestamp),
    "x-mago-signature": `sha256=${signature}`,
  };
  return {
    payload,
    rawBody,
    timestamp,
    headers,
    request: new Request("http://localhost/api/webhooks/mago-bot", {
      method: "POST",
      headers,
      body: rawBody,
    }),
  };
}

export function verifySignedMockWebhook(
  mock: SignedMockWebhook,
  secret: string,
  nowSeconds?: number,
) {
  const signature = parseMagoBotSignature(mock.request);
  if (!signature) return false;
  if (nowSeconds !== undefined && Math.abs(nowSeconds - signature.timestamp) > 300) return false;
  return verifyMagoBotSignature(mock.rawBody, signature.timestamp, signature.signature, secret);
}

export function parseMockWebhook(mock: SignedMockWebhook) {
  return parseMagoBotWebhookPayload(mock.payload);
}

export async function processSignedMockBatch<T>(
  mocks: SignedMockWebhook[],
  secret: string,
  handler: (event: NonNullable<ReturnType<typeof parseMagoBotWebhookPayload>>) => Promise<T>,
  concurrency = 4,
) {
  return mapWithConcurrency(
    mocks,
    async (mock) => {
      if (!verifySignedMockWebhook(mock, secret)) throw new Error("mock_signature_invalid");
      const event = parseMockWebhook(mock);
      if (!event) throw new Error("mock_event_invalid");
      return handler(event);
    },
    concurrency,
  );
}
