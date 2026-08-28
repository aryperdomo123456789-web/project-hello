import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { contactBlacklist, contactPolicies, contacts } from "@/db/schema";
import { normalizePhoneE164, markContactOptedOut } from "@/services/contactGovernance.server";
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
const blacklistEntrySchema = z.object({
  phone: z.string().trim().min(3).max(40),
  reason: z.string().trim().min(1).max(240).default("manual"),
  expiresAt: z.string().datetime().nullable().optional(),
});
const blacklistImportSchema = z.object({
  rows: z.array(blacklistEntrySchema).min(1).max(5000),
});
const blacklistIdSchema = z.object({ id: z.string().uuid() });

type SerializableAttribute = string | number | boolean | null;

type SerializableAttributes = Record<string, SerializableAttribute>;

export type ContactBlacklistDTO = {
  id: string;
  phoneE164: string;
  reason: string;
  bannedAt: string;
  expiresAt: string | null;
};

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

function toBlacklistDto(row: typeof contactBlacklist.$inferSelect): ContactBlacklistDTO {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    reason: row.reason,
    bannedAt: row.bannedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
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

export const listBlacklistFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(contactBlacklist)
    .where(eq(contactBlacklist.organizationId, user.organizationId))
    .orderBy(asc(contactBlacklist.bannedAt));
  return rows.map(toBlacklistDto);
});

export const addBlacklistEntryFn = createServerFn({ method: "POST" })
  .validator(blacklistEntrySchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const phoneE164 = normalizePhoneE164(data.phone);
    const [row] = await db
      .insert(contactBlacklist)
      .values({
        organizationId: user.organizationId,
        phoneE164,
        reason: data.reason,
        ...(data.expiresAt !== undefined
          ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }
          : {}),
      })
      .onConflictDoUpdate({
        target: [contactBlacklist.organizationId, contactBlacklist.phoneE164],
        set: {
          reason: data.reason,
          bannedAt: new Date(),
          ...(data.expiresAt !== undefined
            ? { expiresAt: data.expiresAt ? new Date(data.expiresAt) : null }
            : {}),
        },
      })
      .returning();
    if (!row) throw new Error("Não foi possível adicionar número à blacklist");
    await writeAudit(user, {
      action: "contact.blacklisted",
      resourceType: "contact_blacklist",
      resourceId: row.id,
      metadata: { phoneE164, reason: row.reason },
    });
    return toBlacklistDto(row);
  });

export const importBlacklistFn = createServerFn({ method: "POST" })
  .validator(blacklistImportSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const rows = await db.transaction(async (tx) => {
      const result: ContactBlacklistDTO[] = [];
      for (const item of data.rows) {
        const phoneE164 = normalizePhoneE164(item.phone);
        const [row] = await tx
          .insert(contactBlacklist)
          .values({
            organizationId: user.organizationId,
            phoneE164,
            reason: item.reason,
            ...(item.expiresAt !== undefined
              ? { expiresAt: item.expiresAt ? new Date(item.expiresAt) : null }
              : {}),
          })
          .onConflictDoUpdate({
            target: [contactBlacklist.organizationId, contactBlacklist.phoneE164],
            set: {
              reason: item.reason,
              bannedAt: new Date(),
              ...(item.expiresAt !== undefined
                ? { expiresAt: item.expiresAt ? new Date(item.expiresAt) : null }
                : {}),
            },
          })
          .returning();
        if (row) result.push(toBlacklistDto(row));
      }
      return result;
    });
    await writeAudit(user, {
      action: "contacts.blacklist_imported",
      resourceType: "contact_blacklist_batch",
      metadata: { count: rows.length },
    });
    return { imported: rows.length, entries: rows };
  });

export const removeBlacklistEntryFn = createServerFn({ method: "POST" })
  .validator(blacklistIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [removed] = await db
      .delete(contactBlacklist)
      .where(
        and(
          eq(contactBlacklist.id, data.id),
          eq(contactBlacklist.organizationId, user.organizationId),
        ),
      )
      .returning();
    if (!removed) throw new Error("Número não encontrado na blacklist");
    await writeAudit(user, {
      action: "contact.unblacklisted",
      resourceType: "contact_blacklist",
      resourceId: removed.id,
      metadata: { phoneE164: removed.phoneE164 },
    });
    return { ok: true as const };
  });

export const setContactOptOutFn = createServerFn({ method: "POST" })
  .validator(contactIdSchema.extend({ optedOut: z.boolean() }))
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    if (data.optedOut) {
      await markContactOptedOut(user.organizationId, data.contactId);
    } else {
      await db
        .insert(contactPolicies)
        .values({ organizationId: user.organizationId, contactId: data.contactId, optedOut: false })
        .onConflictDoUpdate({
          target: [contactPolicies.organizationId, contactPolicies.contactId],
          set: { optedOut: false, updatedAt: new Date() },
        });
    }
    return { ok: true as const };
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
