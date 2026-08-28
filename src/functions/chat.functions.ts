import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { channelConnections, contacts, conversations, messages, queues } from "@/db/schema";
import { assertLicense } from "@/services/license.server";
import {
  sendOutboundMessage,
  type OutboundMessageContext,
  type OutboundMessageResult,
} from "@/services/magoBotOutbound.server";
import { requireUser } from "../server/auth.server";

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(1).max(4000),
});

export type ConversationDTO = {
  id: string;
  contactId: string;
  connectionId: string;
  connectionName: string;
  queueName: string | null;
  contactName: string;
  phone: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  lastMessageAt: string;
  automationPaused: boolean;
  lastMessageText: string | null;
  unreadCount: number;
};

export type MessageDTO = {
  id: string;
  conversationId: string;
  text: string;
  direction: "inbound" | "outbound" | "system";
  status: string;
  type: string;
  sentAt: string;
};

function conversationDto(row: {
  conversation: typeof conversations.$inferSelect;
  contact: typeof contacts.$inferSelect;
  connection: typeof channelConnections.$inferSelect;
  queue: typeof queues.$inferSelect | null;
  lastMessageText: string | null;
  unreadCount: number;
}): ConversationDTO {
  return {
    id: row.conversation.id,
    contactId: row.contact.id,
    connectionId: row.conversation.channelConnectionId,
    connectionName: row.connection.name,
    queueName: row.queue?.name ?? null,
    contactName: row.contact.name,
    phone: row.contact.phone ?? row.contact.waId,
    status: row.conversation.status,
    priority: row.conversation.priority,
    assigneeId: row.conversation.assigneeId,
    lastMessageAt: row.conversation.lastMessageAt.toISOString(),
    automationPaused: Boolean(row.conversation.automationPausedAt),
    lastMessageText: row.lastMessageText,
    unreadCount: row.unreadCount,
  };
}

export async function sendChatOutbound(
  context: OutboundMessageContext,
): Promise<OutboundMessageResult> {
  return sendOutboundMessage(context);
}

function messageDto(message: typeof messages.$inferSelect): MessageDTO {
  return {
    id: message.id,
    conversationId: message.conversationId,
    text: message.text ?? "",
    direction: message.direction,
    status: message.status,
    type: message.type,
    sentAt: message.sentAt.toISOString(),
  };
}

export const listConversationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const latestMessages = db
    .selectDistinctOn([messages.conversationId], {
      conversationId: messages.conversationId,
      text: messages.text,
    })
    .from(messages)
    .where(eq(messages.organizationId, user.organizationId))
    .orderBy(messages.conversationId, desc(messages.sentAt))
    .as("latest_messages");

  const [rows, unreadRows] = await Promise.all([
    db
      .select({
        conversation: conversations,
        contact: contacts,
        connection: channelConnections,
        queue: queues,
        lastMessageText: latestMessages.text,
      })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
      .leftJoin(queues, eq(queues.id, conversations.queueId))
      .leftJoin(latestMessages, eq(latestMessages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.organizationId, user.organizationId),
          notInArray(conversations.status, ["closed"]),
        ),
      )
      .orderBy(desc(conversations.priority), desc(conversations.lastMessageAt)),
    db
      .select({ conversationId: messages.conversationId, value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.organizationId, user.organizationId),
          eq(messages.direction, "inbound"),
          isNull(messages.readAt),
        ),
      )
      .groupBy(messages.conversationId),
  ]);
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversationId, Number(row.value)]),
  );
  return rows.map((row) =>
    conversationDto({ ...row, unreadCount: unreadByConversation.get(row.conversation.id) ?? 0 }),
  );
});

export const listConversationMessagesFn = createServerFn({ method: "GET" })
  .validator(conversationIdSchema)
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

    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(messages.sentAt);
    return rows.map(messageDto);
  });

export const sendMessageFn = createServerFn({ method: "POST" })
  .validator(sendMessageSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertLicense("whatsapp:send");

    const [row] = await db
      .select({ conversation: conversations, contact: contacts, connection: channelConnections })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
      .where(
        and(
          eq(conversations.id, data.conversationId),
          eq(conversations.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!row) throw new Error("Conversa não encontrada");

    const clientMessageId = crypto.randomUUID();
    const [pendingMessage] = await db
      .insert(messages)
      .values({
        organizationId: user.organizationId,
        conversationId: row.conversation.id,
        channelConnectionId: row.connection.id,
        clientMessageId,
        direction: "outbound",
        status: "queued",
        type: "text",
        text: data.text,
        senderUserId: user.id,
      })
      .returning();
    if (!pendingMessage) throw new Error("Não foi possível criar mensagem");

    try {
      const result = await sendChatOutbound({
        organizationId: user.organizationId,
        contactId: row.contact.id,
        conversationId: row.conversation.id,
        connectionId: row.connection.id,
        providerInstanceId: row.connection.providerInstanceId,
        apiResourceId: row.connection.apiResourceId,
        apiProjectId: row.connection.apiProjectId,
        recipient: row.contact.phone ?? row.contact.waId,
        text: data.text,
        idempotencyKey: clientMessageId,
      });
      const [sentMessage] = await db
        .update(messages)
        .set({
          status: result.status,
          ...(result.externalId ? { externalId: result.externalId } : {}),
          ...(result.apiMessageId ? { apiMessageId: result.apiMessageId } : {}),
          ...(result.apiProviderMessageId
            ? { apiProviderMessageId: result.apiProviderMessageId }
            : {}),
          ...(result.lastApiRequestId ? { lastApiRequestId: result.lastApiRequestId } : {}),
          sentAt: new Date(),
        })
        .where(
          and(eq(messages.id, pendingMessage.id), eq(messages.organizationId, user.organizationId)),
        )
        .returning();
      await db
        .update(conversations)
        .set({
          status: "in_progress",
          automationPausedAt: new Date(),
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(conversations.id, row.conversation.id),
            eq(conversations.organizationId, user.organizationId),
          ),
        );
      return sentMessage ? messageDto(sentMessage) : messageDto(pendingMessage);
    } catch (error) {
      await db
        .update(messages)
        .set({ status: "failed" })
        .where(
          and(eq(messages.id, pendingMessage.id), eq(messages.organizationId, user.organizationId)),
        );
      throw error;
    }
  });
