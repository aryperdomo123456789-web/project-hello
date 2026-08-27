export type MagoBotApiProvider = "evolution" | "meta_cloud" | "dry_run" | string;

export type MagoBotChannelStatus =
  | "provisioning"
  | "created"
  | "qr_pending"
  | "connecting"
  | "connected"
  | "disconnected"
  | "degraded"
  | "failed"
  | "deleted"
  | "error"
  | string;

export type MagoBotApiErrorBody = {
  code?: string;
  message?: string;
  retryable?: boolean;
  retry_after?: number;
  detail?: unknown;
  request_id?: string;
};

export type MagoBotApiClientConfig = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  userAgent?: string;
};

export type MagoBotApiRequestOptions = {
  idempotencyKey?: string;
  resourceId?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

export type MagoBotChannel = {
  id: string;
  organizationId?: string | null | undefined;
  projectId?: string | null | undefined;
  displayName?: string | null | undefined;
  name?: string | null | undefined;
  provider: MagoBotApiProvider;
  providerFlavor?: string | null | undefined;
  providerInstanceId?: string | null | undefined;
  status: MagoBotChannelStatus;
  phoneNumber?: string | null | undefined;
  phone?: string | null | undefined;
  connection?: {
    instanceId?: string | null | undefined;
    instanceName?: string | null | undefined;
    phoneNumber?: string | null | undefined;
    lastStatusCheckAt?: string | null | undefined;
    lastConnectedAt?: string | null | undefined;
  };
  capabilities?: string[];
  lastSeenAt?: string | null | undefined;
  lastError?: { code?: string; message?: string } | null;
  webhookConfigured?: boolean;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  raw?: unknown;
};

export type MagoBotChannelListResponse = {
  items: MagoBotChannel[];
  nextCursor?: string | null | undefined;
  raw?: unknown;
};

export type CreateChannelInput = {
  displayName: string;
  provider?: "evolution" | "meta_cloud";
  providerFlavor?: "evolution_api" | "evolution_go";
  webhookUrl?: string;
  events?: string[];
  pairingPhone?: string;
};

export type MagoBotChannelActionResponse = {
  ok: boolean;
  channel: MagoBotChannel;
  provider?: Record<string, unknown>;
  raw?: unknown;
};

export type MagoBotQrResponse = {
  ok: boolean;
  channelId: string;
  qrcode?: string | null | undefined;
  code?: string | null | undefined;
  expiresAt?: string | null | undefined;
  raw?: unknown;
};

export type MagoBotChannelStatusResponse = {
  channel: MagoBotChannel;
  status?: Record<string, unknown>;
  raw?: unknown;
};

export type MagoBotMessagePayload = {
  to: string;
  type?: "text" | "image" | "video" | "audio" | "document" | "template" | string;
  conversationId?: string;
  text?: Record<string, unknown>;
  template?: Record<string, unknown>;
  media?: Record<string, unknown>;
};

export type MagoBotMessage = {
  id: string;
  status: string;
  provider: MagoBotApiProvider;
  providerMessageId?: string | null | undefined;
  createdAt?: string | null | undefined;
  errorCode?: string | null | undefined;
  conversationId?: string | null | undefined;
  raw?: unknown;
};

export type MagoBotSendMessageResponse = {
  message: MagoBotMessage;
  idempotentReplay?: boolean;
  requestId?: string | undefined;
  raw?: unknown;
};

export type MagoBotWebhookSubscriptionInput = {
  endpointUrl: string;
  events?: string[];
};

export type MagoBotWebhookSubscription = {
  id?: number;
  uuid: string;
  tenantId?: number | string;
  projectId?: number | string;
  endpointUrl: string;
  events: string[];
  status: string;
  failureCount?: number;
  lastDeliveryAt?: string | null | undefined;
  createdAt?: string | null | undefined;
  secret?: string | null | undefined;
  raw?: unknown;
};

export type MagoBotWebhookSubscriptionResponse = {
  ok: boolean;
  webhook: MagoBotWebhookSubscription;
  secretWarning?: string | undefined;
  raw?: unknown;
};

export type MagoBotApiResponseMeta = {
  requestId?: string;
  status: number;
  retryAfterSeconds?: number;
};

export class MagoBotApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId?: string | undefined;
  readonly retryAfterSeconds?: number | undefined;
  readonly body?: unknown | undefined;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | undefined;
      retryable?: boolean | undefined;
      requestId?: string | undefined;
      retryAfterSeconds?: number | undefined;
      body?: unknown | undefined;
    },
  ) {
    super(message);
    this.name = "MagoBotApiError";
    this.status = options.status;
    this.code = options.code ?? "mago_bot_api_error";
    this.retryable =
      options.retryable ??
      (options.status === 408 ||
        options.status === 425 ||
        options.status === 429 ||
        options.status >= 500);
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.body = options.body;
  }
}
