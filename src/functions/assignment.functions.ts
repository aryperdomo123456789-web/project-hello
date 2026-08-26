import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { assignmentEvents, conversations, memberships, queues } from "@/db/schema";
import { writeAudit } from "../server/audit.server";
import { requireRole, requireUser } from "../server/auth.server";

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const queueSettingsSchema = z.object({
  queueId: z.string().uuid(),
  strategy: z.enum(["least_load", "round_robin", "skill", "customer_history"]),
  slaFirstResponseMinutes: z.number().int().min(1).max(1440),
  requiredSkill: z.string().trim().max(80).optional(),
  businessHours: z.record(z.string(), z.object({ start: z.string(), end: z.string() })).optional(),
});

export type QueueDTO = {
  id: string;
  name: string;
  slug: string;
  strategy: string;
  slaFirstResponseMinutes: number;
};

export const listQueuesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select({
      id: queues.id,
      name: queues.name,
      slug: queues.slug,
      strategy: queues.strategy,
      slaFirstResponseMinutes: queues.slaFirstResponseMinutes,
    })
    .from(queues)
    .where(and(eq(queues.organizationId, user.organizationId), eq(queues.isActive, true)));
  return rows;
});
const transferSchema = z
  .object({
    conversationId: z.string().uuid(),
    assigneeId: z.string().uuid().nullable().optional(),
    queueId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(240).optional(),
  })
  .refine(
    (value) => value.assigneeId !== undefined || value.queueId !== undefined,
    "Informe atendente ou fila",
  );

async function assertMember(organizationId: string, userId: string) {
  const [member] = await db
    .select({ userId: memberships.userId, status: memberships.status })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);
  if (!member) throw new Error("Atendente não pertence à organização");
}

async function getConversation(organizationId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.organizationId, organizationId)),
    )
    .limit(1);
  if (!conversation) throw new Error("Conversa não encontrada");
  return conversation;
}

export const updateQueueSettingsFn = createServerFn({ method: "POST" })
  .validator(queueSettingsSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager", "supervisor");
    const [queue] = await db
      .select({ id: queues.id })
      .from(queues)
      .where(
        and(
          eq(queues.id, data.queueId),
          eq(queues.organizationId, user.organizationId),
          eq(queues.isActive, true),
        ),
      )
      .limit(1);
    if (!queue) throw new Error("Fila não encontrada");

    const settings: Record<string, unknown> = {};
    if (data.requiredSkill) settings["requiredSkill"] = data.requiredSkill;
    if (data.businessHours) settings["businessHours"] = data.businessHours;
    await db
      .update(queues)
      .set({
        strategy: data.strategy,
        slaFirstResponseMinutes: data.slaFirstResponseMinutes,
        settings,
      })
      .where(eq(queues.id, data.queueId));
    await writeAudit(user, {
      action: "queue.settings_updated",
      resourceType: "queue",
      resourceId: data.queueId,
      metadata: {
        strategy: data.strategy,
        slaFirstResponseMinutes: data.slaFirstResponseMinutes,
        hasBusinessHours: Boolean(data.businessHours),
      },
    });
    return { ok: true as const };
  });

export const claimConversationFn = createServerFn({ method: "POST" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [updated] = await db
      .update(conversations)
      .set({
        assigneeId: user.id,
        status: "in_progress",
        automationPausedAt: new Date(),
        version: sql`${conversations.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, user.organizationId),
          isNull(conversations.assigneeId),
          eq(conversations.status, "queued"),
        ),
      )
      .returning();

    if (!updated) throw new Error("Essa conversa já foi assumida por outro atendente");

    await db.insert(assignmentEvents).values({
      organizationId: user.organizationId,
      conversationId: updated.id,
      toUserId: user.id,
      toQueueId: updated.queueId,
      eventType: "claimed",
      actorUserId: user.id,
      reason: "Atendimento assumido",
    });
    await writeAudit(user, {
      action: "conversation.claimed",
      resourceType: "conversation",
      resourceId: updated.id,
      metadata: { queueId: updated.queueId },
    });

    return { ok: true as const, assigneeId: user.id };
  });

export const releaseConversationFn = createServerFn({ method: "POST" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const conversation = await getConversation(user.organizationId, data.conversationId);
    const canRelease =
      conversation.assigneeId === user.id ||
      ["owner", "admin", "manager", "supervisor"].includes(user.role);
    if (!canRelease) throw new Error("Sem permissão para devolver este atendimento");

    await db
      .update(conversations)
      .set({
        assigneeId: null,
        status: "queued",
        automationPausedAt: null,
        version: sql`${conversations.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));

    await db.insert(assignmentEvents).values({
      organizationId: user.organizationId,
      conversationId: conversation.id,
      fromUserId: conversation.assigneeId,
      fromQueueId: conversation.queueId,
      eventType: "released",
      actorUserId: user.id,
      reason: "Devolvido à fila",
    });
    await writeAudit(user, {
      action: "conversation.released",
      resourceType: "conversation",
      resourceId: conversation.id,
      metadata: { fromUserId: conversation.assigneeId, queueId: conversation.queueId },
    });

    return { ok: true as const };
  });

export const transferConversationFn = createServerFn({ method: "POST" })
  .validator(transferSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const conversation = await getConversation(user.organizationId, data.conversationId);

    if (data.assigneeId) await assertMember(user.organizationId, data.assigneeId);
    if (data.queueId) {
      const [queue] = await db
        .select({ id: queues.id })
        .from(queues)
        .where(
          and(
            eq(queues.id, data.queueId),
            eq(queues.organizationId, user.organizationId),
            eq(queues.isActive, true),
          ),
        )
        .limit(1);
      if (!queue) throw new Error("Fila não encontrada");
    }

    const [updated] = await db
      .update(conversations)
      .set({
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.queueId !== undefined ? { queueId: data.queueId } : {}),
        status: data.assigneeId ? "in_progress" : "queued",
        automationPausedAt: new Date(),
        version: sql`${conversations.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(conversations.id, conversation.id), eq(conversations.version, conversation.version)),
      )
      .returning();

    if (!updated)
      throw new Error("Conversa mudou durante a transferência; atualize e tente novamente");

    await db.insert(assignmentEvents).values({
      organizationId: user.organizationId,
      conversationId: conversation.id,
      fromUserId: conversation.assigneeId,
      toUserId: data.assigneeId ?? null,
      fromQueueId: conversation.queueId,
      toQueueId: data.queueId ?? null,
      eventType: "transferred",
      actorUserId: user.id,
      reason: data.reason ?? "Transferência manual",
    });
    await writeAudit(user, {
      action: "conversation.transferred",
      resourceType: "conversation",
      resourceId: conversation.id,
      metadata: {
        fromUserId: conversation.assigneeId,
        toUserId: data.assigneeId ?? null,
        fromQueueId: conversation.queueId,
        toQueueId: data.queueId ?? null,
      },
    });

    return {
      ok: true as const,
      assigneeId: data.assigneeId ?? null,
      queueId: data.queueId ?? null,
    };
  });

export const resolveConversationFn = createServerFn({ method: "POST" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const conversation = await getConversation(user.organizationId, data.conversationId);
    const canResolve =
      conversation.assigneeId === user.id ||
      ["owner", "admin", "manager", "supervisor"].includes(user.role);
    if (!canResolve) throw new Error("Sem permissão para resolver este atendimento");

    await db
      .update(conversations)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
        automationPausedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(conversations.id, conversation.id), eq(conversations.version, conversation.version)),
      );

    await db.insert(assignmentEvents).values({
      organizationId: user.organizationId,
      conversationId: conversation.id,
      fromUserId: conversation.assigneeId,
      fromQueueId: conversation.queueId,
      eventType: "resolved",
      actorUserId: user.id,
      reason: "Atendimento resolvido",
    });
    await writeAudit(user, {
      action: "conversation.resolved",
      resourceType: "conversation",
      resourceId: conversation.id,
      metadata: { fromUserId: conversation.assigneeId, queueId: conversation.queueId },
    });

    return { ok: true as const };
  });

export const resumeAutomationFn = createServerFn({ method: "POST" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const conversation = await getConversation(user.organizationId, data.conversationId);
    if (
      conversation.assigneeId !== user.id &&
      !["owner", "admin", "manager", "supervisor"].includes(user.role)
    ) {
      throw new Error("Sem permissão para retomar a automação");
    }

    await db
      .update(conversations)
      .set({ automationPausedAt: null, status: "waiting_customer", updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));

    return { ok: true as const };
  });
