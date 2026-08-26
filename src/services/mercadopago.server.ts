import { createHmac, timingSafeEqual } from "node:crypto";

import { getPlanCatalog, type PlanId } from "@/entitlements/plans";
import { getServerEnv } from "@/server/env.server";

const MP_REQUEST_TIMEOUT_MS = 12_000;

export type MercadoPagoWebhookEvent = {
  externalEventId: string;
  type: string;
  action: string;
  dataId: string;
};

export type MercadoPagoSubscription = {
  id: string;
  status?: string;
  external_reference?: string | number;
  payer_email?: string;
  init_point?: string;
  next_payment_date?: string;
  auto_recurring?: {
    transaction_amount?: number | string;
    currency_id?: string;
    frequency?: number;
    frequency_type?: string;
  };
};

export type MercadoPagoPayment = {
  id: number | string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  date_created?: string;
};

export type CreateSubscriptionResult = {
  id: string;
  initPoint: string | null;
  externalReference: string;
  environment: "test" | "production";
};

function getConfig() {
  const env = getServerEnv();
  const configured = Boolean(env.MP_ACCESS_TOKEN);
  if (!configured) throw new Error("Mercado Pago não configurado");
  if (env.MP_ENVIRONMENT === "production" && !env.MP_LIVE_ENABLED) {
    throw new Error("Mercado Pago produção bloqueado por segurança");
  }
  return env;
}

export function isMercadoPagoConfigured() {
  const env = getServerEnv();
  return Boolean(env.MP_ACCESS_TOKEN);
}

function amountForPlan(plan: PlanId) {
  const env = getServerEnv();
  const amounts: Record<PlanId, number> = {
    starter: env.MP_STARTER_AMOUNT_CENTS,
    growth: env.MP_GROWTH_AMOUNT_CENTS,
    scale: env.MP_SCALE_AMOUNT_CENTS,
  };
  const cents = amounts[plan];
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error(`Preço do plano ${plan} não configurado`);
  }
  return cents;
}

async function requestMercadoPago<T>(path: string, init: RequestInit = {}): Promise<T> {
  const env = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MP_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.MP_API_BASE_URL.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Mercado Pago respondeu HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Mercado Pago respondeu")) throw error;
    throw new Error("Mercado Pago indisponível ou resposta inválida");
  } finally {
    clearTimeout(timeout);
  }
}

export async function createMercadoPagoSubscription(input: {
  organizationId: string;
  organizationName: string;
  payerEmail: string;
  plan: PlanId;
}): Promise<CreateSubscriptionResult> {
  const env = getConfig();
  const catalog = getPlanCatalog(input.plan);
  const amountCents = amountForPlan(input.plan);
  const externalReference = `mago-bot:org:${input.organizationId}:plan:${input.plan}:${crypto.randomUUID()}`;
  const response = await requestMercadoPago<MercadoPagoSubscription>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `${catalog.name} — ${input.organizationName}`.slice(0, 255),
      external_reference: externalReference,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: amountCents / 100,
        currency_id: "BRL",
      },
      back_url: `${env.APP_URL.replace(/\/$/, "")}/?billing=mercadopago`,
    }),
  });
  if (!response.id) throw new Error("Mercado Pago não retornou o ID da assinatura");
  return {
    id: response.id,
    initPoint: response.init_point ?? null,
    externalReference,
    environment: env.MP_ENVIRONMENT,
  };
}

export async function getMercadoPagoPayment(paymentId: string) {
  return requestMercadoPago<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

export async function getMercadoPagoSubscription(subscriptionId: string) {
  return requestMercadoPago<MercadoPagoSubscription>(
    `/preapproval/${encodeURIComponent(subscriptionId)}`,
  );
}

export function parseMercadoPagoWebhook(
  request: Request,
  payload: Record<string, unknown>,
): MercadoPagoWebhookEvent {
  const type = String(payload["type"] ?? payload["topic"] ?? "");
  const action = String(payload["action"] ?? "");
  const data = payload["data"];
  const dataId =
    typeof data === "object" && data !== null && "id" in data
      ? String((data as { id?: unknown }).id ?? "")
      : (new URL(request.url).searchParams.get("data.id") ??
        new URL(request.url).searchParams.get("id") ??
        "");
  const requestId = request.headers.get("x-request-id") ?? "";
  const notificationId = payload["id"] ? String(payload["id"]) : "";
  const externalEventId = notificationId || `${type}:${action}:${dataId}:${requestId}`;
  if (!type || !dataId || !externalEventId) throw new Error("Notificação Mercado Pago incompleta");
  return { externalEventId, type, action, dataId };
}

export function verifyMercadoPagoWebhookSignature(input: {
  request: Request;
  dataId: string;
  secret: string;
  now?: number;
}) {
  const signature = input.request.headers.get("x-signature") ?? "";
  const requestId = input.request.headers.get("x-request-id") ?? "";
  const parts = new Map(
    signature
      .split(",")
      .map((part) => part.split("=", 2).map((value) => value.trim()))
      .filter(([key, value]) => Boolean(key && value)) as Array<[string, string]>,
  );
  const timestamp = parts.get("ts");
  const receivedHash = parts.get("v1");
  if (!timestamp || !receivedHash || !requestId || !input.dataId) return false;
  const timestampNumber = Number(timestamp);
  const maxAge = getServerEnv().MP_WEBHOOK_MAX_AGE_SECONDS;
  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs((input.now ?? Date.now() / 1000) - timestampNumber) > maxAge
  ) {
    return false;
  }
  const manifest = `id:${input.dataId};request-id:${requestId};ts:${timestamp};`;
  const expectedHash = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const received = Buffer.from(receivedHash, "utf8");
  const expected = Buffer.from(expectedHash, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function organizationIdFromMercadoPagoReference(reference: string | number | undefined) {
  const match = String(reference ?? "").match(
    /^mago-bot:org:([0-9a-f-]{36}):plan:(starter|growth|scale):/i,
  );
  return match?.[1] ?? null;
}

export function planFromMercadoPagoReference(
  reference: string | number | undefined,
): PlanId | null {
  const match = String(reference ?? "").match(
    /^mago-bot:org:[0-9a-f-]{36}:plan:(starter|growth|scale):/i,
  );
  return (match?.[1] as PlanId | undefined) ?? null;
}
