import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureDiagnostic,
  clearDiagnostics,
  getDiagnostics,
  registerDiagnosticRetry,
  requestDiagnosticRetry,
} from "@/lib/diagnostics";

describe("diagnóstico resiliente", () => {
  beforeEach(() => clearDiagnostics());

  it("redige segredos e conserva contexto acionável", () => {
    const record = captureDiagnostic(new Error("Falha no envio"), {
      source: "network",
      component: "ChatMessageArea",
      state: { conversationId: "conversation-1", token: "do-not-store" },
      payload: {
        url: "/api/send",
        authorization: "Bearer do-not-store",
        status: 502,
      },
    });

    expect(record.message).toBe("Falha no envio");
    expect(record.location.component).toBe("ChatMessageArea");
    expect(record.state).toMatchObject({ token: "[REDACTED]" });
    expect(record.payload).toMatchObject({ authorization: "[REDACTED]", status: 502 });
    expect(record.actionPlan.length).toBeGreaterThan(2);
    expect(getDiagnostics()).toHaveLength(1);
  });

  it("permite recarregar somente o componente que falhou", () => {
    const retry = vi.fn();
    const record = captureDiagnostic(new Error("Render quebrado"), {
      source: "render",
      component: "reports-screen",
    });
    registerDiagnosticRetry(record.id, retry);

    requestDiagnosticRetry(record.id);

    expect(retry).toHaveBeenCalledOnce();
  });
});
