import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { contactTasks, contacts, conversations, memberships } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireUser } from "@/server/auth.server";

const taskIdSchema = z.object({ taskId: z.string().uuid() });
const taskInputSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(240),
  dueAt: z.string().datetime().optional(),
  assignedTo: z.string().uuid().optional(),
});

export type ContactTaskDTO = {
  id: string;
  contactId: string;
  conversationId: string | null;
  title: string;
  status: string;
  dueAt: string | null;
  assignedTo: string | null;
  createdAt: string;
};

export const listOpenTasksFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select({
      id: contactTasks.id,
      contactId: contactTasks.contactId,
      conversationId: contactTasks.conversationId,
      title: contactTasks.title,
      status: contactTasks.status,
      dueAt: contactTasks.dueAt,
      assignedTo: contactTasks.assignedTo,
      createdAt: contactTasks.createdAt,
    })
    .from(contactTasks)
    .where(
      and(eq(contactTasks.organizationId, user.organizationId), eq(contactTasks.status, "open")),
    )
    .orderBy(asc(contactTasks.dueAt), asc(contactTasks.createdAt));
  return rows.map(toTaskDTO) satisfies ContactTaskDTO[];
});

export const listContactTasksFn = createServerFn({ method: "GET" })
  .validator(z.object({ contactId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const rows = await db
      .select({
        id: contactTasks.id,
        contactId: contactTasks.contactId,
        conversationId: contactTasks.conversationId,
        title: contactTasks.title,
        status: contactTasks.status,
        dueAt: contactTasks.dueAt,
        assignedTo: contactTasks.assignedTo,
        createdAt: contactTasks.createdAt,
      })
      .from(contactTasks)
      .where(
        and(
          eq(contactTasks.organizationId, user.organizationId),
          eq(contactTasks.contactId, data.contactId),
        ),
      )
      .orderBy(asc(contactTasks.status), asc(contactTasks.dueAt));
    return rows.map(toTaskDTO) satisfies ContactTaskDTO[];
  });

export const createContactTaskFn = createServerFn({ method: "POST" })
  .validator(taskInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.organizationId, user.organizationId)))
      .limit(1);
    if (!contact) throw new Error("Contato não encontrado");

    if (data.conversationId) {
      const [conversation] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, data.conversationId),
            eq(conversations.organizationId, user.organizationId),
            eq(conversations.contactId, data.contactId),
          ),
        )
        .limit(1);
      if (!conversation) throw new Error("Conversa não encontrada para este contato");
    }

    if (data.assignedTo) {
      const [member] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, user.organizationId),
            eq(memberships.userId, data.assignedTo),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      if (!member) throw new Error("Responsável não pertence à organização");
    }

    const [task] = await db
      .insert(contactTasks)
      .values({
        organizationId: user.organizationId,
        contactId: data.contactId,
        ...(data.conversationId ? { conversationId: data.conversationId } : {}),
        title: data.title,
        ...(data.dueAt ? { dueAt: new Date(data.dueAt) } : {}),
        ...(data.assignedTo ? { assignedTo: data.assignedTo } : {}),
        createdBy: user.id,
      })
      .returning();
    if (!task) throw new Error("Não foi possível criar a tarefa");
    await writeAudit(user, {
      action: "crm.task_created",
      resourceType: "contact_task",
      resourceId: task.id,
      metadata: { contactId: task.contactId, hasDueAt: Boolean(task.dueAt) },
    });
    return toTaskDTO(task);
  });

export const completeContactTaskFn = createServerFn({ method: "POST" })
  .validator(taskIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [task] = await db
      .update(contactTasks)
      .set({ status: "completed", updatedAt: new Date() })
      .where(
        and(
          eq(contactTasks.id, data.taskId),
          eq(contactTasks.organizationId, user.organizationId),
          eq(contactTasks.status, "open"),
        ),
      )
      .returning({ id: contactTasks.id });
    if (!task) throw new Error("Tarefa aberta não encontrada");
    await writeAudit(user, {
      action: "crm.task_completed",
      resourceType: "contact_task",
      resourceId: task.id,
    });
    return { ok: true as const };
  });

type TaskRow = Pick<
  typeof contactTasks.$inferSelect,
  "id" | "contactId" | "conversationId" | "title" | "status" | "dueAt" | "assignedTo" | "createdAt"
>;

function toTaskDTO(row: TaskRow): ContactTaskDTO {
  return {
    id: row.id,
    contactId: row.contactId,
    conversationId: row.conversationId,
    title: row.title,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt.toISOString(),
  };
}
