import { and, eq } from "drizzle-orm";
import Stripe from "stripe";

import { db } from "@/db/client.server";
import { auditLogs, billingEvents, organizations, planCatalogItems } from "@/db/schema";
import { type PlanId } from "@/entitlements/plans";
import { stripeEventPayload } from "@/services/stripe.server";

const PLAN_IDS: readonly PlanId[] = ["starter", "growth", "scale"];
type DbExecutor = Pick<typeof db, "select" | "insert" | "update">;

function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PLAN_IDS.includes(value as PlanId);
}

export type StripeBillingTransition = {
  billingStatus: "active" | "past_due" | "canceled";
  grantsPlanAccess: boolean;
  fallbackPlan: PlanId | null;
};

export function stripeBillingTransition(
  eventType: string,
  subscriptionStatus: string | null | undefined,
): StripeBillingTransition {
  if (
    eventType === "customer.subscription.deleted" ||
    ["canceled", "unpaid", "incomplete_expired"].includes(subscriptionStatus ?? "")
  ) {
    return { billingStatus: "canceled", grantsPlanAccess: false, fallbackPlan: "starter" };
  }
  if (subscriptionStatus === "past_due") {
    return { billingStatus: "past_due", grantsPlanAccess: true, fallbackPlan: null };
  }
  return { billingStatus: "active", grantsPlanAccess: true, fallbackPlan: null };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataOf(value: unknown) {
  const metadata = asRecord(asRecord(value)["metadata"]);
  return metadata;
}

function organizationIdFromMetadata(value: unknown) {
  const organizationId = stringValue(metadataOf(value)["organizationId"]);
  return organizationId && /^[0-9a-f-]{36}$/i.test(organizationId) ? organizationId : null;
}

function customerIdFrom(value: unknown) {
  return stringValue(asRecord(value)["customer"]);
}

function subscriptionIdFrom(value: unknown) {
  const record = asRecord(value);
  return (
    stringValue(record["subscription"]) ??
    (record["object"] === "subscription" ? stringValue(record["id"]) : null)
  );
}

function periodEndFrom(value: unknown) {
  const record = asRecord(value);
  const raw = record["current_period_end"] ?? record["period_end"];
  if (typeof raw === "number" && Number.isFinite(raw)) return new Date(raw * 1000);
  return null;
}

function priceIdFrom(value: unknown) {
  const record = asRecord(value);
  const direct = stringValue(record["price"]);
  if (direct) return direct;
  const price = asRecord(record["price"]);
  return stringValue(price["id"]);
}

function planIdFromMetadata(value: unknown): PlanId | null {
  const planId = metadataOf(value)["planId"];
  return isPlanId(planId) ? planId : null;
}

async function planIdFromPrice(
  executor: DbExecutor,
  organizationId: string,
  priceId: string | null,
) {
  if (!priceId) return null;
  const [plan] = await executor
    .select({ planId: planCatalogItems.planId })
    .from(planCatalogItems)
    .where(
      and(
        eq(planCatalogItems.organizationId, organizationId),
        eq(planCatalogItems.stripePriceId, priceId),
      ),
    )
    .limit(1);
  return isPlanId(plan?.planId) ? plan.planId : null;
}

async function resolveOrganizationId(event: Stripe.Event) {
  const object = event.data.object as unknown;
  const metadataOrganizationId = organizationIdFromMetadata(object);
  if (metadataOrganizationId) return metadataOrganizationId;

  const customerId = customerIdFrom(object);
  if (!customerId) return null;
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.billingCustomerRef, customerId))
    .limit(1);
  return organization?.id ?? null;
}

async function markBillingEvent(
  executor: DbExecutor,
  eventId: string,
  status: "processed" | "failed",
) {
  await executor
    .update(billingEvents)
    .set({ status, processedAt: status === "processed" ? new Date() : null })
    .where(and(eq(billingEvents.provider, "stripe"), eq(billingEvents.externalEventId, eventId)));
}

async function writeStripeAudit(
  executor: DbExecutor,
  organizationId: string,
  action: string,
  event: Stripe.Event,
  metadata: Record<string, unknown>,
) {
  await executor.insert(auditLogs).values({
    organizationId,
    actorUserId: null,
    action,
    resourceType: "organization",
    resourceId: organizationId,
    metadata: { provider: "stripe", eventId: event.id, eventType: event.type, ...metadata },
  });
}

async function syncActiveSubscription(
  executor: DbExecutor,
  input: {
    organizationId: string;
    customerId: string | null;
    subscriptionId: string | null;
    priceId: string | null;
    planId: PlanId | null;
    periodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    billingStatus: "active" | "past_due";
    event: Stripe.Event;
  },
) {
  const [current] = await executor
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!current) throw new Error("Organização Stripe não encontrada");

  const plan = input.planId ?? (isPlanId(current.plan) ? current.plan : "starter");
  await executor
    .update(organizations)
    .set({
      plan,
      billingProvider: "stripe",
      billingCustomerRef: input.customerId ?? undefined,
      billingSubscriptionRef: input.subscriptionId ?? undefined,
      billingPriceRef: input.priceId ?? undefined,
      billingStatus: input.billingStatus,
      currentPeriodEnd: input.periodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, input.organizationId));

  await writeStripeAudit(
    executor,
    input.organizationId,
    "billing.stripe_subscription_activated",
    input.event,
    {
      plan,
      subscriptionId: input.subscriptionId,
      priceId: input.priceId,
    },
  );
}

async function syncCanceledSubscription(
  executor: DbExecutor,
  input: {
    organizationId: string;
    customerId: string | null;
    subscriptionId: string | null;
    event: Stripe.Event;
  },
) {
  await executor
    .update(organizations)
    .set({
      plan: "starter",
      billingProvider: "stripe",
      billingCustomerRef: input.customerId ?? undefined,
      billingSubscriptionRef: input.subscriptionId ?? undefined,
      billingStatus: "canceled",
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, input.organizationId));

  await writeStripeAudit(
    executor,
    input.organizationId,
    "billing.stripe_subscription_canceled",
    input.event,
    {
      subscriptionId: input.subscriptionId,
    },
  );
}

async function applyEvent(executor: DbExecutor, event: Stripe.Event, organizationId: string) {
  const object = event.data.object as unknown;
  const metadataPlan = planIdFromMetadata(object);
  const customerId = customerIdFrom(object);
  const subscriptionId = subscriptionIdFrom(object);
  const metadata = metadataOf(object);
  const priceId = priceIdFrom(object) ?? stringValue(metadata["priceId"]);
  const planId = metadataPlan ?? (await planIdFromPrice(executor, organizationId, priceId));
  const transition = stripeBillingTransition(event.type, stringValue(asRecord(object)["status"]));

  if (!transition.grantsPlanAccess) {
    await syncCanceledSubscription(executor, { organizationId, customerId, subscriptionId, event });
    return;
  }

  if (event.type === "invoice.payment_succeeded") {
    const invoice = asRecord(object);
    const lines = asRecord(invoice["lines"]);
    const lineData = Array.isArray(lines["data"]) ? lines["data"] : [];
    const firstLine = asRecord(lineData[0]);
    const invoicePriceId = priceId ?? priceIdFrom(firstLine);
    const invoicePlanId =
      planId ?? (await planIdFromPrice(executor, organizationId, invoicePriceId));
    await syncActiveSubscription(executor, {
      organizationId,
      customerId,
      subscriptionId,
      priceId: invoicePriceId,
      planId: invoicePlanId,
      periodEnd: periodEndFrom(object),
      cancelAtPeriodEnd: false,
      billingStatus: "active",
      event,
    });
    return;
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "customer.subscription.updated"
  ) {
    const activeBillingStatus =
      transition.billingStatus === "past_due" ? ("past_due" as const) : ("active" as const);
    await syncActiveSubscription(executor, {
      organizationId,
      customerId,
      subscriptionId,
      priceId,
      planId,
      periodEnd: periodEndFrom(object),
      cancelAtPeriodEnd: Boolean(asRecord(object)["cancel_at_period_end"]),
      billingStatus: activeBillingStatus,
      event,
    });
  }
}

export async function processStripeWebhook(event: Stripe.Event) {
  const organizationId = await resolveOrganizationId(event);
  if (!organizationId) throw new Error("Organização não encontrada para o evento Stripe");

  const [recorded] = await db
    .insert(billingEvents)
    .values({
      organizationId,
      provider: "stripe",
      externalEventId: event.id,
      eventType: event.type,
      payload: stripeEventPayload(event, { organizationId }),
      status: "received",
    })
    .onConflictDoNothing({ target: [billingEvents.provider, billingEvents.externalEventId] })
    .returning({ id: billingEvents.id });
  if (!recorded) return { duplicate: true, organizationId, eventId: event.id };

  try {
    await db.transaction(async (tx) => {
      await applyEvent(tx, event, organizationId);
      await markBillingEvent(tx, event.id, "processed");
    });
    return { duplicate: false, organizationId, eventId: event.id, processed: true };
  } catch (error) {
    await markBillingEvent(db, event.id, "failed");
    throw error;
  }
}
