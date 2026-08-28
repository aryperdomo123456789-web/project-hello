import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireRole } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import { getOrganizationPlanCatalog, updateOrganizationPlan } from "@/services/plan-catalog.server";

const planIdSchema = z.enum(["starter", "growth", "scale"]);
const limitsSchema = z.object({
  connections: z.number().int().min(1).max(1000),
  agents: z.number().int().min(1).max(10_000),
  monthlyMessages: z.number().int().min(0).max(100_000_000),
  activeFlows: z.number().int().min(1).max(10_000),
  retentionDays: z.number().int().min(1).max(3_650),
});
const updatePlanSchema = z.object({
  planId: planIdSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(280),
  priceCents: z.number().int().min(0).max(2_000_000_000),
  stripePriceId: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^price_[A-Za-z0-9]+$/.test(value),
      "Price ID Stripe inválido",
    ),
  limits: limitsSchema,
  features: z.array(z.string().trim().min(1).max(120)).max(30),
  highlighted: z.boolean(),
  isActive: z.boolean(),
});

export const getPlanCatalogFn = createServerFn({ method: "GET" }).handler(async () => {
  const owner = await requireRole("owner");
  return getOrganizationPlanCatalog(owner.organizationId);
});

export const updatePlanCatalogFn = createServerFn({ method: "POST" })
  .validator(updatePlanSchema)
  .handler(async ({ data }) => {
    const owner = await requireRole("owner");
    const features = [...new Set(data.features.map((feature) => feature.trim()).filter(Boolean))];
    const updated = await updateOrganizationPlan({
      organizationId: owner.organizationId,
      planId: data.planId,
      name: data.name.trim(),
      description: data.description.trim(),
      priceCents: data.priceCents,
      stripePriceId: data.stripePriceId || null,
      limits: data.limits,
      features,
      highlighted: data.highlighted,
      isActive: data.isActive,
    });
    await writeAudit(owner, {
      action: "billing.plan_catalog_updated",
      resourceType: "plan_catalog_item",
      resourceId: updated.id,
      metadata: {
        planId: updated.planId,
        priceCents: updated.priceCents,
        stripePriceIdConfigured: Boolean(updated.stripePriceId),
        isActive: updated.isActive,
      },
    });
    return updated;
  });
