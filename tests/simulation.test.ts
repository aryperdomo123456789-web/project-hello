import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIMULATION_CHANNELS,
  simulateDuplicate,
  simulateInbound,
  simulateProviderFailure,
  simulateReply,
  replaySimulation,
  runChaosScenario,
} from "@/simulator/simulation";

describe("laboratório multi-WhatsApp", () => {
  it("preserva o especialista e a fila de cada número", () => {
    const [commercial, support] = DEFAULT_SIMULATION_CHANNELS;
    const commercialEvent = simulateInbound(commercial!, "Quero saber o preço");
    const supportEvent = simulateInbound(support!, "Estou com erro no acesso");

    expect(commercialEvent).toMatchObject({
      channelId: "sim-comercial",
      specialist: "Especialista de vendas",
      queue: "Comercial",
      status: "routed",
    });
    expect(supportEvent).toMatchObject({
      channelId: "sim-suporte",
      specialist: "Especialista técnico",
      queue: "Suporte N1",
      status: "routed",
    });
  });

  it("mostra resposta, replay idempotente e falha encaminhada para retry", () => {
    const event = simulateInbound(DEFAULT_SIMULATION_CHANNELS[0]!, "Olá");
    expect(simulateReply(event).status).toBe("replied");
    expect(simulateDuplicate(event).trace.at(-1)).toContain("descartado por idempotência");
    expect(simulateProviderFailure(event).trace.at(-1)).toContain("retry do worker");
  });

  it("reproduz caos sem misturar canais e descarta duplicações por externalId", () => {
    const original = simulateInbound(
      DEFAULT_SIMULATION_CHANNELS[0]!,
      "Evento repetido",
      new Date(1_700_000_000_000),
    );
    const replay = replaySimulation([original, simulateDuplicate(original)]);
    expect(replay.accepted).toHaveLength(1);
    expect(replay.duplicates).toHaveLength(1);
    expect(replay.channels).toEqual(["sim-comercial"]);

    const chaos = runChaosScenario({ rounds: 12, duplicateEvery: 3, failureEvery: 5 });
    expect(chaos.channels).toHaveLength(3);
    expect(chaos.failed).toHaveLength(2);
    expect(chaos.duplicates).toHaveLength(4);
    expect(chaos.accepted.every((event) => event.channelId.startsWith("sim-"))).toBe(true);
  });
});
