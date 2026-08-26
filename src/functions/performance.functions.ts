import { createServerFn } from "@tanstack/react-start";
import { and, asc, count, eq, gte, lte, avg } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import {
  contacts,
  conversationQualityReviews,
  conversations,
  conversionEvents,
  marketingSpend,
  memberships,
  users,
} from "@/db/schema";
import { requireRole } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";

const dateSchema = z.string().datetime({ offset: true });
const conversionSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  eventType: z.enum(["won", "qualified", "lost", "refund"]).default("won"),
  source: z.string().trim().min(1).max(100).default("manual"),
  revenueCents: z.number().int().min(0).max(2_000_000_000).default(0),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .default("BRL"),
  occurredAt: dateSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const spendSchema = z.object({
  source: z.string().trim().min(1).max(100),
  amountCents: z.number().int().min(0).max(2_000_000_000),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .default("BRL"),
  periodStart: dateSchema,
  periodEnd: dateSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const analyticsSchema = z.object({ days: z.number().int().min(1).max(365).default(30) });

export type PerformanceAnalyticsDTO = {
  period: { since: string; until: string; days: number };
  conversion: {
    totalEvents: number;
    wonEvents: number;
    revenueCents: number;
    spendCents: number;
    roiPercent: number | null;
    bySource: Array<{
      source: string;
      conversions: number;
      revenueCents: number;
      spendCents: number;
      roiPercent: number | null;
    }>;
  };
  quality: Array<{
    userId: string;
    agentName: string;
    role: string;
    reviews: number;
    averageScore: number;
  }>;
};

function inPeriod(column: typeof conversionEvents.occurredAt, since: Date, until: Date) {
  return and(gte(column, since), lte(column, until));
}

export const createConversionEventFn = createServerFn({ method: "POST" })
  .validator(conversionSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager", "supervisor", "agent");
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.id, data.contactId), eq(contacts.organizationId, actor.organizationId)),
      )
      .limit(1);
    if (!contact) throw new Error("Contato não encontrado nesta organização");
    if (data.conversationId) {
      const [conversation] = await db
        .select({ id: conversations.id, contactId: conversations.contactId })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, data.conversationId),
            eq(conversations.organizationId, actor.organizationId),
          ),
        )
        .limit(1);
      if (!conversation || conversation.contactId !== data.contactId)
        throw new Error("Conversa não pertence ao contato informado");
    }
    const [created] = await db
      .insert(conversionEvents)
      .values({
        organizationId: actor.organizationId,
        contactId: data.contactId,
        ...(data.conversationId ? { conversationId: data.conversationId } : {}),
        eventType: data.eventType,
        source: data.source,
        revenueCents: data.revenueCents,
        currency: data.currency,
        occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
        metadata: data.metadata,
        createdBy: actor.id,
      })
      .returning({ id: conversionEvents.id });
    if (!created) throw new Error("Não foi possível registrar a conversão");
    await writeAudit(actor, {
      action: "conversion.created",
      resourceType: "conversion_event",
      resourceId: created.id,
      metadata: {
        eventType: data.eventType,
        source: data.source,
        revenueCents: data.revenueCents,
        currency: data.currency,
      },
    });
    return { id: created.id };
  });

export const createMarketingSpendFn = createServerFn({ method: "POST" })
  .validator(spendSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager");
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    if (periodEnd < periodStart) throw new Error("Período de custo inválido");
    const [created] = await db
      .insert(marketingSpend)
      .values({
        organizationId: actor.organizationId,
        source: data.source,
        amountCents: data.amountCents,
        currency: data.currency,
        periodStart,
        periodEnd,
        metadata: data.metadata,
        createdBy: actor.id,
      })
      .returning({ id: marketingSpend.id });
    if (!created) throw new Error("Não foi possível registrar o custo de marketing");
    await writeAudit(actor, {
      action: "marketing_spend.created",
      resourceType: "marketing_spend",
      resourceId: created.id,
      metadata: {
        source: data.source,
        amountCents: data.amountCents,
        currency: data.currency,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
      },
    });
    return { id: created.id };
  });

export const getPerformanceAnalyticsFn = createServerFn({ method: "GET" })
  .validator(analyticsSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager", "supervisor");
    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const [conversions, spendRows, qualityRows] = await Promise.all([
      db
        .select({
          eventType: conversionEvents.eventType,
          source: conversionEvents.source,
          revenueCents: conversionEvents.revenueCents,
        })
        .from(conversionEvents)
        .where(
          and(
            eq(conversionEvents.organizationId, actor.organizationId),
            inPeriod(conversionEvents.occurredAt, since, until),
          ),
        )
        .orderBy(asc(conversionEvents.occurredAt)),
      db
        .select({
          source: marketingSpend.source,
          amountCents: marketingSpend.amountCents,
        })
        .from(marketingSpend)
        .where(
          and(
            eq(marketingSpend.organizationId, actor.organizationId),
            lte(marketingSpend.periodStart, until),
            gte(marketingSpend.periodEnd, since),
          ),
        )
        .orderBy(asc(marketingSpend.periodStart)),
      db
        .select({
          userId: users.id,
          agentName: users.fullName,
          role: memberships.role,
          reviews: count(conversationQualityReviews.id),
          averageScore: avg(conversationQualityReviews.score),
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(
          conversations,
          and(
            eq(conversations.organizationId, actor.organizationId),
            eq(conversations.assigneeId, users.id),
          ),
        )
        .leftJoin(
          conversationQualityReviews,
          and(
            eq(conversationQualityReviews.organizationId, actor.organizationId),
            eq(conversationQualityReviews.conversationId, conversations.id),
            and(
              gte(conversationQualityReviews.createdAt, since),
              lte(conversationQualityReviews.createdAt, until),
            ),
          ),
        )
        .where(
          and(
            eq(memberships.organizationId, actor.organizationId),
            eq(memberships.status, "active"),
          ),
        )
        .groupBy(users.id, users.fullName, memberships.role)
        .orderBy(asc(users.fullName)),
    ]);

    const sourceMap = new Map<
      string,
      { conversions: number; revenueCents: number; spendCents: number }
    >();
    for (const event of conversions) {
      const entry = sourceMap.get(event.source) ?? {
        conversions: 0,
        revenueCents: 0,
        spendCents: 0,
      };
      if (event.eventType === "won") {
        entry.conversions += 1;
        entry.revenueCents += event.revenueCents;
      }
      sourceMap.set(event.source, entry);
    }
    for (const spend of spendRows) {
      const entry = sourceMap.get(spend.source) ?? {
        conversions: 0,
        revenueCents: 0,
        spendCents: 0,
      };
      entry.spendCents += spend.amountCents;
      sourceMap.set(spend.source, entry);
    }

    const totalRevenue = conversions
      .filter((event) => event.eventType === "won")
      .reduce((sum, event) => sum + event.revenueCents, 0);
    const totalSpend = spendRows.reduce((sum, row) => sum + row.amountCents, 0);
    const bySource = [...sourceMap.entries()]
      .map(([source, value]) => ({
        source,
        ...value,
        roiPercent:
          value.spendCents > 0
            ? Math.round(((value.revenueCents - value.spendCents) / value.spendCents) * 1000) / 10
            : null,
      }))
      .sort((left, right) => right.revenueCents - left.revenueCents);

    return {
      period: { since: since.toISOString(), until: until.toISOString(), days: data.days },
      conversion: {
        totalEvents: conversions.length,
        wonEvents: conversions.filter((event) => event.eventType === "won").length,
        revenueCents: totalRevenue,
        spendCents: totalSpend,
        roiPercent:
          totalSpend > 0
            ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 1000) / 10
            : null,
        bySource,
      },
      quality: qualityRows.map((row) => ({
        userId: row.userId,
        agentName: row.agentName,
        role: row.role,
        reviews: Number(row.reviews),
        averageScore: Number(row.averageScore ?? 0),
      })),
    } satisfies PerformanceAnalyticsDTO;
  });
