import type { NormalizedWebhookEvent } from "./whatsapp.server";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const result = stringValue(value);
    if (result) return result;
  }
  return undefined;
}

function firstRecord(...values: unknown[]): JsonRecord {
  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length > 0) return record;
  }
  return {};
}

function normalizePhone(value: unknown): string | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = raw.replace(/@[^@]+$/, "").replace(/\D/g, "");
  return normalized.length >= 6 ? normalized : undefined;
}

function parseTimestamp(...values: unknown[]): Date | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value > 2_000_000_000 ? value : value * 1000;
      const date = new Date(milliseconds);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const text = stringValue(value);
    if (text) {
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return undefined;
}

function messageRecord(payload: JsonRecord, data: JsonRecord): JsonRecord {
  const nested = firstRecord(data["message"], payload["message"]);
  return Object.keys(nested).length > 0 ? nested : data;
}

function eventId(payload: JsonRecord, data: JsonRecord): string | undefined {
  return firstString(
    payload["event_id"],
    payload["eventId"],
    payload["id"],
    data["event_id"],
    data["eventId"],
    data["id"],
  );
}

function channelId(payload: JsonRecord, data: JsonRecord): string | undefined {
  return firstString(
    payload["channel_id"],
    payload["channelId"],
    payload["resource_id"],
    payload["resourceId"],
    data["channel_id"],
    data["channelId"],
    data["instance_id"],
    data["instanceId"],
  );
}

function projectId(payload: JsonRecord, data: JsonRecord): string | undefined {
  return firstString(
    payload["project_id"],
    payload["projectId"],
    data["project_id"],
    data["projectId"],
  );
}

function tenantId(payload: JsonRecord, data: JsonRecord): string | undefined {
  return firstString(
    payload["tenant_id"],
    payload["tenantId"],
    payload["organization_id"],
    payload["organizationId"],
    data["tenant_id"],
    data["tenantId"],
    data["organization_id"],
    data["organizationId"],
  );
}

function requestId(payload: JsonRecord, data: JsonRecord): string | undefined {
  return firstString(
    payload["request_id"],
    payload["requestId"],
    payload["trace_id"],
    payload["traceId"],
    data["request_id"],
    data["requestId"],
  );
}

function apiMessageId(
  payload: JsonRecord,
  data: JsonRecord,
  message: JsonRecord,
): string | undefined {
  return firstString(
    payload["message_id"],
    payload["messageId"],
    data["message_id"],
    data["messageId"],
    message["api_message_id"],
    message["apiMessageId"],
    message["id"],
  );
}

function providerMessageId(
  payload: JsonRecord,
  data: JsonRecord,
  message: JsonRecord,
): string | undefined {
  return firstString(
    payload["provider_message_id"],
    payload["providerMessageId"],
    data["provider_message_id"],
    data["providerMessageId"],
    data["external_message_id"],
    data["externalMessageId"],
    message["provider_message_id"],
    message["providerMessageId"],
    message["external_id"],
    message["externalId"],
  );
}

function extractText(data: JsonRecord, message: JsonRecord): string | undefined {
  const textRecord = asRecord(message["text"] ?? data["text"]);
  return firstString(
    message["body"],
    message["content"],
    message["text"],
    textRecord["body"],
    textRecord["text"],
    data["body"],
    data["content"],
    data["message"],
  );
}

function extractPhone(data: JsonRecord, message: JsonRecord): string | undefined {
  const contact = asRecord(data["contact"] ?? message["contact"]);
  return normalizePhone(
    firstString(
      data["phone"],
      data["from"],
      data["sender"],
      data["remote_jid"],
      data["remoteJid"],
      message["phone"],
      message["from"],
      message["sender"],
      message["remote_jid"],
      message["remoteJid"],
      contact["phone"],
      contact["wa_id"],
      contact["waId"],
    ),
  );
}

function commonEventFields(
  payload: JsonRecord,
  data: JsonRecord,
  eventType: string,
): Omit<NormalizedWebhookEvent, "kind"> | null {
  const id = eventId(payload, data);
  const channel = channelId(payload, data);
  if (!id || !channel) return null;
  const message = messageRecord(payload, data);
  const messageApiId = apiMessageId(payload, data, message);
  const providerId = providerMessageId(payload, data, message);
  const eventTimestamp = parseTimestamp(
    payload["occurred_at"],
    payload["occurredAt"],
    data["occurred_at"],
    data["occurredAt"],
    data["timestamp"],
    message["timestamp"],
  );
  const status = firstString(payload["status"], data["status"], data["state"], message["status"]);
  const phone = extractPhone(data, message);
  const name = firstString(
    data["name"],
    data["push_name"],
    data["pushName"],
    asRecord(data["contact"])["name"],
  );
  const base: Omit<NormalizedWebhookEvent, "kind"> = {
    provider: "mago_bot_api",
    providerInstanceId: channel,
    ...(tenantId(payload, data) ? { apiTenantId: tenantId(payload, data) } : {}),
    ...(projectId(payload, data) ? { apiProjectId: projectId(payload, data) } : {}),
    externalEventId:
      firstString(payload["external_event_id"], payload["externalEventId"], id) ?? id,
    eventType,
    ...(phone ? { phone } : {}),
    ...(name ? { name } : {}),
    ...(extractText(data, message) ? { text: extractText(data, message) } : {}),
    ...(firstString(data["message_type"], data["messageType"], message["type"])
      ? {
          messageType: firstString(data["message_type"], data["messageType"], message["type"]),
        }
      : {}),
    ...(messageApiId ? { apiMessageId: messageApiId } : {}),
    ...(providerId ? { apiProviderMessageId: providerId, externalMessageId: providerId } : {}),
    ...(requestId(payload, data) ? { apiRequestId: requestId(payload, data) } : {}),
    ...(status ? { status } : {}),
    ...(eventTimestamp ? { timestamp: eventTimestamp } : {}),
    payload,
  };
  return base;
}

export function parseMagoBotWebhookPayload(payload: unknown): NormalizedWebhookEvent | null {
  const root = asRecord(payload);
  const data = asRecord(root["data"]);
  const eventType = firstString(
    root["event_type"],
    root["eventType"],
    root["type"],
    data["event_type"],
    data["eventType"],
    data["type"],
  );
  if (!eventType) return null;
  const common = commonEventFields(root, data, eventType);
  if (!common) return null;
  const normalizedType = eventType.toLowerCase();
  if (
    normalizedType === "message.inbound" ||
    normalizedType === "message.incoming" ||
    normalizedType === "messages.inbound"
  ) {
    return { ...common, kind: "incoming_message", fromMe: false };
  }
  if (
    normalizedType === "message.status" ||
    normalizedType === "messages.status" ||
    normalizedType === "message.update"
  ) {
    return { ...common, kind: "message_status" };
  }
  if (normalizedType === "connection.updated" || normalizedType === "connection.update") {
    return { ...common, kind: "connection_update" };
  }
  if (
    normalizedType === "qrcode.updated" ||
    normalizedType === "qr.updated" ||
    normalizedType === "qrcode.update"
  ) {
    return { ...common, kind: "qrcode_updated" };
  }
  return null;
}
