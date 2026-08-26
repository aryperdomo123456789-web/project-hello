import { getServerEnv } from "@/server/env.server";

export type ProviderInstance = {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  phone?: string | undefined;
  qrCode?: { code: string; base64: string } | undefined;
  raw?: unknown;
};

export type NormalizedWebhookEvent = {
  provider: string;
  providerInstanceId?: string | undefined;
  externalEventId: string;
  eventType: string;
  kind: "incoming_message" | "message_status" | "connection_update" | "qrcode_updated" | "unknown";
  phone?: string | undefined;
  name?: string | undefined;
  text?: string | undefined;
  messageType?: string | undefined;
  fromMe?: boolean | undefined;
  externalMessageId?: string | undefined;
  status?: string | undefined;
  timestamp?: Date | undefined;
  payload: Record<string, unknown>;
};

export interface WhatsAppProviderAdapter {
  readonly provider: string;
  listInstances(): Promise<ProviderInstance[]>;
  createInstance(name: string): Promise<ProviderInstance>;
  getQrCode(instanceId: string): Promise<{ code: string; base64: string }>;
  disconnectInstance(instanceId: string): Promise<void>;
  sendText(
    instanceId: string,
    number: string,
    text: string,
  ): Promise<{ externalId?: string | undefined; raw: unknown }>;
  normalizeWebhook(payload: unknown): NormalizedWebhookEvent[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function replaceInstance(path: string, instanceId: string) {
  return path.replaceAll("{instance}", encodeURIComponent(instanceId));
}

function extractInstance(value: unknown): ProviderInstance {
  const raw = asRecord(value);
  const nested = asRecord(raw["instance"]);
  const id =
    stringValue(raw["instanceId"]) ??
    stringValue(raw["instance_id"]) ??
    stringValue(nested["instanceId"]) ??
    stringValue(raw["id"]) ??
    stringValue(raw["name"]) ??
    "unknown-instance";
  const name =
    stringValue(raw["instanceName"]) ??
    stringValue(raw["instance_name"]) ??
    stringValue(nested["instanceName"]) ??
    stringValue(raw["name"]) ??
    id;
  const rawStatus =
    stringValue(raw["status"]) ?? stringValue(raw["state"]) ?? stringValue(raw["connectionStatus"]);
  const status: ProviderInstance["status"] =
    rawStatus === "open" || rawStatus === "connected"
      ? "connected"
      : rawStatus === "connecting" || rawStatus === "connecting..."
        ? "connecting"
        : rawStatus === "error"
          ? "error"
          : "disconnected";
  const phone =
    stringValue(raw["owner"]) ?? stringValue(raw["phone"]) ?? stringValue(raw["number"]);

  return {
    id,
    name,
    status,
    ...(phone ? { phone } : {}),
    raw: value,
  };
}

class StubWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = "stub";
  private readonly instances = new Map<string, ProviderInstance>();

  async listInstances() {
    return [...this.instances.values()];
  }

  async createInstance(name: string) {
    const id = `stub-${crypto.randomUUID()}`;
    const instance: ProviderInstance = { id, name, status: "connecting" };
    this.instances.set(id, instance);
    return instance;
  }

  async getQrCode(instanceId: string) {
    const instance = this.instances.get(instanceId);
    if (instance) this.instances.set(instanceId, { ...instance, status: "connecting" });
    const code = `stub:${instanceId}`;
    const base64 = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(code)}`;
    return { code, base64 };
  }

  async disconnectInstance(instanceId: string) {
    const instance = this.instances.get(instanceId);
    if (instance) this.instances.set(instanceId, { ...instance, status: "disconnected" });
  }

  async sendText(instanceId: string, number: string, text: string) {
    return { externalId: `stub-message-${crypto.randomUUID()}`, raw: { instanceId, number, text } };
  }

  normalizeWebhook(payload: unknown): NormalizedWebhookEvent[] {
    const raw = asRecord(payload);
    return [
      {
        provider: this.provider,
        ...(stringValue(raw["instance"])
          ? { providerInstanceId: stringValue(raw["instance"]) }
          : {}),
        externalEventId: stringValue(raw["id"]) ?? `stub-${crypto.randomUUID()}`,
        eventType: stringValue(raw["event"]) ?? "STUB_EVENT",
        kind: "unknown",
        payload: raw,
      },
    ];
  }
}

class HttpWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly env = getServerEnv();

  constructor(provider: string) {
    if (!this.env.WHATSAPP_API_BASE_URL) throw new Error("WHATSAPP_API_BASE_URL não configurado");
    this.provider = provider;
    this.baseUrl = this.env.WHATSAPP_API_BASE_URL.replace(/\/$/, "");
    this.apiKey = this.env.WHATSAPP_API_KEY ?? "";
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    if (this.apiKey) headers.set("apikey", this.apiKey);

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok)
      throw new Error(
        `WhatsApp provider ${response.status}: ${JSON.stringify(data).slice(0, 500)}`,
      );
    return data;
  }

  async listInstances() {
    const response = await this.request(this.env.EVOLUTION_INSTANCES_PATH);
    const responseRecord = asRecord(response);
    const raw = Array.isArray(response) ? response : responseRecord["instances"];
    return (Array.isArray(raw) ? raw : []).map(extractInstance);
  }

  async createInstance(name: string) {
    const response = await this.request(this.env.EVOLUTION_CREATE_PATH, {
      method: "POST",
      body: JSON.stringify({ instanceName: name, qrcode: true }),
    });
    return extractInstance(response);
  }

  async getQrCode(instanceId: string) {
    const response = asRecord(
      await this.request(replaceInstance(this.env.EVOLUTION_CONNECT_PATH, instanceId)),
    );
    const nested = asRecord(response["qrcode"] ?? response["qr"] ?? response["data"]);
    const base64 =
      stringValue(response["base64"]) ??
      stringValue(response["qrCode"]) ??
      stringValue(nested["base64"]) ??
      stringValue(nested["qrcode"]);
    const code = stringValue(response["code"]) ?? stringValue(nested["code"]) ?? "";
    if (!base64) throw new Error("O provedor não retornou QR Code");
    return { code, base64 };
  }

  async disconnectInstance(instanceId: string) {
    await this.request(replaceInstance(this.env.EVOLUTION_LOGOUT_PATH, instanceId), {
      method: "DELETE",
    });
  }

  async sendText(instanceId: string, number: string, text: string) {
    const response = await this.request(
      replaceInstance(this.env.EVOLUTION_SEND_TEXT_PATH, instanceId),
      {
        method: "POST",
        body: JSON.stringify({ number, text }),
      },
    );
    const raw = asRecord(response);
    const key = asRecord(raw["key"]);
    const externalId = stringValue(key["id"]) ?? stringValue(raw["id"]);
    return {
      ...(externalId ? { externalId } : {}),
      raw: response,
    };
  }

  normalizeWebhook(payload: unknown): NormalizedWebhookEvent[] {
    const raw = asRecord(payload);
    const event = stringValue(raw["event"]) ?? stringValue(raw["type"]) ?? "UNKNOWN";
    const data = asRecord(raw["data"] ?? raw);
    const key = asRecord(data["key"]);
    const message = asRecord(data["message"]);
    const remoteJid = stringValue(key["remoteJid"]) ?? stringValue(raw["sender"]);
    const phone = remoteJid?.split("@")[0];
    const externalMessageId = stringValue(key["id"]) ?? stringValue(data["id"]);
    const fromMe = key["fromMe"] === true;
    const timestampValue = data["messageTimestamp"] ?? raw["timestamp"];
    const timestamp =
      typeof timestampValue === "number"
        ? new Date(timestampValue > 2_000_000_000 ? timestampValue : timestampValue * 1000)
        : undefined;
    const conversation = asRecord(message["conversation"]);
    const extendedText = asRecord(message["extendedTextMessage"]);
    const image = asRecord(message["imageMessage"]);
    const video = asRecord(message["videoMessage"]);
    const text =
      stringValue(conversation["body"]) ??
      stringValue(message["conversation"]) ??
      stringValue(extendedText["text"]) ??
      stringValue(image["caption"]) ??
      stringValue(video["caption"]);
    const providerInstanceId = stringValue(raw["instance"]) ?? stringValue(data["instance"]);
    const eventReference =
      externalMessageId ??
      stringValue(raw["id"]) ??
      stringValue(raw["date_time"]) ??
      String(Date.now());
    const base = {
      provider: this.provider,
      ...(providerInstanceId ? { providerInstanceId } : {}),
      externalEventId: `${event}:${eventReference}`,
      eventType: event,
      ...(phone ? { phone } : {}),
      ...(stringValue(data["pushName"]) ? { name: stringValue(data["pushName"]) } : {}),
      ...(text ? { text } : {}),
      ...(stringValue(data["messageType"])
        ? { messageType: stringValue(data["messageType"]) }
        : {}),
      fromMe,
      ...(externalMessageId ? { externalMessageId } : {}),
      ...(timestamp ? { timestamp } : {}),
      payload: raw,
    };

    if (
      event === "MESSAGES_UPSERT" ||
      event === "messages.upsert" ||
      event === "MESSAGE_RECEIVED"
    ) {
      return [{ ...base, kind: "incoming_message" }];
    }
    if (event === "MESSAGES_UPDATE" || event === "messages.update" || event === "MESSAGE_STATUS") {
      const statusRecord = Array.isArray(raw["data"]) ? asRecord(raw["data"][0]) : data;
      const status = stringValue(statusRecord["status"]);
      return [{ ...base, kind: "message_status", ...(status ? { status } : {}) }];
    }
    if (
      event === "CONNECTION_UPDATE" ||
      event === "connection.update" ||
      event === "CONNECTION_STATUS"
    ) {
      const status = stringValue(data["state"]) ?? stringValue(data["status"]);
      return [{ ...base, kind: "connection_update", ...(status ? { status } : {}) }];
    }
    if (event === "QRCODE_UPDATED" || event === "qrcode.updated" || event === "QR_UPDATED") {
      return [{ ...base, kind: "qrcode_updated" }];
    }
    return [{ ...base, kind: "unknown" }];
  }
}

let adapter: WhatsAppProviderAdapter | undefined;

export function getWhatsAppAdapter(): WhatsAppProviderAdapter {
  if (!adapter) {
    const provider = getServerEnv().WHATSAPP_PROVIDER;
    adapter = provider === "stub" ? new StubWhatsAppAdapter() : new HttpWhatsAppAdapter(provider);
  }
  return adapter;
}
