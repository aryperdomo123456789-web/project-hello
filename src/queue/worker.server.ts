import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { Worker } from "bullmq";

import { db } from "@/db/client.server";
import { channelConnections, conversations, flowEffects, messages } from "@/db/schema";
import { resumeFlowAfterTimer } from "@/services/flowRuntime.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";
import { getRedisConnection } from "./redis.server";
import { MAGO_QUEUE_NAME, type FlowEffectJob } from "./jobs.server";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

export async function processFlowEffect(effectId: string) {
  const [effect] = await db
    .select()
    .from(flowEffects)
    .where(
      and(
        eq(flowEffects.id, effectId),
        inArray(flowEffects.status, ["pending", "failed"]),
        or(isNull(flowEffects.nextAttemptAt), lte(flowEffects.nextAttemptAt, new Date())),
      ),
    )
    .limit(1);
  if (!effect) return { status: "skipped" as const };

  const [claimed] = await db
    .update(flowEffects)
    .set({ status: "processing", attempts: sql`${flowEffects.attempts} + 1` })
    .where(and(eq(flowEffects.id, effect.id), inArray(flowEffects.status, ["pending", "failed"])))
    .returning();
  if (!claimed) return { status: "race_lost" as const };

  try {
    const payload = claimed.payload;
    const [connection] = await db
      .select()
      .from(channelConnections)
      .where(eq(channelConnections.id, stringValue(payload["connectionId"])))
      .limit(1);
    if (!connection) throw new Error("Conexão do efeito não encontrada");

    const result = await getWhatsAppAdapter().sendText(
      connection.providerInstanceId ?? connection.id,
      stringValue(payload["phone"]),
      stringValue(payload["text"]),
    );
    await db
      .insert(messages)
      .values({
        organizationId: claimed.organizationId,
        conversationId: stringValue(payload["conversationId"]),
        channelConnectionId: connection.id,
        ...(result.externalId ? { externalId: result.externalId } : {}),
        clientMessageId: claimed.idempotencyKey,
        direction: "outbound",
        status: "sent",
        type: "text",
        text: stringValue(payload["text"]),
        payload: { source: "flow-worker", effectId: claimed.id },
      })
      .onConflictDoNothing();
    await db
      .update(flowEffects)
      .set({ status: "completed", completedAt: new Date(), nextAttemptAt: null, lastError: null })
      .where(eq(flowEffects.id, claimed.id));
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, stringValue(payload["conversationId"])));
    return { status: "completed" as const };
  } catch (error) {
    const attempts = claimed.attempts;
    const retryDelayMs = Math.min(15 * 60_000, 2_000 * 2 ** Math.max(0, attempts - 1));
    await db
      .update(flowEffects)
      .set({
        status: "failed",
        nextAttemptAt: new Date(Date.now() + retryDelayMs),
        lastError: error instanceof Error ? error.message : "Falha no efeito",
      })
      .where(eq(flowEffects.id, claimed.id));
    throw error;
  }
}

export function createBackgroundWorker() {
  return new Worker<FlowEffectJob>(
    MAGO_QUEUE_NAME,
    async (job) => {
      if (job.data.kind === "flow_effect") return processFlowEffect(job.data.effectId);
      if (job.data.kind === "resume_flow") {
        return resumeFlowAfterTimer(
          job.data.conversationId,
          job.data.executionId,
          job.data.externalEventId,
        );
      }
      return { status: "ignored" as const };
    },
    { connection: getRedisConnection(), concurrency: 10 },
  );
}
