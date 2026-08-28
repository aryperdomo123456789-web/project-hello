import { createFileRoute } from "@tanstack/react-router";

import { consumeRateLimit } from "@/server/rate-limit.server";
import { getServerEnv } from "@/server/env.server";
import { processStripeWebhook } from "@/services/stripe-billing.server";
import { constructWebhookEvent } from "@/services/stripe.server";

const SUPPORTED_EVENTS = new Set([
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "customer.subscription.deleted",
  "customer.subscription.updated",
]);

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "mago-bot-stripe-webhook" }),
      POST: async ({ request }) => {
        const env = getServerEnv();
        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
          return Response.json({ error: "Webhook Stripe não configurado" }, { status: 503 });
        }

        try {
          const rate = await consumeRateLimit(
            `stripe-webhook:${clientKey(request)}`,
            env.RATE_LIMIT_WEBHOOK_PER_MINUTE,
            60,
          );
          if (!rate.allowed) {
            return Response.json(
              {
                error: "Limite de requisições atingido",
                retryAfterSeconds: rate.retryAfterSeconds,
              },
              { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
            );
          }
        } catch {
          return Response.json({ error: "Proteção temporariamente indisponível" }, { status: 503 });
        }

        const signature = request.headers.get("stripe-signature") ?? "";
        if (!signature) return Response.json({ error: "Assinatura ausente" }, { status: 400 });

        let event: ReturnType<typeof constructWebhookEvent>;
        try {
          const payload = await request.text();
          event = constructWebhookEvent(payload, signature);
        } catch {
          return Response.json({ error: "Assinatura Stripe inválida" }, { status: 400 });
        }

        if (!SUPPORTED_EVENTS.has(event.type)) {
          return Response.json({ ok: true, ignored: true, eventId: event.id, type: event.type });
        }

        try {
          const result = await processStripeWebhook(event);
          return Response.json({ ok: true, type: event.type, ...result });
        } catch {
          console.error("stripe webhook processing failed", {
            type: event.type,
            eventId: event.id,
          });
          return Response.json({ error: "Evento Stripe não processado" }, { status: 500 });
        }
      },
    },
  },
});
