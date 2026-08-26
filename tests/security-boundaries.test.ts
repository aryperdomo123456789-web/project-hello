import { describe, expect, it } from "vitest";

import { canAccessTab } from "@/permissions/roles";
import { buildAssistSuggestions } from "@/services/assistiveEngine.server";

describe("security and product boundaries", () => {
  it("hides administrative areas from agents", () => {
    expect(canAccessTab("agent", "Atendimento")).toBe(true);
    expect(canAccessTab("agent", "Contatos/CRM")).toBe(true);
    expect(canAccessTab("agent", "Equipe")).toBe(false);
    expect(canAccessTab("agent", "Conexões")).toBe(false);
    expect(canAccessTab("agent", "Saúde")).toBe(false);
    expect(canAccessTab("owner", "Configurações")).toBe(true);
  });

  it("keeps assistive output as a suggestion, never an automatic send", () => {
    const result = buildAssistSuggestions("Ana", [
      { sender: "contact", text: "Preciso da segunda via do boleto" },
    ]);
    expect(result.intent).toBe("finance");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.every((suggestion) => typeof suggestion === "string")).toBe(true);
    expect(result).not.toHaveProperty("send");
    expect(result).not.toHaveProperty("dispatch");
  });

  it("does not leak context between simulated channels", () => {
    const first = buildAssistSuggestions("Contato A", [
      { sender: "contact", text: "Quero agendar para amanhã" },
    ]);
    const second = buildAssistSuggestions("Contato B", [
      { sender: "contact", text: "Estou com um erro no sistema" },
    ]);
    expect(first.intent).toBe("scheduling");
    expect(second.intent).toBe("support");
    expect(first.summary).not.toContain("Contato B");
    expect(second.summary).not.toContain("Contato A");
  });
});
