import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { channelConnections, contacts, conversations, queues } from "@/db/schema";
import { requireRole } from "@/server/auth.server";

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export const exportConversationsCsvFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("owner", "admin", "manager", "supervisor");
  const rows = await db
    .select({
      conversationId: conversations.id,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      channel: channelConnections.name,
      queue: queues.name,
      status: conversations.status,
      priority: conversations.priority,
      firstResponseAt: conversations.firstResponseAt,
      lastMessageAt: conversations.lastMessageAt,
      resolvedAt: conversations.resolvedAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
    .leftJoin(queues, eq(queues.id, conversations.queueId))
    .where(eq(conversations.organizationId, user.organizationId))
    .orderBy(asc(conversations.createdAt));

  const header = [
    "conversation_id",
    "contact_name",
    "contact_phone",
    "channel",
    "queue",
    "status",
    "priority",
    "first_response_at",
    "last_message_at",
    "resolved_at",
    "created_at",
  ];
  const body = rows.map((row) =>
    [
      row.conversationId,
      row.contactName,
      row.contactPhone,
      row.channel,
      row.queue,
      row.status,
      row.priority,
      row.firstResponseAt,
      row.lastMessageAt,
      row.resolvedAt,
      row.createdAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return {
    filename: `mago-bot-conversas-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: [header.map(csvCell).join(","), ...body].join("\n"),
    count: rows.length,
  };
});
