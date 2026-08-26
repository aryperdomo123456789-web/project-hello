import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, gte, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db/client.server";
import { channelConnections, conversations, flowExecutions, messages, queues } from "@/db/schema";
import { requireUser } from "../server/auth.server";

export type MetricsDTO = {
  totalConversations: number;
  openConversations: number;
  queuedConversations: number;
  resolvedToday: number;
  inboundToday: number;
  connectedConnections: number;
  activeAutomations: number;
  resolutionRate: number;
  byQueue: Array<{ name: string; value: number }>;
};

export const getMetricsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [total, open, queued, resolvedToday, inboundToday, connected, active, queueRows] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(conversations)
        .where(eq(conversations.organizationId, user.organizationId)),
      db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, user.organizationId),
            notInArray(conversations.status, ["resolved", "closed"]),
          ),
        ),
      db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, user.organizationId),
            eq(conversations.status, "queued"),
          ),
        ),
      db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, user.organizationId),
            eq(conversations.status, "resolved"),
            gte(conversations.resolvedAt, startOfDay),
          ),
        ),
      db
        .select({ value: count() })
        .from(messages)
        .where(
          and(
            eq(messages.organizationId, user.organizationId),
            eq(messages.direction, "inbound"),
            gte(messages.createdAt, startOfDay),
          ),
        ),
      db
        .select({ value: count() })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.organizationId, user.organizationId),
            eq(channelConnections.status, "connected"),
          ),
        ),
      db
        .select({ value: count() })
        .from(flowExecutions)
        .where(
          and(
            eq(flowExecutions.organizationId, user.organizationId),
            inArray(flowExecutions.status, [
              "running",
              "waiting_input",
              "waiting_timer",
              "waiting_external",
              "handoff",
              "paused_by_human",
            ]),
          ),
        ),
      db
        .select({ name: queues.name, value: count(conversations.id) })
        .from(queues)
        .leftJoin(
          conversations,
          and(eq(conversations.queueId, queues.id), notInArray(conversations.status, ["closed"])),
        )
        .where(and(eq(queues.organizationId, user.organizationId), eq(queues.isActive, true)))
        .groupBy(queues.id, queues.name),
    ]);

  const totalConversations = Number(total[0]?.value ?? 0);
  const resolved = Number(resolvedToday[0]?.value ?? 0);
  return {
    totalConversations,
    openConversations: Number(open[0]?.value ?? 0),
    queuedConversations: Number(queued[0]?.value ?? 0),
    resolvedToday: resolved,
    inboundToday: Number(inboundToday[0]?.value ?? 0),
    connectedConnections: Number(connected[0]?.value ?? 0),
    activeAutomations: Number(active[0]?.value ?? 0),
    resolutionRate: totalConversations
      ? Math.round((resolved / totalConversations) * 1000) / 10
      : 0,
    byQueue: queueRows.map((row) => ({ name: row.name, value: Number(row.value) })),
  } satisfies MetricsDTO;
});
