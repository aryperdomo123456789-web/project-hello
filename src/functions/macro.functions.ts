import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { quickReplies } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole, requireUser } from "@/server/auth.server";

const macroIdSchema = z.object({ id: z.string().uuid() });
const macroFields = z.object({
  name: z.string().trim().min(2).max(120),
  shortcut: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9._-]{0,39}$/, "Atalho inválido"),
  body: z.string().trim().min(1).max(4000),
  category: z.string().trim().min(2).max(80).default("geral"),
});
const createMacroSchema = macroFields;
const updateMacroSchema = macroIdSchema.merge(macroFields.partial());
const archiveMacroSchema = macroIdSchema.extend({ isActive: z.boolean() });

export type MacroDTO = {
  id: string;
  name: string;
  shortcut: string;
  body: string;
  category: string;
  isActive: boolean;
  updatedAt: string;
};

function toDTO(row: typeof quickReplies.$inferSelect): MacroDTO {
  return {
    id: row.id,
    name: row.name,
    shortcut: row.shortcut,
    body: row.body,
    category: row.category,
    isActive: row.isActive,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const listMacrosFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(quickReplies)
    .where(eq(quickReplies.organizationId, user.organizationId))
    .orderBy(asc(quickReplies.category), asc(quickReplies.name));
  return rows.map(toDTO);
});

export const createMacroFn = createServerFn({ method: "POST" })
  .validator(createMacroSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [row] = await db
      .insert(quickReplies)
      .values({
        organizationId: user.organizationId,
        ...data,
        createdBy: user.id,
      })
      .returning();
    if (!row) throw new Error("Não foi possível criar a macro");
    await writeAudit(user, {
      action: "macro.created",
      resourceType: "quick_reply",
      resourceId: row.id,
      metadata: { shortcut: row.shortcut, category: row.category },
    });
    return toDTO(row);
  });

export const updateMacroFn = createServerFn({ method: "POST" })
  .validator(updateMacroSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const { id, ...changes } = data;
    const [row] = await db
      .update(quickReplies)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(quickReplies.id, id), eq(quickReplies.organizationId, user.organizationId)))
      .returning();
    if (!row) throw new Error("Macro não encontrada");
    await writeAudit(user, {
      action: "macro.updated",
      resourceType: "quick_reply",
      resourceId: row.id,
      metadata: { changedFields: Object.keys(changes) },
    });
    return toDTO(row);
  });

export const archiveMacroFn = createServerFn({ method: "POST" })
  .validator(archiveMacroSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [row] = await db
      .update(quickReplies)
      .set({ isActive: data.isActive, updatedAt: new Date() })
      .where(
        and(eq(quickReplies.id, data.id), eq(quickReplies.organizationId, user.organizationId)),
      )
      .returning();
    if (!row) throw new Error("Macro não encontrada");
    await writeAudit(user, {
      action: data.isActive ? "macro.restored" : "macro.archived",
      resourceType: "quick_reply",
      resourceId: row.id,
      metadata: { isActive: data.isActive },
    });
    return toDTO(row);
  });
