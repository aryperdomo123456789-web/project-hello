import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "@/db/client.server";
import { internalTeamMessages, memberships, users } from "@/db/schema";
import { requireUser } from "@/server/auth.server";

const authorUsers = alias(users, "team_message_authors");
const recipientUsers = alias(users, "team_message_recipients");

const listSchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const sendSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  recipientUserId: z.string().uuid().optional(),
});

export type TeamMessageDTO = {
  id: string;
  body: string;
  authorUserId: string;
  authorName: string;
  recipientUserId: string | null;
  recipientName: string | null;
  createdAt: string;
};

export const listTeamMessagesFn = createServerFn({ method: "GET" })
  .validator(listSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const predicates = [eq(internalTeamMessages.organizationId, user.organizationId)];
    if (data.before) {
      predicates.push(lt(internalTeamMessages.createdAt, new Date(data.before)));
    }

    const rows = await db
      .select({
        id: internalTeamMessages.id,
        body: internalTeamMessages.body,
        authorUserId: internalTeamMessages.authorUserId,
        authorName: authorUsers.fullName,
        recipientUserId: internalTeamMessages.recipientUserId,
        recipientName: recipientUsers.fullName,
        createdAt: internalTeamMessages.createdAt,
      })
      .from(internalTeamMessages)
      .innerJoin(authorUsers, eq(authorUsers.id, internalTeamMessages.authorUserId))
      .leftJoin(recipientUsers, eq(recipientUsers.id, internalTeamMessages.recipientUserId))
      .where(and(...predicates))
      .orderBy(desc(internalTeamMessages.createdAt))
      .limit(data.limit);

    return rows.reverse().map((row) => ({
      id: row.id,
      body: row.body,
      authorUserId: row.authorUserId,
      authorName: row.authorName ?? "Equipe",
      recipientUserId: row.recipientUserId,
      recipientName: row.recipientName ?? null,
      createdAt: row.createdAt.toISOString(),
    })) satisfies TeamMessageDTO[];
  });

export const sendTeamMessageFn = createServerFn({ method: "POST" })
  .validator(sendSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    if (data.recipientUserId) {
      const [recipient] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, user.organizationId),
            eq(memberships.userId, data.recipientUserId),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      if (!recipient) throw new Error("Destinatário não pertence à organização");
    }

    const [message] = await db
      .insert(internalTeamMessages)
      .values({
        organizationId: user.organizationId,
        authorUserId: user.id,
        recipientUserId: data.recipientUserId,
        body: data.body,
      })
      .returning();
    if (!message) throw new Error("Não foi possível enviar a mensagem interna");

    return {
      id: message.id,
      body: message.body,
      authorUserId: user.id,
      authorName: user.fullName,
      recipientUserId: message.recipientUserId,
      recipientName: null,
      createdAt: message.createdAt.toISOString(),
    } satisfies TeamMessageDTO;
  });
