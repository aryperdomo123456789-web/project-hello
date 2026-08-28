import { describe, expect, it } from "vitest";

import {
  campaignDeterministicRandom,
  campaignPacingDelayMs,
  parseCampaignSpintax,
  renderCampaignMessage,
} from "@/queue/campaignPolicy.server";

describe("variação segura e pacing de campanhas", () => {
  it("expande alternativas explícitas sem interpretar placeholders CRM", () => {
    expect(parseCampaignSpintax("{Olá|Oi|E aí}, {{name}}!", () => 0)).toBe("Olá, {{name}}!");
    expect(
      renderCampaignMessage("{Olá|Oi|E aí}, {{name}}!", "Ana", "5511999999999", () => 0.99),
    ).toBe("E aí, Ana!");
  });

  it("preserva texto sem alternativas e remove escolhas vazias", () => {
    expect(parseCampaignSpintax("Olá {{name}}", () => 0)).toBe("Olá {{name}}");
    expect(parseCampaignSpintax("{ |Oi}", () => 0)).toBe("Oi");
  });

  it("calcula pacing dentro dos limites configurados", () => {
    expect(campaignPacingDelayMs(5, 25, () => 0)).toBe(5_000);
    expect(campaignPacingDelayMs(5, 25, () => 0.999)).toBe(25_000);
    expect(campaignPacingDelayMs(-2, 0, () => 0.5)).toBe(0);
    expect(campaignPacingDelayMs(25, 5, () => 0)).toBe(5_000);
  });

  it("mantém variante e pacing estáveis por chave de idempotência", () => {
    const key = "campaign:c1:r1:1";
    const firstVariant = renderCampaignMessage(
      "{Olá|Oi}, {{name}}",
      "Ana",
      "5511",
      campaignDeterministicRandom(key),
    );
    const retryVariant = renderCampaignMessage(
      "{Olá|Oi}, {{name}}",
      "Ana",
      "5511",
      campaignDeterministicRandom(key),
    );
    const firstDelay = campaignPacingDelayMs(5, 25, campaignDeterministicRandom(`${key}:pacing`));
    const retryDelay = campaignPacingDelayMs(5, 25, campaignDeterministicRandom(`${key}:pacing`));
    expect(retryVariant).toBe(firstVariant);
    expect(retryDelay).toBe(firstDelay);
  });
});
