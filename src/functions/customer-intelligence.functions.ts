import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { contacts, contactTasks, conversationRatings, conversations, tickets } from "@/db/schema";
import { requireUser } from "@/server/auth.server";
import {
  buildCustomerIntelligence,
  type CustomerIntelligenceResult,
} from "@/services/customerIntelligence.server";

const schema = z.object({ contactId: z.string().uuid() });

export const getCustomerIntelligenceFn = createServerFn({ method: "GET" })
  .validator(schema)
  .handler(async ({ data }) => {
    const actor = await requireUser();
    const [contact] = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.id, data.contactId), eq(contacts.organizationId, actor.organizationId)),
      )
      .limit(1);
    if (!contact) throw new Error("Contato não encontrado");

    const contactConversations = await db
      .select({
        status: conversations.status,
        priority: conversations.priority,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.contactId, contact.id),
          eq(conversations.organizationId, actor.organizationId),
        ),
      )
      .orderBy(asc(conversations.lastMessageAt))
      .limit(200);
    const tasks = await db
      .select({ status: contactTasks.status, dueAt: contactTasks.dueAt })
      .from(contactTasks)
      .where(
        and(
          eq(contactTasks.contactId, contact.id),
          eq(contactTasks.organizationId, actor.organizationId),
        ),
      )
      .limit(200);
    const contactTickets = await db
      .select({ status: tickets.status, priority: tickets.priority })
      .from(tickets)
      .where(
        and(eq(tickets.contactId, contact.id), eq(tickets.organizationId, actor.organizationId)),
      )
      .limit(200);
    const ratings = await db
      .select({ rating: conversationRatings.rating })
      .from(conversationRatings)
      .innerJoin(
        conversations,
        and(
          eq(conversations.id, conversationRatings.conversationId),
          eq(conversations.organizationId, actor.organizationId),
        ),
      )
      .where(
        and(
          eq(conversationRatings.organizationId, actor.organizationId),
          eq(conversations.contactId, contact.id),
        ),
      )
      .limit(100);

    return buildCustomerIntelligence({
      contact,
      conversations: contactConversations,
      tasks,
      tickets: contactTickets,
      ratings,
    }) satisfies CustomerIntelligenceResult;
  });
