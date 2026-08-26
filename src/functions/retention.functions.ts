import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { retentionPolicies, retentionRuns } from "@/db/schema";
import { requireRole } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import {
  ensureRetentionPolicy,
  normalizeRetentionPolicy,
  runRetentionDryRun,
  type RetentionPolicyInput,
} from "@/services/retention.server";

const policySchema = z.object({
  messageRetentionDays: z.number().int().min(30).max(3650),
  webhookRetentionDays: z.number().int().min(30).max(3650),
  auditRetentionDays: z.number().int().min(180).max(3650),
  qualityRetentionDays: z.number().int().min(180).max(3650),
  sequenceRetentionDays: z.number().int().min(30).max(3650),
  legalHold: z.boolean(),
  dryRunOnly: z.boolean(),
});

export type RetentionPolicyDTO = {
  messageRetentionDays: number;
  webhookRetentionDays: number;
  auditRetentionDays: number;
  qualityRetentionDays: number;
  sequenceRetentionDays: number;
  legalHold: boolean;
  dryRunOnly: boolean;
  updatedAt: string;
};

function toDTO(policy: Awaited<ReturnType<typeof ensureRetentionPolicy>>): RetentionPolicyDTO {
  return {
    messageRetentionDays: policy.messageRetentionDays,
    webhookRetentionDays: policy.webhookRetentionDays,
    auditRetentionDays: policy.auditRetentionDays,
    qualityRetentionDays: policy.qualityRetentionDays,
    sequenceRetentionDays: policy.sequenceRetentionDays,
    legalHold: policy.legalHold,
    dryRunOnly: policy.dryRunOnly,
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export const getRetentionPolicyFn = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRole("owner", "admin", "manager", "supervisor");
  return toDTO(await ensureRetentionPolicy(actor.organizationId));
});

export const updateRetentionPolicyFn = createServerFn({ method: "POST" })
  .validator(policySchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin");
    const normalized = normalizeRetentionPolicy(data satisfies RetentionPolicyInput);
    const [policy] = await db
      .insert(retentionPolicies)
      .values({ organizationId: actor.organizationId, ...normalized, updatedBy: actor.id })
      .onConflictDoUpdate({
        target: retentionPolicies.organizationId,
        set: { ...normalized, updatedBy: actor.id, updatedAt: new Date() },
      })
      .returning();
    if (!policy) throw new Error("Não foi possível salvar a política de retenção");
    await writeAudit(actor, {
      action: "retention.policy_updated",
      resourceType: "retention_policy",
      resourceId: policy.id,
      metadata: {
        legalHold: policy.legalHold,
        dryRunOnly: policy.dryRunOnly,
        messageRetentionDays: policy.messageRetentionDays,
        auditRetentionDays: policy.auditRetentionDays,
      },
    });
    return toDTO(policy);
  });

export const runRetentionDryRunFn = createServerFn({ method: "POST" }).handler(async () => {
  const actor = await requireRole("owner", "admin", "manager");
  const report = await runRetentionDryRun(actor.organizationId, actor.id);
  await writeAudit(actor, {
    action: "retention.dry_run_requested",
    resourceType: "retention_run",
    ...(report.runId ? { resourceId: report.runId } : {}),
    metadata: { counts: report.counts, blockedByLegalHold: report.blockedByLegalHold },
  });
  return {
    ...report,
    policy: toDTO(report.policy),
  };
});

export const getLatestRetentionRunFn = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireRole("owner", "admin", "manager", "supervisor");
  const [run] = await db
    .select()
    .from(retentionRuns)
    .where(eq(retentionRuns.organizationId, actor.organizationId))
    .orderBy(desc(retentionRuns.createdAt))
    .limit(1);
  return run
    ? {
        id: run.id,
        mode: run.mode,
        status: run.status,
        counts: run.counts,
        cutoff: run.cutoff,
        createdAt: run.createdAt.toISOString(),
      }
    : null;
});
