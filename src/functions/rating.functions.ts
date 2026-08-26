import { createServerFn } from "@tanstack/react-start";
import { and, avg, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { conversationRatings, conversations } from "@/db/schema";
import { writeAudit } from "@/server/audit.server";
import { requireUser } from "@/server/auth.server";

const submitRatingSchema = z.object({
  conversationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
  source: z.enum(["customer", "operator"]).default("operator"),
});

const ratingMetricsSchema = z.object({ days: z.number().int().min(1).max(365).default(30) });

export type RatingMetricsDTO = {
  total: number;
  average: number;
  distribution: Record<string, number>;
};

export const submitConversationRatingFn = createServerFn({ method: "POST" })
  .validator(submitRatingSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [conversation] = await db
      .select({ id: conversations.id, status: conversations.status })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!conversation) throw new Error("Conversa não encontrada");
    if (!["resolved", "closed"].includes(conversation.status))
      throw new Error("Avalie apenas uma conversa resolvida");

    const [rating] = await db
      .insert(conversationRatings)
      .values({
        organizationId: user.organizationId,
        conversationId: data.conversationId,
        rating: data.rating,
        comment: data.comment || null,
        source: data.source,
      })
      .onConflictDoUpdate({
        target: conversationRatings.conversationId,
        set: { rating: data.rating, comment: data.comment || null, source: data.source },
      })
      .returning({ id: conversationRatings.id, rating: conversationRatings.rating });
    if (!rating) throw new Error("Não foi possível registrar a avaliação");
    await writeAudit(user, {
      action: "conversation.rating_submitted",
      resourceType: "conversation_rating",
      resourceId: rating.id,
      metadata: { conversationId: data.conversationId, rating: data.rating, source: data.source },
    });
    return { ok: true as const, rating: rating.rating };
  });

export const getRatingMetricsFn = createServerFn({ method: "GET" })
  .validator(ratingMetricsSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const [summary] = await db
      .select({ total: count(), average: avg(conversationRatings.rating) })
      .from(conversationRatings)
      .where(
        and(
          eq(conversationRatings.organizationId, user.organizationId),
          gte(conversationRatings.createdAt, since),
        ),
      );
    const distributionRows = await db
      .select({ rating: conversationRatings.rating, total: count() })
      .from(conversationRatings)
      .where(
        and(
          eq(conversationRatings.organizationId, user.organizationId),
          gte(conversationRatings.createdAt, since),
        ),
      )
      .groupBy(conversationRatings.rating);
    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of distributionRows) distribution[String(row.rating)] = Number(row.total);
    return {
      total: Number(summary?.total ?? 0),
      average: Number(summary?.average ?? 0),
      distribution,
    } satisfies RatingMetricsDTO;
  });
