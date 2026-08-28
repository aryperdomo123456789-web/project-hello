import Stripe from "stripe";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { organizations, planCatalogItems } from "@/db/schema";
import type { PlanId } from "@/entitlements/plans";
import { getServerEnv } from "@/server/env.server";

const STRIPE_PLAN_IDS: readonly PlanId[] = ["starter", "growth", "scale"];

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getStripeConfig() {
  const env = getServerEnv();
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe não configurado");
  return env;
}

function getStripeClient() {
  return new Stripe(getStripeConfig().STRIPE_SECRET_KEY as string);
}

export function isStripeConfigured() {
  const env = getServerEnv();
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured() {
  const env = getServerEnv();
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && STRIPE_PLAN_IDS.includes(value as PlanId);
}

export function stripePriceIdFromEnvironment(planId: PlanId) {
  const env = getServerEnv();
  return planId === "starter"
    ? env.STRIPE_PRICE_STARTER_ID || null
    : planId === "growth"
      ? env.STRIPE_PRICE_GROWTH_ID || null
      : env.STRIPE_PRICE_SCALE_ID || null;
}

export async function resolveStripePriceId(organizationId: string, planId: PlanId) {
  const [catalog] = await db
    .select({ stripePriceId: planCatalogItems.stripePriceId })
    .from(planCatalogItems)
    .where(
      and(
        eq(planCatalogItems.organizationId, organizationId),
        eq(planCatalogItems.planId, planId),
        eq(planCatalogItems.isActive, true),
      ),
    )
    .limit(1);
  return catalog?.stripePriceId || stripePriceIdFromEnvironment(planId);
}

export type StripeCheckoutResult = {
  sessionId: string;
  url: string;
  customerId: string;
  planId: PlanId;
};

export async function createCheckoutSession(
  organizationId: string,
  planId: PlanId,
  customerEmail: string,
): Promise<StripeCheckoutResult> {
  if (!isPlanId(planId)) throw new Error("Plano Stripe inválido");
  const env = getStripeConfig();
  const stripe = getStripeClient();
  const priceId = await resolveStripePriceId(organizationId, planId);
  if (!priceId) throw new Error(`Stripe Price ID não configurado para o plano ${planId}`);

  const [organization] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      billingCustomerRef: organizations.billingCustomerRef,
      billingProvider: organizations.billingProvider,
      billingStatus: organizations.billingStatus,
      billingSubscriptionRef: organizations.billingSubscriptionRef,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) throw new Error("Organização não encontrada");
  if (
    organization.billingProvider === "stripe" &&
    ["active", "trialing", "past_due"].includes(organization.billingStatus) &&
    organization.billingSubscriptionRef
  ) {
    throw new Error("Assinatura Stripe ativa: use o Customer Portal para trocar de plano");
  }
  if (
    organization.billingProvider !== "none" &&
    organization.billingProvider !== "stripe" &&
    ["active", "trialing", "past_due"].includes(organization.billingStatus)
  ) {
    throw new Error("Existe uma assinatura ativa em outro provedor de billing");
  }

  let customerId = organization.billingCustomerRef;
  if (!customerId || !customerId.startsWith("cus_")) {
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: organization.name,
      metadata: { organizationId },
    });
    customerId = customer.id;
    await db
      .update(organizations)
      .set({
        billingProvider: "stripe",
        billingCustomerRef: customerId,
        billingStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));
  }

  const successUrl =
    env.STRIPE_SUCCESS_URL ?? `${env.APP_URL.replace(/\/$/, "")}/admin?billing=success`;
  const cancelUrl =
    env.STRIPE_CANCEL_URL ?? `${env.APP_URL.replace(/\/$/, "")}/admin?billing=cancel`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId, planId },
    subscription_data: { metadata: { organizationId, planId } },
  });
  if (!session.url) throw new Error("Stripe não retornou o endereço do Checkout");

  await db
    .update(organizations)
    .set({
      billingProvider: "stripe",
      billingCustomerRef: customerId,
      billingPriceRef: priceId,
      billingStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  return { sessionId: session.id, url: session.url, customerId, planId };
}

export async function createPortalSession(organizationId: string) {
  const stripe = getStripeClient();
  const env = getServerEnv();
  const [organization] = await db
    .select({
      billingCustomerRef: organizations.billingCustomerRef,
      billingProvider: organizations.billingProvider,
      billingStatus: organizations.billingStatus,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const customerId = organization?.billingCustomerRef;
  if (
    organization?.billingProvider !== "stripe" ||
    !["active", "trialing", "past_due"].includes(organization.billingStatus) ||
    !customerId ||
    !customerId.startsWith("cus_")
  ) {
    throw new Error("Nenhum cliente Stripe vinculado à organização");
  }
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: env.STRIPE_PORTAL_RETURN_URL ?? `${env.APP_URL.replace(/\/$/, "")}/admin`,
  });
  return { url: portal.url, customerId };
}

export function constructWebhookEvent(payload: string | Buffer, signature: string) {
  const env = getStripeConfig();
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("Webhook Stripe não configurado");
  return getStripeClient().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
}

export function stripeEventPayload(event: Stripe.Event, metadata: Record<string, unknown> = {}) {
  const object = asRecord(event.data.object);
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    object: event.data.object.object,
    customer: typeof object["customer"] === "string" ? object["customer"] : null,
    subscription:
      typeof object["subscription"] === "string"
        ? object["subscription"]
        : typeof object["id"] === "string" && object["object"] === "subscription"
          ? object["id"]
          : null,
    status: typeof object["status"] === "string" ? object["status"] : null,
    ...metadata,
  } satisfies Record<string, unknown>;
}
