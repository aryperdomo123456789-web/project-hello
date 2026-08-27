import {
  MagoBotApiError,
  type CreateChannelInput,
  type MagoBotApiClientConfig,
  type MagoBotApiRequestOptions,
  type MagoBotChannel,
  type MagoBotChannelActionResponse,
  type MagoBotChannelListResponse,
  type MagoBotChannelStatusResponse,
  type MagoBotMessage,
  type MagoBotMessagePayload,
  type MagoBotQrResponse,
  type MagoBotSendMessageResponse,
  type MagoBotWebhookSubscription,
  type MagoBotWebhookSubscriptionInput,
  type MagoBotWebhookSubscriptionResponse,
} from "./magoBotApi.types";

type JsonRecord = Record<string, unknown>;

type RequestOptions = MagoBotApiRequestOptions & {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return stringValue(value);
}

function firstString(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function firstNullableString(record: JsonRecord, ...keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (key in record) return nullableString(record[key]);
  }
  return undefined;
}

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || /[\s]/.test(normalized)) {
    throw new Error(`${label} inválido`);
  }
  return encodeURIComponent(normalized);
}

function requireIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 160) {
    throw new Error("X-Idempotency-Key deve ter entre 16 e 160 caracteres");
  }
  return normalized;
}

function normalizeChannel(value: unknown): MagoBotChannel {
  const record = asRecord(value);
  const connection = asRecord(record["connection"]);
  const id = firstString(record, "id", "uuid") ?? "";
  return {
    id,
    ...(firstNullableString(record, "organizationId", "organization_id") !== undefined
      ? { organizationId: firstNullableString(record, "organizationId", "organization_id") }
      : {}),
    ...(firstNullableString(record, "projectId", "project_id") !== undefined
      ? { projectId: firstNullableString(record, "projectId", "project_id") }
      : {}),
    ...(firstString(record, "displayName", "display_name", "name")
      ? { displayName: firstString(record, "displayName", "display_name", "name") }
      : {}),
    ...(firstString(record, "name") ? { name: firstString(record, "name") } : {}),
    provider: firstString(record, "provider", "provider_type") ?? "unknown",
    ...(firstString(record, "providerFlavor", "provider_flavor")
      ? { providerFlavor: firstString(record, "providerFlavor", "provider_flavor") }
      : {}),
    ...(firstString(record, "providerInstanceId", "provider_instance_id")
      ? { providerInstanceId: firstString(record, "providerInstanceId", "provider_instance_id") }
      : {}),
    status: firstString(record, "status", "state") ?? "unknown",
    ...(firstNullableString(record, "phoneNumber", "phone_number", "phone") !== undefined
      ? { phoneNumber: firstNullableString(record, "phoneNumber", "phone_number", "phone") }
      : {}),
    ...(Object.keys(connection).length > 0
      ? {
          connection: {
            ...(firstNullableString(connection, "instanceId", "instance_id") !== undefined
              ? { instanceId: firstNullableString(connection, "instanceId", "instance_id") }
              : {}),
            ...(firstNullableString(connection, "instanceName", "instance_name") !== undefined
              ? { instanceName: firstNullableString(connection, "instanceName", "instance_name") }
              : {}),
            ...(firstNullableString(connection, "phoneNumber", "phone_number") !== undefined
              ? { phoneNumber: firstNullableString(connection, "phoneNumber", "phone_number") }
              : {}),
            ...(firstNullableString(connection, "lastStatusCheckAt", "last_status_check_at") !==
            undefined
              ? {
                  lastStatusCheckAt: firstNullableString(
                    connection,
                    "lastStatusCheckAt",
                    "last_status_check_at",
                  ),
                }
              : {}),
            ...(firstNullableString(connection, "lastConnectedAt", "last_connected_at") !==
            undefined
              ? {
                  lastConnectedAt: firstNullableString(
                    connection,
                    "lastConnectedAt",
                    "last_connected_at",
                  ),
                }
              : {}),
          },
        }
      : {}),
    ...(Array.isArray(record["capabilities"])
      ? {
          capabilities: record["capabilities"].filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
    ...(firstNullableString(record, "lastSeenAt", "last_seen_at") !== undefined
      ? { lastSeenAt: firstNullableString(record, "lastSeenAt", "last_seen_at") }
      : {}),
    ...(record["lastError"] !== undefined || record["last_error"] !== undefined
      ? {
          lastError:
            record["lastError"] === null || record["last_error"] === null
              ? null
              : asRecord(record["lastError"] ?? record["last_error"]),
        }
      : {}),
    ...(typeof record["webhookConfigured"] === "boolean" ||
    typeof record["webhook_configured"] === "boolean"
      ? { webhookConfigured: Boolean(record["webhookConfigured"] ?? record["webhook_configured"]) }
      : {}),
    ...(firstNullableString(record, "createdAt", "created_at") !== undefined
      ? { createdAt: firstNullableString(record, "createdAt", "created_at") }
      : {}),
    ...(firstNullableString(record, "updatedAt", "updated_at") !== undefined
      ? { updatedAt: firstNullableString(record, "updatedAt", "updated_at") }
      : {}),
    raw: value,
  };
}

function normalizeChannelList(value: unknown): MagoBotChannelListResponse {
  const record = asRecord(value);
  const source = Array.isArray(value) ? value : record["items"];
  return {
    items: Array.isArray(source) ? source.map(normalizeChannel) : [],
    ...(firstNullableString(record, "nextCursor", "next_cursor") !== undefined
      ? { nextCursor: firstNullableString(record, "nextCursor", "next_cursor") }
      : {}),
    raw: value,
  };
}

function normalizeAction(value: unknown): MagoBotChannelActionResponse {
  const record = asRecord(value);
  return {
    ok: record["ok"] !== false,
    channel: normalizeChannel(record["channel"] ?? record),
    ...(asRecord(record["provider"]) && Object.keys(asRecord(record["provider"])).length > 0
      ? { provider: asRecord(record["provider"]) }
      : {}),
    raw: value,
  };
}

function normalizeQr(value: unknown, channelId: string): MagoBotQrResponse {
  const record = asRecord(value);
  return {
    ok: record["ok"] !== false,
    channelId: firstString(record, "channelId", "channel_id") ?? channelId,
    ...(firstNullableString(record, "qrcode", "qr", "base64") !== undefined
      ? { qrcode: firstNullableString(record, "qrcode", "qr", "base64") }
      : {}),
    ...(firstNullableString(record, "code", "pairingCode", "pairing_code") !== undefined
      ? { code: firstNullableString(record, "code", "pairingCode", "pairing_code") }
      : {}),
    ...(firstNullableString(record, "expiresAt", "expires_at") !== undefined
      ? { expiresAt: firstNullableString(record, "expiresAt", "expires_at") }
      : {}),
    raw: value,
  };
}

function normalizeStatus(value: unknown): MagoBotChannelStatusResponse {
  const record = asRecord(value);
  return {
    channel: normalizeChannel(record["channel"] ?? {}),
    ...(asRecord(record["status"]) ? { status: asRecord(record["status"]) } : {}),
    raw: value,
  };
}

function normalizeMessage(value: unknown): MagoBotMessage {
  const record = asRecord(value);
  return {
    id: firstString(record, "id", "uuid") ?? "",
    status: firstString(record, "status") ?? "unknown",
    provider: firstString(record, "provider", "provider_type") ?? "unknown",
    ...(firstNullableString(record, "providerMessageId", "provider_message_id") !== undefined
      ? {
          providerMessageId: firstNullableString(
            record,
            "providerMessageId",
            "provider_message_id",
          ),
        }
      : {}),
    ...(firstNullableString(record, "createdAt", "created_at") !== undefined
      ? { createdAt: firstNullableString(record, "createdAt", "created_at") }
      : {}),
    ...(firstNullableString(record, "errorCode", "error_code") !== undefined
      ? { errorCode: firstNullableString(record, "errorCode", "error_code") }
      : {}),
    ...(firstNullableString(record, "conversationId", "conversation_id") !== undefined
      ? { conversationId: firstNullableString(record, "conversationId", "conversation_id") }
      : {}),
    raw: value,
  };
}

function normalizeSendMessage(value: unknown, requestId?: string): MagoBotSendMessageResponse {
  const record = asRecord(value);
  return {
    message: normalizeMessage(record["message"] ?? record),
    ...(typeof record["idempotent_replay"] === "boolean" ||
    typeof record["idempotentReplay"] === "boolean"
      ? { idempotentReplay: Boolean(record["idempotentReplay"] ?? record["idempotent_replay"]) }
      : {}),
    ...(requestId ? { requestId } : {}),
    raw: value,
  };
}

function normalizeSubscription(value: unknown): MagoBotWebhookSubscriptionResponse {
  const record = asRecord(value);
  const webhook = asRecord(record["webhook"] ?? record);
  return {
    ok: record["ok"] !== false,
    webhook: {
      ...(typeof webhook["id"] === "number" ? { id: webhook["id"] } : {}),
      uuid: firstString(webhook, "uuid", "id") ?? "",
      ...(webhook["tenant_id"] !== undefined
        ? { tenantId: webhook["tenant_id"] as number | string }
        : {}),
      ...(webhook["project_id"] !== undefined
        ? { projectId: webhook["project_id"] as number | string }
        : {}),
      endpointUrl: firstString(webhook, "endpointUrl", "endpoint_url") ?? "",
      events: Array.isArray(webhook["events"])
        ? webhook["events"].filter((item): item is string => typeof item === "string")
        : [],
      status: firstString(webhook, "status") ?? "unknown",
      ...(typeof webhook["failure_count"] === "number"
        ? { failureCount: webhook["failure_count"] }
        : {}),
      ...(firstNullableString(webhook, "lastDeliveryAt", "last_delivery_at") !== undefined
        ? { lastDeliveryAt: firstNullableString(webhook, "lastDeliveryAt", "last_delivery_at") }
        : {}),
      ...(firstNullableString(webhook, "createdAt", "created_at") !== undefined
        ? { createdAt: firstNullableString(webhook, "createdAt", "created_at") }
        : {}),
      ...(firstNullableString(webhook, "secret") !== undefined
        ? { secret: firstNullableString(webhook, "secret") }
        : {}),
      raw: webhook,
    },
    ...(firstString(record, "secretWarning", "secret_warning")
      ? { secretWarning: firstString(record, "secretWarning", "secret_warning") }
      : {}),
    raw: value,
  };
}

function toApiChannelPayload(input: CreateChannelInput): JsonRecord {
  return {
    display_name: input.displayName,
    provider: input.provider ?? "evolution",
    ...(input.providerFlavor ? { provider_flavor: input.providerFlavor } : {}),
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
    ...(input.events ? { events: input.events } : {}),
    ...(input.pairingPhone ? { pairing_phone: input.pairingPhone } : {}),
  };
}

function toApiMessagePayload(input: MagoBotMessagePayload): JsonRecord {
  return {
    to: input.to,
    type: input.type ?? "text",
    ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    ...(input.text ? { text: input.text } : {}),
    ...(input.template ? { template: input.template } : {}),
    ...(input.media ? { media: input.media } : {}),
  };
}

export class MagoBotApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private lastRequestId: string | undefined;

  constructor(config: MagoBotApiClientConfig) {
    const baseUrl = config.baseUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\//i.test(baseUrl))
      throw new Error("Base URL da API Mago Bot deve usar HTTP ou HTTPS");
    if (!config.apiKey.trim()) throw new Error("API Key da API Mago Bot não configurada");
    this.baseUrl = baseUrl;
    this.apiKey = config.apiKey.trim();
    this.timeoutMs = Math.min(Math.max(config.timeoutMs ?? 15_000, 1_000), 120_000);
    this.userAgent = config.userAgent ?? "mago-bot-crm/1.0";
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    headers.set("x-api-key", this.apiKey);
    headers.set("user-agent", this.userAgent);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    if (options.idempotencyKey)
      headers.set("x-idempotency-key", requireIdempotencyKey(options.idempotencyKey));
    if (options.resourceId)
      headers.set("x-resource-id", requireIdentifier(options.resourceId, "X-Resource-Id"));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortListener = () => controller.abort();
    options.signal?.addEventListener("abort", abortListener, { once: true });

    let response: Response;
    let body: unknown;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!text) {
        body = null;
      } else {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text.slice(0, 20_000);
        }
      }
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Timeout ao chamar a API Mago Bot"
          : "Não foi possível alcançar a API Mago Bot";
      throw new MagoBotApiError(message, {
        status: 503,
        code:
          error instanceof DOMException && error.name === "AbortError"
            ? "api_timeout"
            : "api_unreachable",
        retryable: true,
        body: error instanceof Error ? error.message : undefined,
      });
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortListener);
    }

    const requestId =
      response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id") ?? undefined;
    this.lastRequestId = requestId;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds =
      retryAfterHeader && /^\d+$/.test(retryAfterHeader)
        ? Number.parseInt(retryAfterHeader, 10)
        : undefined;

    if (!response.ok) {
      const record = asRecord(body);
      const detail = asRecord(record["detail"]);
      const code =
        firstString(record, "code") ?? firstString(detail, "code") ?? `http_${response.status}`;
      const message =
        firstString(record, "message") ??
        firstString(detail, "message") ??
        `API Mago Bot respondeu HTTP ${response.status}`;
      throw new MagoBotApiError(message, {
        status: response.status,
        code,
        retryable:
          typeof record["retryable"] === "boolean"
            ? Boolean(record["retryable"])
            : typeof detail["retryable"] === "boolean"
              ? Boolean(detail["retryable"])
              : undefined,
        requestId:
          requestId ?? firstString(record, "request_id") ?? firstString(detail, "request_id"),
        retryAfterSeconds:
          retryAfterSeconds ??
          (typeof record["retry_after"] === "number" ? record["retry_after"] : undefined),
        body,
      });
    }

    return body as T;
  }

  async listChannels(projectId: string): Promise<MagoBotChannelListResponse> {
    const project = requireIdentifier(projectId, "projectId");
    const response = await this.request<unknown>(`/v1/projects/${project}/channels`);
    return normalizeChannelList(response);
  }

  async createChannel(
    projectId: string,
    input: CreateChannelInput,
    options: MagoBotApiRequestOptions = {},
  ): Promise<MagoBotChannelActionResponse> {
    const project = requireIdentifier(projectId, "projectId");
    const response = await this.request<unknown>(`/v1/projects/${project}/channels`, {
      method: "POST",
      body: toApiChannelPayload(input),
      ...options,
    });
    return normalizeAction(response);
  }

  async getQr(channelId: string): Promise<MagoBotQrResponse> {
    const channel = requireIdentifier(channelId, "channelId");
    const response = await this.request<unknown>(`/v1/channels/${channel}/qr`);
    return normalizeQr(response, channelId);
  }

  async getChannelStatus(channelId: string): Promise<MagoBotChannelStatusResponse> {
    const channel = requireIdentifier(channelId, "channelId");
    const response = await this.request<unknown>(`/v1/channels/${channel}/status`);
    return normalizeStatus(response);
  }

  async reconnectChannel(
    channelId: string,
    options: MagoBotApiRequestOptions = {},
  ): Promise<MagoBotChannelActionResponse> {
    const channel = requireIdentifier(channelId, "channelId");
    const response = await this.request<unknown>(`/v1/channels/${channel}/reconnect`, {
      method: "POST",
      ...options,
    });
    return normalizeAction(response);
  }

  async disconnectChannel(
    channelId: string,
    options: MagoBotApiRequestOptions = {},
  ): Promise<MagoBotChannelActionResponse> {
    const channel = requireIdentifier(channelId, "channelId");
    const response = await this.request<unknown>(`/v1/channels/${channel}/disconnect`, {
      method: "POST",
      ...options,
    });
    return normalizeAction(response);
  }

  getLastRequestId(): string | undefined {
    return this.lastRequestId;
  }

  async sendMessage(
    projectId: string,
    payload: MagoBotMessagePayload,
    idempotencyKey: string,
    options: Omit<MagoBotApiRequestOptions, "idempotencyKey"> = {},
  ): Promise<MagoBotSendMessageResponse> {
    const project = requireIdentifier(projectId, "projectId");
    const response = await this.request<unknown>(`/v1/projects/${project}/messages`, {
      method: "POST",
      body: toApiMessagePayload(payload),
      idempotencyKey,
      ...options,
    });
    return normalizeSendMessage(response, this.lastRequestId);
  }

  async createWebhookSubscription(
    projectId: string,
    input: MagoBotWebhookSubscriptionInput,
    options: MagoBotApiRequestOptions = {},
  ): Promise<MagoBotWebhookSubscriptionResponse> {
    const project = requireIdentifier(projectId, "projectId");
    const response = await this.request<unknown>(`/v1/projects/${project}/webhooks`, {
      method: "POST",
      body: {
        endpoint_url: input.endpointUrl,
        ...(input.events ? { events: input.events } : {}),
      },
      ...options,
    });
    return normalizeSubscription(response);
  }
}

export function createMagoBotApiClient(config: MagoBotApiClientConfig): MagoBotApiClient {
  return new MagoBotApiClient(config);
}

export type {
  MagoBotApiClientConfig,
  MagoBotApiRequestOptions,
  MagoBotChannel,
  MagoBotMessage,
  MagoBotWebhookSubscription,
};
