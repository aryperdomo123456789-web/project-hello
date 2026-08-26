export type SimulationChannel = {
  id: string;
  name: string;
  displayPhone: string;
  specialist: string;
  queue: string;
};

export type SimulationEvent = {
  id: string;
  channelId: string;
  channelName: string;
  phone: string;
  direction: "inbound" | "outbound" | "system";
  text: string;
  timestamp: string;
  status: "received" | "routed" | "replied" | "duplicated" | "failed";
  specialist: string;
  queue: string;
  trace: string[];
};

export const DEFAULT_SIMULATION_CHANNELS: SimulationChannel[] = [
  {
    id: "sim-comercial",
    name: "Comercial",
    displayPhone: "+55 11 90000-1001",
    specialist: "Especialista de vendas",
    queue: "Comercial",
  },
  {
    id: "sim-suporte",
    name: "Suporte",
    displayPhone: "+55 11 90000-1002",
    specialist: "Especialista técnico",
    queue: "Suporte N1",
  },
  {
    id: "sim-financeiro",
    name: "Financeiro",
    displayPhone: "+55 11 90000-1003",
    specialist: "Especialista financeiro",
    queue: "Financeiro",
  },
];

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `sim-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function buildTrace(channel: SimulationChannel, text: string) {
  const normalized = text.toLowerCase();
  const trace = [
    `Entrada recebida no número ${channel.displayPhone}`,
    `Fluxo selecionado: ${channel.specialist}`,
  ];
  if (
    normalized.includes("preço") ||
    normalized.includes("preco") ||
    normalized.includes("comprar")
  ) {
    trace.push("Condição: intenção comercial detectada");
    trace.push(`Fila de destino: ${channel.queue}`);
  } else if (normalized.includes("problema") || normalized.includes("erro")) {
    trace.push("Condição: suporte técnico detectado");
    trace.push(`Fila de destino: ${channel.queue}`);
  } else {
    trace.push("Condição: mensagem inicial sem intenção explícita");
    trace.push("Ação: pergunta de qualificação enviada");
  }
  return trace;
}

export function simulateInbound(
  channel: SimulationChannel,
  text: string,
  now = new Date(),
): SimulationEvent {
  const safeText = text.trim() || "Mensagem vazia de teste";
  return {
    id: createId(),
    channelId: channel.id,
    channelName: channel.name,
    phone: channel.displayPhone,
    direction: "inbound",
    text: safeText,
    timestamp: now.toISOString(),
    status: "routed",
    specialist: channel.specialist,
    queue: channel.queue,
    trace: buildTrace(channel, safeText),
  };
}

export function simulateReply(
  event: SimulationEvent,
  text = "Recebido. Um especialista continuará seu atendimento.",
) {
  return {
    ...event,
    id: createId(),
    direction: "outbound" as const,
    text,
    status: "replied" as const,
    timestamp: new Date().toISOString(),
    trace: [
      ...event.trace,
      "Resposta produzida no modo sandbox",
      "Mensagem pronta para o provedor",
    ],
  };
}

export function simulateDuplicate(event: SimulationEvent) {
  return {
    ...event,
    id: createId(),
    status: "duplicated" as const,
    timestamp: new Date().toISOString(),
    trace: [
      ...event.trace,
      "Replay do mesmo webhook detectado",
      "Evento descartado por idempotência",
    ],
  };
}

export function simulateProviderFailure(event: SimulationEvent) {
  return {
    ...event,
    id: createId(),
    status: "failed" as const,
    timestamp: new Date().toISOString(),
    trace: [
      ...event.trace,
      "Falha controlada no provedor",
      "Efeito encaminhado para retry do worker",
    ],
  };
}
