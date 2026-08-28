import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import {
  campaignRecipients,
  campaigns,
  channelConnections,
  contactPolicies,
  contacts,
} from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { enqueueCampaign } from "@/queue/jobs.server";
import { requireRole, requireUser } from "@/server/auth.server";
import {
  getCampaignTelemetry,
  type CampaignTelemetryDTO,
} from "@/services/campaignTelemetry.server";

export type { CampaignTelemetryDTO } from "@/services/campaignTelemetry.server";

const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  messageTemplate: z.string().trim().min(1).max(4000),
  contactIds: z.array(z.string().uuid()).min(1).max(1000),
  channelConnectionId: z.string().uuid(),
  scheduledAt: z.string().datetime().optional(),
  dailyLimit: z.number().int().min(1).max(10000).default(100),
  frequencyHours: z.number().int().min(1).max(720).default(24),
  rateLimitPerMinute: z.number().int().min(1).max(60).default(10),
  sendWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("08:00"),
  sendWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("20:00"),
  timezone: z.string().min(1).max(64).default("America/Sao_Paulo"),
});

const campaignIdSchema = z.object({ campaignId: z.string().uuid() });
const simulateCampaignSchema = campaignIdSchema.extend({ now: z.string().datetime().optional() });
const telemetrySchema = z.object({ campaignId: z.string().uuid().optional() });
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
  channelConnectionId: string | null;
  scheduledAt: string | null;
  dailyLimit: number;
  frequencyHours: number;
  rateLimitPerMinute: number;
  sendWindowStart: string;
  sendWindowEnd: string;
  timezone: string;
  queuedCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  completedAt: string | null;
  circuitState: string;
  circuitOpenedAt: string | null;
  circuitReason: string | null;
  createdAt: string;
};

function toCampaignDto(row: typeof campaigns.$inferSelect): CampaignDTO {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    messageTemplate: row.messageTemplate,
    channelConnectionId: row.channelConnectionId,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    dailyLimit: row.dailyLimit,
    frequencyHours: row.frequencyHours,
    rateLimitPerMinute: row.rateLimitPerMinute,
    sendWindowStart: row.sendWindowStart,
    sendWindowEnd: row.sendWindowEnd,
    timezone: row.timezone,
    queuedCount: row.queuedCount,
    sentCount: row.sentCount,
    deliveredCount: row.deliveredCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    completedAt: row.completedAt?.toISOString() ?? null,
    circuitState: row.circuitState,
    circuitOpenedAt: row.circuitOpenedAt?.toISOString() ?? null,
    circuitReason: row.circuitReason,
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

export const getCampaignTelemetryFn = createServerFn({ method: "GET" })
  .validator(telemetrySchema)
  .handler(async ({ data }): Promise<CampaignTelemetryDTO> => {
    const user = await requireUser();
    return getCampaignTelemetry(user.organizationId, data.campaignId);
  });

export const createCampaignFn = createServerFn({ method: "POST" })
  .validator(createCampaignSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const uniqueContactIds = [...new Set(data.contactIds)];
    const [channel] = await db
      .select({ id: channelConnections.id })
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, data.channelConnectionId),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!channel) throw new Error("Canal da campanha não pertence à organização");
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
          channelConnectionId: data.channelConnectionId,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          dailyLimit: data.dailyLimit,
          frequencyHours: data.frequencyHours,
          rateLimitPerMinute: data.rateLimitPerMinute,
          sendWindowStart: data.sendWindowStart,
          sendWindowEnd: data.sendWindowEnd,
          timezone: data.timezone,
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
      metadata: {
        recipients: uniqueContactIds.length,
        channelConnectionId: campaign.channelConnectionId,
        mode: "queued_broadcast",
      },
    });
    if (campaign.scheduledAt) {
      await enqueueCampaign(campaign.id, Math.max(0, campaign.scheduledAt.getTime() - Date.now()));
    }
    return toCampaignDto(campaign);
  });

export const startCampaignFn = createServerFn({ method: "POST" })
  .validator(campaignIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(
        and(eq(campaigns.id, data.campaignId), eq(campaigns.organizationId, user.organizationId)),
      )
      .limit(1);
    if (!campaign) throw new Error("Campanha não encontrada");
    if (["completed", "failed"].includes(campaign.status)) {
      throw new Error("Campanha finalizada não pode ser reiniciada; duplique-a para novo disparo");
    }
    if (!campaign.channelConnectionId) {
      throw new Error(
        "Campanha antiga sem canal: edite ou recrie a campanha com um canal explícito",
      );
    }
    const now = new Date();
    if (campaign.scheduledAt && campaign.scheduledAt > now) {
      throw new Error("A campanha ainda está agendada para o futuro");
    }
    const [running] = await db
      .update(campaigns)
      .set({
        status: "running",
        startedAt: campaign.startedAt ?? now,
        lastError: null,
        circuitState: "closed",
        circuitOpenedAt: null,
        circuitReason: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(campaigns.id, campaign.id),
          eq(campaigns.organizationId, user.organizationId),
          inArray(campaigns.status, ["draft", "scheduled", "paused", "running"]),
        ),
      )
      .returning();
    if (!running) throw new Error("Não foi possível iniciar a campanha");
    await enqueueCampaign(running.id);
    await writeAudit(user, {
      action: "campaign.started",
      resourceType: "campaign",
      resourceId: running.id,
      metadata: { channelConnectionId: running.channelConnectionId },
    });
    return toCampaignDto(running);
  });

export const pauseCampaignFn = createServerFn({ method: "POST" })
  .validator(campaignIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const [paused] = await db
      .update(campaigns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(eq(campaigns.id, data.campaignId), eq(campaigns.organizationId, user.organizationId)),
      )
      .returning();
    if (!paused) throw new Error("Campanha não encontrada");
    await writeAudit(user, {
      action: "campaign.paused",
      resourceType: "campaign",
      resourceId: paused.id,
      metadata: {},
    });
    return toCampaignDto(paused);
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
