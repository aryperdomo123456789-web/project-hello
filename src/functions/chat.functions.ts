import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { channelConnections, contacts, conversations, messages } from "@/db/schema";
import { assertLicense } from "@/services/license.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";
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
  contactName: string;
  phone: string;
  status: string;
  priority: number;
  assigneeId: string | null;
  lastMessageAt: string;
  automationPaused: boolean;
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
}): ConversationDTO {
  return {
    id: row.conversation.id,
    contactId: row.contact.id,
    connectionId: row.conversation.channelConnectionId,
    contactName: row.contact.name,
    phone: row.contact.phone ?? row.contact.waId,
    status: row.conversation.status,
    priority: row.conversation.priority,
    assigneeId: row.conversation.assigneeId,
    lastMessageAt: row.conversation.lastMessageAt.toISOString(),
    automationPaused: Boolean(row.conversation.automationPausedAt),
  };
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
  const rows = await db
    .select({ conversation: conversations, contact: contacts })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(
      and(
        eq(conversations.organizationId, user.organizationId),
        notInArray(conversations.status, ["closed"]),
      ),
    )
    .orderBy(desc(conversations.priority), desc(conversations.lastMessageAt));
  return rows.map(conversationDto);
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
      const result = await getWhatsAppAdapter().sendText(
        row.connection.providerInstanceId ?? row.connection.id,
        row.contact.phone ?? row.contact.waId,
        data.text,
      );
      const [sentMessage] = await db
        .update(messages)
        .set({
          status: "sent",
          ...(result.externalId ? { externalId: result.externalId } : {}),
          sentAt: new Date(),
        })
        .where(eq(messages.id, pendingMessage.id))
        .returning();
      await db
        .update(conversations)
        .set({
          status: "in_progress",
          automationPausedAt: new Date(),
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, row.conversation.id));
      return sentMessage ? messageDto(sentMessage) : messageDto(pendingMessage);
    } catch (error) {
      await db.update(messages).set({ status: "failed" }).where(eq(messages.id, pendingMessage.id));
      throw error;
    }
  });
