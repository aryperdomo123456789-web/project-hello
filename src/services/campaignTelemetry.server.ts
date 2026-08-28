import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db/client.server";
import { campaignRecipients, campaigns, internalTeamMessages, memberships } from "@/db/schema";

export type CampaignTelemetryRow = {
  campaignId: string;
  name: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  optedOut: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
  optOutRate: number;
};

export type CampaignTelemetryDTO = {
  generatedAt: string;
  summary: Omit<CampaignTelemetryRow, "campaignId" | "name">;
  campaigns: CampaignTelemetryRow[];
};

function percentage(value: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((value / denominator) * 10_000) / 100;
}

export function buildTelemetryRow(
  campaignId: string,
  name: string,
  counts: Map<string, number>,
): CampaignTelemetryRow {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const queued = (counts.get("pending") ?? 0) + (counts.get("processing") ?? 0);
  const read = counts.get("read") ?? 0;
  const delivered = (counts.get("delivered") ?? 0) + read;
  const sent = (counts.get("sent") ?? 0) + delivered;
  const failed = counts.get("failed") ?? 0;
  const optedOut = counts.get("opted_out") ?? 0;
  return {
    campaignId,
    name,
    total,
    queued,
    sent,
    delivered,
    read,
    failed,
    optedOut,
    deliveryRate: percentage(delivered, sent),
    readRate: percentage(read, delivered),
    failureRate: percentage(failed, total),
    optOutRate: percentage(optedOut, total),
  };
}

export async function getCampaignTelemetry(
  organizationId: string,
  campaignId?: string,
): Promise<CampaignTelemetryDTO> {
  const campaignRows = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        ...(campaignId ? [eq(campaigns.id, campaignId)] : []),
      ),
    )
    .orderBy(asc(campaigns.createdAt));

  if (!campaignRows.length) {
    const empty = buildTelemetryRow("summary", "Resumo", new Map());
    const { campaignId: _campaignId, name: _name, ...summary } = empty;
    return { generatedAt: new Date().toISOString(), summary, campaigns: [] };
  }

  const campaignIds = campaignRows.map((row) => row.id);
  const grouped = await db
    .select({
      campaignId: campaignRecipients.campaignId,
      status: campaignRecipients.status,
      lastError: campaignRecipients.lastError,
      total: count(),
    })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.organizationId, organizationId),
        inArray(campaignRecipients.campaignId, campaignIds),
      ),
    )
    .groupBy(
      campaignRecipients.campaignId,
      campaignRecipients.status,
      campaignRecipients.lastError,
    );

  const rows = campaignRows.map((campaign) => {
    const counts = new Map<string, number>();
    for (const group of grouped) {
      if (group.campaignId !== campaign.id) continue;
      const key =
        group.status === "skipped" && group.lastError === "opted_out" ? "opted_out" : group.status;
      counts.set(key, (counts.get(key) ?? 0) + Number(group.total));
    }
    return buildTelemetryRow(campaign.id, campaign.name, counts);
  });

  const summaryCounts = new Map<string, number>();
  for (const group of grouped) {
    const key =
      group.status === "skipped" && group.lastError === "opted_out" ? "opted_out" : group.status;
    summaryCounts.set(key, (summaryCounts.get(key) ?? 0) + Number(group.total));
  }
  const summaryRow = buildTelemetryRow("summary", "Resumo", summaryCounts);
  const { campaignId: _campaignId, name: _name, ...summary } = summaryRow;
  return { generatedAt: new Date().toISOString(), summary, campaigns: rows };
}

export async function openCampaignCircuit(
  organizationId: string,
  channelConnectionId: string,
  reason: string,
) {
  const now = new Date();
  const safeReason = reason.slice(0, 500);
  const affected = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(campaigns.channelConnectionId, channelConnectionId),
        inArray(campaigns.status, ["running", "scheduled"]),
        ne(campaigns.circuitState, "open"),
      ),
    );
  if (!affected.length) return { paused: 0, alerted: 0 };

  await db
    .update(campaigns)
    .set({
      status: "paused",
      circuitState: "open",
      circuitOpenedAt: now,
      circuitReason: safeReason,
      lastError: safeReason,
      updatedAt: now,
    })
    .where(
      and(
        eq(campaigns.organizationId, organizationId),
        eq(campaigns.channelConnectionId, channelConnectionId),
        inArray(
          campaigns.id,
          affected.map((campaign) => campaign.id),
        ),
      ),
    );

  const recipients = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
        inArray(memberships.role, ["owner", "admin", "manager"]),
      ),
    )
    .orderBy(asc(memberships.createdAt));
  const author = recipients[0]?.userId;
  if (!author) {
    console.warn(`[campaign-circuit] organização sem owner/admin para alerta: ${organizationId}`);
    return { paused: affected.length, alerted: 0 };
  }

  const body = `[CIRCUIT_BREAKER] Canal ${channelConnectionId} offline. ${affected.length} campanha(s) pausada(s). Motivo: ${safeReason}`;
  await db.insert(internalTeamMessages).values(
    recipients.map(({ userId }) => ({
      organizationId,
      authorUserId: author,
      recipientUserId: userId,
      body,
    })),
  );
  console.warn(`[campaign-circuit] ${body}`);
  return { paused: affected.length, alerted: recipients.length };
}
