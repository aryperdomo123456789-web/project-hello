import { and, desc, eq, notInArray, or } from "drizzle-orm";

import { db } from "@/db/client.server";
import { channelConnections, contacts, conversations, messages, webhookEvents } from "@/db/schema";
import type { NormalizedWebhookEvent } from "./whatsapp.server";
import { dispatchBestAgent, startOrResumeFlow } from "./flowRuntime.server";

function mapMessageStatus(value?: string) {
  switch (value?.toLowerCase()) {
    case "read":
      return "read" as const;
    case "delivered":
      return "delivered" as const;
    case "sent":
    case "accepted":
      return "sent" as const;
    case "failed":
    case "error":
      return "failed" as const;
    default:
      return undefined;
  }
}

function mapConnectionStatus(value?: string) {
  switch (value?.toLowerCase()) {
    case "open":
    case "connected":
      return "connected" as const;
    case "connecting":
      return "connecting" as const;
    case "close":
    case "closed":
    case "disconnected":
      return "disconnected" as const;
    default:
      return "error" as const;
  }
}

async function findConnection(event: NormalizedWebhookEvent) {
  const instanceId = event.providerInstanceId;
  if (!instanceId) return null;

  const matches = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.provider, event.provider as "stub"),
        or(
          eq(channelConnections.providerInstanceId, instanceId),
          eq(channelConnections.slug, instanceId),
          eq(channelConnections.name, instanceId),
        ),
      ),
    )
    .limit(1);

  return matches[0] ?? null;
}

async function processIncomingMessage(
  event: NormalizedWebhookEvent,
  connection: typeof channelConnections.$inferSelect,
) {
  const phone = event.phone;
  if (!phone) return { kind: "ignored" as const, reason: "missing_phone" };

  const result = await db.transaction(async (tx) => {
    const existingContact = await tx
      .select()
      .from(contacts)
      .where(and(eq(contacts.organizationId, connection.organizationId), eq(contacts.waId, phone)))
      .limit(1);

    const contact =
      existingContact[0] ??
      (
        await tx
          .insert(contacts)
          .values({
            organizationId: connection.organizationId,
            waId: phone,
            phone,
            name: event.name ?? "Contato",
          })
          .returning()
      )[0];

    if (!contact) throw new Error("Não foi possível criar contato");

    if (event.name && event.name !== contact.name) {
      await tx
        .update(contacts)
        .set({ name: event.name, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));
    }

    const openConversations = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.organizationId, connection.organizationId),
          eq(conversations.channelConnectionId, connection.id),
          eq(conversations.contactId, contact.id),
          notInArray(conversations.status, ["resolved", "closed"]),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(1);

    const conversation =
      openConversations[0] ??
      (
        await tx
          .insert(conversations)
          .values({
            organizationId: connection.organizationId,
            channelConnectionId: connection.id,
            contactId: contact.id,
            status: "queued",
            lastMessageAt: event.timestamp ?? new Date(),
          })
          .returning()
      )[0];

    if (!conversation) throw new Error("Não foi possível criar conversa");

    const externalId = event.externalMessageId ?? event.externalEventId;
    const inserted = await tx
      .insert(messages)
      .values({
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        channelConnectionId: connection.id,
        externalId,
        direction: event.fromMe ? "outbound" : "inbound",
        status: event.fromMe ? "sent" : "received",
        type: event.messageType ?? "text",
        text: event.text,
        payload: event.payload,
        sentAt: event.timestamp ?? new Date(),
      })
      .onConflictDoNothing()
      .returning();

    await tx
      .update(conversations)
      .set({
        lastMessageAt: event.timestamp ?? new Date(),
        status: conversation.assigneeId ? "in_progress" : "queued",
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversation.id));

    return {
      kind: "message" as const,
      conversationId: conversation.id,
      messageId: inserted[0]?.id,
      created: inserted.length > 0,
    };
  });

  if (result.kind === "message" && result.created && event.text && !event.fromMe) {
    const flow = await startOrResumeFlow(result.conversationId, event.text, event.externalEventId);
    const assignedUserId =
      flow.status === "no_flow"
        ? await dispatchBestAgent(connection.organizationId, result.conversationId, null)
        : null;
    return { ...result, flow, assignedUserId };
  }

  return result;
}

async function processEvent(event: NormalizedWebhookEvent) {
  const connection = await findConnection(event);
  if (!connection) return { kind: "ignored" as const, reason: "connection_not_found" };

  if (event.kind === "incoming_message") {
    return processIncomingMessage(event, connection);
  }

  if (event.kind === "message_status" && event.externalMessageId) {
    const status = mapMessageStatus(event.status);
    if (status) {
      await db
        .update(messages)
        .set({
          status,
          ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
          ...(status === "read" ? { readAt: new Date() } : {}),
        })
        .where(
          and(
            eq(messages.channelConnectionId, connection.id),
            eq(messages.externalId, event.externalMessageId),
          ),
        );
    }
    return { kind: "status" as const, status };
  }

  if (event.kind === "connection_update") {
    await db
      .update(channelConnections)
      .set({
        status: mapConnectionStatus(event.status),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, connection.id));
    return { kind: "connection" as const, status: event.status };
  }

  return { kind: "ignored" as const, reason: event.kind };
}

export async function processWebhookEvents(events: NormalizedWebhookEvent[]) {
  const results: unknown[] = [];

  for (const event of events) {
    const connection = await findConnection(event);
    const [stored] = await db
      .insert(webhookEvents)
      .values({
        organizationId: connection?.organizationId,
        channelConnectionId: connection?.id,
        provider: event.provider,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        payload: event.payload,
        status: "received",
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });

    if (!stored) {
      results.push({ kind: "duplicate", externalEventId: event.externalEventId });
      continue;
    }

    try {
      const result = await processEvent(event);
      await db
        .update(webhookEvents)
        .set({ status: "processed", processedAt: new Date() })
        .where(eq(webhookEvents.id, stored.id));
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await db
        .update(webhookEvents)
        .set({ status: "failed", attempts: 1, lastError: message })
        .where(eq(webhookEvents.id, stored.id));
      results.push({ kind: "failed", error: message });
    }
  }

  return results;
}
