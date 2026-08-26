import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { conversationQualityReviews, conversations, messages } from "@/db/schema";
import { requireRole, requireUser } from "@/server/auth.server";
import { writeAudit } from "@/server/audit.server";
import { reviewConversation } from "@/services/qualityEngine.server";

const reviewSchema = z.object({ conversationId: z.string().uuid() });

export type QualityReviewDTO = {
  id: string;
  conversationId: string;
  score: number;
  sentiment: string;
  intent: string;
  summary: string;
  policyViolations: string[];
  recommendations: string[];
  source: string;
  updatedAt: string;
};

function toDTO(row: typeof conversationQualityReviews.$inferSelect): QualityReviewDTO {
  return {
    id: row.id,
    conversationId: row.conversationId,
    score: row.score,
    sentiment: row.sentiment,
    intent: row.intent,
    summary: row.summary,
    policyViolations: row.policyViolations,
    recommendations: row.recommendations,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const reviewConversationFn = createServerFn({ method: "POST" })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const actor = await requireRole("owner", "admin", "manager", "supervisor");
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, actor.organizationId),
        ),
      )
      .limit(1);
    if (!conversation) throw new Error("Conversa não encontrada");

    const rows = await db
      .select({ direction: messages.direction, text: messages.text })
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, actor.organizationId),
          eq(messages.conversationId, data.conversationId),
        ),
      )
      .orderBy(asc(messages.sentAt))
      .limit(40);
    const result = reviewConversation(
      rows.map((row) => ({
        sender: row.direction === "inbound" ? ("contact" as const) : ("me" as const),
        text: row.text ?? "",
      })),
    );

    const [saved] = await db
      .insert(conversationQualityReviews)
      .values({
        organizationId: actor.organizationId,
        conversationId: data.conversationId,
        reviewerUserId: actor.id,
        source: "rules",
        score: result.score,
        sentiment: result.sentiment,
        intent: result.intent,
        summary: result.summary,
        policyViolations: result.policyViolations,
        recommendations: result.recommendations,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: conversationQualityReviews.conversationId,
        set: {
          reviewerUserId: actor.id,
          score: result.score,
          sentiment: result.sentiment,
          intent: result.intent,
          summary: result.summary,
          policyViolations: result.policyViolations,
          recommendations: result.recommendations,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!saved) throw new Error("Não foi possível salvar a avaliação");

    await writeAudit(actor, {
      action: "conversation.quality_reviewed",
      resourceType: "conversation",
      resourceId: data.conversationId,
      metadata: { score: result.score, sentiment: result.sentiment },
    });
    return toDTO(saved);
  });

export const getQualityReviewFn = createServerFn({ method: "GET" })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [review] = await db
      .select()
      .from(conversationQualityReviews)
      .innerJoin(
        conversations,
        and(
          eq(conversations.id, conversationQualityReviews.conversationId),
          eq(conversations.organizationId, user.organizationId),
        ),
      )
      .where(
        and(
          eq(conversationQualityReviews.conversationId, data.conversationId),
          eq(conversationQualityReviews.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    return review ? toDTO(review.conversation_quality_reviews) : null;
  });
