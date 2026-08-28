import { describe, expect, it } from "vitest";

import { isOptOutMessage, normalizePhoneE164 } from "@/services/contactGovernance.server";
import { shouldDeferCampaignContact } from "@/queue/campaignPolicy.server";

describe("governança de contatos", () => {
  it("normaliza telefones brasileiros para E.164", () => {
    expect(normalizePhoneE164("(11) 99999-9999")).toBe("+5511999999999");
    expect(normalizePhoneE164("0055 11 99999-9999")).toBe("+5511999999999");
    expect(normalizePhoneE164("+5511999999999")).toBe("+5511999999999");
  });

  it("rejeita telefone vazio ou fora do intervalo", () => {
    expect(() => normalizePhoneE164(" ")).toThrow("Telefone vazio");
    expect(() => normalizePhoneE164("123")).toThrow("E.164");
  });

  it("reconhece comandos de opt-out isolados", () => {
    expect(isOptOutMessage("SAIR")).toBe(true);
    expect(isOptOutMessage(" parar ")).toBe(true);
    expect(isOptOutMessage("CANCELAR")).toBe(true);
    expect(isOptOutMessage("Quero sair da loja")).toBe(false);
    expect(isOptOutMessage("Olá, tudo bem?")).toBe(false);
  });

  it("faz a policy bloquear blacklist antes do opt-out/frequência", () => {
    const decision = shouldDeferCampaignContact(
      new Date("2026-08-27T12:00:00Z"),
      { optedOut: false, frequencyHours: 24 },
      true,
    );
    expect(decision).toEqual({ defer: true, reason: "blacklisted" });
  });
});
