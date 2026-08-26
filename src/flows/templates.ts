import type { FlowGraph, FlowNodeKind } from "./types";

type Template = {
  id: string;
  name: string;
  category: string;
  description: string;
  graph: FlowGraph;
};

function node(
  id: string,
  type: FlowNodeKind,
  x: number,
  y: number,
  label: string,
  data: Record<string, unknown> = {},
) {
  return { id, type, position: { x, y }, data: { label, ...data } };
}

export const FLOW_TEMPLATES: Template[] = [
  {
    id: "vendas",
    name: "Especialista Comercial",
    category: "vendas",
    description: "Qualifica o lead e entrega para o comercial.",
    graph: {
      nodes: [
        node("trigger", "trigger", 40, 180, "Lead chamou"),
        node("welcome", "message", 300, 180, "Boas-vindas", {
          text: "Olá! Sou o especialista comercial. Posso entender o que você procura?",
        }),
        node("qualify", "question", 590, 180, "Qualificar interesse", {
          variable: "interesse",
          text: "Você busca preço, demonstração ou falar com um consultor?",
        }),
        node("tag", "tag", 880, 80, "Marcar lead", { tag: "lead-qualificado" }),
        node("handoff", "handoff", 880, 260, "Entregar ao comercial"),
      ],
      edges: [
        { id: "e1", source: "trigger", target: "welcome" },
        { id: "e2", source: "welcome", target: "qualify" },
        { id: "e3", source: "qualify", target: "tag", label: "sim" },
        { id: "e4", source: "tag", target: "handoff" },
        { id: "e5", source: "qualify", target: "handoff", label: "não" },
      ],
    },
  },
  {
    id: "suporte",
    name: "Especialista de Suporte",
    category: "suporte",
    description: "Faz triagem e envia para a fila técnica.",
    graph: {
      nodes: [
        node("trigger", "trigger", 40, 180, "Cliente chamou"),
        node("welcome", "message", 300, 180, "Acolher", {
          text: "Olá! Vou agilizar seu suporte. Qual produto ou serviço apresentou problema?",
        }),
        node("question", "question", 590, 180, "Coletar problema", {
          variable: "problema",
          text: "Descreva em uma frase o que aconteceu.",
        }),
        node("queue", "assign_queue", 880, 180, "Fila Suporte", { queue: "suporte" }),
        node("handoff", "handoff", 1150, 180, "Transbordar N1"),
      ],
      edges: [
        { id: "e1", source: "trigger", target: "welcome" },
        { id: "e2", source: "welcome", target: "question" },
        { id: "e3", source: "question", target: "queue" },
        { id: "e4", source: "queue", target: "handoff" },
      ],
    },
  },
  {
    id: "financeiro",
    name: "Especialista Financeiro",
    category: "financeiro",
    description: "Identifica a solicitação e envia ao financeiro.",
    graph: {
      nodes: [
        node("trigger", "trigger", 40, 180, "Cliente chamou"),
        node("welcome", "message", 300, 180, "Financeiro", {
          text: "Olá! Posso ajudar com boleto, pagamento ou negociação.",
        }),
        node("question", "question", 590, 180, "Entender pedido", {
          variable: "pedido_financeiro",
          text: "Você precisa de segunda via, status de pagamento ou negociação?",
        }),
        node("tag", "tag", 880, 180, "Identificar financeiro", { tag: "financeiro" }),
        node("queue", "assign_queue", 1150, 180, "Fila Financeiro", { queue: "financeiro" }),
        node("handoff", "handoff", 1410, 180, "Transbordar"),
      ],
      edges: [
        { id: "e1", source: "trigger", target: "welcome" },
        { id: "e2", source: "welcome", target: "question" },
        { id: "e3", source: "question", target: "tag" },
        { id: "e4", source: "tag", target: "queue" },
        { id: "e5", source: "queue", target: "handoff" },
      ],
    },
  },
  {
    id: "agendamento",
    name: "Especialista de Agendamento",
    category: "agendamento",
    description: "Coleta preferência e entrega para a agenda.",
    graph: {
      nodes: [
        node("trigger", "trigger", 40, 180, "Cliente chamou"),
        node("welcome", "message", 300, 180, "Agendar atendimento", {
          text: "Olá! Vou encontrar o melhor horário para você.",
        }),
        node("question", "question", 590, 180, "Coletar preferência", {
          variable: "preferencia",
          text: "Qual dia e período são melhores para você?",
        }),
        node("queue", "assign_queue", 880, 180, "Fila Agenda", { queue: "comercial" }),
        node("handoff", "handoff", 1150, 180, "Confirmar horário"),
      ],
      edges: [
        { id: "e1", source: "trigger", target: "welcome" },
        { id: "e2", source: "welcome", target: "question" },
        { id: "e3", source: "question", target: "queue" },
        { id: "e4", source: "queue", target: "handoff" },
      ],
    },
  },
  {
    id: "recuperacao",
    name: "Especialista de Recuperação",
    category: "recuperacao",
    description: "Recupera conversas paradas com abordagem humana.",
    graph: {
      nodes: [
        node("trigger", "trigger", 40, 180, "Cliente retornou"),
        node("message", "message", 300, 180, "Retomar conversa", {
          text: "Que bom falar com você de novo. Posso retomar de onde paramos?",
        }),
        node("question", "question", 590, 180, "Confirmar interesse", {
          variable: "retorno",
          text: "Você ainda quer receber ajuda com essa solicitação?",
        }),
        node("condition", "condition", 880, 180, "Interesse ativo", {
          condition: "retorno contains sim",
        }),
        node("handoff", "handoff", 1150, 100, "Entregar ao time"),
        node("end", "end", 1150, 280, "Encerrar com respeito"),
      ],
      edges: [
        { id: "e1", source: "trigger", target: "message" },
        { id: "e2", source: "message", target: "question" },
        { id: "e3", source: "question", target: "condition" },
        { id: "e4", source: "condition", target: "handoff", label: "sim" },
        { id: "e5", source: "condition", target: "end", label: "não" },
      ],
    },
  },
];
