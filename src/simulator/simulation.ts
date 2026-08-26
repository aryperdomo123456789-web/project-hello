export type SimulationChannel = {
  id: string;
  name: string;
  displayPhone: string;
  specialist: string;
  queue: string;
};

export type SimulationEvent = {
  id: string;
  externalId: string;
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

export type SimulationScenario = {
  id: string;
  label: string;
  description: string;
  channelId: string;
  message: string;
  reply: string;
};

export const SIMULATION_SCENARIOS: SimulationScenario[] = [
  {
    id: "sales-qualification",
    label: "Venda consultiva",
    description: "Qualifica interesse e envia para Comercial.",
    channelId: "sim-comercial",
    message: "Quero saber o preço do plano Growth",
    reply: "Vou te mostrar o plano ideal e chamar um especialista comercial.",
  },
  {
    id: "technical-support",
    label: "Suporte técnico",
    description: "Detecta problema e roteia para Suporte N1.",
    channelId: "sim-suporte",
    message: "Estou com problema para acessar minha conta",
    reply: "Entendi. Vou encaminhar seu caso para o Suporte N1.",
  },
  {
    id: "finance-request",
    label: "Financeiro",
    description: "Preserva o contexto e direciona para Financeiro.",
    channelId: "sim-financeiro",
    message: "Preciso da segunda via da minha cobrança",
    reply: "Vou encaminhar sua solicitação para a fila Financeiro.",
  },
];

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
    externalId: `sim-inbound-${channel.id}-${now.getTime()}`,
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
    externalId: `sim-outbound-${event.externalId}`,
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

export type SimulationReplay = {
  accepted: SimulationEvent[];
  duplicates: SimulationEvent[];
  failed: SimulationEvent[];
  channels: string[];
};

export function replaySimulation(events: SimulationEvent[]): SimulationReplay {
  const seen = new Set<string>();
  const accepted: SimulationEvent[] = [];
  const duplicates: SimulationEvent[] = [];
  const failed: SimulationEvent[] = [];
  for (const event of events) {
    if (event.status === "failed") {
      failed.push(event);
      continue;
    }
    if (seen.has(event.externalId)) {
      duplicates.push({
        ...event,
        status: "duplicated",
        trace: [...event.trace, "Replay descartado por externalId idempotente"],
      });
      continue;
    }
    seen.add(event.externalId);
    accepted.push(event);
  }
  return {
    accepted,
    duplicates,
    failed,
    channels: [...new Set(events.map((event) => event.channelId))],
  };
}

export type ChaosScenarioInput = {
  channels?: SimulationChannel[];
  rounds: number;
  duplicateEvery?: number;
  failureEvery?: number;
};

export function runChaosScenario({
  channels = DEFAULT_SIMULATION_CHANNELS,
  rounds,
  duplicateEvery = 0,
  failureEvery = 0,
}: ChaosScenarioInput): SimulationReplay {
  const events: SimulationEvent[] = [];
  for (let index = 0; index < Math.max(0, rounds); index += 1) {
    const channel = channels[index % channels.length];
    if (!channel) continue;
    const inbound = simulateInbound(
      channel,
      `Evento de teste ${index + 1}`,
      new Date(1_700_000_000_000 + index * 1_000),
    );
    events.push(
      failureEvery > 0 && (index + 1) % failureEvery === 0
        ? simulateProviderFailure(inbound)
        : inbound,
    );
    if (duplicateEvery > 0 && (index + 1) % duplicateEvery === 0) {
      events.push(simulateDuplicate(inbound));
    }
  }
  return replaySimulation(events);
}
