import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { channelConnections, webhookEvents } from "@/db/schema";
import { getServerEnv } from "@/server/env.server";
import { consumeRateLimit } from "@/server/rate-limit.server";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";
import { enqueueMagoBotWebhook } from "@/queue/jobs.server";
import {
  isMagoBotTimestampFresh,
  parseMagoBotSignature,
  verifyMagoBotSignature,
} from "@/services/magoBotWebhook.server";

const WEBHOOK_PROVIDER = "mago_bot_api";
const MAX_BODY_BYTES = 1_000_000;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function eventData(payload: JsonRecord): JsonRecord {
  return asRecord(payload["data"]);
}

function eventIdFrom(payload: JsonRecord, data: JsonRecord): string | undefined {
  return (
    firstString(payload, "event_id", "eventId", "id") ??
    firstString(data, "event_id", "eventId", "id")
  );
}

function channelIdFrom(payload: JsonRecord, data: JsonRecord): string | undefined {
  return (
    firstString(payload, "channel_id", "channelId") ?? firstString(data, "channel_id", "channelId")
  );
}

function projectIdFrom(payload: JsonRecord, data: JsonRecord): string | undefined {
  return (
    firstString(payload, "project_id", "projectId") ?? firstString(data, "project_id", "projectId")
  );
}

function tenantIdFrom(payload: JsonRecord, data: JsonRecord): string | undefined {
  return (
    firstString(payload, "organization_id", "organizationId", "tenant_id", "tenantId") ??
    firstString(data, "organization_id", "organizationId", "tenant_id", "tenantId")
  );
}

export const Route = createFileRoute("/api/webhooks/mago-bot")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, service: "mago-bot-api-webhook" }),
      POST: async ({ request }) => {
        const env = getServerEnv();
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (contentLength > MAX_BODY_BYTES) {
          return Response.json({ error: "Payload grande demais" }, { status: 413 });
        }

        try {
          const rate = await consumeRateLimit(
            `mago-bot-webhook:${clientKey(request)}`,
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
          console.error(
            "mago bot webhook rate limiter unavailable",
            error instanceof Error ? error.message : "unknown error",
          );
          return Response.json({ error: "Proteção temporariamente indisponível" }, { status: 503 });
        }

        const rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
          return Response.json({ error: "Payload grande demais" }, { status: 413 });
        }

        const signatureInput = parseMagoBotSignature(request);
        if (
          !signatureInput ||
          !isMagoBotTimestampFresh(signatureInput.timestamp, env.MAGO_BOT_WEBHOOK_MAX_AGE_SECONDS)
        ) {
          return Response.json(
            { error: "Timestamp do webhook inválido ou expirado" },
            { status: 401 },
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody) as unknown;
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        const payload = asRecord(parsed);
        if (Object.keys(payload).length === 0) {
          return Response.json({ error: "Payload inválido" }, { status: 400 });
        }

        const data = eventData(payload);
        const eventId = eventIdFrom(payload, data);
        const channelId = channelIdFrom(payload, data);
        const projectId = projectIdFrom(payload, data);
        const tenantId = tenantIdFrom(payload, data);
        const eventType = firstString(payload, "event_type", "eventType", "type") ?? "unknown";
        if (!eventId || !channelId) {
          return Response.json(
            { error: "event_id e channel_id são obrigatórios" },
            { status: 400 },
          );
        }

        const [connection] = await db
          .select()
          .from(channelConnections)
          .where(eq(channelConnections.apiChannelId, channelId))
          .limit(1);
        if (!connection) {
          return Response.json({ error: "Canal não encontrado" }, { status: 404 });
        }

        if (projectId && connection.apiProjectId !== projectId) {
          return Response.json(
            { error: "Projeto do webhook não corresponde ao canal" },
            { status: 404 },
          );
        }
        if (
          tenantId &&
          connection.apiTenantId !== tenantId &&
          connection.organizationId !== tenantId
        ) {
          return Response.json(
            { error: "Organização do webhook não corresponde ao canal" },
            { status: 404 },
          );
        }

        const integration = await getOrganizationIntegrationRuntime(
          connection.organizationId,
          "mago_bot_api",
        );
        const signingSecret = integration?.credentials["webhookSigningSecret"];
        if (!signingSecret) {
          return Response.json({ error: "Webhook API Mago Bot não configurado" }, { status: 503 });
        }
        if (
          !verifyMagoBotSignature(
            rawBody,
            signatureInput.timestamp,
            signatureInput.signature,
            signingSecret,
          )
        ) {
          return Response.json({ error: "Assinatura inválida" }, { status: 401 });
        }

        const [createdReceipt] = await db
          .insert(webhookEvents)
          .values({
            organizationId: connection.organizationId,
            channelConnectionId: connection.id,
            provider: WEBHOOK_PROVIDER,
            eventId,
            externalEventId: eventId,
            eventType,
            payload,
            status: "received",
            attempts: 0,
          })
          .onConflictDoNothing({
            target: [webhookEvents.provider, webhookEvents.eventId],
          })
          .returning({ id: webhookEvents.id });

        const receipt = createdReceipt
          ? { id: createdReceipt.id, status: "received" }
          : (
              await db
                .select({ id: webhookEvents.id, status: webhookEvents.status })
                .from(webhookEvents)
                .where(
                  and(
                    eq(webhookEvents.provider, WEBHOOK_PROVIDER),
                    eq(webhookEvents.eventId, eventId),
                  ),
                )
                .limit(1)
            )[0];
        if (!receipt) {
          return Response.json({ error: "Receipt não pôde ser localizado" }, { status: 500 });
        }
        if (!createdReceipt && (receipt.status === "processed" || receipt.status === "ignored")) {
          return Response.json({ ok: true, duplicate: true, eventId }, { status: 200 });
        }

        try {
          await enqueueMagoBotWebhook(receipt.id);
        } catch (error) {
          await db
            .update(webhookEvents)
            .set({
              status: "failed",
              lastError: error instanceof Error ? error.message.slice(0, 500) : "Fila indisponível",
            })
            .where(eq(webhookEvents.id, receipt.id));
          return Response.json({ error: "Fila de processamento indisponível" }, { status: 503 });
        }

        return Response.json(
          {
            ok: true,
            accepted: true,
            duplicate: !createdReceipt,
            eventId,
            receiptId: receipt.id,
          },
          { status: 202 },
        );
      },
    },
  },
});
