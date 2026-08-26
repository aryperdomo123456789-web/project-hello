import { and, eq, gte, sql } from "drizzle-orm";

import { aiUsageEvents, organizations } from "@/db/schema";
import { db } from "@/db/client.server";

export type AiUsageRecord = {
  organizationId: string;
  provider: string;
  model: string;
  purpose: string;
  latencyMs: number;
  fallbackUsed: boolean;
  success: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  error?: string;
};

export type AiBudgetSummary = {
  monthlyBudgetCents: number;
  usedCents: number;
  remainingCents: number | null;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  periodStart: string;
};

const PRICE_USD_PER_MILLION_TOKENS: Array<{
  provider: string;
  modelPrefix: string;
  input: number;
  output: number;
}> = [
  { provider: "deepseek", modelPrefix: "deepseek-chat", input: 0.27, output: 1.1 },
  { provider: "gemini", modelPrefix: "gemini-2.5-flash", input: 0.3, output: 2.5 },
  { provider: "groq", modelPrefix: "llama-3.3-70b", input: 0.59, output: 0.79 },
];

function safeTokens(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 0;
}

function estimateCostCents(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
) {
  const pricing = PRICE_USD_PER_MILLION_TOKENS.find(
    (item) => item.provider === provider && model.startsWith(item.modelPrefix),
  );
  if (!pricing) return 0;
  const usd =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return Math.max(0, Math.round(usd * 100));
}

export async function recordAiUsage(record: AiUsageRecord) {
  if (!record.organizationId) return;
  const inputTokens = safeTokens(record.usage?.inputTokens);
  const outputTokens = safeTokens(record.usage?.outputTokens);
  const totalTokens = safeTokens(record.usage?.totalTokens) || inputTokens + outputTokens;
  const estimatedCostCents = estimateCostCents(
    record.provider,
    record.model,
    inputTokens,
    outputTokens,
  );
  await db.insert(aiUsageEvents).values({
    organizationId: record.organizationId,
    provider: record.provider,
    model: record.model,
    purpose: record.purpose,
    inputTokens,
    outputTokens,
    totalTokens,
    latencyMs: Math.max(0, Math.floor(record.latencyMs)),
    fallbackUsed: record.fallbackUsed,
    status: record.success ? "succeeded" : "failed",
    estimatedCostCents,
    ...(record.error ? { errorCode: record.error.slice(0, 120) } : {}),
  });
}

export async function getAiBudgetSummary(organizationId: string): Promise<AiBudgetSummary> {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [organization] = await db
    .select({ monthlyBudgetCents: organizations.aiBudgetCentsMonthly })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const [usage] = await db
    .select({
      usedCents: sql<string>`coalesce(sum(${aiUsageEvents.estimatedCostCents}), 0)`,
      inputTokens: sql<string>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
      calls: sql<string>`count(*)`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.organizationId, organizationId),
        gte(aiUsageEvents.createdAt, periodStart),
      ),
    );
  const monthlyBudgetCents = organization?.monthlyBudgetCents ?? 0;
  const usedCents = Number(usage?.usedCents ?? 0);
  return {
    monthlyBudgetCents,
    usedCents,
    remainingCents: monthlyBudgetCents > 0 ? Math.max(0, monthlyBudgetCents - usedCents) : null,
    inputTokens: Number(usage?.inputTokens ?? 0),
    outputTokens: Number(usage?.outputTokens ?? 0),
    calls: Number(usage?.calls ?? 0),
    periodStart: periodStart.toISOString(),
  };
}
