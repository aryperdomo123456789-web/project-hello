import { describe, expect, it } from "vitest";

import { HttpWhatsAppAdapter } from "@/services/whatsapp.server";

process.env.WHATSAPP_API_BASE_URL = "http://127.0.0.1:9";
process.env.WHATSAPP_PROVIDER = "evolution";

describe("adaptador Evolution", () => {
  it("normaliza mensagem recebida com conversation", () => {
    const adapter = new HttpWhatsAppAdapter("evolution");
    const [event] = adapter.normalizeWebhook({
      event: "MESSAGES_UPSERT",
      instance: "comercial-01",
      data: {
        pushName: "Cliente Teste",
        messageTimestamp: 1_700_000_000,
        key: { remoteJid: "5511999999999@s.whatsapp.net", id: "msg-1", fromMe: false },
        message: { conversation: "Quero conhecer o produto" },
      },
    });

    expect(event).toMatchObject({
      kind: "incoming_message",
      providerInstanceId: "comercial-01",
      phone: "5511999999999",
      name: "Cliente Teste",
      text: "Quero conhecer o produto",
      externalMessageId: "msg-1",
      fromMe: false,
    });
  });

  it("normaliza status e conexão sem confundir com mensagem", () => {
    const adapter = new HttpWhatsAppAdapter("evolution");
    const [status] = adapter.normalizeWebhook({
      event: "MESSAGES_UPDATE",
      instance: "suporte-01",
      data: { key: { id: "msg-2", remoteJid: "5511888888888@s.whatsapp.net" }, status: "READ" },
    });
    const [connection] = adapter.normalizeWebhook({
      event: "CONNECTION_UPDATE",
      instance: "suporte-01",
      data: { state: "open" },
    });

    expect(status).toMatchObject({ kind: "message_status", status: "READ" });
    expect(connection).toMatchObject({ kind: "connection_update", status: "open" });
  });
});
