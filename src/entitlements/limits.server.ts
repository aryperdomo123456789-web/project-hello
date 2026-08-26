import { and, count, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { channelConnections, flows, memberships, organizations } from "@/db/schema";
import { getPlanCatalog, type PlanId } from "@/entitlements/plans";

export type PlanResource = "connections" | "agents" | "activeFlows";

export async function assertPlanCapacity(organizationId: string, resource: PlanResource) {
  const [organization] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!organization) throw new Error("Organização não encontrada");

  const catalog = getPlanCatalog(organization.plan) as {
    id: PlanId;
    limits: Record<PlanResource, number>;
  };
  const [row] =
    resource === "connections"
      ? await db
          .select({ value: count() })
          .from(channelConnections)
          .where(eq(channelConnections.organizationId, organizationId))
      : resource === "agents"
        ? await db
            .select({ value: count() })
            .from(memberships)
            .where(
              and(eq(memberships.organizationId, organizationId), eq(memberships.status, "active")),
            )
        : await db
            .select({ value: count() })
            .from(flows)
            .where(and(eq(flows.organizationId, organizationId), eq(flows.status, "published")));
  const used = Number(row?.value ?? 0);
  const limit = catalog.limits[resource];
  if (used >= limit) {
    throw new Error(`Limite do plano ${catalog.id} atingido para ${resource}: ${limit}`);
  }
  return { used, limit, plan: catalog.id };
}
