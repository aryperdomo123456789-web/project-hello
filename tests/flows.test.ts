import { describe, expect, it } from "vitest";

import { FLOW_TEMPLATES } from "@/flows/templates";
import { starterFlowGraph } from "@/flows/types";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";

function assertGraph(graph: ReturnType<typeof starterFlowGraph>) {
  const ids = graph.nodes.map((node) => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(graph.nodes.filter((node) => node.type === "trigger")).toHaveLength(1);
  for (const edge of graph.edges) {
    expect(ids).toContain(edge.source);
    expect(ids).toContain(edge.target);
  }
}

describe("especialistas de atendimento", () => {
  it("mantém o grafo inicial válido", () => {
    assertGraph(starterFlowGraph());
  });

  it("entrega templates prontos para os principais setores", () => {
    expect(FLOW_TEMPLATES.map((template) => template.id)).toEqual([
      "vendas",
      "suporte",
      "financeiro",
      "agendamento",
      "recuperacao",
    ]);
    for (const template of FLOW_TEMPLATES) assertGraph(template.graph);
  });

  it("permite criar conexão e gerar QR sem rede no adaptador stub", async () => {
    const adapter = getWhatsAppAdapter();
    const instance = await adapter.createInstance("Teste");
    const qr = await adapter.getQrCode(instance.id);
    expect(instance.status).toBe("connecting");
    expect(qr.base64).toContain("api.qrserver.com");
    expect((await adapter.sendText(instance.id, "5511999999999", "Olá")).externalId).toContain(
      "stub-message-",
    );
  });
});
