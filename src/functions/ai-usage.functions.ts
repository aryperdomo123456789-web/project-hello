import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { organizations } from "@/db/schema";
import { requireRole } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import { getAiBudgetSummary } from "@/services/aiUsage.server";

const aiBudgetSchema = z.object({
  monthlyBudgetCents: z.number().int().min(0).max(100_000_000),
});

export const getAiBudgetSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("owner", "admin");
  return getAiBudgetSummary(user.organizationId);
});

export const updateAiBudgetFn = createServerFn({ method: "POST" })
  .validator(aiBudgetSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner");
    await db
      .update(organizations)
      .set({ aiBudgetCentsMonthly: data.monthlyBudgetCents, updatedAt: new Date() })
      .where(eq(organizations.id, user.organizationId));
    await writeAudit(user, {
      action: "ai_budget_updated",
      resourceType: "organization",
      resourceId: user.organizationId,
      metadata: { monthlyBudgetCents: data.monthlyBudgetCents },
    });
    return getAiBudgetSummary(user.organizationId);
  });
