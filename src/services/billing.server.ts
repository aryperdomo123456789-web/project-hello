import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { billingEvents, organizations } from "@/db/schema";
import { getPlanCatalog, type PlanId } from "@/entitlements/plans";
import { isStripeConfigured } from "@/services/stripe.server";

export const TRIAL_DAYS = 14;

export type BillingSummary = {
  plan: PlanId;
  planName: string;
  billingStatus: string;
  billingProvider: string;
  stripeConfigured: boolean;
  canManageStripe: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  daysRemaining: number;
  isTrialActive: boolean;
};

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysBetween(later: Date, earlier: Date) {
  return Math.max(0, Math.ceil((later.getTime() - earlier.getTime()) / 86_400_000));
}

export function buildBillingSummary(
  organization: {
    plan: string;
    billingStatus: string;
    billingProvider: string;
    billingCustomerRef: string | null;
    trialStartedAt: Date;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  },
  now = new Date(),
): BillingSummary {
  const trialEndsAt = organization.trialEndsAt ?? addDays(organization.trialStartedAt, TRIAL_DAYS);
  const catalog = getPlanCatalog(organization.plan);
  const isTrialActive =
    organization.billingStatus === "trialing" && trialEndsAt.getTime() > now.getTime();
  return {
    plan: catalog.id,
    planName: catalog.name,
    billingStatus: organization.billingStatus,
    billingProvider: organization.billingProvider,
    stripeConfigured: isStripeConfigured(),
    canManageStripe:
      isStripeConfigured() &&
      organization.billingProvider === "stripe" &&
      Boolean(organization.billingCustomerRef) &&
      ["active", "trialing", "past_due"].includes(organization.billingStatus),
    trialStartedAt: organization.trialStartedAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    currentPeriodEnd: organization.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
    daysRemaining: isTrialActive ? daysBetween(trialEndsAt, now) : 0,
    isTrialActive,
  };
}

export async function getOrganizationBilling(organizationId: string) {
  const [organization] = await db
    .select({
      plan: organizations.plan,
      billingStatus: organizations.billingStatus,
      billingProvider: organizations.billingProvider,
      billingCustomerRef: organizations.billingCustomerRef,
      trialStartedAt: organizations.trialStartedAt,
      trialEndsAt: organizations.trialEndsAt,
      currentPeriodEnd: organizations.currentPeriodEnd,
      cancelAtPeriodEnd: organizations.cancelAtPeriodEnd,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) throw new Error("Organização não encontrada");
  const summary = buildBillingSummary(organization);
  if (!organization.trialEndsAt) {
    await db
      .update(organizations)
      .set({ trialEndsAt: new Date(summary.trialEndsAt), updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
  }
  return summary;
}

export async function markCancelAtPeriodEnd(organizationId: string, cancel: boolean) {
  const [organization] = await db
    .update(organizations)
    .set({ cancelAtPeriodEnd: cancel, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId))
    .returning({ id: organizations.id });
  if (!organization) throw new Error("Organização não encontrada");
  return { cancelAtPeriodEnd: cancel };
}

export async function recordBillingEvent(input: {
  organizationId: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(billingEvents)
    .values({
      organizationId: input.organizationId,
      provider: input.provider,
      externalEventId: input.externalEventId,
      eventType: input.eventType,
      payload: input.payload,
      status: "received",
    })
    .onConflictDoNothing({
      target: [billingEvents.provider, billingEvents.externalEventId],
    })
    .returning({ id: billingEvents.id, createdAt: billingEvents.createdAt });
  return { created: Boolean(event), eventId: event?.id ?? null };
}

export async function listBillingEvents(organizationId: string) {
  return db
    .select({
      id: billingEvents.id,
      provider: billingEvents.provider,
      eventType: billingEvents.eventType,
      status: billingEvents.status,
      createdAt: billingEvents.createdAt,
    })
    .from(billingEvents)
    .where(eq(billingEvents.organizationId, organizationId))
    .orderBy(desc(billingEvents.createdAt))
    .limit(100);
}
