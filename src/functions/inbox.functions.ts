import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { conversationNotes, conversations, quickReplies, users } from "@/db/schema";
import { requireUser } from "@/server/auth.server";

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const createNoteSchema = conversationIdSchema.extend({ body: z.string().trim().min(1).max(4000) });

export type QuickReplyDTO = {
  id: string;
  name: string;
  shortcut: string;
  body: string;
  category: string;
};

export type ConversationNoteDTO = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export const listQuickRepliesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select({
      id: quickReplies.id,
      name: quickReplies.name,
      shortcut: quickReplies.shortcut,
      body: quickReplies.body,
      category: quickReplies.category,
    })
    .from(quickReplies)
    .where(
      and(eq(quickReplies.organizationId, user.organizationId), eq(quickReplies.isActive, true)),
    )
    .orderBy(asc(quickReplies.category), asc(quickReplies.name));
  return rows satisfies QuickReplyDTO[];
});

export const listConversationNotesFn = createServerFn({ method: "GET" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const rows = await db
      .select({
        id: conversationNotes.id,
        body: conversationNotes.body,
        authorName: users.fullName,
        createdAt: conversationNotes.createdAt,
      })
      .from(conversationNotes)
      .innerJoin(conversations, eq(conversations.id, conversationNotes.conversationId))
      .innerJoin(users, eq(users.id, conversationNotes.authorUserId))
      .where(
        and(
          eq(conversationNotes.organizationId, user.organizationId),
          eq(conversationNotes.conversationId, data.conversationId),
        ),
      )
      .orderBy(asc(conversationNotes.createdAt));

    return rows.map((row) => ({
      id: row["id"],
      body: row["body"],
      authorName: row["authorName"] ?? "Equipe",
      createdAt: row["createdAt"].toISOString(),
    })) satisfies ConversationNoteDTO[];
  });

export const createConversationNoteFn = createServerFn({ method: "POST" })
  .validator(createNoteSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!conversation) throw new Error("Conversa não encontrada");

    const [note] = await db
      .insert(conversationNotes)
      .values({
        organizationId: user.organizationId,
        conversationId: data.conversationId,
        authorUserId: user.id,
        body: data.body,
      })
      .returning();
    if (!note) throw new Error("Não foi possível salvar a nota");
    return {
      id: note.id,
      body: note.body,
      authorName: user.fullName,
      createdAt: note.createdAt.toISOString(),
    } satisfies ConversationNoteDTO;
  });
