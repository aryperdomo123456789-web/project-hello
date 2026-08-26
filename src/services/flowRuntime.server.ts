import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client.server";
import {
  channelConnections,
  contacts,
  conversations,
  flowBindings,
  flowEffects,
  flowExecutionEvents,
  flowExecutions,
  flowNodeRuns,
  flowVersions,
  memberships,
  messages,
  queueMembers,
  queues,
} from "@/db/schema";
import type { FlowEdge, FlowGraph, FlowNode, FlowNodeData } from "@/flows/types";
import { enqueueFlowEffect } from "@/queue/jobs.server";
import { getWhatsAppAdapter } from "./whatsapp.server";

type RuntimeGraph = FlowGraph & { entryNodeId?: string | undefined };

function asGraph(value: unknown): RuntimeGraph {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    nodes: Array.isArray(record["nodes"]) ? (record["nodes"] as FlowNode[]) : [],
    edges: Array.isArray(record["edges"]) ? (record["edges"] as FlowEdge[]) : [],
    entryNodeId: typeof record["entryNodeId"] === "string" ? record["entryNodeId"] : undefined,
  };
}

function nodeData(node: FlowNode): FlowNodeData {
  return node.data ?? { label: node.id };
}

function nextNodes(graph: RuntimeGraph, nodeId: string, context: Record<string, unknown>) {
  const outgoing = graph.edges.filter((edge) => edge.source === nodeId);
  if (outgoing.length === 0) return [];
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (node?.type !== "condition") return outgoing.map((edge) => edge.target);

  const data = nodeData(node);
  const condition = data.condition ?? "";
  const match = condition.match(/^([\w.-]+)\s*(===|==|contains)\s*["']?([^"']+)["']?$/i);
  if (!match) return [outgoing[0]!.target];
  const [, variable, operator, expected] = match;
  const actual = String(context[variable!] ?? "");
  const result =
    operator?.toLowerCase() === "contains"
      ? actual.toLowerCase().includes(expected!.toLowerCase())
      : actual === expected;
  const label = result ? "sim" : "não";
  const labeled = outgoing.find((edge) => String(edge.label ?? "").toLowerCase() === label);
  return [labeled?.target ?? outgoing[result ? 0 : Math.min(1, outgoing.length - 1)]!.target];
}

function getText(data: FlowNodeData) {
  return data.text?.trim();
}

async function getExecution(executionId: string) {
  const [execution] = await db
    .select()
    .from(flowExecutions)
    .where(eq(flowExecutions.id, executionId))
    .limit(1);
  if (!execution) throw new Error("Execução não encontrada");
  return execution;
}

async function getConversationContext(conversationId: string) {
  const [row] = await db
    .select({ conversation: conversations, contact: contacts, connection: channelConnections })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(channelConnections, eq(channelConnections.id, conversations.channelConnectionId))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!row) throw new Error("Conversa não encontrada");
  return row;
}

export async function dispatchBestAgent(
  organizationId: string,
  conversationId: string,
  queueId: string | null,
) {
  const candidateQueues = queueId
    ? await db
        .select({ id: queues.id })
        .from(queues)
        .where(
          and(
            eq(queues.id, queueId),
            eq(queues.organizationId, organizationId),
            eq(queues.isActive, true),
          ),
        )
        .limit(1)
    : await db
        .select({ id: queues.id })
        .from(queues)
        .where(and(eq(queues.organizationId, organizationId), eq(queues.isActive, true)))
        .orderBy(queues.createdAt)
        .limit(1);
  const queue = candidateQueues[0];
  if (!queue) return null;

  const members = await db
    .select({ userId: queueMembers.userId, maxConcurrentChats: memberships.maxConcurrentChats })
    .from(queueMembers)
    .innerJoin(
      memberships,
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, queueMembers.userId),
        eq(memberships.status, "active"),
        eq(memberships.availability, "online"),
      ),
    )
    .where(
      and(eq(queueMembers.organizationId, organizationId), eq(queueMembers.queueId, queue.id)),
    );

  const loads = await Promise.all(
    members.map(async (member) => {
      const [row] = await db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, organizationId),
            eq(conversations.assigneeId, member.userId),
            inArray(conversations.status, ["in_progress", "waiting_customer"]),
          ),
        );
      return { ...member, load: Number(row?.value ?? 0) };
    }),
  );
  const eligible = loads
    .filter((member) => member.load < member.maxConcurrentChats)
    .sort((left, right) => left.load - right.load)[0];
  if (!eligible) return null;

  const claimed = await db
    .update(conversations)
    .set({
      queueId: queue.id,
      assigneeId: eligible.userId,
      status: "in_progress",
      automationPausedAt: new Date(),
      version: sql`${conversations.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.organizationId, organizationId),
        sql`${conversations.assigneeId} IS NULL`,
      ),
    )
    .returning({ id: conversations.id });
  return claimed[0]?.id ? eligible.userId : null;
}

async function dispatchMessageEffect(executionId: string, nodeRunId: string, text: string) {
  const row = await getConversationContext((await getExecution(executionId)).conversationId);
  const idempotencyKey = `${executionId}:${nodeRunId}:send_message`;
  const [effect] = await db
    .insert(flowEffects)
    .values({
      organizationId: row.conversation.organizationId,
      nodeRunId,
      effectType: "send_message",
      idempotencyKey,
      payload: {
        conversationId: row.conversation.id,
        connectionId: row.connection.id,
        instanceId: row.connection.providerInstanceId ?? row.connection.id,
        phone: row.contact.phone ?? row.contact.waId,
        text,
      },
    })
    .onConflictDoNothing()
    .returning();

  if (!effect) return;

  try {
    const result = await getWhatsAppAdapter().sendText(
      row.connection.providerInstanceId ?? row.connection.id,
      row.contact.phone ?? row.contact.waId,
      text,
    );
    const [message] = await db
      .insert(messages)
      .values({
        organizationId: row.conversation.organizationId,
        conversationId: row.conversation.id,
        channelConnectionId: row.connection.id,
        ...(result.externalId ? { externalId: result.externalId } : {}),
        clientMessageId: idempotencyKey,
        direction: "outbound",
        status: "sent",
        type: "text",
        text,
        payload: { source: "flow", executionId, nodeRunId },
      })
      .onConflictDoNothing()
      .returning();
    await db
      .update(flowEffects)
      .set({ status: "completed", completedAt: new Date(), attempts: 1 })
      .where(eq(flowEffects.id, effect.id));
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, row.conversation.id));
    if (!message) return;
  } catch (error) {
    await db
      .update(flowEffects)
      .set({
        status: "failed",
        attempts: 1,
        nextAttemptAt: new Date(),
        lastError: error instanceof Error ? error.message : "Falha no envio",
      })
      .where(eq(flowEffects.id, effect.id));
    try {
      await enqueueFlowEffect(effect.id);
    } catch {
      // Redis pode estar indisponível durante desenvolvimento; o erro do provedor permanece a causa principal.
    }
    throw error;
  }
}

async function markExecution(executionId: string, patch: Record<string, unknown>) {
  await db
    .update(flowExecutions)
    .set(patch as never)
    .where(eq(flowExecutions.id, executionId));
}

async function runNode(
  executionId: string,
  node: FlowNode,
  context: Record<string, unknown>,
  inputText?: string,
) {
  const execution = await getExecution(executionId);
  const nextAttempt = (
    await db
      .select({ id: flowNodeRuns.id })
      .from(flowNodeRuns)
      .where(and(eq(flowNodeRuns.executionId, executionId), eq(flowNodeRuns.nodeId, node.id)))
      .orderBy(desc(flowNodeRuns.attempt))
      .limit(1)
  )[0];
  const attempt = nextAttempt ? 2 : 1;
  const [nodeRun] = await db
    .insert(flowNodeRuns)
    .values({
      organizationId: execution.organizationId,
      executionId,
      nodeId: node.id,
      attempt,
      status: "running",
      input: inputText ? { text: inputText } : {},
    })
    .returning();
  if (!nodeRun) throw new Error("Não foi possível registrar bloco");

  const data = nodeData(node);
  let nextContext = context;
  let waiting = false;
  let handoff = false;
  let output: Record<string, unknown> = {};

  if (node.type === "message") {
    const text = getText(data);
    if (text) await dispatchMessageEffect(executionId, nodeRun.id, text);
    output = { sent: Boolean(text) };
  } else if (node.type === "question") {
    if (inputText && execution.status === "waiting_input") {
      nextContext = { ...context, [data.variable ?? node.id]: inputText, lastInput: inputText };
      output = { answer: inputText, variable: data.variable ?? node.id };
    } else {
      const text = getText(data);
      if (text) await dispatchMessageEffect(executionId, nodeRun.id, text);
      waiting = true;
      output = { waitingFor: data.variable ?? node.id };
    }
  } else if (node.type === "assign_queue") {
    const row = await getConversationContext(execution.conversationId);
    const queueName = data.queue ?? "";
    const [queue] = await db
      .select({ id: queues.id })
      .from(queues)
      .where(
        and(
          eq(queues.organizationId, row.conversation.organizationId),
          eq(queues.isActive, true),
          sql`(${queues.slug} = ${queueName} OR ${queues.name} = ${queueName})`,
        ),
      )
      .limit(1);
    if (queue)
      await db
        .update(conversations)
        .set({ queueId: queue.id, updatedAt: new Date() })
        .where(eq(conversations.id, row.conversation.id));
    output = { queueId: queue?.id ?? null };
  } else if (node.type === "handoff") {
    const row = await getConversationContext(execution.conversationId);
    const assignedUserId = await dispatchBestAgent(
      row.conversation.organizationId,
      execution.conversationId,
      row.conversation.queueId,
    );
    if (!assignedUserId) {
      await db
        .update(conversations)
        .set({
          status: "queued",
          assigneeId: null,
          automationPausedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, execution.conversationId));
    }
    handoff = true;
    output = { handoff: true, assignedUserId };
  } else if (node.type === "delay") {
    waiting = true;
    output = { seconds: data.seconds ?? 0 };
  } else if (node.type === "tag") {
    const row = await getConversationContext(execution.conversationId);
    const tag = data.tag?.trim();
    if (tag && !row.contact.tags.includes(tag)) {
      await db
        .update(contacts)
        .set({ tags: [...row.contact.tags, tag], updatedAt: new Date() })
        .where(eq(contacts.id, row.contact.id));
    }
    output = { tag };
  } else if (node.type === "end") {
    output = { ended: true };
  } else if (node.type === "condition") {
    output = { evaluated: data.condition ?? "" };
  }

  await db
    .update(flowNodeRuns)
    .set({ status: "completed", output, finishedAt: new Date() })
    .where(eq(flowNodeRuns.id, nodeRun.id));
  return { nextContext, waiting, handoff, nodeRunId: nodeRun.id };
}

export async function startOrResumeFlow(
  conversationId: string,
  inputText: string,
  externalEventId: string,
) {
  const row = await getConversationContext(conversationId);
  const [existingExecution] = await db
    .select()
    .from(flowExecutions)
    .where(
      and(
        eq(flowExecutions.conversationId, conversationId),
        inArray(flowExecutions.status, [
          "running",
          "waiting_input",
          "waiting_timer",
          "waiting_external",
          "handoff",
          "paused_by_human",
        ]),
      ),
    )
    .orderBy(desc(flowExecutions.startedAt))
    .limit(1);

  let execution = existingExecution;
  if (execution?.status === "handoff" || execution?.status === "paused_by_human")
    return { status: execution.status };

  if (!execution) {
    const [binding] = await db
      .select({ binding: flowBindings, version: flowVersions })
      .from(flowBindings)
      .innerJoin(flowVersions, eq(flowVersions.id, flowBindings.flowVersionId))
      .where(
        and(
          eq(flowBindings.channelConnectionId, row.connection.id),
          eq(flowBindings.active, true),
          eq(flowBindings.trigger, "conversation_started"),
        ),
      )
      .orderBy(desc(flowBindings.priority))
      .limit(1);
    if (!binding) return { status: "no_flow" as const };
    const graph = asGraph(binding.version.compiledGraph);
    const entryNodeId =
      graph.entryNodeId ?? graph.nodes.find((node) => node.type === "trigger")?.id;
    if (!entryNodeId) return { status: "invalid_flow" as const };
    const createdExecutions = await db
      .insert(flowExecutions)
      .values({
        organizationId: row.conversation.organizationId,
        conversationId,
        flowVersionId: binding.version.id,
        currentNodeId: entryNodeId,
        context: { lastInput: inputText },
      })
      .onConflictDoNothing()
      .returning();
    execution = createdExecutions[0];
    if (!execution) {
      const [raceWinner] = await db
        .select()
        .from(flowExecutions)
        .where(
          and(
            eq(flowExecutions.conversationId, conversationId),
            inArray(flowExecutions.status, [
              "running",
              "waiting_input",
              "waiting_timer",
              "waiting_external",
              "handoff",
              "paused_by_human",
            ]),
          ),
        )
        .orderBy(desc(flowExecutions.startedAt))
        .limit(1);
      execution = raceWinner;
    }
    if (!execution) throw new Error("Não foi possível iniciar fluxo");
  }

  const [event] = await db
    .insert(flowExecutionEvents)
    .values({
      organizationId: row.conversation.organizationId,
      executionId: execution.id,
      externalEventId,
      eventType: "inbound_message",
      payload: { text: inputText },
    })
    .onConflictDoNothing()
    .returning();
  if (!event) return { status: "duplicate" as const };

  const version = (
    await db
      .select()
      .from(flowVersions)
      .where(eq(flowVersions.id, execution.flowVersionId))
      .limit(1)
  )[0];
  if (!version) throw new Error("Versão do fluxo não encontrada");
  const graph = asGraph(version.compiledGraph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  let currentId = execution.currentNodeId;
  let context: Record<string, unknown> = {
    ...(execution.context as Record<string, unknown>),
    lastInput: inputText,
  };
  let status: "running" | "waiting_input" | "waiting_timer" | "handoff" | "completed" = "running";

  for (let safety = 0; safety < 50; safety += 1) {
    const node = nodes.get(currentId);
    if (!node) throw new Error(`Bloco ${currentId} não encontrado`);
    const result = await runNode(
      execution.id,
      node,
      context,
      node.type === "question" && execution.status === "waiting_input" ? inputText : undefined,
    );
    context = result.nextContext;
    if (result.handoff) {
      status = "handoff";
      break;
    }
    if (result.waiting) {
      status = node.type === "question" ? "waiting_input" : "waiting_timer";
      break;
    }
    if (node.type === "end") {
      status = "completed";
      break;
    }
    const next = nextNodes(graph, node.id, context)[0];
    if (!next) {
      status = "completed";
      break;
    }
    currentId = next;
  }

  await db
    .update(flowExecutions)
    .set({
      currentNodeId: currentId,
      context,
      status,
      ...(status === "completed" || status === "handoff" ? { completedAt: new Date() } : {}),
      lockVersion: sql`${flowExecutions.lockVersion} + 1`,
    })
    .where(eq(flowExecutions.id, execution.id));
  return { status, executionId: execution.id };
}
