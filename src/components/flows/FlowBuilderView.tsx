import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Copy, Download, Save, Send, Sparkles, Upload, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listConnectionsFn, type ConnectionDTO } from "@/functions/channel.functions";
import {
  bindFlowToConnectionFn,
  createFlowFn,
  listFlowsFn,
  publishFlowFn,
  saveFlowDraftFn,
  simulateFlowFn,
  type FlowDTO,
} from "@/functions/flow.functions";
import {
  FLOW_NODE_LABELS,
  starterFlowGraph,
  type FlowGraph,
  type FlowNodeData,
  type FlowNodeKind,
} from "@/flows/types";
import { FLOW_TEMPLATES } from "@/flows/templates";
import { captureDiagnostic } from "@/lib/diagnostics";

const nodeKinds = Object.keys(FLOW_NODE_LABELS) as FlowNodeKind[];

type CanvasNode = Node<FlowNodeData, FlowNodeKind>;

type AutomationNodeProps = NodeProps<CanvasNode>;

function AutomationNode({ data, type, selected }: AutomationNodeProps) {
  const color =
    type === "trigger"
      ? "border-emerald-400 bg-emerald-50"
      : type === "handoff"
        ? "border-amber-400 bg-amber-50"
        : type === "end"
          ? "border-slate-400 bg-slate-100"
          : "border-blue-300 bg-white";
  return (
    <div
      className={`min-w-44 rounded-xl border-2 px-4 py-3 shadow-sm ${color} ${selected ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {FLOW_NODE_LABELS[type as FlowNodeKind] ?? type}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{data.label}</p>
      {data.text && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{data.text}</p>}
    </div>
  );
}

const nodeTypes = Object.fromEntries(nodeKinds.map((kind) => [kind, AutomationNode]));

function graphToReactFlow(graph: FlowGraph) {
  return {
    nodes: graph.nodes as CanvasNode[],
    edges: graph.edges as Edge[],
  };
}

function reactFlowToGraph(nodes: CanvasNode[], edges: Edge[]): FlowGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: (node.type ?? "message") as FlowNodeKind,
      position: { x: node.position.x, y: node.position.y },
      data: node.data,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.label ? { label: String(edge.label) } : {}),
    })),
  };
}

function isFlowGraph(value: unknown): value is FlowGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return false;
  const validNodes = graph.nodes.every((node) => {
    if (!node || typeof node !== "object") return false;
    const candidate = node as Record<string, unknown>;
    const position = candidate["position"];
    const data = candidate["data"];
    return (
      typeof candidate["id"] === "string" &&
      nodeKinds.includes(candidate["type"] as FlowNodeKind) &&
      Boolean(position) &&
      typeof position === "object" &&
      typeof (position as Record<string, unknown>)["x"] === "number" &&
      typeof (position as Record<string, unknown>)["y"] === "number" &&
      Boolean(data) &&
      typeof data === "object" &&
      typeof (data as Record<string, unknown>)["label"] === "string"
    );
  });
  const validEdges = graph.edges.every((edge) => {
    if (!edge || typeof edge !== "object") return false;
    const candidate = edge as Record<string, unknown>;
    return (
      typeof candidate["id"] === "string" &&
      typeof candidate["source"] === "string" &&
      typeof candidate["target"] === "string"
    );
  });
  return validNodes && validEdges;
}

function parseFlowGraph(value: string, context: string): FlowGraph {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isFlowGraph(parsed)) throw new Error("Grafo precisa conter nodes e edges válidos");
    return parsed;
  } catch (error) {
    captureDiagnostic(error, {
      source: "async",
      component: "FlowBuilderView",
      payload: { operation: "parse_flow_graph", context },
      recoverable: true,
    });
    toast.error(
      "O rascunho estava inválido; carregamos um fluxo vazio para você recuperar o trabalho.",
    );
    return starterFlowGraph();
  }
}

export function FlowBuilderView() {
  const listFlows = useServerFn(listFlowsFn);
  const createFlow = useServerFn(createFlowFn);
  const saveDraft = useServerFn(saveFlowDraftFn);
  const publishFlow = useServerFn(publishFlowFn);
  const listConnections = useServerFn(listConnectionsFn);
  const bindFlow = useServerFn(bindFlowToConnectionFn);
  const simulateFlow = useServerFn(simulateFlowFn);
  const [flows, setFlows] = useState<FlowDTO[]>([]);
  const [connections, setConnections] = useState<ConnectionDTO[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [newFlowName, setNewFlowName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("vendas");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [saving, setSaving] = useState(false);
  const [simulationOutput, setSimulationOutput] = useState<string[]>([]);
  const [simulationInput, setSimulationInput] = useState("Olá, quero saber mais");
  const importInputRef = useRef<HTMLInputElement>(null);

  const selectedFlow = useMemo(
    () => flows.find((flow) => flow.id === selectedFlowId) ?? null,
    [flows, selectedFlowId],
  );
  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const load = useCallback(async () => {
    const [flowRows, connectionRows] = await Promise.all([listFlows(), listConnections()]);
    setFlows(flowRows);
    setConnections(connectionRows);
    setSelectedConnectionId((current) => current || connectionRows[0]?.id || "");
    if (flowRows[0] && !selectedFlowId) {
      setSelectedFlowId(flowRows[0].id);
      const graph = graphToReactFlow(parseFlowGraph(flowRows[0].draftGraphJson, "initial_load"));
      setNodes(graph.nodes);
      setEdges(graph.edges);
    }
  }, [listConnections, listFlows, selectedFlowId, setEdges, setNodes]);

  useEffect(() => {
    void load().catch((error) => {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        payload: { operation: "load_flows" },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao carregar automações");
    });
  }, [load]);

  function selectFlow(flow: FlowDTO) {
    setSelectedFlowId(flow.id);
    setSelectedNodeId(null);
    const graph = graphToReactFlow(parseFlowGraph(flow.draftGraphJson, "select_flow"));
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }

  async function handleCreateFlow() {
    const name = newFlowName.trim();
    if (!name) {
      toast.error("Dê um nome para o especialista");
      return;
    }
    setSaving(true);
    try {
      const template = FLOW_TEMPLATES.find((item) => item.id === selectedTemplateId);
      const graph = template?.graph ?? starterFlowGraph();
      const flow = await createFlow({
        data: { name, category: template?.category ?? "custom", graphJson: JSON.stringify(graph) },
      });
      setFlows((current) => [flow, ...current]);
      selectFlow(flow);
      setNewFlowName("");
      toast.success("Especialista criado como rascunho");
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        payload: { operation: "create_flow", templateId: selectedTemplateId },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao criar especialista");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(): Promise<boolean> {
    if (!selectedFlowId) return false;
    setSaving(true);
    try {
      const flow = await saveDraft({
        data: { flowId: selectedFlowId, graphJson: JSON.stringify(reactFlowToGraph(nodes, edges)) },
      });
      setFlows((current) => current.map((item) => (item.id === flow.id ? flow : item)));
      toast.success("Rascunho salvo");
      return true;
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        state: { selectedFlowId, nodeCount: nodes.length, edgeCount: edges.length },
        payload: { operation: "save_flow_draft" },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao salvar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!selectedFlowId) return;
    const saved = await handleSave();
    if (!saved) return;
    setSaving(true);
    try {
      const flow = await publishFlow({ data: { flowId: selectedFlowId } });
      setFlows((current) => current.map((item) => (item.id === flow.id ? flow : item)));
      toast.success(`Versão ${flow.publishedVersion} publicada`);
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        payload: { operation: "publish_flow", flowId: selectedFlowId },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao publicar");
    } finally {
      setSaving(false);
    }
  }

  function handleExport() {
    if (!selectedFlow) return;
    const payload = JSON.stringify(
      {
        name: selectedFlow.name,
        category: selectedFlow.category,
        graph: reactFlowToGraph(nodes, edges),
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedFlow.slug || "especialista"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Fluxo exportado");
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result ?? ""));
        const graphValue =
          parsed && typeof parsed === "object" && "graph" in parsed
            ? (parsed as { graph?: unknown }).graph
            : parsed;
        const graph = parseFlowGraph(JSON.stringify(graphValue), "import_file");
        const reactGraph = graphToReactFlow(graph);
        setNodes(reactGraph.nodes);
        setEdges(reactGraph.edges);
        toast.success("Fluxo importado como alteração local; salve para persistir");
      } catch (error) {
        captureDiagnostic(error, {
          source: "async",
          component: "FlowBuilderView",
          payload: { operation: "import_flow", fileName: file.name, fileSize: file.size },
          recoverable: true,
        });
        toast.error("Arquivo de fluxo inválido");
      }
    };
    reader.onerror = () => {
      const error = reader.error ?? new Error("Falha ao ler arquivo de fluxo");
      captureDiagnostic(error, {
        source: "network",
        component: "FlowBuilderView",
        payload: { operation: "read_flow_file", fileName: file.name },
        recoverable: true,
      });
      toast.error("Não foi possível ler o arquivo");
    };
    reader.readAsText(file);
  }

  async function handleDuplicate() {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      const copy = await createFlow({
        data: {
          name: `${selectedFlow.name} (cópia)`.slice(0, 120),
          category: selectedFlow.category,
          graphJson: JSON.stringify(reactFlowToGraph(nodes, edges)),
        },
      });
      setFlows((current) => [copy, ...current]);
      selectFlow(copy);
      toast.success("Especialista duplicado");
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        payload: { operation: "duplicate_flow", flowId: selectedFlow.id },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao duplicar");
    } finally {
      setSaving(false);
    }
  }

  async function handleBind() {
    if (!selectedFlowId || !selectedConnectionId) {
      toast.error("Escolha um fluxo e um número");
      return;
    }
    try {
      const result = await bindFlow({
        data: { flowId: selectedFlowId, connectionId: selectedConnectionId },
      });
      toast.success(`Fluxo ${result.version} vinculado ao número`);
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        payload: {
          operation: "bind_flow",
          flowId: selectedFlowId,
          connectionId: selectedConnectionId,
        },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha ao vincular");
    }
  }

  async function handleSimulate() {
    if (!selectedFlowId) return;
    try {
      const result = await simulateFlow({
        data: {
          graphJson: JSON.stringify(reactFlowToGraph(nodes, edges)),
          inputText: simulationInput.trim() || "sim",
        },
      });
      setSimulationOutput(result.trace.map((item) => `${item.type}: ${item.label}`));
      toast.success("Simulação concluída sem envio real");
    } catch (error) {
      captureDiagnostic(error, {
        source: "async",
        component: "FlowBuilderView",
        state: { selectedFlowId, nodeCount: nodes.length, edgeCount: edges.length },
        payload: { operation: "simulate_flow", inputLength: simulationInput.length },
        recoverable: true,
      });
      toast.error(error instanceof Error ? error.message : "Falha na simulação");
    }
  }

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => addEdge({ ...connection, animated: true }, current));
    },
    [setEdges],
  );

  function addNode(kind: FlowNodeKind) {
    const id = `${kind}-${crypto.randomUUID().slice(0, 8)}`;
    setNodes((current) => [
      ...current,
      {
        id,
        type: kind,
        position: { x: 180 + current.length * 30, y: 100 + (current.length % 4) * 110 },
        data: { label: FLOW_NODE_LABELS[kind] },
      },
    ]);
  }

  function updateSelectedNode(patch: Partial<FlowNodeData>) {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    );
  }

  function updateSelectedEdgeLabel(label: string) {
    if (!selectedEdgeId) return;
    setEdges((current) =>
      current.map((edge) => (edge.id === selectedEdgeId ? { ...edge, label } : edge)),
    );
  }

  return (
    <div className="flex h-full min-h-[680px] flex-col bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold">Especialistas por número</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Desenhe, publique e conecte um atendimento diferente a cada WhatsApp.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-10 rounded-md border bg-white px-3 text-sm"
            value={selectedConnectionId}
            onChange={(event) => setSelectedConnectionId(event.target.value)}
          >
            <option value="">Vincular a um número...</option>
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => void handleBind()}
            disabled={!selectedFlowId || !selectedConnectionId}
          >
            Vincular fluxo
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            disabled={!selectedFlowId || saving}
          >
            <Upload className="mr-1 h-4 w-4" /> Importar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!selectedFlowId || saving}
          >
            <Download className="mr-1 h-4 w-4" /> Exportar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDuplicate()}
            disabled={!selectedFlowId || saving}
          >
            <Copy className="mr-1 h-4 w-4" /> Duplicar
          </Button>
          <div className="hidden items-center gap-2 rounded-md border bg-slate-50 p-1 lg:flex">
            <Input
              className="h-8 w-48 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
              value={simulationInput}
              onChange={(event) => setSimulationInput(event.target.value)}
              placeholder="Mensagem de teste..."
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSimulate()}
              disabled={!selectedFlowId || saving}
            >
              Simular conversa
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => void handleSave()}
            disabled={!selectedFlowId || saving}
            className="gap-2"
          >
            <Save className="h-4 w-4" /> Salvar
          </Button>
          <Button
            onClick={() => void handlePublish()}
            disabled={!selectedFlowId || saving}
            className="gap-2"
          >
            <Send className="h-4 w-4" /> Publicar
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 border-r bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Meus especialistas
            </p>
            <Sparkles className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mb-4 space-y-2">
            <Input
              placeholder="Novo especialista"
              value={newFlowName}
              onChange={(event) => setNewFlowName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreateFlow();
              }}
            />
            <select
              className="h-9 w-full rounded-md border bg-white px-2 text-xs"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              {FLOW_TEMPLATES.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="w-full"
              onClick={() => void handleCreateFlow()}
              disabled={saving}
            >
              Criar especialista
            </Button>
          </div>
          <div className="space-y-2">
            {flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => selectFlow(flow)}
                className={`w-full rounded-xl border p-3 text-left transition ${flow.id === selectedFlowId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <p className="truncate text-sm font-semibold">{flow.name}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">
                  {flow.status} {flow.publishedVersion ? `• v${flow.publishedVersion}` : ""}
                </p>
              </button>
            ))}
          </div>
          {flows.length === 0 && (
            <p className="text-xs leading-relaxed text-slate-500">
              Crie seu primeiro especialista. O fluxo começa com entrada, boas-vindas, pergunta e
              transbordo.
            </p>
          )}
        </aside>

        <div className="relative min-w-0 flex-1 bg-slate-100">
          {!selectedFlow ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-slate-500">
              <div>
                <Workflow className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                <p>Crie ou selecione um especialista para desenhar.</p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={(_, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              fitView
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap />
            </ReactFlow>
          )}
          {simulationOutput.length > 0 && (
            <div className="absolute right-4 top-4 z-10 max-w-64 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                  Simulação
                </p>
                <button onClick={() => setSimulationOutput([])}>
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <ol className="space-y-1 text-xs text-slate-600">
                {simulationOutput.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <span className="mr-1 font-bold text-blue-600">{index + 1}.</span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {selectedFlow && (
            <div className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] gap-2 overflow-x-auto rounded-xl border bg-white/95 p-2 shadow-lg backdrop-blur">
              {nodeKinds.map((kind) => (
                <button
                  key={kind}
                  className="whitespace-nowrap rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-100 hover:text-blue-700"
                  onClick={() => addNode(kind)}
                >
                  + {FLOW_NODE_LABELS[kind]}
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="w-72 shrink-0 border-l bg-white p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Inspector</p>
              <p className="mt-1 text-sm font-semibold">
                {selectedEdge ? "Configurar saída" : "Configurar bloco"}
              </p>
            </div>
            {(selectedNode || selectedEdge) && (
              <button
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}
          </div>
          {selectedEdge ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Rótulo da saída</label>
                <Input
                  className="mt-1"
                  value={String(selectedEdge.label ?? "")}
                  onChange={(event) => updateSelectedEdgeLabel(event.target.value)}
                  placeholder="sim ou não"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Condições usam esses rótulos para escolher o caminho.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                <p>Origem: {selectedEdge.source}</p>
                <p className="mt-1">Destino: {selectedEdge.target}</p>
              </div>
            </div>
          ) : !selectedNode ? (
            <p className="text-sm leading-relaxed text-slate-500">
              Clique em um bloco ou em uma saída do canvas para editar o especialista.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Nome do bloco</label>
                <Input
                  className="mt-1"
                  value={selectedNode.data.label}
                  onChange={(event) => updateSelectedNode({ label: event.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Mensagem / instrução</label>
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border bg-white p-2 text-sm outline-none focus:border-blue-500"
                  value={selectedNode.data.text ?? ""}
                  onChange={(event) => updateSelectedNode({ text: event.target.value })}
                />
              </div>
              {selectedNode.type === "question" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Guardar resposta em
                  </label>
                  <Input
                    className="mt-1"
                    value={selectedNode.data.variable ?? ""}
                    onChange={(event) => updateSelectedNode({ variable: event.target.value })}
                    placeholder="ex.: assunto"
                  />
                </div>
              )}
              {selectedNode.type === "condition" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Regra da condição</label>
                  <Input
                    className="mt-1"
                    value={selectedNode.data.condition ?? ""}
                    onChange={(event) => updateSelectedNode({ condition: event.target.value })}
                    placeholder={'assunto contains "financeiro"'}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Use `campo contains valor` ou `campo == valor`.
                  </p>
                </div>
              )}
              {selectedNode.type === "assign_queue" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Fila destino</label>
                  <Input
                    className="mt-1"
                    value={selectedNode.data.queue ?? ""}
                    onChange={(event) => updateSelectedNode({ queue: event.target.value })}
                    placeholder="Comercial"
                  />
                </div>
              )}
              {selectedNode.type === "tag" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Tag</label>
                  <Input
                    className="mt-1"
                    value={selectedNode.data.tag ?? ""}
                    onChange={(event) => updateSelectedNode({ tag: event.target.value })}
                    placeholder="lead-quente"
                  />
                </div>
              )}
              {selectedNode.type === "delay" && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Aguardar (segundos)
                  </label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={0}
                    value={selectedNode.data.seconds ?? 0}
                    onChange={(event) =>
                      updateSelectedNode({ seconds: Number(event.target.value) || 0 })
                    }
                  />
                </div>
              )}
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                <p className="font-semibold text-slate-700">Tipo</p>
                <p className="mt-1">
                  {FLOW_NODE_LABELS[selectedNode.type as FlowNodeKind] ?? selectedNode.type}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
