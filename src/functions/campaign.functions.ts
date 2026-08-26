import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { campaignRecipients, campaigns, contactPolicies, contacts } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireRole, requireUser } from "@/server/auth.server";

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  messageTemplate: z.string().trim().min(1).max(4000),
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
  dailyLimit: z.number().int().min(1).max(10000).default(100),
  frequencyHours: z.number().int().min(1).max(720).default(24),
});

const campaignIdSchema = z.object({ campaignId: z.string().uuid() });
const simulateCampaignSchema = campaignIdSchema.extend({ now: z.string().datetime().optional() });
const contactPolicySchema = z.object({
  contactId: z.string().uuid(),
  optedOut: z.boolean().optional(),
  quietUntil: z.string().datetime().nullable().optional(),
  frequencyHours: z.number().int().min(1).max(720).optional(),
});

export type CampaignDTO = {
  id: string;
  name: string;
  status: string;
  messageTemplate: string;
  scheduledAt: string | null;
  dailyLimit: number;
  frequencyHours: number;
  createdAt: string;
};

function toCampaignDto(row: typeof campaigns.$inferSelect): CampaignDTO {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    messageTemplate: row.messageTemplate,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    dailyLimit: row.dailyLimit,
    frequencyHours: row.frequencyHours,
    createdAt: row.createdAt.toISOString(),
  };
}

export const listCampaignsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.organizationId, user.organizationId))
    .orderBy(asc(campaigns.createdAt));
  return rows.map(toCampaignDto);
});

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(createCampaignSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const uniqueContactIds = [...new Set(data.contactIds)];
    const allowedContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.organizationId, user.organizationId),
          inArray(contacts.id, uniqueContactIds),
        ),
      );
    if (allowedContacts.length !== uniqueContactIds.length)
      throw new Error("Um ou mais contatos não pertencem à organização");

    const campaign = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(campaigns)
        .values({
          organizationId: user.organizationId,
          name: data.name,
          messageTemplate: data.messageTemplate,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          dailyLimit: data.dailyLimit,
          frequencyHours: data.frequencyHours,
          status: data.scheduledAt ? "scheduled" : "draft",
          createdBy: user.id,
        })
        .returning();
      if (!created) throw new Error("Não foi possível criar a campanha");
      await tx.insert(campaignRecipients).values(
        uniqueContactIds.map((contactId) => ({
          organizationId: user.organizationId,
          campaignId: created.id,
          contactId,
          status: "pending",
        })),
      );
      return created;
    });
    await writeAudit(user, {
      action: "campaign.created",
      resourceType: "campaign",
      resourceId: campaign.id,
      metadata: { recipients: uniqueContactIds.length, sandboxOnly: true },
    });
    return toCampaignDto(campaign);
  });

export const updateContactPolicyFn = createServerFn({ method: "POST" })
  .validator(contactPolicySchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, data.contactId), eq(contacts.organizationId, user.organizationId)))
      .limit(1);
    if (!contact) throw new Error("Contato não encontrado");
    const [policy] = await db
      .insert(contactPolicies)
      .values({
        organizationId: user.organizationId,
        contactId: data.contactId,
        optedOut: data.optedOut ?? false,
        quietUntil: data.quietUntil ? new Date(data.quietUntil) : null,
        frequencyHours: data.frequencyHours ?? 24,
      })
      .onConflictDoUpdate({
        target: [contactPolicies.organizationId, contactPolicies.contactId],
        set: {
          ...(data.optedOut !== undefined ? { optedOut: data.optedOut } : {}),
          ...(data.quietUntil !== undefined
            ? { quietUntil: data.quietUntil ? new Date(data.quietUntil) : null }
            : {}),
          ...(data.frequencyHours !== undefined ? { frequencyHours: data.frequencyHours } : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!policy) throw new Error("Não foi possível atualizar a política do contato");
    await writeAudit(user, {
      action: "contact.policy_updated",
      resourceType: "contact_policy",
      resourceId: policy.id,
      metadata: { contactId: data.contactId, optedOut: policy.optedOut },
    });
    return {
      id: policy.id,
      contactId: policy.contactId,
      optedOut: policy.optedOut,
      quietUntil: policy.quietUntil?.toISOString() ?? null,
      frequencyHours: policy.frequencyHours,
    };
  });

export const simulateCampaignFn = createServerFn({ method: "POST" })
  .validator(simulateCampaignSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, data.campaignId), eq(campaigns.organizationId, user.organizationId)),
      )
      .limit(1);
    if (!campaign) throw new Error("Campanha não encontrada");
    const now = data.now ? new Date(data.now) : new Date();
    const rows = await db
      .select({
        recipient: campaignRecipients,
        contact: contacts,
        policy: contactPolicies,
      })
      .from(campaignRecipients)
      .innerJoin(contacts, eq(contacts.id, campaignRecipients.contactId))
      .leftJoin(
        contactPolicies,
        and(
          eq(contactPolicies.contactId, campaignRecipients.contactId),
          eq(contactPolicies.organizationId, user.organizationId),
        ),
      )
      .where(
        and(
          eq(campaignRecipients.campaignId, campaign.id),
          eq(campaignRecipients.organizationId, user.organizationId),
        ),
      )
      .orderBy(asc(campaignRecipients.createdAt));

    const eligible = rows.filter(
      ({ recipient, policy }) =>
        recipient.status === "pending" &&
        !policy?.optedOut &&
        (!policy?.quietUntil || policy.quietUntil <= now) &&
        (!recipient.nextEligibleAt || recipient.nextEligibleAt <= now),
    );
    const planned = eligible.slice(0, campaign.dailyLimit).map(({ recipient, contact }) => ({
      recipientId: recipient.id,
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone ?? contact.waId,
      message: campaign.messageTemplate
        .replaceAll("{{name}}", contact.name)
        .replaceAll("{{phone}}", contact.phone ?? contact.waId),
    }));
    const skipped = rows.length - planned.length;
    return {
      campaign: toCampaignDto(campaign),
      now: now.toISOString(),
      totalRecipients: rows.length,
      eligible: planned.length,
      skipped,
      blockedByOptOut: rows.filter(({ policy }) => policy?.optedOut).length,
      preview: planned,
      mode: "sandbox" as const,
    };
  });
