import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireRole, requireUser } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import {
  getOrganizationBilling,
  listBillingEvents,
  markCancelAtPeriodEnd,
} from "@/services/billing.server";

const cancelSchema = z.object({ cancel: z.boolean() });

export const getBillingSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return getOrganizationBilling(user.organizationId);
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
