import { describe, expect, it } from "vitest";

import { DEFAULT_SIMULATION_CHANNELS, simulateInbound } from "@/simulator/simulation";

describe("carga simulada da central", () => {
  it("processa 3000 eventos mantendo o número e a fila corretos", () => {
    const events = Array.from({ length: 3000 }, (_, index) => {
      const channel = DEFAULT_SIMULATION_CHANNELS[index % DEFAULT_SIMULATION_CHANNELS.length]!;
      return simulateInbound(channel, `Mensagem de carga ${index}`);
    });

    expect(events).toHaveLength(3000);
    expect(new Set(events.map((event) => event.channelId))).toEqual(
      new Set(DEFAULT_SIMULATION_CHANNELS.map((channel) => channel.id)),
    );
    expect(events.every((event) => event.trace[0]?.includes(event.phone))).toBe(true);
    expect(events.filter((event) => event.queue === "Comercial")).toHaveLength(1000);
    expect(events.filter((event) => event.queue === "Suporte N1")).toHaveLength(1000);
    expect(events.filter((event) => event.queue === "Financeiro")).toHaveLength(1000);
  });
});
