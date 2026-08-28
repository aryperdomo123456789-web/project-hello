import { describe, expect, it } from "vitest";

import {
  createSignedMagoBotWebhook,
  parseMockWebhook,
  processSignedMockBatch,
  verifySignedMockWebhook,
} from "./mago-bot-webhook-mock";

const SECRET = "a".repeat(64);

describe("harness local de webhooks Mago Bot", () => {
  it("assina e valida o corpo bruto com HMAC-SHA256", () => {
    const mock = createSignedMagoBotWebhook(
      "message.inbound",
      { from: "5511999999999", body: "SAIR", message_id: "api-msg-1" },
      SECRET,
      { eventId: "evt-inbound-1", timestamp: 1_800_000_000 },
    );
    expect(verifySignedMockWebhook(mock, SECRET, 1_800_000_000)).toBe(true);
    expect(verifySignedMockWebhook(mock, "b".repeat(64), 1_800_000_000)).toBe(false);
    expect(verifySignedMockWebhook(mock, SECRET, 1_800_000_400)).toBe(false);
  });

  it.each([
    [
      "message.inbound",
      { from: "5511999999999", body: "Olá", message_id: "m-in" },
      "incoming_message",
    ],
    ["message.status", { status: "delivered", message_id: "m-status" }, "message_status"],
    ["connection.updated", { state: "close" }, "connection_update"],
    ["qrcode.updated", { status: "qrcode", qr: "mock-qr" }, "qrcode_updated"],
  ] as const)("normaliza %s para o processor", (eventType, data, kind) => {
    const mock = createSignedMagoBotWebhook(eventType, data, SECRET);
    expect(parseMockWebhook(mock)?.kind).toBe(kind);
  });

  it("processa lote assinado com concorrência limitada e preserva a ordem", async () => {
    const mocks = Array.from({ length: 8 }, (_, index) =>
      createSignedMagoBotWebhook(
        "message.inbound",
        { from: `55119999999${index}`, body: `Mensagem ${index}`, message_id: `m-${index}` },
        SECRET,
        { eventId: `evt-${index}` },
      ),
    );
    let active = 0;
    let maxActive = 0;
    const result = await processSignedMockBatch(
      mocks,
      SECRET,
      async (event) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 4));
        active -= 1;
        return event.externalEventId;
      },
      2,
    );
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(result).toEqual(mocks.map((mock) => mock.payload.event_id));
  });
});
