import { createFileRoute } from "@tanstack/react-router";

import { getServerEnv } from "@/server/env.server";
import { consumeRateLimit } from "@/server/rate-limit.server";
import { assertLicense } from "@/services/license.server";
import { processWebhookEvents } from "@/services/webhookProcessor.server";
import { getWhatsAppAdapter } from "@/services/whatsapp.server";

function isAuthorized(request: Request) {
  const expected = getServerEnv().WHATSAPP_WEBHOOK_SECRET;
  const provided =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(provided && expected && provided === expected);
}

export const Route = createFileRoute("/api/webhooks/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (mode === "subscribe" && token === getServerEnv().WHATSAPP_WEBHOOK_SECRET && challenge) {
          return new Response(challenge, { status: 200 });
        }

        return Response.json({ ok: true, service: "mago-bot-webhook" });
      },
      POST: async ({ request }) => {
        const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
        const clientKey = forwardedFor || request.headers.get("x-real-ip") || "unknown";
        try {
          const rate = await consumeRateLimit(
            `webhook:${clientKey}`,
            getServerEnv().RATE_LIMIT_WEBHOOK_PER_MINUTE,
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
          console.error("webhook rate limiter unavailable", error);
          return Response.json({ error: "Proteção temporariamente indisponível" }, { status: 503 });
        }

        if (!isAuthorized(request)) {
          return Response.json({ error: "Webhook não autorizado" }, { status: 401 });
        }

        await assertLicense("whatsapp:webhook");
        const payload = await request.json();
        const events = getWhatsAppAdapter().normalizeWebhook(payload);
        const results = await processWebhookEvents(events);

        return Response.json({ ok: true, received: events.length, results });
      },
    },
  },
});
