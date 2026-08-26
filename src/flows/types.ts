export type FlowNodeKind =
  | "trigger"
  | "message"
  | "question"
  | "condition"
  | "assign_queue"
  | "handoff"
  | "delay"
  | "tag"
  | "end";

export type FlowNodeData = {
  label: string;
  text?: string;
  variable?: string;
  condition?: string;
  queue?: string;
  tag?: string;
  seconds?: number;
};

export type FlowNode = {
  id: string;
  type: FlowNodeKind;
  position: { x: number; y: number };
  data: FlowNodeData;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type FlowGraph = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export const FLOW_NODE_LABELS: Record<FlowNodeKind, string> = {
  trigger: "Entrada",
  message: "Enviar mensagem",
  question: "Perguntar",
  condition: "Condição",
  assign_queue: "Enviar para fila",
  handoff: "Transferir para humano",
  delay: "Aguardar",
  tag: "Adicionar tag",
  end: "Encerrar",
};

export function starterFlowGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 80, y: 180 },
        data: { label: "Quando o cliente chamar" },
      },
      {
        id: "message-1",
        type: "message",
        position: { x: 360, y: 180 },
        data: { label: "Boas-vindas", text: "Olá! Como posso ajudar?" },
      },
      {
        id: "question-1",
        type: "question",
        position: { x: 660, y: 180 },
        data: { label: "Identificar intenção", variable: "intencao" },
      },
      {
        id: "handoff-1",
        type: "handoff",
        position: { x: 980, y: 180 },
        data: { label: "Enviar para atendimento" },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-1", target: "message-1" },
      { id: "edge-2", source: "message-1", target: "question-1" },
      { id: "edge-3", source: "question-1", target: "handoff-1" },
    ],
  };
}
