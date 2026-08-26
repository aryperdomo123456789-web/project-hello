import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { contacts, sequenceEnrollments, sequenceSteps, sequences } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole, requireUser } from "@/server/auth.server";

const stepSchema = z.object({
  position: z.number().int().min(0).max(99),
  delayMinutes: z.number().int().min(0).max(43_200).default(0),
  type: z.enum(["message", "task", "tag", "handoff"]),
  body: z.string().trim().max(4_000).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});
const createSequenceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  trigger: z
    .enum(["manual", "tag_added", "ticket_resolved", "conversation_resolved"])
    .default("manual"),
  steps: z.array(stepSchema).min(1).max(20),
});
const sequenceIdSchema = z.object({ id: z.string().uuid() });
const statusSchema = sequenceIdSchema.extend({
  status: z.enum(["draft", "active", "paused", "archived"]),
});
const enrollSchema = z.object({
  sequenceId: z.string().uuid(),
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
});

export type SequenceDTO = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  trigger: string;
  createdAt: string;
  steps: Array<{
    id: string;
    position: number;
    delayMinutes: number;
    type: string;
    body: string | null;
    config: string;
  }>;
};

export const listSequencesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(sequences)
    .where(eq(sequences.organizationId, user.organizationId))
    .orderBy(asc(sequences.createdAt));
  const result: SequenceDTO[] = [];
  for (const sequence of rows) {
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.organizationId, user.organizationId),
          eq(sequenceSteps.sequenceId, sequence.id),
        ),
      )
      .orderBy(asc(sequenceSteps.position));
    result.push({
      id: sequence.id,
      name: sequence.name,
      description: sequence.description,
      status: sequence.status,
      trigger: sequence.trigger,
      createdAt: sequence.createdAt.toISOString(),
      steps: steps.map((step) => ({
        id: step.id,
        position: step.position,
        delayMinutes: step.delayMinutes,
        type: step.type,
        body: step.body,
        config: JSON.stringify(step.config),
      })),
    });
  }
  return result;
});

export const createSequenceFn = createServerFn({ method: "POST" })
  .validator(createSequenceSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const result = await db.transaction(async (tx) => {
      const [sequence] = await tx
        .insert(sequences)
        .values({
          organizationId: user.organizationId,
          name: data.name,
          description: data.description,
          trigger: data.trigger,
          createdBy: user.id,
        })
        .returning();
      if (!sequence) throw new Error("Não foi possível criar a sequência");
      const steps = await tx
        .insert(sequenceSteps)
        .values(
          data.steps.map((step) => ({
            organizationId: user.organizationId,
            sequenceId: sequence.id,
            position: step.position,
            delayMinutes: step.delayMinutes,
            type: step.type,
            body: step.body,
            config: step.config,
          })),
        )
        .returning();
      return { sequence, steps };
    });
    await writeAudit(user, {
      action: "sequence.created",
      resourceType: "sequence",
      resourceId: result.sequence.id,
      metadata: { stepCount: result.steps.length, trigger: data.trigger },
    });
    return { id: result.sequence.id };
  });

export const setSequenceStatusFn = createServerFn({ method: "POST" })
  .validator(statusSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [sequence] = await db
      .update(sequences)
      .set({ status: data.status, updatedAt: new Date() })
      .where(and(eq(sequences.id, data.id), eq(sequences.organizationId, user.organizationId)))
      .returning({ id: sequences.id, status: sequences.status });
    if (!sequence) throw new Error("Sequência não encontrada");
    await writeAudit(user, {
      action: "sequence.status_changed",
      resourceType: "sequence",
      resourceId: sequence.id,
      metadata: { status: data.status },
    });
    return sequence;
  });

export const enrollContactFn = createServerFn({ method: "POST" })
  .validator(enrollSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager", "supervisor", "agent");
    const [sequence] = await db
      .select({ id: sequences.id, status: sequences.status })
      .from(sequences)
      .where(
        and(eq(sequences.id, data.sequenceId), eq(sequences.organizationId, user.organizationId)),
      )
      .limit(1);
    if (!sequence || sequence.status !== "active") throw new Error("Sequência não está ativa");
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.organizationId, user.organizationId)))
      .limit(1);
    if (!contact) throw new Error("Contato não encontrado");
    const [firstStep] = await db
      .select({ delayMinutes: sequenceSteps.delayMinutes })
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.sequenceId, data.sequenceId),
          eq(sequenceSteps.organizationId, user.organizationId),
        ),
      )
      .orderBy(asc(sequenceSteps.position))
      .limit(1);
    const nextRunAt = new Date(Date.now() + (firstStep?.delayMinutes ?? 0) * 60_000);
    const [enrollment] = await db
      .insert(sequenceEnrollments)
      .values({
        organizationId: user.organizationId,
        sequenceId: data.sequenceId,
        contactId: data.contactId,
        conversationId: data.conversationId,
        nextRunAt,
      })
      .onConflictDoNothing({
        target: [sequenceEnrollments.sequenceId, sequenceEnrollments.contactId],
      })
      .returning({ id: sequenceEnrollments.id, nextRunAt: sequenceEnrollments.nextRunAt });
    if (!enrollment) throw new Error("Contato já está inscrito ou não pode ser inscrito");
    await writeAudit(user, {
      action: "sequence.contact_enrolled",
      resourceType: "sequence_enrollment",
      resourceId: enrollment.id,
      metadata: { sequenceId: data.sequenceId, contactId: data.contactId },
    });
    return { id: enrollment.id, nextRunAt: enrollment.nextRunAt?.toISOString() ?? null };
  });

export const previewSequenceFn = createServerFn({ method: "GET" })
  .validator(sequenceIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [sequence] = await db
      .select({ id: sequences.id, name: sequences.name, status: sequences.status })
      .from(sequences)
      .where(and(eq(sequences.id, data.id), eq(sequences.organizationId, user.organizationId)))
      .limit(1);
    if (!sequence) throw new Error("Sequência não encontrada");
    const steps = await db
      .select({
        position: sequenceSteps.position,
        delayMinutes: sequenceSteps.delayMinutes,
        type: sequenceSteps.type,
        body: sequenceSteps.body,
      })
      .from(sequenceSteps)
      .where(
        and(
          eq(sequenceSteps.sequenceId, data.id),
          eq(sequenceSteps.organizationId, user.organizationId),
        ),
      )
      .orderBy(asc(sequenceSteps.position));
    let cursor = new Date();
    return {
      ...sequence,
      steps: steps.map((step) => {
        cursor = new Date(cursor.getTime() + step.delayMinutes * 60_000);
        return { ...step, scheduledAt: cursor.toISOString() };
      }),
    };
  });
