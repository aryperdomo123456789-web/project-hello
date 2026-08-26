import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  organizationIdFromMercadoPagoReference,
  parseMercadoPagoWebhook,
  planFromMercadoPagoReference,
  verifyMercadoPagoWebhookSignature,
} from "@/services/mercadopago.server";

const organizationId = "123e4567-e89b-12d3-a456-426614174000";

function signedRequest(dataId: string, timestamp: number, secret = "sandbox-webhook-secret") {
  const requestId = "req-test-123";
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");
  return new Request(`https://mago-bot.com/api/webhooks/mercadopago?data.id=${dataId}`, {
    headers: {
      "x-request-id": requestId,
      "x-signature": `ts=${timestamp},v1=${digest}`,
    },
  });
}

describe("Mercado Pago adapter", () => {
  it("validates the official x-signature manifest", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(
      verifyMercadoPagoWebhookSignature({
        request: signedRequest("payment-1", timestamp),
        dataId: "payment-1",
        secret: "sandbox-webhook-secret",
      }),
    ).toBe(true);
    expect(
      verifyMercadoPagoWebhookSignature({
        request: signedRequest("payment-1", timestamp),
        dataId: "payment-1",
        secret: "wrong-secret",
      }),
    ).toBe(false);
  });

  it("rejects stale signatures and parses notification data", () => {
    const stale = Math.floor(Date.now() / 1000) - 90_000;
    expect(
      verifyMercadoPagoWebhookSignature({
        request: signedRequest("payment-2", stale),
        dataId: "payment-2",
        secret: "sandbox-webhook-secret",
      }),
    ).toBe(false);
    const event = parseMercadoPagoWebhook(
      signedRequest("payment-3", Math.floor(Date.now() / 1000)),
      { id: 77, type: "payment", action: "payment.updated", data: { id: "payment-3" } },
    );
    expect(event).toEqual({
      externalEventId: "77",
      type: "payment",
      action: "payment.updated",
      dataId: "payment-3",
    });
  });

  it("extracts tenant and plan from a stable external reference", () => {
    const reference = `mago-bot:org:${organizationId}:plan:growth:checkout-1`;
    expect(organizationIdFromMercadoPagoReference(reference)).toBe(organizationId);
    expect(planFromMercadoPagoReference(reference)).toBe("growth");
    expect(organizationIdFromMercadoPagoReference("unknown")).toBeNull();
  });
});
