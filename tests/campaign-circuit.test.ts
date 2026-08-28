import { describe, expect, it } from "vitest";

import {
  circuitReasonForChannel,
  isFatalProviderError,
  isOfflineChannelStatus,
} from "@/queue/campaignCircuit.server";
import { buildTelemetryRow } from "@/services/campaignTelemetry.server";
import { MagoBotApiError } from "@/services/magoBotApi.types";

describe("circuit breaker de campanhas", () => {
  it.each(["close", "closed", "disconnected", "offline", "error", "failed"])(
    "abre o circuito para status %s",
    (status) => {
      expect(isOfflineChannelStatus(status)).toBe(true);
    },
  );

  it("não abre o circuito para canal conectado", () => {
    expect(isOfflineChannelStatus("open")).toBe(false);
    expect(isOfflineChannelStatus("connected")).toBe(false);
  });

  it("classifica erro fatal do provider e ignora timeout transitório", () => {
    expect(isFatalProviderError(new Error("channel disconnected"))).toBe(true);
    expect(
      isFatalProviderError(
        new MagoBotApiError("credencial rejeitada", { status: 401, code: "unauthorized" }),
      ),
    ).toBe(true);
    expect(
      isFatalProviderError(new MagoBotApiError("timeout", { status: 503, code: "timeout" })),
    ).toBe(false);
  });

  it("gera motivo persistível para o alerta interno", () => {
    expect(circuitReasonForChannel("close")).toContain("close");
  });
});

describe("telemetria agregada de campanhas", () => {
  it("calcula entrega, leitura, falha e opt-out com denominadores seguros", () => {
    const row = buildTelemetryRow(
      "campaign-1",
      "Reativação",
      new Map([
        ["pending", 2],
        ["sent", 3],
        ["delivered", 3],
        ["read", 2],
        ["failed", 1],
        ["opted_out", 1],
      ]),
    );
    expect(row.total).toBe(12);
    expect(row.queued).toBe(2);
    expect(row.sent).toBe(8);
    expect(row.delivered).toBe(5);
    expect(row.read).toBe(2);
    expect(row.deliveryRate).toBe(62.5);
    expect(row.readRate).toBe(40);
    expect(row.failureRate).toBe(8.33);
    expect(row.optOutRate).toBe(8.33);
  });

  it("retorna zero para métricas sem destinatários", () => {
    const row = buildTelemetryRow("empty", "Vazia", new Map());
    expect(row.total).toBe(0);
    expect(row.deliveryRate).toBe(0);
    expect(row.readRate).toBe(0);
    expect(row.failureRate).toBe(0);
    expect(row.optOutRate).toBe(0);
  });
});
