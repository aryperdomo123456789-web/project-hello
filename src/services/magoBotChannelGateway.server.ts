import { getIntegrationDefinition } from "@/services/integration-registry.server";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";
import { getWhatsAppAdapter, type ProviderInstance } from "@/services/whatsapp.server";
import { createMagoBotApiClient } from "./magoBotApi.server";
import type { MagoBotChannel } from "./magoBotApi.types";

export type ChannelGatewayTransport = "mago_bot_api" | "legacy_provider";

export type ChannelGatewayChannel = {
  transport: ChannelGatewayTransport;
  provider: "evolution" | "meta" | "stub" | "custom";
  apiTenantId?: string | null;
  apiProjectId?: string | null;
  apiResourceId?: string | null;
  apiChannelId?: string | null;
  providerInstanceId: string;
  displayPhone?: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
};

export type ChannelGatewayQr = {
  transport: ChannelGatewayTransport;
  code: string;
  base64: string;
};

export type ChannelGatewayStatus = ChannelGatewayChannel & {
  lastSeenAt: Date;
  connectedAt?: Date;
};

function localStatus(value: string | undefined): ChannelGatewayChannel["status"] {
  switch (value?.toLowerCase()) {
    case "connected":
    case "open":
      return "connected";
    case "connecting":
    case "provisioning":
    case "created":
    case "qr_pending":
      return "connecting";
    case "error":
    case "failed":
    case "degraded":
      return "error";
    default:
      return "disconnected";
  }
}

function localProvider(value: string | undefined): ChannelGatewayChannel["provider"] {
  if (value === "meta_cloud") return "meta";
  if (value === "evolution") return "evolution";
  return "custom";
}

function apiChannelToLocal(
  channel: MagoBotChannel,
  projectId: string,
  transport: ChannelGatewayTransport = "mago_bot_api",
): ChannelGatewayChannel {
  const apiChannelId = channel.id;
  const providerInstanceId =
    channel.providerInstanceId ?? channel.connection?.instanceId ?? apiChannelId;
  const apiTenantId = channel.organizationId ?? null;
  const apiProjectId = channel.projectId ?? projectId;
  return {
    transport,
    provider: localProvider(channel.provider),
    apiTenantId,
    apiProjectId,
    apiResourceId: apiChannelId,
    apiChannelId,
    providerInstanceId,
    displayPhone: channel.phoneNumber ?? channel.phone ?? channel.connection?.phoneNumber ?? null,
    status: localStatus(channel.status),
  };
}

function legacyToLocal(instance: ProviderInstance): ChannelGatewayChannel {
  return {
    transport: "legacy_provider",
    provider: instance.status === "error" ? "custom" : "evolution",
    providerInstanceId: instance.id,
    displayPhone: instance.phone ?? null,
    status: instance.status,
  };
}

async function apiGateway(organizationId: string) {
  const runtime = await getOrganizationIntegrationRuntime(organizationId, "mago_bot_api");
  const apiKey = runtime?.credentials["apiKey"]?.trim();
  const projectId = runtime?.credentials["apiProjectId"]?.trim();
  if (!apiKey || !projectId) return null;
  const baseUrl = runtime?.endpointUrl ?? getIntegrationDefinition("mago_bot_api").defaultEndpoint;
  if (!baseUrl) throw new Error("Endpoint da API Mago Bot não configurado");
  return {
    projectId,
    client: createMagoBotApiClient({
      baseUrl,
      apiKey,
      userAgent: "mago-bot-crm/1.0 channels",
    }),
  };
}

export async function createChannel(
  organizationId: string,
  name: string,
  idempotencyKey: string,
): Promise<ChannelGatewayChannel> {
  const api = await apiGateway(organizationId);
  if (api) {
    const result = await api.client.createChannel(
      api.projectId,
      {
        displayName: name,
        provider: "evolution",
        events: ["message.inbound", "message.status", "connection.updated", "qrcode.updated"],
      },
      { idempotencyKey },
    );
    return apiChannelToLocal(result.channel, api.projectId);
  }

  const instance = await getWhatsAppAdapter().createInstance(name);
  return legacyToLocal(instance);
}

export async function getQrCode(
  organizationId: string,
  connection: {
    apiChannelId: string | null;
    providerInstanceId: string | null;
    id: string;
  },
): Promise<ChannelGatewayQr> {
  const api = await apiGateway(organizationId);
  if (api && connection.apiChannelId) {
    const result = await api.client.getQr(connection.apiChannelId);
    return {
      transport: "mago_bot_api",
      code: result.code ?? "",
      base64: result.qrcode ?? "",
    };
  }

  const result = await getWhatsAppAdapter().getQrCode(
    connection.providerInstanceId ?? connection.id,
  );
  return { transport: "legacy_provider", ...result };
}

export async function getChannelStatus(
  organizationId: string,
  connection: {
    apiChannelId: string | null;
    providerInstanceId: string | null;
    id: string;
  },
): Promise<ChannelGatewayStatus> {
  const api = await apiGateway(organizationId);
  if (api && connection.apiChannelId) {
    const result = await api.client.getChannelStatus(connection.apiChannelId);
    const channel = apiChannelToLocal(result.channel, api.projectId);
    return {
      ...channel,
      lastSeenAt: new Date(),
      ...(channel.status === "connected" ? { connectedAt: new Date() } : {}),
    };
  }

  const instances = await getWhatsAppAdapter().listInstances();
  const instance = instances.find(
    (item) => item.id === (connection.providerInstanceId ?? connection.id),
  );
  if (!instance) throw new Error("Instância do canal não encontrada no provider legado");
  const channel = legacyToLocal(instance);
  return {
    ...channel,
    lastSeenAt: new Date(),
    ...(channel.status === "connected" ? { connectedAt: new Date() } : {}),
  };
}

export async function reconnectChannel(
  organizationId: string,
  connection: {
    apiChannelId: string | null;
    providerInstanceId: string | null;
    id: string;
  },
  idempotencyKey: string,
): Promise<ChannelGatewayChannel> {
  const api = await apiGateway(organizationId);
  if (api && connection.apiChannelId) {
    const result = await api.client.reconnectChannel(connection.apiChannelId, { idempotencyKey });
    return apiChannelToLocal(result.channel, api.projectId);
  }

  const instanceId = connection.providerInstanceId ?? connection.id;
  await getWhatsAppAdapter().getQrCode(instanceId);
  return {
    transport: "legacy_provider",
    provider: "evolution",
    providerInstanceId: instanceId,
    status: "connecting",
  };
}

export async function disconnectChannel(
  organizationId: string,
  connection: {
    apiChannelId: string | null;
    providerInstanceId: string | null;
    id: string;
  },
  idempotencyKey: string,
): Promise<ChannelGatewayChannel> {
  const api = await apiGateway(organizationId);
  if (api && connection.apiChannelId) {
    const result = await api.client.disconnectChannel(connection.apiChannelId, { idempotencyKey });
    return apiChannelToLocal(result.channel, api.projectId);
  }

  const instanceId = connection.providerInstanceId ?? connection.id;
  await getWhatsAppAdapter().disconnectInstance(instanceId);
  return {
    transport: "legacy_provider",
    provider: "evolution",
    providerInstanceId: instanceId,
    status: "disconnected",
  };
}
