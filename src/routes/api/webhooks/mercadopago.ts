import { createFileRoute } from "@tanstack/react-router";

import { consumeRateLimit } from "@/server/rate-limit.server";
import { getServerEnv } from "@/server/env.server";
import {
  parseMercadoPagoWebhook,
  verifyMercadoPagoWebhookSignature,
} from "@/services/mercadopago.server";
import { processMercadoPagoWebhook } from "@/services/mercadopago-billing.server";

function clientKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export const Route = createFileRoute("/api/webhooks/mercadopago")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "mago-bot-mercadopago-webhook" }),
      POST: async ({ request }) => {
        const env = getServerEnv();
        if (!env.MP_WEBHOOK_SECRET) {
          return Response.json({ error: "Webhook Mercado Pago não configurado" }, { status: 503 });
        }
        try {
          const rate = await consumeRateLimit(
            `mercadopago-webhook:${clientKey(request)}`,
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
        } catch (error) {
          console.error("mercadopago webhook rate limiter unavailable", error);
          return Response.json({ error: "Proteção temporariamente indisponível" }, { status: 503 });
        }

        let payload: Record<string, unknown>;
        try {
          const parsed: unknown = await request.json();
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return Response.json({ error: "Payload inválido" }, { status: 400 });
          }
          payload = parsed as Record<string, unknown>;
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }

        try {
          const event = parseMercadoPagoWebhook(request, payload);
          const valid = verifyMercadoPagoWebhookSignature({
            request,
            dataId: event.dataId,
            secret: env.MP_WEBHOOK_SECRET,
          });
          if (!valid) return Response.json({ error: "Assinatura inválida" }, { status: 401 });
          const result = await processMercadoPagoWebhook(event);
          return Response.json(
            { ok: true, eventId: event.externalEventId, result },
            { status: 200 },
          );
        } catch (error) {
          console.error(
            "mercadopago webhook processing failed",
            error instanceof Error ? error.message : "unknown error",
          );
          return Response.json({ error: "Notificação não processada" }, { status: 500 });
        }
      },
    },
  },
});
