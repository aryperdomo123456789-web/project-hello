import { and, desc, eq, notInArray, or, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  campaignRecipients,
  campaigns,
  channelConnections,
  contactPolicies,
  contacts,
  conversations,
  messages,
  webhookEvents,
} from "@/db/schema";
import { enqueueTranscription } from "@/queue/jobs.server";
import { isOptOutMessage } from "@/services/contactGovernance.server";
import { openCampaignCircuit } from "@/services/campaignTelemetry.server";
import { parseMagoBotWebhookPayload } from "./magoBotWebhookParser.server";
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
    case "qr_pending":
    case "qr.pending":
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

  const filters =
    event.provider === "mago_bot_api"
      ? [eq(channelConnections.apiChannelId, instanceId)]
      : [
          eq(
            channelConnections.provider,
            event.provider as "stub" | "evolution" | "custom" | "meta",
          ),
          or(
            eq(channelConnections.providerInstanceId, instanceId),
            eq(channelConnections.slug, instanceId),
            eq(channelConnections.name, instanceId),
          ),
        ];
  if (event.apiTenantId) filters.push(eq(channelConnections.apiTenantId, event.apiTenantId));
  if (event.apiProjectId) filters.push(eq(channelConnections.apiProjectId, event.apiProjectId));

  const [connection] = await db
    .select()
    .from(channelConnections)
    .where(and(...filters))
    .limit(1);
  return connection ?? null;
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

    let contact = existingContact[0];
    if (!contact) {
      const [createdContact] = await tx
        .insert(contacts)
        .values({
          organizationId: connection.organizationId,
          waId: phone,
          phone,
          name: event.name ?? "Contato",
        })
        .onConflictDoNothing()
        .returning();
      contact = createdContact;
    }
    if (!contact) {
      const [recoveredContact] = await tx
        .select()
        .from(contacts)
        .where(
          and(eq(contacts.organizationId, connection.organizationId), eq(contacts.waId, phone)),
        )
        .limit(1);
      contact = recoveredContact;
    }
    if (!contact) throw new Error("Não foi possível criar contato");

    if (event.name && event.name !== contact.name) {
      await tx
        .update(contacts)
        .set({ name: event.name, updatedAt: new Date() })
        .where(
          and(eq(contacts.id, contact.id), eq(contacts.organizationId, connection.organizationId)),
        );
    }

    const optedOut = !event.fromMe && isOptOutMessage(event.text);
    if (optedOut) {
      await tx
        .insert(contactPolicies)
        .values({
          organizationId: connection.organizationId,
          contactId: contact.id,
          optedOut: true,
        })
        .onConflictDoUpdate({
          target: [contactPolicies.organizationId, contactPolicies.contactId],
          set: { optedOut: true, updatedAt: new Date() },
        });
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

    const externalId =
      event.apiProviderMessageId ?? event.externalMessageId ?? event.externalEventId;
    const inserted = await tx
      .insert(messages)
      .values({
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        channelConnectionId: connection.id,
        externalId,
        ...(event.apiMessageId ? { apiMessageId: event.apiMessageId } : {}),
        ...(event.apiProviderMessageId ? { apiProviderMessageId: event.apiProviderMessageId } : {}),
        ...(event.apiRequestId ? { lastApiRequestId: event.apiRequestId } : {}),
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
        version: sql`${conversations.version} + 1`,
      })
      .where(
        and(
          eq(conversations.id, conversation.id),
          eq(conversations.organizationId, connection.organizationId),
        ),
      );

    return {
      kind: "message" as const,
      conversationId: conversation.id,
      messageId: inserted[0]?.id,
      created: inserted.length > 0,
      optedOut,
    };
  });

  if (
    result.kind === "message" &&
    result.created &&
    event.messageType === "audio" &&
    !event.fromMe
  ) {
    if (result.messageId) {
      void enqueueTranscription(result.messageId).catch((error) => {
        console.warn(
          `[webhook] transcription enqueue unavailable: ${
            error instanceof Error ? error.message : "queue error"
          }`,
        );
      });
    }
  }

  if (result.kind === "message" && result.optedOut) {
    return { ...result, governance: "opted_out" as const };
  }

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

async function updateCampaignDeliveryStatus(
  organizationId: string,
  channelConnectionId: string,
  identifiers: ReturnType<typeof eq>[],
  status: "delivered" | "failed" | "read",
) {
  const [row] = await db
    .select({
      recipientId: campaignRecipients.id,
      campaignId: campaignRecipients.campaignId,
      recipientStatus: campaignRecipients.status,
    })
    .from(campaignRecipients)
    .innerJoin(
      messages,
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.channelConnectionId, channelConnectionId),
        eq(messages.clientMessageId, campaignRecipients.lastIdempotencyKey),
        or(...identifiers),
      ),
    )
    .where(eq(campaignRecipients.organizationId, organizationId))
    .limit(1);
  if (!row || row.recipientStatus === status) return;

  await db.transaction(async (tx) => {
    await tx
      .update(campaignRecipients)
      .set({ status, updatedAt: new Date(), processingAt: null })
      .where(eq(campaignRecipients.id, row.recipientId));
    await tx
      .update(campaigns)
      .set({
        ...(status === "delivered"
          ? { deliveredCount: sql`${campaigns.deliveredCount} + 1` }
          : status === "failed"
            ? { failedCount: sql`${campaigns.failedCount} + 1` }
            : {}),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, row.campaignId));
  });
}

async function processEvent(event: NormalizedWebhookEvent) {
  const connection = await findConnection(event);
  if (!connection) return { kind: "ignored" as const, reason: "connection_not_found" };

  if (event.kind === "incoming_message") {
    return processIncomingMessage(event, connection);
  }

  if (
    event.kind === "message_status" &&
    (event.apiMessageId || event.apiProviderMessageId || event.externalMessageId)
  ) {
    const status = mapMessageStatus(event.status);
    if (status) {
      const identifiers = [
        event.apiMessageId ? eq(messages.apiMessageId, event.apiMessageId) : undefined,
        event.apiProviderMessageId
          ? eq(messages.apiProviderMessageId, event.apiProviderMessageId)
          : undefined,
        event.externalMessageId ? eq(messages.externalId, event.externalMessageId) : undefined,
      ].filter((condition): condition is ReturnType<typeof eq> => Boolean(condition));
      await db
        .update(messages)
        .set({
          status,
          ...(event.apiMessageId ? { apiMessageId: event.apiMessageId } : {}),
          ...(event.apiProviderMessageId
            ? { apiProviderMessageId: event.apiProviderMessageId }
            : {}),
          ...(event.apiRequestId ? { lastApiRequestId: event.apiRequestId } : {}),
          ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
          ...(status === "read" ? { readAt: new Date() } : {}),
        })
        .where(
          and(
            eq(messages.organizationId, connection.organizationId),
            eq(messages.channelConnectionId, connection.id),
            or(...identifiers),
          ),
        );
      if (status === "delivered" || status === "failed" || status === "read") {
        await updateCampaignDeliveryStatus(
          connection.organizationId,
          connection.id,
          identifiers,
          status,
        );
      }
    }
    return { kind: "status" as const, status };
  }

  if (event.kind === "connection_update" || event.kind === "qrcode_updated") {
    const status =
      event.kind === "qrcode_updated" ? "connecting" : mapConnectionStatus(event.status);
    await db
      .update(channelConnections)
      .set({
        status,
        lastSeenAt: new Date(),
        ...(status === "connected" ? { connectedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(channelConnections.id, connection.id),
          eq(channelConnections.organizationId, connection.organizationId),
        ),
      );
    if (status === "disconnected") {
      await openCampaignCircuit(
        connection.organizationId,
        connection.id,
        `Webhook de conexão: ${event.status ?? "disconnected"}`,
      );
    }
    return {
      kind: event.kind === "qrcode_updated" ? ("qrcode" as const) : ("connection" as const),
      status: event.status ?? status,
    };
  }

  return { kind: "ignored" as const, reason: event.kind };
}

async function processWebhookEvent(event: NormalizedWebhookEvent, existingReceiptId?: string) {
  const connection = await findConnection(event);
  const receiptId = existingReceiptId;
  let stored = receiptId ? { id: receiptId } : undefined;

  if (!stored) {
    const [createdReceipt] = await db
      .insert(webhookEvents)
      .values({
        organizationId: connection?.organizationId,
        channelConnectionId: connection?.id,
        provider: event.provider,
        eventId: event.externalEventId,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        payload: event.payload,
        status: "received",
        attempts: 0,
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    stored = createdReceipt;
  }

  if (!stored) {
    return { kind: "duplicate" as const, externalEventId: event.externalEventId };
  }

  try {
    const result = await processEvent(event);
    await db
      .update(webhookEvents)
      .set({ status: "processed", processedAt: new Date(), lastError: null })
      .where(eq(webhookEvents.id, stored.id));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await db
      .update(webhookEvents)
      .set({
        status: "failed",
        attempts: sql`${webhookEvents.attempts} + 1`,
        lastError: message.slice(0, 500),
      })
      .where(eq(webhookEvents.id, stored.id));
    throw error;
  }
}

export async function processWebhookEvents(events: NormalizedWebhookEvent[]) {
  const results: unknown[] = [];
  for (const event of events) {
    try {
      results.push(await processWebhookEvent(event));
    } catch (error) {
      results.push({
        kind: "failed",
        externalEventId: event.externalEventId,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  }
  return results;
}

export async function processMagoBotWebhookReceipt(receiptId: string) {
  const [claimed] = await db
    .update(webhookEvents)
    .set({ status: "processing", attempts: sql`${webhookEvents.attempts} + 1` })
    .where(
      and(
        eq(webhookEvents.id, receiptId),
        eq(webhookEvents.provider, "mago_bot_api"),
        or(eq(webhookEvents.status, "received"), eq(webhookEvents.status, "failed")),
      ),
    )
    .returning();
  if (!claimed) return { kind: "skipped" as const, receiptId };

  const event = parseMagoBotWebhookPayload(claimed.payload);
  if (!event) {
    await db
      .update(webhookEvents)
      .set({
        status: "ignored",
        processedAt: new Date(),
        lastError: "unsupported_or_invalid_event",
      })
      .where(eq(webhookEvents.id, receiptId));
    return { kind: "ignored" as const, receiptId };
  }

  const result = await processWebhookEvent(event, receiptId);
  return { kind: "processed" as const, receiptId, result };
}
