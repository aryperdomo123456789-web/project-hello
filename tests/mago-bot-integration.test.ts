import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRuntime: vi.fn(),
  getAdapter: vi.fn(),
  sendText: vi.fn(),
  assertAllowed: vi.fn(),
}));

vi.mock("@/services/integrations.server", () => ({
  getOrganizationIntegrationRuntime: mocks.getRuntime,
}));

vi.mock("@/services/whatsapp.server", () => ({
  getWhatsAppAdapter: mocks.getAdapter,
}));

vi.mock("@/services/contactGovernance.server", () => ({
  assertOutboundAllowed: mocks.assertAllowed,
  isOptOutMessage: (text: string | null | undefined) =>
    ["SAIR", "PARAR", "CANCELAR"].includes(text?.trim().toUpperCase() ?? ""),
}));

import { sendChatOutbound } from "@/functions/chat.functions";
import {
  createChannel,
  disconnectChannel,
  getChannelStatus,
  getQrCode,
  reconnectChannel,
} from "@/services/magoBotChannelGateway.server";
import { flowMessageIdempotencyKey } from "@/services/flowRuntime.server";
import { parseMagoBotWebhookPayload } from "@/services/magoBotWebhookParser.server";

describe("outbound do chat pelo gateway da API Mago Bot", () => {
  beforeEach(() => {
    mocks.getRuntime.mockReset();
    mocks.getAdapter.mockReset();
    mocks.sendText.mockReset();
    mocks.assertAllowed.mockReset();
    mocks.assertAllowed.mockResolvedValue({ allowed: true });
    mocks.getAdapter.mockReturnValue({ sendText: mocks.sendText });
  });

  it("usa API Mago Bot e devolve IDs de correlação para persistência local", async () => {
    mocks.getRuntime.mockResolvedValue({
      provider: "mago_bot_api",
      endpointUrl: "https://api.example.test",
      credentials: {
        apiKey: "mb_test_key",
        apiProjectId: "project-1",
        webhookSigningSecret: "secret",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: {
              id: "api-msg-1",
              status: "sent",
              provider: "evolution",
              provider_message_id: "provider-msg-1",
            },
          }),
          {
            status: 201,
            headers: { "content-type": "application/json", "x-request-id": "req-123" },
          },
        ),
      ),
    );

    const result = await sendChatOutbound({
      organizationId: "org-1",
      conversationId: "conversation-1",
      connectionId: "connection-1",
      providerInstanceId: "instance-1",
      apiResourceId: "resource-1",
      apiProjectId: null,
      recipient: "5511999999999",
      text: "Olá pelo CRM",
      idempotencyKey: "client-message-123456",
    });

    expect(result).toMatchObject({
      transport: "mago_bot_api",
      status: "sent",
      externalId: "provider-msg-1",
      apiMessageId: "api-msg-1",
      apiProviderMessageId: "provider-msg-1",
      lastApiRequestId: "req-123",
    });
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("bloqueia outbound quando a governança rejeita o número", async () => {
    mocks.getRuntime.mockResolvedValue(null);
    mocks.assertAllowed.mockRejectedValue(new Error("Número bloqueado pela blacklist"));

    await expect(
      sendChatOutbound({
        organizationId: "org-blocked",
        contactId: "contact-1",
        conversationId: "conversation-1",
        connectionId: "connection-1",
        providerInstanceId: "instance-1",
        apiResourceId: null,
        apiProjectId: null,
        recipient: "5511999999999",
        text: "não deve sair",
        idempotencyKey: "blocked-message-1",
      }),
    ).rejects.toThrow("Número bloqueado");
    expect(mocks.sendText).not.toHaveBeenCalled();
  });

  it("usa fallback legado apenas quando a integração ainda não está configurada", async () => {
    mocks.getRuntime.mockResolvedValue(null);
    mocks.sendText.mockResolvedValue({ externalId: "legacy-msg-1", raw: {} });

    const result = await sendChatOutbound({
      organizationId: "org-2",
      conversationId: "conversation-2",
      connectionId: "connection-2",
      providerInstanceId: "instance-2",
      apiResourceId: null,
      apiProjectId: null,
      recipient: "5511888888888",
      text: "Fallback controlado",
      idempotencyKey: "client-message-654321",
    });

    expect(result).toMatchObject({
      transport: "legacy_provider",
      status: "sent",
      externalId: "legacy-msg-1",
      fallbackReason: "integration_not_configured",
    });
    expect(mocks.sendText).toHaveBeenCalledWith(
      "instance-2",
      "5511888888888",
      "Fallback controlado",
    );
  });
});

describe("lifecycle M2M de canais", () => {
  beforeEach(() => {
    mocks.getRuntime.mockReset();
    mocks.getAdapter.mockReset();
    mocks.sendText.mockReset();
    mocks.assertAllowed.mockReset();
    mocks.assertAllowed.mockResolvedValue({ allowed: true });
    mocks.getAdapter.mockReturnValue({ sendText: mocks.sendText });
    mocks.getRuntime.mockResolvedValue({
      provider: "mago_bot_api",
      endpointUrl: "https://api.example.test",
      credentials: { apiKey: "mb_test_key", apiProjectId: "project-1" },
    });
  });

  it("cria, consulta status, obtém QR e reconecta/desconecta pela API", async () => {
    const responses = [
      {
        status: 201,
        body: { channel: { id: "channel-1", provider: "evolution", status: "qr_pending" } },
      },
      {
        status: 200,
        body: {
          channel: {
            id: "channel-1",
            provider: "evolution",
            status: "connected",
            phone_number: "5511999999999",
          },
        },
      },
      {
        status: 200,
        body: {
          ok: true,
          channel_id: "channel-1",
          qrcode: "data:image/png;base64,qr",
          code: "pair-1",
        },
      },
      {
        status: 200,
        body: { channel: { id: "channel-1", provider: "evolution", status: "connecting" } },
      },
      {
        status: 200,
        body: { channel: { id: "channel-1", provider: "evolution", status: "disconnected" } },
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      const next = responses.shift();
      if (!next) throw new Error("resposta inesperada");
      return new Response(JSON.stringify(next.body), {
        status: next.status,
        headers: { "content-type": "application/json", "x-request-id": "channel-req" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createChannel("org-1", "Comercial", "channel-create:org-1:unique-123456");
    const status = await getChannelStatus("org-1", {
      id: "local-1",
      apiChannelId: created.apiChannelId ?? null,
      providerInstanceId: created.providerInstanceId,
    });
    const qr = await getQrCode("org-1", {
      id: "local-1",
      apiChannelId: created.apiChannelId ?? null,
      providerInstanceId: created.providerInstanceId,
    });
    const reconnected = await reconnectChannel(
      "org-1",
      {
        id: "local-1",
        apiChannelId: created.apiChannelId ?? null,
        providerInstanceId: created.providerInstanceId,
      },
      "channel-reconnect:local-1:unique-123456",
    );
    const disconnected = await disconnectChannel(
      "org-1",
      {
        id: "local-1",
        apiChannelId: created.apiChannelId ?? null,
        providerInstanceId: created.providerInstanceId,
      },
      "channel-disconnect:local-1:unique-123456",
    );

    expect(created).toMatchObject({
      transport: "mago_bot_api",
      apiChannelId: "channel-1",
      status: "connecting",
    });
    expect(status).toMatchObject({
      transport: "mago_bot_api",
      status: "connected",
      displayPhone: "5511999999999",
    });
    expect(qr).toMatchObject({
      transport: "mago_bot_api",
      code: "pair-1",
      base64: "data:image/png;base64,qr",
    });
    expect(reconnected.status).toBe("connecting");
    expect(disconnected.status).toBe("disconnected");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-idempotency-key")).toBe(
      "channel-create:org-1:unique-123456",
    );
  });

  it("faz fallback de criação para o adapter legado sem configuração da API", async () => {
    mocks.getRuntime.mockResolvedValue(null);
    mocks.sendText.mockReset();
    const legacy = {
      createInstance: vi
        .fn()
        .mockResolvedValue({ id: "legacy-1", name: "Suporte", status: "connecting" }),
      listInstances: vi.fn(),
      getQrCode: vi.fn(),
      disconnectInstance: vi.fn(),
      sendText: mocks.sendText,
    };
    mocks.getAdapter.mockReturnValue(legacy);

    const result = await createChannel(
      "org-legacy",
      "Suporte",
      "channel-create:legacy:unique-123456",
    );
    expect(result).toMatchObject({
      transport: "legacy_provider",
      providerInstanceId: "legacy-1",
      status: "connecting",
    });
    expect(legacy.createInstance).toHaveBeenCalledWith("Suporte");
  });
});

describe("idempotência do Flow Builder", () => {
  it("gera a mesma chave para o mesmo execution/node e muda quando o node muda", () => {
    expect(flowMessageIdempotencyKey("execution-1", "node-1")).toBe(
      "execution-1:node-1:send_message",
    );
    expect(flowMessageIdempotencyKey("execution-1", "node-1")).toBe(
      flowMessageIdempotencyKey("execution-1", "node-1"),
    );
    expect(flowMessageIdempotencyKey("execution-1", "node-2")).not.toBe(
      flowMessageIdempotencyKey("execution-1", "node-1"),
    );
  });
});

describe("parser de eventos API Mago Bot", () => {
  it.each([
    [
      "message.inbound",
      {
        event_id: "evt-inbound",
        type: "message.inbound",
        tenant_id: "tenant-1",
        project_id: "project-1",
        channel_id: "channel-1",
        data: {
          phone: "5511999999999@s.whatsapp.net",
          name: "Cliente",
          message_id: "api-msg-in",
          provider_message_id: "provider-msg-in",
          text: { body: "Quero ajuda" },
          message_type: "text",
        },
      },
      "incoming_message",
    ],
    [
      "message.status",
      {
        event_id: "evt-status",
        type: "message.status",
        channel_id: "channel-1",
        data: {
          message_id: "api-msg-out",
          provider_message_id: "provider-msg-out",
          status: "delivered",
        },
      },
      "message_status",
    ],
    [
      "connection.updated",
      {
        event_id: "evt-connection",
        type: "connection.updated",
        channel_id: "channel-1",
        data: { status: "connected" },
      },
      "connection_update",
    ],
    [
      "qrcode.updated",
      {
        event_id: "evt-qr",
        type: "qrcode.updated",
        channel_id: "channel-1",
        data: { qrcode: "data:image/png;base64,qr" },
      },
      "qrcode_updated",
    ],
  ])("normaliza %s", (_type, payload, expectedKind) => {
    const event = parseMagoBotWebhookPayload(payload);
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      kind: expectedKind,
      provider: "mago_bot_api",
      providerInstanceId: "channel-1",
      externalEventId: expect.stringMatching(/^evt-/),
    });
  });

  it("preserva tenant, projeto, mensagem e telefone do inbound", () => {
    const event = parseMagoBotWebhookPayload({
      event_id: "evt-correlated",
      type: "message.inbound",
      tenant_id: "tenant-7",
      project_id: "project-7",
      channel_id: "channel-7",
      request_id: "req-webhook-7",
      data: {
        from: "5511977777777@s.whatsapp.net",
        message_id: "api-msg-7",
        provider_message_id: "provider-msg-7",
        text: { body: "Teste de correlação" },
      },
    });

    expect(event).toMatchObject({
      apiTenantId: "tenant-7",
      apiProjectId: "project-7",
      apiMessageId: "api-msg-7",
      apiProviderMessageId: "provider-msg-7",
      apiRequestId: "req-webhook-7",
      externalMessageId: "provider-msg-7",
      phone: "5511977777777",
      text: "Teste de correlação",
    });
  });
});
