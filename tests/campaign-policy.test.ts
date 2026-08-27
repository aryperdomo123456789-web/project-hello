import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_BATCH_SIZE,
  CAMPAIGN_MAX_ATTEMPTS,
  campaignIdempotencyKey,
  campaignRateLimitRetryDelayMs,
  campaignRetryDelayMs,
  canConsumeCampaignRateLimit,
  isWithinCampaignWindow,
  renderCampaignMessage,
  shouldDeferCampaignContact,
  splitCampaignBatch,
} from "@/queue/campaignPolicy.server";

describe("políticas do motor de campanhas", () => {
  it("fatia destinatários em lotes controlados", () => {
    const batches = splitCampaignBatch([1, 2, 3, 4, 5], 2);
    expect(batches).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitCampaignBatch([], CAMPAIGN_BATCH_SIZE)).toEqual([]);
  });

  it("aplica rate limit no limite e bloqueia o próximo envio", () => {
    expect(canConsumeCampaignRateLimit(1, 10)).toBe(true);
    expect(canConsumeCampaignRateLimit(10, 10)).toBe(true);
    expect(canConsumeCampaignRateLimit(11, 10)).toBe(false);
    expect(canConsumeCampaignRateLimit(0, 10)).toBe(false);
  });

  it("gera chave determinística por campanha, destinatário e tentativa", () => {
    expect(campaignIdempotencyKey("campaign-1", "recipient-1", 1)).toBe(
      "campaign:campaign-1:recipient-1:1",
    );
    expect(campaignIdempotencyKey("campaign-1", "recipient-1", 1)).toBe(
      campaignIdempotencyKey("campaign-1", "recipient-1", 1),
    );
    expect(campaignIdempotencyKey("campaign-1", "recipient-1", 2)).not.toBe(
      campaignIdempotencyKey("campaign-1", "recipient-1", 1),
    );
  });

  it("respeita janela normal e janela que atravessa meia-noite", () => {
    expect(isWithinCampaignWindow(new Date("2026-08-27T12:00:00Z"), "08:00", "20:00", "UTC")).toBe(
      true,
    );
    expect(isWithinCampaignWindow(new Date("2026-08-27T22:00:00Z"), "08:00", "20:00", "UTC")).toBe(
      false,
    );
    expect(isWithinCampaignWindow(new Date("2026-08-27T23:00:00Z"), "22:00", "06:00", "UTC")).toBe(
      true,
    );
    expect(isWithinCampaignWindow(new Date("2026-08-27T12:00:00Z"), "22:00", "06:00", "UTC")).toBe(
      false,
    );
  });

  it("bloqueia opt-out e adia quietUntil/frequência", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    expect(shouldDeferCampaignContact(now, { optedOut: true, frequencyHours: 24 })).toMatchObject({
      defer: true,
      reason: "opted_out",
    });
    const quietUntil = new Date("2026-08-27T13:00:00Z");
    expect(
      shouldDeferCampaignContact(now, { optedOut: false, quietUntil, frequencyHours: 24 }),
    ).toMatchObject({
      defer: true,
      reason: "quiet_until",
      nextEligibleAt: quietUntil,
    });
    const lastContactAt = new Date("2026-08-27T11:30:00Z");
    expect(
      shouldDeferCampaignContact(now, { optedOut: false, lastContactAt, frequencyHours: 2 }),
    ).toMatchObject({
      defer: true,
      reason: "frequency",
    });
  });

  it("renderiza template e calcula backoff para falhas", () => {
    expect(renderCampaignMessage("Olá {{name}}: {{phone}}", "Ana", "5511999999999")).toBe(
      "Olá Ana: 5511999999999",
    );
    expect(campaignRetryDelayMs(1)).toBe(2_000);
    expect(campaignRetryDelayMs(CAMPAIGN_MAX_ATTEMPTS)).toBe(8_000);
    expect(campaignRateLimitRetryDelayMs(new Date("2026-08-27T12:00:30.000Z"))).toBe(30_500);
  });
});
