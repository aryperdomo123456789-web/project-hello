import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { organizations } from "@/db/schema";
import { requireRole, requireUser } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import {
  getOrganizationBilling,
  listBillingEvents,
  markCancelAtPeriodEnd,
  recordBillingEvent,
} from "@/services/billing.server";
import { createMercadoPagoSubscription } from "@/services/mercadopago.server";
import { createCheckoutSession, createPortalSession } from "@/services/stripe.server";
import { getOrganizationPlan } from "@/services/plan-catalog.server";

const cancelSchema = z.object({ cancel: z.boolean() });
const checkoutSchema = z.object({ plan: z.enum(["starter", "growth", "scale"]) });

export const getBillingSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return getOrganizationBilling(user.organizationId);
});

export const createStripeCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin");
    const result = await createCheckoutSession(actor.organizationId, data.plan, actor.email);
    await writeAudit(actor, {
      action: "billing.stripe_checkout_created",
      resourceType: "organization",
      resourceId: actor.organizationId,
      metadata: { provider: "stripe", plan: data.plan, sessionId: result.sessionId },
    });
    return result;
  });

export const createStripePortalFn = createServerFn({ method: "POST" }).handler(async () => {
  const actor = await requireRole("owner", "admin");
  const result = await createPortalSession(actor.organizationId);
  await writeAudit(actor, {
    action: "billing.stripe_portal_opened",
    resourceType: "organization",
    resourceId: actor.organizationId,
    metadata: { provider: "stripe", customerId: result.customerId },
  });
  return result;
});

export const createMercadoPagoCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin");
    const catalogPlan = await getOrganizationPlan(actor.organizationId, data.plan);
    const result = await createMercadoPagoSubscription({
      organizationId: actor.organizationId,
      organizationName: actor.organizationName,
      payerEmail: actor.email,
      plan: catalogPlan.planId,
      planName: catalogPlan.name,
      amountCents: catalogPlan.priceCents,
    });
    await db
      .update(organizations)
      .set({
        billingProvider: "mercadopago",
        billingCustomerRef: result.id,
        billingStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, actor.organizationId));
    await recordBillingEvent({
      organizationId: actor.organizationId,
      provider: "mercadopago",
      externalEventId: `subscription:${result.id}:created`,
      eventType: "subscription.checkout_created",
      payload: {
        subscriptionId: result.id,
        plan: data.plan,
        environment: result.environment,
        externalReference: result.externalReference,
      },
    });
    await writeAudit(actor, {
      action: "billing.checkout_created",
      resourceType: "organization",
      resourceId: actor.organizationId,
      metadata: { provider: "mercadopago", plan: data.plan, environment: result.environment },
    });
    return result;
  });

export const setCancelAtPeriodEndFn = createServerFn({ method: "POST" })
  .validator(cancelSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin");
    const result = await markCancelAtPeriodEnd(user.organizationId, data.cancel);
    await writeAudit(user, {
      action: data.cancel ? "billing.cancel_scheduled" : "billing.cancel_reverted",
      resourceType: "organization",
      resourceId: user.organizationId,
      metadata: { cancelAtPeriodEnd: data.cancel },
    });
    return result;
  });

export const listBillingEventsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("owner", "admin");
  const events = await listBillingEvents(user.organizationId);
  return events.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));
});
