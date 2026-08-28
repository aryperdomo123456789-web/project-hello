import { getIntegrationDefinition } from "@/services/integration-registry.server";
import { assertOutboundAllowed } from "@/services/contactGovernance.server";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";
import { createMagoBotApiClient } from "./magoBotApi.server";
import type { MagoBotApiError } from "./magoBotApi.types";

export type OutboundMessageContext = {
  organizationId: string;
  contactId?: string | null;
  conversationId: string;
  connectionId: string;
  providerInstanceId: string | null;
  apiResourceId: string | null;
  apiProjectId: string | null;
  recipient: string;
  text: string;
  idempotencyKey: string;
};

export type OutboundMessageResult = {
  transport: "mago_bot_api" | "legacy_provider";
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  externalId?: string | undefined;
  apiMessageId?: string | undefined;
  apiProviderMessageId?: string | undefined;
  lastApiRequestId?: string | undefined;
  fallbackReason?: "integration_not_configured" | "integration_incomplete" | undefined;
};

function localStatus(value: string | undefined): OutboundMessageResult["status"] {
  switch (value?.toLowerCase()) {
    case "delivered":
      return "delivered";
    case "read":
      return "read";
    case "sent":
    case "accepted":
      return "sent";
    case "failed":
    case "error":
      return "failed";
    case "queued":
    case "sending":
    case "pending":
      return "queued";
    default:
      return "sent";
  }
}

function apiErrorRequestId(error: unknown): string | undefined {
  return error && typeof error === "object" && "requestId" in error
    ? (error as MagoBotApiError).requestId
    : undefined;
}

export async function sendChatOutbound(
  context: OutboundMessageContext,
): Promise<OutboundMessageResult> {
  await assertOutboundAllowed({
    organizationId: context.organizationId,
    recipient: context.recipient,
    ...(context.contactId !== undefined ? { contactId: context.contactId } : {}),
  });
  const runtime = await getOrganizationIntegrationRuntime(context.organizationId, "mago_bot_api");
  const apiKey = runtime?.credentials["apiKey"]?.trim();
  const apiProjectId = context.apiProjectId?.trim() || runtime?.credentials["apiProjectId"]?.trim();
  const endpoint =
    runtime?.endpointUrl?.trim() || getIntegrationDefinition("mago_bot_api").defaultEndpoint;

  if (apiKey && apiProjectId && endpoint) {
    const client = createMagoBotApiClient({
      baseUrl: endpoint,
      apiKey,
      userAgent: "mago-bot-crm/1.0 outbound",
    });
    const result = await client.sendMessage(
      apiProjectId,
      {
        to: context.recipient,
        type: "text",
        conversationId: context.conversationId,
        text: { body: context.text },
      },
      context.idempotencyKey,
      context.apiResourceId ? { resourceId: context.apiResourceId } : {},
    );
    const providerMessageId = result.message.providerMessageId ?? undefined;
    return {
      transport: "mago_bot_api",
      status: localStatus(result.message.status),
      externalId: providerMessageId ?? result.message.id,
      apiMessageId: result.message.id,
      ...(providerMessageId ? { apiProviderMessageId: providerMessageId } : {}),
      ...(result.requestId ? { lastApiRequestId: result.requestId } : {}),
    };
  }

  const fallbackReason = runtime ? "integration_incomplete" : "integration_not_configured";
  const legacy = await getWhatsAppAdapter().sendText(
    context.providerInstanceId ?? context.connectionId,
    context.recipient,
    context.text,
  );
  return {
    transport: "legacy_provider",
    status: "sent",
    ...(legacy.externalId ? { externalId: legacy.externalId } : {}),
    fallbackReason,
  };
}

export const sendOutboundMessage = sendChatOutbound;
