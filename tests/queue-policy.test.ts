import { describe, expect, it } from "vitest";

import {
  calculateSlaState,
  chooseQueueAgent,
  isWithinBusinessHours,
  type BusinessHours,
  type QueueAgent,
} from "@/queues/policy";

const weekdayHours: BusinessHours = {
  timezone: "America/Sao_Paulo",
  weekdays: {
    1: { start: "08:00", end: "18:00" },
    2: { start: "08:00", end: "18:00" },
    3: { start: "08:00", end: "18:00" },
    4: { start: "08:00", end: "18:00" },
    5: { start: "08:00", end: "18:00" },
  },
};

const agents: QueueAgent[] = [
  { userId: "a", load: 1, maxConcurrentChats: 3, online: true, skills: ["vendas"] },
  { userId: "b", load: 0, maxConcurrentChats: 3, online: true, skills: ["suporte"] },
  { userId: "c", load: 0, maxConcurrentChats: 0, online: true, skills: ["financeiro"] },
];

describe("política operacional de filas", () => {
  it("respeita horário comercial e janela fora do expediente", () => {
    expect(isWithinBusinessHours(new Date("2026-08-26T12:00:00Z"), weekdayHours)).toBe(true);
    expect(isWithinBusinessHours(new Date("2026-08-26T22:00:00Z"), weekdayHours)).toBe(false);
  });

  it("escolhe agente online com capacidade e skill quando disponível", () => {
    expect(chooseQueueAgent(agents, "skill", "suporte")?.userId).toBe("b");
    expect(chooseQueueAgent(agents, "skill", "financeiro")).toBeNull();
  });

  it("classifica SLA em normal, alerta e rompido", () => {
    expect(calculateSlaState(4, 15)).toBe("within_sla");
    expect(calculateSlaState(12, 15)).toBe("warning");
    expect(calculateSlaState(15, 15)).toBe("breached");
  });
});
