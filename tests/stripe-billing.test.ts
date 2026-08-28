import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { stripeBillingTransition } from "@/services/stripe-billing.server";

const SECRET = "whsec_test_secret_for_unit_tests";

describe("Stripe billing", () => {
  it.each([
    ["checkout.session.completed", null, "active", true, null],
    ["invoice.payment_succeeded", null, "active", true, null],
    ["customer.subscription.updated", "past_due", "past_due", true, null],
    ["customer.subscription.updated", "unpaid", "canceled", false, "starter"],
    ["customer.subscription.deleted", "active", "canceled", false, "starter"],
  ])(
    "calcula a transição para %s/%s",
    (eventType, providerStatus, billingStatus, grantsPlanAccess, fallbackPlan) => {
      expect(stripeBillingTransition(eventType, providerStatus)).toEqual({
        billingStatus,
        grantsPlanAccess,
        fallbackPlan,
      });
    },
  );

  it("valida a assinatura do corpo bruto e rejeita adulteração", () => {
    const payload = JSON.stringify({
      id: "evt_test_123",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_123", object: "checkout.session" } },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000),
    });
    const stripe = new Stripe("sk_test_unit_only");
    const event = stripe.webhooks.constructEvent(payload, signature, SECRET);
    expect(event.id).toBe("evt_test_123");
    expect(event.type).toBe("checkout.session.completed");
    expect(() => stripe.webhooks.constructEvent(`${payload} `, signature, SECRET)).toThrow();
  });
});
