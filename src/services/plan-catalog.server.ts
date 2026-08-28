import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { planCatalogItems } from "@/db/schema";
import { PLAN_CATALOG, type PlanId, type PlanLimits } from "@/entitlements/plans";
import { stripePriceIdFromEnvironment } from "@/services/stripe.server";

const INITIAL_PRICES_CENTS: Record<PlanId, number> = {
  starter: 14_900,
  growth: 29_700,
  scale: 59_700,
};

export type PlanCatalogItemDTO = {
  id: string;
  planId: PlanId;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  stripePriceId: string | null;
  limits: PlanLimits;
  features: string[];
  highlighted: boolean;
  isActive: boolean;
  updatedAt: string;
};

function toDTO(item: typeof planCatalogItems.$inferSelect): PlanCatalogItemDTO {
  const planId = item.planId === "growth" || item.planId === "scale" ? item.planId : "starter";
  const features = Array.isArray(item.features)
    ? item.features.filter((feature): feature is string => typeof feature === "string")
    : [];
  return {
    id: item.id,
    planId,
    name: item.name,
    description: item.description,
    priceCents: item.priceCents,
    currency: item.currency,
    stripePriceId: item.stripePriceId,
    limits: {
      connections: item.connections,
      agents: item.agents,
      monthlyMessages: item.monthlyMessages,
      activeFlows: item.activeFlows,
      retentionDays: item.retentionDays,
    },
    features,
    highlighted: item.highlighted,
    isActive: item.isActive,
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function seedMissingPlans(organizationId: string, existingPlanIds: Set<string>) {
  const missing = (Object.keys(PLAN_CATALOG) as PlanId[]).filter(
    (planId) => !existingPlanIds.has(planId),
  );
  if (missing.length === 0) return;
  await db
    .insert(planCatalogItems)
    .values(
      missing.map((planId) => {
        const catalog = PLAN_CATALOG[planId];
        return {
          organizationId,
          planId,
          name: catalog.name,
          description: catalog.description,
          priceCents: INITIAL_PRICES_CENTS[planId],
          currency: "BRL",
          stripePriceId: stripePriceIdFromEnvironment(planId),
          ...catalog.limits,
          features: catalog.features,
          highlighted: planId === "growth",
          isActive: true,
        };
      }),
    )
    .onConflictDoNothing({ target: [planCatalogItems.organizationId, planCatalogItems.planId] });
}

export async function getOrganizationPlanCatalog(organizationId: string) {
  let rows = await db
    .select()
    .from(planCatalogItems)
    .where(eq(planCatalogItems.organizationId, organizationId))
    .orderBy(asc(planCatalogItems.planId));
  await seedMissingPlans(organizationId, new Set(rows.map((row) => row.planId)));
  if (rows.length < Object.keys(PLAN_CATALOG).length) {
    rows = await db
      .select()
      .from(planCatalogItems)
      .where(eq(planCatalogItems.organizationId, organizationId))
      .orderBy(asc(planCatalogItems.planId));
  }
  return rows.map(toDTO);
}

export async function getOrganizationPlan(organizationId: string, planId: PlanId) {
  const catalog = await getOrganizationPlanCatalog(organizationId);
  const item = catalog.find((row) => row.planId === planId && row.isActive);
  if (!item) throw new Error("Plano não encontrado ou arquivado");
  return item;
}

export async function updateOrganizationPlan(input: {
  organizationId: string;
  planId: PlanId;
  name: string;
  description: string;
  priceCents: number;
  stripePriceId: string | null;
  limits: PlanLimits;
  features: string[];
  highlighted: boolean;
  isActive: boolean;
}) {
  const [updated] = await db
    .update(planCatalogItems)
    .set({
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      currency: "BRL",
      stripePriceId: input.stripePriceId,
      connections: input.limits.connections,
      agents: input.limits.agents,
      monthlyMessages: input.limits.monthlyMessages,
      activeFlows: input.limits.activeFlows,
      retentionDays: input.limits.retentionDays,
      features: input.features,
      highlighted: input.highlighted,
      isActive: input.isActive,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(planCatalogItems.organizationId, input.organizationId),
        eq(planCatalogItems.planId, input.planId),
      ),
    )
    .returning();
  if (!updated) throw new Error("Plano não encontrado");
  return toDTO(updated);
}
