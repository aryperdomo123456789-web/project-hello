import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, max } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import {
  contacts,
  conversations,
  memberships,
  queues,
  ticketEvents,
  tickets,
  users,
} from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole, requireUser } from "@/server/auth.server";

const ticketStatus = z.enum(["open", "pending", "in_progress", "resolved", "closed"]);
const category = z.string().trim().min(1).max(80);

const listSchema = z.object({
  status: ticketStatus.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const createSchema = z.object({
  conversationId: z.string().uuid(),
  subject: z.string().trim().min(3).max(180),
  category,
  priority: z.number().int().min(0).max(4).default(0),
  slaMinutes: z.number().int().min(1).max(10080).default(1440),
});

const updateSchema = z.object({
  ticketId: z.string().uuid(),
  status: ticketStatus.optional(),
  category: category.optional(),
  priority: z.number().int().min(0).max(4).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  queueId: z.string().uuid().nullable().optional(),
});

export type TicketDTO = {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: number;
  status: string;
  contactId: string;
  conversationId: string | null;
  contactName: string;
  queueName: string | null;
  assigneeName: string | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toTicketDTO(row: {
  id: string;
  number: number;
  subject: string;
  category: string;
  priority: number;
  status: string;
  contactId: string;
  conversationId: string | null;
  contactName: string;
  queueName: string | null;
  assigneeName: string | null;
  slaDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TicketDTO {
  return {
    id: row.id,
    number: row.number,
    subject: row.subject,
    category: row.category,
    priority: row.priority,
    status: row.status,
    contactId: row.contactId,
    conversationId: row.conversationId,
    contactName: row.contactName,
    queueName: row.queueName,
    assigneeName: row.assigneeName,
    slaDueAt: row.slaDueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ticketSelection = {
  id: tickets.id,
  number: tickets.number,
  subject: tickets.subject,
  category: tickets.category,
  priority: tickets.priority,
  status: tickets.status,
  contactId: tickets.contactId,
  conversationId: tickets.conversationId,
  contactName: contacts.name,
  queueName: queues.name,
  assigneeName: users.fullName,
  slaDueAt: tickets.slaDueAt,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
};

export const listTicketsFn = createServerFn({ method: "GET" })
  .validator(listSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const conditions = [eq(tickets.organizationId, user.organizationId)];
    if (data.status) conditions.push(eq(tickets.status, data.status));
    const rows = await db
      .select(ticketSelection)
      .from(tickets)
      .innerJoin(contacts, eq(contacts.id, tickets.contactId))
      .leftJoin(queues, eq(queues.id, tickets.queueId))
      .leftJoin(users, eq(users.id, tickets.assigneeId))
      .where(and(...conditions))
      .orderBy(desc(tickets.priority), desc(tickets.updatedAt))
      .limit(data.limit);
    return rows.map(toTicketDTO) satisfies TicketDTO[];
  });

export const createTicketFn = createServerFn({ method: "POST" })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const actor = await requireUser();
    const [conversation] = await db
      .select({
        id: conversations.id,
        contactId: conversations.contactId,
        queueId: conversations.queueId,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!conversation) throw new Error("Conversa não encontrada");

    const [last] = await db
      .select({ number: max(tickets.number) })
      .from(tickets)
      .where(eq(tickets.organizationId, actor.organizationId));
    const number = Number(last?.number ?? 0) + 1;
    const [ticket] = await db
      .insert(tickets)
      .values({
        organizationId: actor.organizationId,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        queueId: conversation.queueId,
        number,
        subject: data.subject,
        category: data.category,
        priority: data.priority,
        slaDueAt: new Date(Date.now() + data.slaMinutes * 60_000),
        createdBy: actor.id,
      })
      .returning({ id: tickets.id, number: tickets.number });
    if (!ticket) throw new Error("Não foi possível criar o ticket");

    await db.insert(ticketEvents).values({
      organizationId: actor.organizationId,
      ticketId: ticket.id,
      actorUserId: actor.id,
      eventType: "created",
      toValue: "open",
      metadata: { category: data.category, priority: data.priority },
    });
    await writeAudit(actor, {
      action: "ticket.created",
      resourceType: "ticket",
      resourceId: ticket.id,
      metadata: { number: ticket.number, conversationId: data.conversationId },
    });
    return ticket;
  });

export const updateTicketFn = createServerFn({ method: "POST" })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager", "supervisor", "agent");
    const [current] = await db
      .select({
        id: tickets.id,
        organizationId: tickets.organizationId,
        status: tickets.status,
        category: tickets.category,
        priority: tickets.priority,
        assigneeId: tickets.assigneeId,
        queueId: tickets.queueId,
      })
      .from(tickets)
      .where(and(eq(tickets.id, data.ticketId), eq(tickets.organizationId, actor.organizationId)))
      .limit(1);
    if (!current) throw new Error("Ticket não encontrado");

    if (data.assigneeId) {
      const [member] = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(
          memberships,
          and(
            eq(memberships.userId, users.id),
            eq(memberships.organizationId, actor.organizationId),
            eq(memberships.status, "active"),
          ),
        )
        .where(eq(users.id, data.assigneeId))
        .limit(1);
      if (!member) throw new Error("Responsável não pertence à organização");
    }

    const nextValues: Partial<typeof tickets.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (data.status !== undefined) nextValues.status = data.status;
    if (data.category !== undefined) nextValues.category = data.category;
    if (data.priority !== undefined) nextValues.priority = data.priority;
    if (data.assigneeId !== undefined) nextValues.assigneeId = data.assigneeId;
    if (data.queueId !== undefined) nextValues.queueId = data.queueId;

    const [updated] = await db
      .update(tickets)
      .set(nextValues)
      .where(and(eq(tickets.id, data.ticketId), eq(tickets.organizationId, actor.organizationId)))
      .returning({
        id: tickets.id,
        status: tickets.status,
        category: tickets.category,
        priority: tickets.priority,
      });
    if (!updated) throw new Error("Não foi possível atualizar o ticket");

    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];
    for (const [field, before, after] of [
      ["status", current.status, data.status],
      ["category", current.category, data.category],
      ["priority", String(current.priority), data.priority?.toString()],
      ["assigneeId", current.assigneeId, data.assigneeId ?? undefined],
      ["queueId", current.queueId, data.queueId ?? undefined],
    ] as const) {
      if (after !== undefined && String(before ?? "") !== String(after ?? "")) {
        changes.push({ field, from: before, to: String(after) });
      }
    }
    if (changes.length) {
      await db.insert(ticketEvents).values(
        changes.map((change) => ({
          organizationId: actor.organizationId,
          ticketId: data.ticketId,
          actorUserId: actor.id,
          eventType: change.field,
          fromValue: change.from,
          toValue: change.to,
        })),
      );
    }
    await writeAudit(actor, {
      action: "ticket.updated",
      resourceType: "ticket",
      resourceId: data.ticketId,
      metadata: { changes },
    });
    return updated;
  });
