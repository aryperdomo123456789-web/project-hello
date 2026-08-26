import { and, eq } from "drizzle-orm";

import { db } from "@/db/client.server";
import { messages } from "@/db/schema";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";
import { getServerEnv } from "@/server/env.server";
import { isSafeKnowledgeUrl } from "@/services/knowledge.server";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const DEFAULT_MODEL = "whisper-1";

type TranscriptionResult = {
  text: string;
  language?: string;
  durationSeconds?: number;
  provider: "whisper" | "groq";
  model: string;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function getTranscriptionRuntime(organizationId: string) {
  try {
    const whisper = await getOrganizationIntegrationRuntime(organizationId, "whisper");
    if (whisper?.credentials["apiKey"]) return whisper;
  } catch {
    // A broken tenant credential should fall back to the next configured provider.
  }
  try {
    const groq = await getOrganizationIntegrationRuntime(organizationId, "groq");
    if (groq?.credentials["apiKey"]) return groq;
  } catch {
    // A broken tenant credential should not crash the worker before the global fallback.
  }
  return null;
}

function transcriptionEndpoint(provider: "whisper" | "groq", endpointUrl: string | undefined) {
  const env = getServerEnv();
  const fallback =
    provider === "groq"
      ? "https://api.groq.com/openai/v1"
      : env.WHISPER_API_BASE_URL || "https://api.openai.com/v1";
  const base = (endpointUrl || fallback).replace(/\/$/, "");
  return base.endsWith("/audio/transcriptions") ? base : `${base}/audio/transcriptions`;
}

function globalTranscriptionConfig() {
  const env = getServerEnv();
  if (env.WHISPER_API_KEY) {
    return {
      provider: "whisper" as const,
      apiKey: env.WHISPER_API_KEY,
      model: env.WHISPER_MODEL,
      endpointUrl: env.WHISPER_API_BASE_URL || undefined,
    };
  }
  if (env.GROQ_API_KEY) {
    return {
      provider: "groq" as const,
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_TRANSCRIPTION_MODEL,
      endpointUrl: "https://api.groq.com/openai/v1",
    };
  }
  return null;
}

export async function transcribeAudio(input: {
  organizationId: string;
  mediaUrl: string;
  filename?: string;
  mimeType?: string;
}): Promise<TranscriptionResult> {
  if (!isSafeKnowledgeUrl(input.mediaUrl)) throw new Error("URL de áudio não é pública ou segura");

  const runtime = await getTranscriptionRuntime(input.organizationId);
  const global = globalTranscriptionConfig();
  const provider = runtime?.provider === "groq" ? "groq" : runtime ? "whisper" : global?.provider;
  const apiKey = runtime?.credentials["apiKey"] ?? global?.apiKey;
  if (!provider || !apiKey) throw new Error("Nenhum provider de transcrição está configurado");

  const mediaResponse = await fetch(input.mediaUrl, {
    signal: AbortSignal.timeout(Math.min(getServerEnv().AI_TIMEOUT_MS * 3, 45_000)),
  });
  if (!mediaResponse.ok) throw new Error(`Áudio retornou HTTP ${mediaResponse.status}`);
  const declaredLength = Number(mediaResponse.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error("Áudio excede o limite de 25 MB");
  const bytes = await mediaResponse.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES)
    throw new Error("Áudio vazio ou excede o limite de 25 MB");

  const form = new FormData();
  const mimeType = input.mimeType?.startsWith("audio/") ? input.mimeType : "audio/mpeg";
  const filename = input.filename?.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "audio.ogg";
  form.set("file", new Blob([bytes], { type: mimeType }), filename);
  form.set("model", runtime?.model ?? global?.model ?? DEFAULT_MODEL);
  form.set("response_format", "json");

  const model = runtime?.model ?? global?.model ?? DEFAULT_MODEL;
  const response = await fetch(
    transcriptionEndpoint(provider, runtime?.endpointUrl ?? global?.endpointUrl),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(Math.min(getServerEnv().AI_TIMEOUT_MS * 4, 60_000)),
    },
  );
  if (!response.ok) throw new Error(`Transcription provider returned HTTP ${response.status}`);
  const body = recordValue(await response.json());
  const text = stringValue(body["text"]);
  if (!text) throw new Error("Transcription provider returned empty text");
  return {
    text: text.slice(0, 50_000),
    ...(typeof body["language"] === "string" ? { language: body["language"] } : {}),
    ...(typeof body["duration"] === "number" ? { durationSeconds: body["duration"] } : {}),
    provider,
    model,
  };
}

export async function transcribeMessage(messageId: string) {
  const [message] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message) return { status: "missing" as const };
  if (message.type !== "audio") return { status: "ignored" as const, reason: "not_audio" };

  const payload = recordValue(message.payload);
  const currentTranscription = recordValue(payload["transcription"]);
  if (currentTranscription["status"] === "completed" && stringValue(message.text)) {
    return { status: "completed" as const, text: message.text };
  }
  const media = recordValue(payload["media"]);
  const mediaUrl = stringValue(payload["mediaUrl"]) || stringValue(media["url"]);
  if (!mediaUrl) {
    await db
      .update(messages)
      .set({
        payload: { ...payload, transcription: { status: "failed", error: "media_url_missing" } },
      })
      .where(and(eq(messages.id, message.id), eq(messages.organizationId, message.organizationId)));
    return { status: "failed" as const, reason: "media_url_missing" };
  }

  await db
    .update(messages)
    .set({ payload: { ...payload, transcription: { status: "processing" } } })
    .where(and(eq(messages.id, message.id), eq(messages.organizationId, message.organizationId)));

  try {
    const filename = stringValue(media["filename"]) || stringValue(payload["filename"]);
    const mimeType = stringValue(media["mimeType"]) || stringValue(payload["mimeType"]);
    const result = await transcribeAudio({
      organizationId: message.organizationId,
      mediaUrl,
      ...(filename ? { filename } : {}),
      ...(mimeType ? { mimeType } : {}),
    });
    await db
      .update(messages)
      .set({
        text: result.text,
        payload: {
          ...payload,
          transcription: {
            status: "completed",
            text: result.text,
            provider: result.provider,
            model: result.model,
            ...(result.language ? { language: result.language } : {}),
            ...(result.durationSeconds !== undefined
              ? { durationSeconds: result.durationSeconds }
              : {}),
            completedAt: new Date().toISOString(),
          },
        },
      })
      .where(and(eq(messages.id, message.id), eq(messages.organizationId, message.organizationId)));
    return { status: "completed" as const, text: result.text, provider: result.provider };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "transcription_failed";
    await db
      .update(messages)
      .set({
        payload: { ...payload, transcription: { status: "failed", error: reason.slice(0, 500) } },
      })
      .where(and(eq(messages.id, message.id), eq(messages.organizationId, message.organizationId)));
    throw error;
  }
}
