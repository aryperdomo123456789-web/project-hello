import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { billingEvents, organizations } from "@/db/schema";
import { recordBillingEvent } from "@/services/billing.server";
import {
  getMercadoPagoPayment,
  getMercadoPagoSubscription,
  organizationIdFromMercadoPagoReference,
  planFromMercadoPagoReference,
  type MercadoPagoPayment,
  type MercadoPagoSubscription,
  type MercadoPagoWebhookEvent,
} from "@/services/mercadopago.server";

function sanitizedPayload(event: MercadoPagoWebhookEvent) {
  return {
    type: event.type,
    action: event.action,
    dataId: event.dataId,
    externalEventId: event.externalEventId,
  };
}

async function resolveOrganizationId(reference: string | number | undefined, externalId: string) {
  const fromReference = organizationIdFromMercadoPagoReference(reference);
  if (fromReference) {
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, fromReference))
      .limit(1);
    if (organization) return organization.id;
  }
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.billingProvider, "mercadopago"),
        eq(organizations.billingCustomerRef, externalId),
      ),
    )
    .limit(1);
  return organization?.id ?? null;
}

async function finishBillingEvent(eventId: string, status: "processed" | "failed") {
  await db
    .update(billingEvents)
    .set({ status, processedAt: new Date() })
    .where(eq(billingEvents.id, eventId));
}

function subscriptionStatus(status: string | undefined) {
  if (status === "authorized") return "active";
  if (status === "pending") return "pending";
  if (status === "paused" || status === "cancelled" || status === "expired") return "cancelled";
  return "past_due";
}

async function syncSubscription(
  event: MercadoPagoWebhookEvent,
  subscription: MercadoPagoSubscription,
) {
  const organizationId = await resolveOrganizationId(
    subscription.external_reference,
    subscription.id,
  );
  if (!organizationId) return { handled: false as const, reason: "organization_not_found" };
  const eventRecord = await recordBillingEvent({
    organizationId,
    provider: "mercadopago",
    externalEventId: event.externalEventId,
    eventType: `${event.type}.${event.action || "updated"}`,
    payload: sanitizedPayload(event),
  });
  if (!eventRecord.created) return { handled: true as const, duplicate: true as const };
  try {
    const status = subscriptionStatus(subscription.status);
    const plan = planFromMercadoPagoReference(subscription.external_reference);
    const nextPayment = subscription.next_payment_date
      ? new Date(subscription.next_payment_date)
      : null;
    await db
      .update(organizations)
      .set({
        billingProvider: "mercadopago",
        billingCustomerRef: subscription.id,
        billingStatus: status,
        ...(plan && status === "active" ? { plan } : {}),
        ...(nextPayment && !Number.isNaN(nextPayment.getTime())
          ? { currentPeriodEnd: nextPayment }
          : {}),
        cancelAtPeriodEnd: status === "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));
    if (eventRecord.eventId) await finishBillingEvent(eventRecord.eventId, "processed");
    return { handled: true as const, duplicate: false as const, organizationId, status };
  } catch (error) {
    if (eventRecord.eventId) await finishBillingEvent(eventRecord.eventId, "failed");
    throw error;
  }
}

function paymentStatus(status: string | undefined) {
  if (status === "approved") return "active";
  if (status === "pending" || status === "in_process") return "pending";
  if (status === "cancelled" || status === "refunded" || status === "charged_back")
    return "cancelled";
  return "past_due";
}

async function syncPayment(event: MercadoPagoWebhookEvent, payment: MercadoPagoPayment) {
  const organizationId = await resolveOrganizationId(
    payment.external_reference,
    String(payment.id),
  );
  if (!organizationId) return { handled: false as const, reason: "organization_not_found" };
  const eventRecord = await recordBillingEvent({
    organizationId,
    provider: "mercadopago",
    externalEventId: event.externalEventId,
    eventType: `${event.type}.${event.action || "updated"}`,
    payload: sanitizedPayload(event),
  });
  if (!eventRecord.created) return { handled: true as const, duplicate: true as const };
  try {
    const status = paymentStatus(payment.status);
    await db
      .update(organizations)
      .set({ billingProvider: "mercadopago", billingStatus: status, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId));
    if (eventRecord.eventId) await finishBillingEvent(eventRecord.eventId, "processed");
    return { handled: true as const, duplicate: false as const, organizationId, status };
  } catch (error) {
    if (eventRecord.eventId) await finishBillingEvent(eventRecord.eventId, "failed");
    throw error;
  }
}

export async function processMercadoPagoWebhook(event: MercadoPagoWebhookEvent) {
  if (event.type === "payment") {
    const payment = await getMercadoPagoPayment(event.dataId);
    return syncPayment(event, payment);
  }
  if (event.type === "subscription_preapproval" || event.type === "preapproval") {
    const subscription = await getMercadoPagoSubscription(event.dataId);
    return syncSubscription(event, subscription);
  }
  return { handled: false as const, reason: "unsupported_event" };
}
