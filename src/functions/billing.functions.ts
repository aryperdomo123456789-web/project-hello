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

const cancelSchema = z.object({ cancel: z.boolean() });
const checkoutSchema = z.object({ plan: z.enum(["starter", "growth", "scale"]) });

export const getBillingSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return getOrganizationBilling(user.organizationId);
});

export const createMercadoPagoCheckoutFn = createServerFn({ method: "POST" })
  .validator(checkoutSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin");
    const result = await createMercadoPagoSubscription({
      organizationId: actor.organizationId,
      organizationName: actor.organizationName,
      payerEmail: actor.email,
      plan: data.plan,
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
