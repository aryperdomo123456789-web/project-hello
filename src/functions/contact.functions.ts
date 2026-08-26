import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { contacts } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole, requireUser } from "@/server/auth.server";

const contactIdSchema = z.object({ contactId: z.string().uuid() });
const updateContactSchema = contactIdSchema.extend({
  name: z.string().trim().min(1).max(160).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

const importRowSchema = z.object({
  waId: z.string().trim().min(3).max(80),
  phone: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  email: z.string().email().max(255).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  attributes: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
});

const importContactsSchema = z.object({ rows: z.array(importRowSchema).min(1).max(1000) });

type SerializableAttribute = string | number | boolean | null;

type SerializableAttributes = Record<string, SerializableAttribute>;

export type ContactCRMDTO = {
  id: string;
  waId: string;
  phone: string | null;
  name: string;
  email: string | null;
  tags: string[];
  attributes: SerializableAttributes;
  createdAt: string;
  updatedAt: string;
};

function toAttributes(value: unknown): SerializableAttributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: SerializableAttributes = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = item;
    }
  }
  return result;
}

function toDto(row: typeof contacts.$inferSelect): ContactCRMDTO {
  return {
    id: row.id,
    waId: row.waId,
    phone: row.phone,
    name: row.name,
    email: row.email,
    tags: Array.isArray(row.tags) ? row.tags : [],
    attributes: toAttributes(row.attributes),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const listContactsCRMFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, user.organizationId))
    .orderBy(asc(contacts.name))
    .limit(1000);
  return rows.map(toDto);
});

export const updateContactFn = createServerFn({ method: "POST" })
  .validator(updateContactSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const values = {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.tags !== undefined ? { tags: data.tags } : {}),
      ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
      updatedAt: new Date(),
    };
    const [contact] = await db
      .update(contacts)
      .set(values)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.organizationId, user.organizationId)))
      .returning();
    if (!contact) throw new Error("Contato não encontrado");
    await writeAudit(user, {
      action: "contact.updated",
      resourceType: "contact",
      resourceId: contact.id,
      metadata: { fields: Object.keys(values).filter((field) => field !== "updatedAt") },
    });
    return toDto(contact);
  });

export const importContactsFn = createServerFn({ method: "POST" })
  .validator(importContactsSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const rows = await db.transaction(async (tx) => {
      const result: ContactCRMDTO[] = [];
      for (const row of data.rows) {
        const [contact] = await tx
          .insert(contacts)
          .values({
            organizationId: user.organizationId,
            waId: row.waId,
            phone: row.phone ?? null,
            name: row.name ?? "Contato importado",
            email: row.email ?? null,
            tags: row.tags ?? [],
            attributes: row.attributes ?? {},
          })
          .onConflictDoUpdate({
            target: [contacts.organizationId, contacts.waId],
            set: {
              phone: row.phone ?? null,
              name: row.name ?? "Contato importado",
              email: row.email ?? null,
              tags: row.tags ?? [],
              attributes: row.attributes ?? {},
              updatedAt: new Date(),
            },
          })
          .returning();
        if (contact) result.push(toDto(contact));
      }
      return result;
    });
    await writeAudit(user, {
      action: "contacts.imported",
      resourceType: "contact_batch",
      metadata: { count: rows.length },
    });
    return { imported: rows.length, contacts: rows };
  });
