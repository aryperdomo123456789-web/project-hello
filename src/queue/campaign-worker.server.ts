import { and, asc, count, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  campaignRecipients,
  campaigns,
  channelConnections,
  contactPolicies,
  contacts,
  conversations,
  messages,
} from "@/db/schema";
import { sendChatOutbound } from "@/services/magoBotOutbound.server";
import { getRedisConnection } from "./redis.server";
import {
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_MAX_ATTEMPTS,
  campaignIdempotencyKey,
  campaignDailyLimitRetryDelayMs,
  campaignRateLimitRetryDelayMs,
  campaignRetryDelayMs,
  campaignWindowRetryDelayMs,
  canConsumeCampaignRateLimit,
  isWithinCampaignWindow,
  renderCampaignMessage,
  shouldDeferCampaignContact,
} from "./campaignPolicy.server";
import { enqueueCampaign } from "./jobs.server";

const STALE_PROCESSING_MS = 15 * 60_000;

type CampaignCandidate = {
  recipient: typeof campaignRecipients.$inferSelect;
  contact: typeof contacts.$inferSelect;
  policy: typeof contactPolicies.$inferSelect | null;
};

async function acquireCampaignRateLimit(campaignId: string, limitPerMinute: number) {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const key = `mago:campaign-rate:${campaignId}:${minuteBucket}`;
  const redis = getRedisConnection();
  const currentCount = await redis.incr(key);
  if (currentCount === 1) await redis.expire(key, 70);
  return canConsumeCampaignRateLimit(currentCount, limitPerMinute);
}

async function incrementCampaignMetric(
  campaignId: string,
  metric: "queuedCount" | "sentCount" | "deliveredCount" | "failedCount" | "skippedCount",
) {
  await db
    .update(campaigns)
    .set({ [metric]: sql`${campaigns[metric]} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
}

async function getCampaign(campaignId: string) {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  return campaign;
}

async function getCampaignConnection(
  campaign: typeof campaigns.$inferSelect,
  channelConnectionId: string,
) {
  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, channelConnectionId),
        eq(channelConnections.organizationId, campaign.organizationId),
      ),
    )
    .limit(1);
  return connection;
}

async function recoverStaleRecipients(campaignId: string, now: Date) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  await db
    .update(campaignRecipients)
    .set({ status: "pending", processingAt: null, updatedAt: now })
    .where(
      and(
        eq(campaignRecipients.campaignId, campaignId),
        eq(campaignRecipients.status, "processing"),
        lte(campaignRecipients.processingAt, staleBefore),
      ),
    );
}

async function listCandidates(campaign: typeof campaigns.$inferSelect, now: Date) {
  return db
    .select({
      recipient: campaignRecipients,
      contact: contacts,
      policy: contactPolicies,
    })
    .from(campaignRecipients)
    .innerJoin(
      contacts,
      and(
        eq(contacts.id, campaignRecipients.contactId),
        eq(contacts.organizationId, campaign.organizationId),
      ),
    )
    .leftJoin(
      contactPolicies,
      and(
        eq(contactPolicies.contactId, campaignRecipients.contactId),
        eq(contactPolicies.organizationId, campaign.organizationId),
      ),
    )
    .where(
      and(
        eq(campaignRecipients.campaignId, campaign.id),
        eq(campaignRecipients.organizationId, campaign.organizationId),
        inArray(campaignRecipients.status, ["pending", "failed"]),
        lt(campaignRecipients.attempts, CAMPAIGN_MAX_ATTEMPTS),
        or(isNull(campaignRecipients.nextEligibleAt), lte(campaignRecipients.nextEligibleAt, now)),
      ),
    )
    .orderBy(asc(campaignRecipients.createdAt))
    .limit(CAMPAIGN_BATCH_SIZE * 2);
}

async function claimRecipient(recipientId: string, now: Date) {
  const [claimed] = await db
    .update(campaignRecipients)
    .set({
      status: "processing",
      attempts: sql`${campaignRecipients.attempts} + 1`,
      processingAt: now,
      updatedAt: now,
      lastError: null,
    })
    .where(
      and(
        eq(campaignRecipients.id, recipientId),
        inArray(campaignRecipients.status, ["pending", "failed"]),
      ),
    )
    .returning();
  return claimed;
}

async function findOrCreateConversation(
  organizationId: string,
  channelConnectionId: string,
  contactId: string,
  now: Date,
) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.channelConnectionId, channelConnectionId),
        eq(conversations.contactId, contactId),
      ),
    )
    .orderBy(sql`${conversations.updatedAt} DESC`)
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(conversations)
    .values({
      organizationId,
      channelConnectionId,
      contactId,
      status: "queued",
      lastMessageAt: now,
      updatedAt: now,
    })
    .returning();
  if (!created) throw new Error("Não foi possível criar a conversa da campanha");
  return created;
}

async function markRecipientSkipped(
  campaignId: string,
  recipientId: string,
  reason: string,
  now: Date,
  nextEligibleAt?: Date,
) {
  await db
    .update(campaignRecipients)
    .set({
      status: nextEligibleAt ? "pending" : "skipped",
      lastError: reason,
      nextEligibleAt: nextEligibleAt ?? null,
      processingAt: null,
      updatedAt: now,
    })
    .where(eq(campaignRecipients.id, recipientId));
  if (!nextEligibleAt) await incrementCampaignMetric(campaignId, "skippedCount");
}

async function processCandidate(
  campaign: typeof campaigns.$inferSelect,
  connection: NonNullable<Awaited<ReturnType<typeof getCampaignConnection>>>,
  candidate: CampaignCandidate,
  now: Date,
) {
  const policyDecision = shouldDeferCampaignContact(now, candidate.policy);
  if (policyDecision.defer) {
    await markRecipientSkipped(
      campaign.id,
      candidate.recipient.id,
      policyDecision.reason ?? "policy",
      now,
      policyDecision.nextEligibleAt,
    );
    return "deferred" as const;
  }

  const phone = candidate.contact.phone ?? candidate.contact.waId;
  if (!phone) {
    await markRecipientSkipped(campaign.id, candidate.recipient.id, "phone_missing", now);
    return "skipped" as const;
  }

  if (!(await acquireCampaignRateLimit(campaign.id, campaign.rateLimitPerMinute))) {
    return "rate_limited" as const;
  }

  const claimed = await claimRecipient(candidate.recipient.id, now);
  if (!claimed) return "race_lost" as const;

  const idempotencyKey = campaignIdempotencyKey(campaign.id, claimed.id, claimed.attempts);
  await db
    .update(campaignRecipients)
    .set({ lastIdempotencyKey: idempotencyKey, updatedAt: now })
    .where(eq(campaignRecipients.id, claimed.id));
  await incrementCampaignMetric(campaign.id, "queuedCount");

  try {
    const conversation = await findOrCreateConversation(
      campaign.organizationId,
      connection.id,
      candidate.contact.id,
      now,
    );
    const result = await sendChatOutbound({
      organizationId: campaign.organizationId,
      conversationId: conversation.id,
      connectionId: connection.id,
      providerInstanceId: connection.providerInstanceId,
      apiResourceId: connection.apiResourceId,
      apiProjectId: connection.apiProjectId,
      recipient: phone,
      text: renderCampaignMessage(campaign.messageTemplate, candidate.contact.name, phone),
      idempotencyKey,
    });
    if (result.status === "failed") throw new Error("Gateway recusou o disparo da campanha");

    await db.transaction(async (tx) => {
      await tx
        .insert(messages)
        .values({
          organizationId: campaign.organizationId,
          conversationId: conversation.id,
          channelConnectionId: connection.id,
          ...(result.externalId ? { externalId: result.externalId } : {}),
          ...(result.apiMessageId ? { apiMessageId: result.apiMessageId } : {}),
          ...(result.apiProviderMessageId
            ? { apiProviderMessageId: result.apiProviderMessageId }
            : {}),
          ...(result.lastApiRequestId ? { lastApiRequestId: result.lastApiRequestId } : {}),
          clientMessageId: idempotencyKey,
          direction: "outbound",
          status: result.status,
          type: "text",
          text: renderCampaignMessage(campaign.messageTemplate, candidate.contact.name, phone),
          payload: {
            source: "campaign-broadcast",
            campaignId: campaign.id,
            recipientId: claimed.id,
          },
        })
        .onConflictDoNothing();
      await tx
        .update(campaignRecipients)
        .set({
          status: result.status === "delivered" ? "delivered" : "sent",
          apiMessageId: result.apiMessageId ?? null,
          apiProviderMessageId: result.apiProviderMessageId ?? null,
          lastApiRequestId: result.lastApiRequestId ?? null,
          lastSentAt: now,
          processingAt: null,
          nextEligibleAt: null,
          updatedAt: now,
          lastError: null,
        })
        .where(eq(campaignRecipients.id, claimed.id));
      await tx
        .update(campaigns)
        .set({
          dailySentCount: sql`${campaigns.dailySentCount} + 1`,
          dailySentAt: now,
          updatedAt: now,
        })
        .where(eq(campaigns.id, campaign.id));
      await tx
        .update(conversations)
        .set({ lastMessageAt: now, updatedAt: now, status: "in_progress" })
        .where(eq(conversations.id, conversation.id));
      await tx
        .insert(contactPolicies)
        .values({
          organizationId: campaign.organizationId,
          contactId: candidate.contact.id,
          lastContactAt: now,
        })
        .onConflictDoUpdate({
          target: [contactPolicies.organizationId, contactPolicies.contactId],
          set: { lastContactAt: now, updatedAt: now },
        });
    });
    await incrementCampaignMetric(
      campaign.id,
      result.status === "delivered" ? "deliveredCount" : "sentCount",
    );
    return "sent" as const;
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 500) : "Falha no disparo";
    const retryAt =
      claimed.attempts < CAMPAIGN_MAX_ATTEMPTS
        ? new Date(now.getTime() + campaignRetryDelayMs(claimed.attempts))
        : null;
    await db
      .update(campaignRecipients)
      .set({
        status: retryAt ? "failed" : "failed",
        lastError,
        nextEligibleAt: retryAt,
        processingAt: null,
        updatedAt: new Date(),
      })
      .where(eq(campaignRecipients.id, claimed.id));
    if (!retryAt) await incrementCampaignMetric(campaign.id, "failedCount");
    return "failed" as const;
  }
}

function isSameUtcDay(left: Date | null, right: Date) {
  if (!left) return false;
  return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
}

async function resetDailyCounter(campaign: typeof campaigns.$inferSelect, now: Date) {
  if (isSameUtcDay(campaign.dailySentAt, now)) return campaign;
  await db
    .update(campaigns)
    .set({ dailySentCount: 0, dailySentAt: now, updatedAt: now })
    .where(eq(campaigns.id, campaign.id));
  return { ...campaign, dailySentCount: 0, dailySentAt: now };
}

async function hasPendingRecipients(campaignId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.campaignId, campaignId),
        inArray(campaignRecipients.status, ["pending", "failed", "processing"]),
        lt(campaignRecipients.attempts, CAMPAIGN_MAX_ATTEMPTS),
      ),
    );
  return Number(row?.value ?? 0) > 0;
}

async function nextPendingAt(campaignId: string) {
  const [row] = await db
    .select({ nextEligibleAt: campaignRecipients.nextEligibleAt })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.campaignId, campaignId),
        eq(campaignRecipients.status, "pending"),
        lte(campaignRecipients.attempts, CAMPAIGN_MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(campaignRecipients.nextEligibleAt))
    .limit(1);
  return row?.nextEligibleAt ?? null;
}

export async function processCampaign(campaignId: string) {
  let campaign = await getCampaign(campaignId);
  if (!campaign) return { status: "missing" as const };
  const now = new Date();
  if (campaign.status === "scheduled") {
    if (campaign.scheduledAt && campaign.scheduledAt > now) {
      await enqueueCampaign(campaign.id, campaign.scheduledAt.getTime() - now.getTime());
      return { status: "scheduled" as const };
    }
    const [started] = await db
      .update(campaigns)
      .set({ status: "running", startedAt: now, updatedAt: now })
      .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "scheduled")))
      .returning();
    if (!started) return { status: "paused" as const };
    campaign = started;
  }
  if (campaign.status !== "running") return { status: "paused" as const };

  if (!campaign.channelConnectionId) {
    await db
      .update(campaigns)
      .set({ status: "failed", lastError: "Campanha sem canal explícito", updatedAt: new Date() })
      .where(eq(campaigns.id, campaign.id));
    return { status: "missing_channel" as const };
  }

  const channelConnectionId = campaign.channelConnectionId;
  const dailyCampaign = await resetDailyCounter(campaign, now);
  if (
    !isWithinCampaignWindow(
      now,
      dailyCampaign.sendWindowStart,
      dailyCampaign.sendWindowEnd,
      dailyCampaign.timezone,
    )
  ) {
    const delay = campaignWindowRetryDelayMs(
      now,
      dailyCampaign.timezone,
      dailyCampaign.sendWindowStart,
    );
    await enqueueCampaign(campaign.id, delay);
    return { status: "outside_window" as const, delay };
  }

  const connection = await getCampaignConnection(dailyCampaign, channelConnectionId);
  if (!connection) throw new Error("Canal da campanha não encontrado");
  if (connection.status !== "connected") {
    await db
      .update(campaigns)
      .set({ status: "failed", lastError: "Canal não está conectado", updatedAt: now })
      .where(eq(campaigns.id, campaign.id));
    return { status: "channel_not_connected" as const };
  }

  await recoverStaleRecipients(dailyCampaign.id, now);
  const candidates = await listCandidates(dailyCampaign, now);
  let processed = 0;
  let sentThisRun = 0;
  for (const candidate of candidates) {
    if (processed >= CAMPAIGN_BATCH_SIZE) break;
    if (dailyCampaign.dailySentCount + sentThisRun >= dailyCampaign.dailyLimit) break;
    const result = await processCandidate(dailyCampaign, connection, candidate, new Date());
    if (result === "rate_limited") break;
    if (result === "sent") sentThisRun += 1;
    if (result !== "deferred" && result !== "race_lost") processed += 1;
  }

  if (await hasPendingRecipients(campaign.id)) {
    const nextAt = await nextPendingAt(campaign.id);
    const delay =
      dailyCampaign.dailySentCount + sentThisRun >= dailyCampaign.dailyLimit
        ? campaignDailyLimitRetryDelayMs()
        : candidates.length > 0 && processed === 0
          ? campaignRateLimitRetryDelayMs()
          : nextAt
            ? Math.max(1_000, nextAt.getTime() - Date.now())
            : 1_000;
    await enqueueCampaign(campaign.id, delay);
    return { status: "scheduled_next" as const, processed, delay };
  }

  await db
    .update(campaigns)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(campaigns.id, campaign.id), eq(campaigns.status, "running")));
  return { status: "completed" as const, processed };
}
