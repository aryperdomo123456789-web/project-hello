import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client.server";
import { channelConnections, flowBindings, flowVersions, flows } from "@/db/schema";
import type { FlowGraph, FlowNode } from "@/flows/types";
import { requireUser } from "../server/auth.server";

const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        type: z.string().min(1).max(40),
        position: z.object({ x: z.number(), y: z.number() }),
        data: z.record(z.unknown()),
      }),
    )
    .max(200),
  edges: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        source: z.string().min(1).max(100),
        target: z.string().min(1).max(100),
        label: z.string().max(120).optional(),
      }),
    )
    .max(500),
});

const createFlowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(40).default("custom"),
  graphJson: z.string().max(600_000),
});
const flowIdSchema = z.object({ flowId: z.string().uuid() });
const bindFlowSchema = z.object({ flowId: z.string().uuid(), connectionId: z.string().uuid() });

export type FlowDTO = {
  id: string;
  name: string;
  slug: string;
  category: string;
  status: string;
  draftGraphJson: string;
  publishedVersion: number | null;
};

function parseGraph(graphJson: string): FlowGraph {
  const parsed: unknown = JSON.parse(graphJson);
  return graphSchema.parse(parsed) as FlowGraph;
}

function compileGraph(graph: FlowGraph) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!graph.nodes.some((node) => node.type === "trigger"))
    throw new Error("O fluxo precisa de uma entrada");
  if (graph.nodes.some((node) => !nodeIds.has(node.id))) throw new Error("Grafo inválido");
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      throw new Error("Aresta aponta para bloco inexistente");
  }
  if (graph.nodes.filter((node) => node.type === "trigger").length > 1)
    throw new Error("Use apenas uma entrada por fluxo");

  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);

  return {
    schemaVersion: 1,
    entryNodeId: graph.nodes.find((node) => node.type === "trigger")?.id,
    nodes: graph.nodes,
    edges: graph.edges,
    adjacency: Object.fromEntries(adjacency),
  };
}

function flowDto(flow: typeof flows.$inferSelect, publishedVersion: number | null): FlowDTO {
  return {
    id: flow.id,
    name: flow.name,
    slug: flow.slug,
    category: flow.category,
    status: flow.status,
    draftGraphJson: JSON.stringify(flow.draftGraph),
    publishedVersion,
  };
}

async function getFlowForOrg(flowId: string, organizationId: string) {
  const [flow] = await db
    .select()
    .from(flows)
    .where(and(eq(flows.id, flowId), eq(flows.organizationId, organizationId)))
    .limit(1);
  if (!flow) throw new Error("Fluxo não encontrado");
  return flow;
}

async function latestVersion(flowId: string) {
  const [version] = await db
    .select({ version: flowVersions.version })
    .from(flowVersions)
    .where(eq(flowVersions.flowId, flowId))
    .orderBy(desc(flowVersions.version))
    .limit(1);
  return version?.version ?? null;
}

export const listFlowsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(flows)
    .where(eq(flows.organizationId, user.organizationId))
    .orderBy(desc(flows.updatedAt));
  return Promise.all(rows.map(async (flow) => flowDto(flow, await latestVersion(flow.id))));
});

export const createFlowFn = createServerFn({ method: "POST" })
  .validator(createFlowSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const graph = parseGraph(data.graphJson);
    const slug = `${data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70)}-${crypto.randomUUID().slice(0, 8)}`;
    const [flow] = await db
      .insert(flows)
      .values({
        organizationId: user.organizationId,
        name: data.name,
        slug,
        category: data.category,
        draftGraph: graph,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();
    if (!flow) throw new Error("Não foi possível criar o fluxo");
    return flowDto(flow, null);
  });

export const saveFlowDraftFn = createServerFn({ method: "POST" })
  .validator(z.object({ flowId: z.string().uuid(), graphJson: z.string().max(600_000) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const graph = parseGraph(data.graphJson);
    const [flow] = await db
      .update(flows)
      .set({ draftGraph: graph, status: "draft", updatedBy: user.id, updatedAt: new Date() })
      .where(and(eq(flows.id, data.flowId), eq(flows.organizationId, user.organizationId)))
      .returning();
    if (!flow) throw new Error("Fluxo não encontrado");
    return flowDto(flow, await latestVersion(flow.id));
  });

export const publishFlowFn = createServerFn({ method: "POST" })
  .validator(flowIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const flow = await getFlowForOrg(data.flowId, user.organizationId);
    const graph = parseGraph(JSON.stringify(flow.draftGraph));
    const compiledGraph = compileGraph(graph);
    const canonical = JSON.stringify(compiledGraph);
    const checksum = createHash("sha256").update(canonical).digest("hex");
    const nextVersion = ((await latestVersion(flow.id)) ?? 0) + 1;

    const [version] = await db
      .insert(flowVersions)
      .values({
        organizationId: user.organizationId,
        flowId: flow.id,
        version: nextVersion,
        editorGraph: graph,
        compiledGraph,
        checksum,
        publishedBy: user.id,
      })
      .returning();
    if (!version) throw new Error("Não foi possível publicar o fluxo");

    const [updated] = await db
      .update(flows)
      .set({ status: "published", updatedBy: user.id, updatedAt: new Date() })
      .where(eq(flows.id, flow.id))
      .returning();
    if (!updated) throw new Error("Não foi possível atualizar o fluxo");
    return flowDto(updated, version.version);
  });

const simulationSchema = z.object({
  graphJson: z.string().max(600_000),
  inputText: z.string().max(4000).default("sim"),
});

export const simulateFlowFn = createServerFn({ method: "POST" })
  .validator(simulationSchema)
  .handler(async ({ data }) => {
    await requireUser();
    const graph = parseGraph(data.graphJson);
    const compiled = compileGraph(graph);
    const trace: Array<{ nodeId: string; type: string; label: string }> = [];
    let currentId = compiled.entryNodeId;
    const context: Record<string, unknown> = { lastInput: data.inputText };
    const nodes = new Map(compiled.nodes.map((node) => [node.id, node]));

    for (let step = 0; step < 50 && currentId; step += 1) {
      const node = nodes.get(currentId);
      if (!node) throw new Error(`Bloco ${currentId} não encontrado`);
      trace.push({ nodeId: node.id, type: node.type, label: node.data.label });
      if (node.type === "question") context[node.data.variable ?? node.id] = data.inputText;
      if (node.type === "end" || node.type === "handoff") break;
      currentId = compiled.edges.find((edge) => edge.source === node.id)?.target;
    }

    const serializableContext: Record<string, string> = Object.fromEntries(
      Object.entries(context).map(([key, value]) => [key, String(value)]),
    );
    return { ok: true as const, trace, context: serializableContext };
  });

export const bindFlowToConnectionFn = createServerFn({ method: "POST" })
  .validator(bindFlowSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const flow = await getFlowForOrg(data.flowId, user.organizationId);
    const version = await db
      .select()
      .from(flowVersions)
      .where(
        and(eq(flowVersions.flowId, flow.id), eq(flowVersions.organizationId, user.organizationId)),
      )
      .orderBy(desc(flowVersions.version))
      .limit(1);
    const published = version[0];
    if (!published) throw new Error("Publique o fluxo antes de vincular");

    const [connection] = await db
      .select({ id: channelConnections.id })
      .from(channelConnections)
      .where(
        and(
          eq(channelConnections.id, data.connectionId),
          eq(channelConnections.organizationId, user.organizationId),
        ),
      )
      .limit(1);
    if (!connection) throw new Error("Conexão não encontrada");

    await db.transaction(async (tx) => {
      await tx
        .update(flowBindings)
        .set({ active: false })
        .where(
          and(
            eq(flowBindings.channelConnectionId, connection.id),
            eq(flowBindings.trigger, "conversation_started"),
          ),
        );
      await tx.insert(flowBindings).values({
        organizationId: user.organizationId,
        channelConnectionId: connection.id,
        flowVersionId: published.id,
        trigger: "conversation_started",
        active: true,
      });
    });

    return {
      ok: true as const,
      flowId: flow.id,
      connectionId: connection.id,
      version: published.version,
    };
  });
