import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  channelConnections,
  contactPolicies,
  contactTasks,
  contacts,
  conversations,
  messages,
  queues,
  sequenceEnrollments,
  sequenceEvents,
  sequenceSteps,
  sequences,
} from "@/db/schema";
import { getServerEnv } from "@/server/env.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";

const LEASE_MINUTES = 10;
const RETRY_MINUTES = 5;
const BATCH_SIZE = 20;
const MAX_EVENT_DETAIL = 900;

type SequenceContext = Record<string, unknown>;
type SequenceResult = "completed" | "skipped" | "deferred" | "failed" | "race_lost";

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function shortDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const serialized = JSON.stringify(detail);
  if (serialized.length <= MAX_EVENT_DETAIL) return detail;
  return { summary: serialized.slice(0, MAX_EVENT_DETAIL - 3) + "..." };
}

export function sequenceEventKey(enrollmentId: string, stepId: string): string {
  return `sequence:${enrollmentId}:step:${stepId}`;
}

export function mergeContactTags(tags: string[] | null | undefined, nextTag: string): string[] {
  const normalized = nextTag.trim();
  if (!normalized) return tags ?? [];
  return [...new Set([...(tags ?? []), normalized])].slice(0, 100);
}

export function nextSequenceRunAt(now: Date, delayMinutes: number): Date {
  return new Date(now.getTime() + Math.max(0, delayMinutes) * 60_000);
}

function nextRetryAt(now: Date): Date {
  return nextSequenceRunAt(now, RETRY_MINUTES);
}

async function claimEnrollment(now: Date) {
  const leaseUntil = nextSequenceRunAt(now, LEASE_MINUTES);
  const [candidate] = await db
    .select({
      id: sequenceEnrollments.id,
      organizationId: sequenceEnrollments.organizationId,
      sequenceId: sequenceEnrollments.sequenceId,
      contactId: sequenceEnrollments.contactId,
      conversationId: sequenceEnrollments.conversationId,
      currentStep: sequenceEnrollments.currentStep,
      context: sequenceEnrollments.context,
    })
    .from(sequenceEnrollments)
    .where(
      and(
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextRunAt, now),
      ),
    )
    .orderBy(asc(sequenceEnrollments.nextRunAt), asc(sequenceEnrollments.createdAt))
    .limit(1);
  if (!candidate) return null;

  const [claimed] = await db
    .update(sequenceEnrollments)
    .set({ nextRunAt: leaseUntil, updatedAt: now })
    .where(
      and(
        eq(sequenceEnrollments.id, candidate.id),
        eq(sequenceEnrollments.status, "active"),
        lte(sequenceEnrollments.nextRunAt, now),
      ),
    )
    .returning();
  return claimed ? { ...candidate, nextRunAt: leaseUntil } : null;
}

async function findStep(enrollment: {
  organizationId: string;
  sequenceId: string;
  currentStep: number;
}) {
  const [sequence] = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
      createdBy: sequences.createdBy,
    })
    .from(sequences)
    .where(
      and(eq(sequences.id, enrollment.sequenceId), eq(sequences.organizationId, enrollment.organizationId)),
    )
    .limit(1);
  if (!sequence) return null;
  const [step] = await db
    .select()
    .from(sequenceSteps)
    .where(
      and(
        eq(sequenceSteps.organizationId, enrollment.organizationId),
        eq(sequenceSteps.sequenceId, enrollment.sequenceId),
        eq(sequenceSteps.position, enrollment.currentStep),
      ),
    )
    .limit(1);
  return { sequence, step };
}

async function completeEnrollment(
  enrollmentId: string,
  organizationId: string,
  sequenceId: string,
  stepPosition: number,
  context: SequenceContext,
  now: Date,
) {
  const nextDelay = await db
    .select({ delayMinutes: sequenceSteps.delayMinutes })
    .from(sequenceSteps)
    .where(
      and(
        eq(sequenceSteps.organizationId, organizationId),
        eq(sequenceSteps.sequenceId, sequenceId),
        gt(sequenceSteps.position, stepPosition),
      ),
    )
    .orderBy(asc(sequenceSteps.position))
    .limit(1);
  const delayMinutes = nextDelay[0]?.delayMinutes;
  await db
    .update(sequenceEnrollments)
    .set({
      currentStep: stepPosition + 1,
      status: delayMinutes === undefined ? "completed" : "active",
      nextRunAt: delayMinutes === undefined ? null : nextSequenceRunAt(now, delayMinutes),
      lastRunAt: now,
      context,
      updatedAt: now,
    })
    .where(eq(sequenceEnrollments.id, enrollmentId));
}

async function updateEvent(
  eventId: string,
  status: "processing" | "pending" | "completed" | "skipped" | "failed",
  detail: Record<string, unknown>,
) {
  await db
    .update(sequenceEvents)
    .set({ status, detail: shortDetail(detail) })
    .where(eq(sequenceEvents.id, eventId));
}

async function ensureEvent(
  organizationId: string,
  enrollmentId: string,
  stepId: string,
  now: Date,
) {
  const idempotencyKey = sequenceEventKey(enrollmentId, stepId);
  await db
    .insert(sequenceEvents)
    .values({
      organizationId,
      enrollmentId,
      stepId,
      idempotencyKey,
      status: "pending",
      detail: { createdBy: "sequence-worker" },
    })
    .onConflictDoNothing({ target: sequenceEvents.idempotencyKey });

  const [event] = await db
    .select()
    .from(sequenceEvents)
    .where(eq(sequenceEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (!event) throw new Error("Evento de sequência não pôde ser criado");
  if (event.status === "completed" || event.status === "skipped") return { event, claimed: false };

  const [claimed] = await db
    .update(sequenceEvents)
    .set({ status: "processing", detail: { ...event.detail, claimedAt: now.toISOString() } })
    .where(
      and(
        eq(sequenceEvents.id, event.id),
        or(
          inArray(sequenceEvents.status, ["pending", "failed"]),
          and(
            eq(sequenceEvents.status, "processing"),
            lte(sequenceEvents.createdAt, new Date(now.getTime() - LEASE_MINUTES * 60_000)),
          ),
        ),
      ),
    )
    .returning();
  return { event: claimed ?? event, claimed: Boolean(claimed) };
}

async function loadContactPolicy(organizationId: string, contactId: string) {
  const [policy] = await db
    .select()
    .from(contactPolicies)
    .where(
      and(eq(contactPolicies.organizationId, organizationId), eq(contactPolicies.contactId, contactId)),
    )
    .limit(1);
  return policy;
}

async function resolveTarget(
  organizationId: string,
  contactId: string,
  conversationId: string | null,
) {
  const [target] = conversationId
    ? await db
        .select({ conversation: conversations, connection: channelConnections, contact: contacts })
        .from(conversations)
        .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.organizationId, organizationId),
            eq(conversations.contactId, contactId),
          ),
        )
        .limit(1)
    : await db
        .select({ conversation: conversations, connection: channelConnections, contact: contacts })
        .from(conversations)
        .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
        .innerJoin(contacts, eq(contacts.id, conversations.contactId))
        .where(
          and(eq(conversations.organizationId, organizationId), eq(conversations.contactId, contactId)),
        )
        .orderBy(desc(conversations.updatedAt))
        .limit(1);
  return target ?? null;
}

async function processInternalStep(
  enrollment: {
    id: string;
    organizationId: string;
    sequenceId: string;
    contactId: string;
    conversationId: string | null;
    currentStep: number;
    context: SequenceContext;
  },
  sequence: { name: string; createdBy: string },
  step: typeof sequenceSteps.$inferSelect,
  event: typeof sequenceEvents.$inferSelect,
  now: Date,
): Promise<SequenceResult> {
  const config = step.config;
  const context: SequenceContext = { ...enrollment.context, [`step_${step.position}`]: step.type };

  if (step.type === "task") {
    const title = stringValue(config["title"]) || stringValue(step.body) || `Tarefa: ${sequence.name}`;
    await db.transaction(async (tx) => {
      await tx.insert(contactTasks).values({
        organizationId: enrollment.organizationId,
        contactId: enrollment.contactId,
        ...(enrollment.conversationId ? { conversationId: enrollment.conversationId } : {}),
        title,
        dueAt: now,
        createdBy: sequence.createdBy,
      });
      await tx
        .update(sequenceEvents)
        .set({ status: "completed", detail: { type: "task", title } })
        .where(eq(sequenceEvents.id, event.id));
    });
    await completeEnrollment(
      enrollment.id,
      enrollment.organizationId,
      enrollment.sequenceId,
      enrollment.currentStep,
      context,
      now,
    );
    return "completed";
  }

  if (step.type === "tag") {
    const tag = stringValue(config["tag"]) || stringValue(step.body);
    if (!tag) throw new Error("Passo de tag sem nome configurado");
    const [contact] = await db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(and(eq(contacts.id, enrollment.contactId), eq(contacts.organizationId, enrollment.organizationId)))
      .limit(1);
    if (!contact) throw new Error("Contato da sequência não encontrado");
    await db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ tags: mergeContactTags(contact.tags, tag), updatedAt: now })
        .where(and(eq(contacts.id, enrollment.contactId), eq(contacts.organizationId, enrollment.organizationId)));
      await tx
        .update(sequenceEvents)
        .set({ status: "completed", detail: { type: "tag", tag } })
        .where(eq(sequenceEvents.id, event.id));
    });
    await completeEnrollment(
      enrollment.id,
      enrollment.organizationId,
      enrollment.sequenceId,
      enrollment.currentStep,
      context,
      now,
    );
    return "completed";
  }

  if (step.type === "handoff") {
    const queueId = stringValue(config["queueId"]);
    if (!queueId || !enrollment.conversationId) {
      await updateEvent(event.id, "skipped", { type: "handoff", reason: "queue_or_conversation_missing" });
      await completeEnrollment(enrollment.id, enrollment.organizationId, enrollment.sequenceId, enrollment.currentStep, context, now);
      return "skipped";
    }
    const [queue] = await db
      .select({ id: queues.id })
      .from(queues)
      .where(and(eq(queues.id, queueId), eq(queues.organizationId, enrollment.organizationId)))
      .limit(1);
    if (!queue) throw new Error("Fila do handoff não pertence à organização");
    await db.transaction(async (tx) => {
      await tx
        .update(conversations)
        .set({ queueId, assigneeId: null, status: "queued", updatedAt: now })
        .where(
          and(
            eq(conversations.id, enrollment.conversationId as string),
            eq(conversations.organizationId, enrollment.organizationId),
          ),
        );
      await tx
        .update(sequenceEvents)
        .set({ status: "completed", detail: { type: "handoff", queueId } })
        .where(eq(sequenceEvents.id, event.id));
    });
    await completeEnrollment(
      enrollment.id,
      enrollment.organizationId,
      enrollment.sequenceId,
      enrollment.currentStep,
      context,
      now,
    );
    return "completed";
  }

  throw new Error("Tipo de passo interno não suportado");
}

async function processMessageStep(
  enrollment: {
    id: string;
    organizationId: string;
    sequenceId: string;
    contactId: string;
    conversationId: string | null;
    currentStep: number;
    context: SequenceContext;
  },
  step: typeof sequenceSteps.$inferSelect,
  event: typeof sequenceEvents.$inferSelect,
  now: Date,
): Promise<SequenceResult> {
  const body = stringValue(step.body) || stringValue(step.config["text"]);
  if (!body) throw new Error("Passo de mensagem sem texto");
  const env = getServerEnv();
  if (env.WHATSAPP_PROVIDER === "stub") {
    await updateEvent(event.id, "skipped", {
      type: "message",
      mode: "sandbox",
      reason: "WHATSAPP_PROVIDER=stub",
    });
    await completeEnrollment(enrollment.id, enrollment.organizationId, enrollment.sequenceId, enrollment.currentStep, { ...enrollment.context, lastMessage: "sandbox" }, now);
    return "skipped";
  }

  const target = await resolveTarget(enrollment.organizationId, enrollment.contactId, enrollment.conversationId);
  const phone = target?.contact.phone ?? target?.contact.waId ?? "";
  if (!target || !phone || target.connection.status !== "connected") {
    await updateEvent(event.id, "pending", {
      type: "message",
      reason: !target ? "conversation_missing" : !phone ? "phone_missing" : "connection_not_connected",
      retryAt: nextRetryAt(now).toISOString(),
    });
    await db
      .update(sequenceEnrollments)
      .set({ nextRunAt: nextRetryAt(now), updatedAt: now })
      .where(eq(sequenceEnrollments.id, enrollment.id));
    return "deferred";
  }

  const idempotencyKey = sequenceEventKey(enrollment.id, step.id);
  const [existingMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.organizationId, enrollment.organizationId), eq(messages.clientMessageId, idempotencyKey)),
    )
    .limit(1);
  if (!existingMessage) {
    const adapter = getWhatsAppAdapter();
    const result = await adapter.sendText(target.connection.providerInstanceId ?? target.connection.id, phone, body);
    await db.transaction(async (tx) => {
      await tx
        .insert(messages)
        .values({
          organizationId: enrollment.organizationId,
          conversationId: target.conversation.id,
          channelConnectionId: target.connection.id,
          ...(result.externalId ? { externalId: result.externalId } : {}),
          clientMessageId: idempotencyKey,
          direction: "outbound",
          status: "sent",
          type: "text",
          text: body,
          payload: { source: "sequence-worker", sequenceEventId: event.id },
        })
        .onConflictDoNothing();
      await tx
        .update(conversations)
        .set({ lastMessageAt: now, updatedAt: now, status: "in_progress" })
        .where(eq(conversations.id, target.conversation.id));
      await tx
        .insert(contactPolicies)
        .values({
          organizationId: enrollment.organizationId,
          contactId: enrollment.contactId,
          lastContactAt: now,
        })
        .onConflictDoUpdate({
          target: [contactPolicies.organizationId, contactPolicies.contactId],
          set: { lastContactAt: now, updatedAt: now },
        });
      await tx
        .update(sequenceEvents)
        .set({ status: "completed", detail: { type: "message", conversationId: target.conversation.id } })
        .where(eq(sequenceEvents.id, event.id));
    });
    await completeEnrollment(
      enrollment.id,
      enrollment.organizationId,
      enrollment.sequenceId,
      enrollment.currentStep,
      { ...enrollment.context, lastMessage: "sent" },
      now,
    );
  } else {
    await updateEvent(event.id, "completed", { type: "message", idempotentReplay: true });
    await completeEnrollment(enrollment.id, enrollment.organizationId, enrollment.sequenceId, enrollment.currentStep, { ...enrollment.context, lastMessage: "replayed" }, now);
  }
  return "completed";
}

export async function processOneSequenceEnrollment(now = new Date()): Promise<SequenceResult> {
  const enrollment = await claimEnrollment(now);
  if (!enrollment) return "race_lost";
  try {
    const found = await findStep(enrollment);
    if (!found) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "cancelled", nextRunAt: null, updatedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      return "skipped";
    }
    const { sequence, step } = found;
    if (sequence.status !== "active" || !step) {
      await db
        .update(sequenceEnrollments)
        .set({ status: sequence.status === "archived" ? "cancelled" : "paused", nextRunAt: null, updatedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      return "skipped";
    }

    const policy = await loadContactPolicy(enrollment.organizationId, enrollment.contactId);
    if (policy?.optedOut) {
      await db
        .update(sequenceEnrollments)
        .set({ status: "cancelled", nextRunAt: null, updatedAt: now, context: { ...enrollment.context, cancelled: "opted_out" } })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      return "skipped";
    }
    if (step.type === "message") {
      const quietUntil = policy?.quietUntil?.getTime() ?? 0;
      const frequencyUntil = policy?.lastContactAt
        ? policy.lastContactAt.getTime() + positiveInt(policy.frequencyHours, 24) * 3_600_000
        : 0;
      const eligibleAt = Math.max(quietUntil, frequencyUntil);
      if (eligibleAt > now.getTime()) {
        await db
          .update(sequenceEnrollments)
          .set({ nextRunAt: new Date(eligibleAt), updatedAt: now })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        return "deferred";
      }
    }

    const eventState = await ensureEvent(enrollment.organizationId, enrollment.id, step.id, now);
    if (!eventState.claimed) {
      if (eventState.event.status === "completed" || eventState.event.status === "skipped") {
        await completeEnrollment(
          enrollment.id,
          enrollment.organizationId,
          enrollment.sequenceId,
          enrollment.currentStep,
          enrollment.context,
          now,
        );
        return eventState.event.status === "completed" ? "completed" : "skipped";
      }
      await db
        .update(sequenceEnrollments)
        .set({ nextRunAt: nextRetryAt(now), updatedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id));
      return "deferred";
    }

    if (step.type === "message") return processMessageStep(enrollment, step, eventState.event, now);
    return processInternalStep(enrollment, sequence, step, eventState.event, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sequência";
    const id = enrollment.id;
    const step = await db
      .select({ id: sequenceSteps.id })
      .from(sequenceSteps)
      .where(
        and(eq(sequenceSteps.sequenceId, enrollment.sequenceId), eq(sequenceSteps.position, enrollment.currentStep)),
      )
      .limit(1);
    if (step[0]) {
      await db
        .update(sequenceEvents)
        .set({ status: "failed", detail: { error: message.slice(0, 500), retryAt: nextRetryAt(now).toISOString() } })
        .where(eq(sequenceEvents.idempotencyKey, sequenceEventKey(id, step[0].id)));
    }
    await db
      .update(sequenceEnrollments)
      .set({ nextRunAt: nextRetryAt(now), updatedAt: now, context: { ...enrollment.context, lastError: message.slice(0, 500) } })
      .where(eq(sequenceEnrollments.id, id));
    console.error(`[sequence-worker] enrollment=${id} failed: ${message}`);
    return "failed";
  }
}

export async function runReadySequenceEnrollments(limit = BATCH_SIZE): Promise<number> {
  let processed = 0;
  for (let i = 0; i < Math.max(1, limit); i += 1) {
    const result = await processOneSequenceEnrollment();
    if (result === "race_lost") break;
    processed += 1;
  }
  return processed;
}
