#!/usr/bin/env -S node --import tsx

import Stripe from "stripe";
import postgres from "postgres";

const EVENT_TYPES = [
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "customer.subscription.deleted",
] as const;

type SmokeEventType = (typeof EVENT_TYPES)[number];

type StripeSmokeEvent = {
  id: string;
  object: "event";
  api_version: string;
  created: number;
  data: { object: Record<string, unknown> };
  livemode: false;
  pending_webhooks: number;
  request: null;
  type: SmokeEventType;
};

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function isProductionUrl(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === "mago-bot.com" || host.endsWith(".mago-bot.com");
  } catch {
    return false;
  }
}

function buildEvent(
  runId: string,
  type: SmokeEventType,
  organizationId: string,
  customerId: string,
  subscriptionId: string,
): StripeSmokeEvent {
  const created = Math.floor(Date.now() / 1000);
  const base = {
    organizationId,
    planId: "growth",
    customerId,
    subscriptionId,
    object: type === "customer.subscription.deleted" ? "subscription" : type.split(".")[0],
  };
  const object: Record<string, unknown> =
    type === "checkout.session.completed"
      ? {
          id: `cs_smoke_${runId}`,
          object: "checkout.session",
          customer: customerId,
          subscription: subscriptionId,
          metadata: base,
          status: "complete",
        }
      : type === "invoice.payment_succeeded"
        ? {
            id: `in_smoke_${runId}`,
            object: "invoice",
            customer: customerId,
            subscription: subscriptionId,
            metadata: base,
            period_end: created + 2_592_000,
            lines: {
              object: "list",
              data: [{ price: { id: `price_smoke_growth_${runId}` } }],
            },
          }
        : {
            id: subscriptionId,
            object: "subscription",
            customer: customerId,
            metadata: base,
            status: "canceled",
            current_period_end: created,
          };

  return {
    id: `evt_smoke_${runId}_${type.replaceAll(".", "_")}`,
    object: "event",
    api_version: "2025-06-30.basil",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  };
}

function signedPayload(event: StripeSmokeEvent, secret: string) {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: event.created,
  });
  return { payload, signature };
}

async function postEvent(baseUrl: string, event: StripeSmokeEvent, secret: string) {
  const { payload, signature } = signedPayload(event, secret);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Evento ${event.type} retornou HTTP ${response.status}`);
  }
  return { type: event.type, status: response.status, body: body.slice(0, 200) };
}

async function assertDatabaseState(
  databaseUrl: string,
  organizationId: string,
  eventIds: string[],
  testOrgTag: string,
) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const [organization] = await sql<
      {
        name: string;
        plan: string;
        billing_status: string;
        billing_provider: string;
      }[]
    >`
      SELECT name, plan, billing_status, billing_provider
      FROM organizations
      WHERE id = ${organizationId}
      LIMIT 1
    `;
    if (!organization || !organization.name.toLowerCase().includes(testOrgTag.toLowerCase())) {
      throw new Error(`A organização não possui o marcador de teste exigido: ${testOrgTag}`);
    }
    if (
      organization.plan !== "starter" ||
      organization.billing_status !== "canceled" ||
      organization.billing_provider !== "stripe"
    ) {
      throw new Error("A organização não terminou em canceled/starter/stripe");
    }

    const [events] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM billing_events
      WHERE organization_id = ${organizationId}
        AND provider = 'stripe'
        AND external_event_id = ANY(${sql.array(eventIds)})
        AND status = 'processed'
    `;
    if (Number(events?.count ?? 0) !== eventIds.length) {
      throw new Error("Nem todos os eventos Stripe foram marcados como processed");
    }

    const [audits] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM audit_logs
      WHERE organization_id = ${organizationId}
        AND action IN ('billing.stripe_subscription_activated', 'billing.stripe_subscription_canceled')
        AND metadata->>'eventId' = ANY(${sql.array(eventIds)})
    `;
    if (Number(audits?.count ?? 0) < 2) {
      throw new Error("Auditoria Stripe insuficiente para a transição testada");
    }

    return {
      finalPlan: organization.plan,
      finalBillingStatus: organization.billing_status,
      finalBillingProvider: organization.billing_provider,
      processedEvents: Number(events?.count ?? 0),
      auditRecords: Number(audits?.count ?? 0),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const live = process.env.STRIPE_SMOKE_RUN_LIVE === "1";
  const baseUrl = process.env.STRIPE_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const organizationId = process.env.STRIPE_SMOKE_ORG_ID ?? "00000000-0000-4000-8000-000000000001";
  const testOrgTag = process.env.STRIPE_SMOKE_TEST_ORG_TAG ?? "[stripe-test]";
  const secret =
    process.env.STRIPE_SMOKE_WEBHOOK_SECRET ??
    process.env.STRIPE_WEBHOOK_SECRET ??
    "whsec_smoke_local_only";
  const customerId = `cus_smoke_${runId}`;
  const subscriptionId = `sub_smoke_${runId}`;
  const events = EVENT_TYPES.map((type) =>
    buildEvent(runId, type, organizationId, customerId, subscriptionId),
  );

  if (live) {
    if (process.env.STRIPE_SMOKE_CONFIRM_TEST_MODE !== "yes") {
      throw new Error("Defina STRIPE_SMOKE_CONFIRM_TEST_MODE=yes para habilitar o smoke live");
    }
    if (isProductionUrl(baseUrl) && process.env.STRIPE_SMOKE_ALLOW_PRODUCTION !== "TEST_ORG_ONLY") {
      throw new Error("Produção exige STRIPE_SMOKE_ALLOW_PRODUCTION=TEST_ORG_ONLY");
    }
    if (!process.env.STRIPE_SMOKE_ORG_ID)
      throw new Error("STRIPE_SMOKE_ORG_ID é obrigatório no modo live");
    const databaseUrl = required("STRIPE_SMOKE_DATABASE_URL", process.env.DATABASE_URL);
    const results = [];
    for (const event of events) results.push(await postEvent(baseUrl, event, secret));
    const database = await assertDatabaseState(
      databaseUrl,
      organizationId,
      events.map((event) => event.id),
      testOrgTag,
    );
    console.log(
      JSON.stringify({ ok: true, mode: "live", runId, events: results.length, database }),
    );
    return;
  }

  const signed = events.map((event) => signedPayload(event, secret));
  console.log(
    JSON.stringify({
      ok: true,
      mode: "dry-run",
      runId,
      endpoint: `${baseUrl.replace(/\/$/, "")}/api/webhooks/stripe`,
      events: events.map((event, index) => ({
        id: event.id,
        type: event.type,
        signatureGenerated: signed[index].signature.startsWith("t="),
      })),
      note: "Nenhuma requisição foi enviada; use STRIPE_SMOKE_RUN_LIVE=1 somente com organização marcada para teste.",
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Stripe smoke test failed");
  process.exitCode = 1;
});
