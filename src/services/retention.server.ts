import { and, count, eq, lt } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  auditLogs,
  conversationQualityReviews,
  messages,
  retentionPolicies,
  retentionRuns,
  sequenceEvents,
  webhookEvents,
} from "@/db/schema";
import { getServerEnv } from "@/server/env.server";

export const RETENTION_FLOOR_DAYS = {
  message: 30,
  webhook: 30,
  audit: 180,
  quality: 180,
  sequence: 30,
} as const;

export const RETENTION_CEILING_DAYS = 3_650;

export type RetentionPolicyInput = {
  messageRetentionDays?: number;
  webhookRetentionDays?: number;
  auditRetentionDays?: number;
  qualityRetentionDays?: number;
  sequenceRetentionDays?: number;
  legalHold?: boolean;
  dryRunOnly?: boolean;
};

export type RetentionCounts = {
  messages: number;
  webhookEvents: number;
  auditLogs: number;
  qualityReviews: number;
  sequenceEvents: number;
};

export type RetentionCutoffs = {
  messages: string;
  webhookEvents: string;
  auditLogs: string;
  qualityReviews: string;
  sequenceEvents: string;
};

function clampDays(value: number | undefined, fallback: number, floor: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(floor, Math.min(RETENTION_CEILING_DAYS, value));
}

export function normalizeRetentionPolicy(input: RetentionPolicyInput) {
  return {
    messageRetentionDays: clampDays(input.messageRetentionDays, 365, RETENTION_FLOOR_DAYS.message),
    webhookRetentionDays: clampDays(input.webhookRetentionDays, 90, RETENTION_FLOOR_DAYS.webhook),
    auditRetentionDays: clampDays(input.auditRetentionDays, 730, RETENTION_FLOOR_DAYS.audit),
    qualityRetentionDays: clampDays(input.qualityRetentionDays, 730, RETENTION_FLOOR_DAYS.quality),
    sequenceRetentionDays: clampDays(
      input.sequenceRetentionDays,
      365,
      RETENTION_FLOOR_DAYS.sequence,
    ),
    legalHold: input.legalHold ?? false,
    dryRunOnly: input.dryRunOnly ?? true,
  };
}

function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function retentionCutoffs(policy: RetentionPolicyInput, now = new Date()): RetentionCutoffs {
  const normalized = normalizeRetentionPolicy(policy);
  return {
    messages: cutoff(now, normalized.messageRetentionDays).toISOString(),
    webhookEvents: cutoff(now, normalized.webhookRetentionDays).toISOString(),
    auditLogs: cutoff(now, normalized.auditRetentionDays).toISOString(),
    qualityReviews: cutoff(now, normalized.qualityRetentionDays).toISOString(),
    sequenceEvents: cutoff(now, normalized.sequenceRetentionDays).toISOString(),
  };
}

export async function ensureRetentionPolicy(organizationId: string) {
  await db
    .insert(retentionPolicies)
    .values({ organizationId, ...normalizeRetentionPolicy({}) })
    .onConflictDoNothing({ target: retentionPolicies.organizationId });
  const [policy] = await db
    .select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.organizationId, organizationId))
    .limit(1);
  if (!policy) throw new Error("Política de retenção não encontrada");
  return policy;
}

export async function countRetentionCandidates(
  organizationId: string,
  policy: RetentionPolicyInput,
  now = new Date(),
): Promise<{
  counts: RetentionCounts;
  cutoffs: RetentionCutoffs;
  blockedByLegalHold: boolean;
}> {
  const normalized = normalizeRetentionPolicy(policy);
  const cutoffs = retentionCutoffs(normalized, now);
  if (normalized.legalHold) {
    return {
      counts: { messages: 0, webhookEvents: 0, auditLogs: 0, qualityReviews: 0, sequenceEvents: 0 },
      cutoffs,
      blockedByLegalHold: true,
    };
  }
  const [messageRows, webhookRows, auditRows, qualityRows, sequenceRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, organizationId),
          lt(messages.createdAt, new Date(cutoffs.messages)),
        ),
      ),
    db
      .select({ value: count() })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.organizationId, organizationId),
          lt(webhookEvents.receivedAt, new Date(cutoffs.webhookEvents)),
        ),
      ),
    db
      .select({ value: count() })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, organizationId),
          lt(auditLogs.createdAt, new Date(cutoffs.auditLogs)),
        ),
      ),
    db
      .select({ value: count() })
      .from(conversationQualityReviews)
      .where(
        and(
          eq(conversationQualityReviews.organizationId, organizationId),
          lt(conversationQualityReviews.createdAt, new Date(cutoffs.qualityReviews)),
        ),
      ),
    db
      .select({ value: count() })
      .from(sequenceEvents)
      .where(
        and(
          eq(sequenceEvents.organizationId, organizationId),
          lt(sequenceEvents.createdAt, new Date(cutoffs.sequenceEvents)),
        ),
      ),
  ]);
  return {
    counts: {
      messages: Number(messageRows[0]?.value ?? 0),
      webhookEvents: Number(webhookRows[0]?.value ?? 0),
      auditLogs: Number(auditRows[0]?.value ?? 0),
      qualityReviews: Number(qualityRows[0]?.value ?? 0),
      sequenceEvents: Number(sequenceRows[0]?.value ?? 0),
    },
    cutoffs,
    blockedByLegalHold: false,
  };
}

export async function runRetentionDryRun(organizationId: string, requestedBy?: string) {
  const policy = await ensureRetentionPolicy(organizationId);
  const now = new Date();
  const report = await countRetentionCandidates(organizationId, policy, now);
  const idempotencyKey = `retention:dry-run:${organizationId}:${now.toISOString()}`;
  const [run] = await db
    .insert(retentionRuns)
    .values({
      organizationId,
      mode: "dry_run",
      status: "completed",
      idempotencyKey,
      cutoff: report.cutoffs,
      counts: report.counts,
      ...(requestedBy ? { requestedBy } : {}),
      completedAt: new Date(),
    })
    .onConflictDoNothing({ target: retentionRuns.idempotencyKey })
    .returning({ id: retentionRuns.id });
  return {
    runId: run?.id ?? null,
    policy,
    ...report,
    destructiveCleanupEnabled: getServerEnv().RETENTION_CLEANUP_ENABLED,
  };
}

export async function runRetentionCleanup(organizationId: string): Promise<RetentionCounts | null> {
  const env = getServerEnv();
  if (!env.RETENTION_CLEANUP_ENABLED) return null;
  const policy = await ensureRetentionPolicy(organizationId);
  if (policy.dryRunOnly || policy.legalHold) return null;
  const now = new Date();
  const report = await countRetentionCandidates(organizationId, policy, now);
  const idempotencyKey = `retention:cleanup:${organizationId}:${now.toISOString().slice(0, 10)}`;
  const [existing] = await db
    .select({ id: retentionRuns.id })
    .from(retentionRuns)
    .where(eq(retentionRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return null;
  const [run] = await db
    .insert(retentionRuns)
    .values({
      organizationId,
      mode: "cleanup",
      status: "processing",
      idempotencyKey,
      cutoff: report.cutoffs,
      counts: report.counts,
    })
    .returning({ id: retentionRuns.id });
  if (!run) return null;
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(messages)
        .where(
          and(
            eq(messages.organizationId, organizationId),
            lt(messages.createdAt, new Date(report.cutoffs.messages)),
          ),
        );
      await tx
        .delete(webhookEvents)
        .where(
          and(
            eq(webhookEvents.organizationId, organizationId),
            lt(webhookEvents.receivedAt, new Date(report.cutoffs.webhookEvents)),
          ),
        );
      await tx
        .delete(auditLogs)
        .where(
          and(
            eq(auditLogs.organizationId, organizationId),
            lt(auditLogs.createdAt, new Date(report.cutoffs.auditLogs)),
          ),
        );
      await tx
        .delete(conversationQualityReviews)
        .where(
          and(
            eq(conversationQualityReviews.organizationId, organizationId),
            lt(conversationQualityReviews.createdAt, new Date(report.cutoffs.qualityReviews)),
          ),
        );
      await tx
        .delete(sequenceEvents)
        .where(
          and(
            eq(sequenceEvents.organizationId, organizationId),
            lt(sequenceEvents.createdAt, new Date(report.cutoffs.sequenceEvents)),
          ),
        );
      await tx
        .update(retentionRuns)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(retentionRuns.id, run.id));
    });
    return report.counts;
  } catch (error) {
    await db
      .update(retentionRuns)
      .set({ status: "failed", completedAt: new Date(), counts: { ...report.counts, error: 1 } })
      .where(eq(retentionRuns.id, run.id));
    throw error;
  }
}

export async function runRetentionSweep(limit = 50) {
  const env = getServerEnv();
  if (!env.RETENTION_CLEANUP_ENABLED) return 0;
  const policies = await db
    .select({ organizationId: retentionPolicies.organizationId })
    .from(retentionPolicies)
    .where(and(eq(retentionPolicies.dryRunOnly, false), eq(retentionPolicies.legalHold, false)))
    .limit(limit);
  let cleaned = 0;
  for (const policy of policies) {
    const result = await runRetentionCleanup(policy.organizationId);
    if (result) cleaned += 1;
  }
  return cleaned;
}
