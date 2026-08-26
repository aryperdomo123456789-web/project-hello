import { createServerFn } from "@tanstack/react-start";
import { and, count, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  channelConnections,
  flowBindings,
  flowExecutions,
  flows,
  memberships,
  organizations,
} from "@/db/schema";
import { getPlanCatalog, type PlanId, type PlanLimits } from "@/entitlements/plans";
import { requireUser } from "@/server/auth.server";

export type WorkspacePlanDTO = {
  organizationName: string;
  status: string;
  plan: PlanId;
  planName: string;
  description: string;
  limits: PlanLimits;
  features: string[];
  usage: {
    connections: number;
    agents: number;
    activeFlows: number;
    testedRuns: number;
  };
};

export const getWorkspacePlanFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const [organization] = await db
    .select({ name: organizations.name, status: organizations.status, plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId))
    .limit(1);
  if (!organization) throw new Error("Organização não encontrada");

  const [[connectionCount], [agentCount], [flowCount], [executionCount]] = await Promise.all([
    db
      .select({ value: count() })
      .from(channelConnections)
      .where(eq(channelConnections.organizationId, user.organizationId)),
    db
      .select({ value: count() })
      .from(memberships)
      .where(
        and(eq(memberships.organizationId, user.organizationId), eq(memberships.status, "active")),
      ),
    db
      .select({ value: count() })
      .from(flows)
      .where(and(eq(flows.organizationId, user.organizationId), eq(flows.status, "published"))),
    db
      .select({ value: count() })
      .from(flowExecutions)
      .where(eq(flowExecutions.organizationId, user.organizationId)),
  ]);

  const catalog = getPlanCatalog(organization.plan);
  return {
    organizationName: organization.name,
    status: organization.status,
    plan: catalog.id,
    planName: catalog.name,
    description: catalog.description,
    limits: catalog.limits,
    features: catalog.features,
    usage: {
      connections: Number(connectionCount?.value ?? 0),
      agents: Number(agentCount?.value ?? 0),
      activeFlows: Number(flowCount?.value ?? 0),
      testedRuns: Number(executionCount?.value ?? 0),
    },
  } satisfies WorkspacePlanDTO;
});
