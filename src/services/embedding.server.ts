import { getServerEnv } from "@/server/env.server";

const MAX_BATCH = 32;
const MAX_TEXT_LENGTH = 8_000;
const MAX_DIMENSIONS = 4_096;

export type EmbeddingProvider = "jina" | "openai-compatible";
export type RerankResult = { index: number; score: number };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function finiteVector(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DIMENSIONS) return null;
  const vector = value.map((entry) => (typeof entry === "number" ? entry : Number(entry)));
  return vector.every((entry) => Number.isFinite(entry)) ? vector : null;
}

function normalizeProvider(value: string | undefined): EmbeddingProvider | null {
  return value === "jina" || value === "openai-compatible" ? value : null;
}

function endpointFor(provider: EmbeddingProvider): string {
  if (provider === "jina") return "https://api.jina.ai/v1/embeddings";
  return `${getServerEnv().EMBEDDING_API_BASE_URL?.replace(/\/$/, "") ?? ""}/embeddings`;
}

function keyFor(provider: EmbeddingProvider): string | undefined {
  const env = getServerEnv();
  return provider === "jina" ? env.JINA_API_KEY : env.EMBEDDING_API_KEY;
}

function modelFor(provider: EmbeddingProvider): string {
  const env = getServerEnv();
  return provider === "jina" ? env.EMBEDDING_MODEL : env.EMBEDDING_MODEL;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function normalizedCosineSimilarity(left: number[], right: number[]): number {
  return Math.max(0, Math.min(1, (cosineSimilarity(left, right) + 1) / 2));
}

async function requestJson(url: string, body: Record<string, unknown>, apiKey: string) {
  const env = getServerEnv();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.min(env.AI_TIMEOUT_MS * 2, 30_000)),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`Embedding provider HTTP ${response.status}`);
  return data;
}

function parseEmbeddings(data: unknown, expected: number): number[][] | null {
  const record = asRecord(data);
  const raw = Array.isArray(data) ? data : record["data"];
  if (!Array.isArray(raw)) return null;
  const sorted = raw
    .map((item, fallbackIndex) => {
      const itemRecord = asRecord(item);
      return {
        index: typeof itemRecord["index"] === "number" ? itemRecord["index"] : fallbackIndex,
        vector: finiteVector(itemRecord["embedding"]),
      };
    })
    .filter((item): item is { index: number; vector: number[] } => item.vector !== null)
    .sort((left, right) => left.index - right.index);
  if (sorted.length !== expected) return null;
  const dimensions = sorted[0]?.vector.length;
  if (!dimensions || sorted.some((item) => item.vector.length !== dimensions)) return null;
  return sorted.map((item) => item.vector);
}

export function configuredEmbeddingProvider(): EmbeddingProvider | null {
  const env = getServerEnv();
  const provider = normalizeProvider(env.EMBEDDING_PROVIDER);
  if (!provider || !keyFor(provider)) return null;
  if (provider === "openai-compatible" && !env.EMBEDDING_API_BASE_URL) return null;
  return provider;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const provider = configuredEmbeddingProvider();
  if (!provider || texts.length === 0 || texts.length > MAX_BATCH) return null;
  const apiKey = keyFor(provider);
  if (!apiKey) return null;
  const safeTexts = texts.map((text) => text.trim().slice(0, MAX_TEXT_LENGTH));
  if (safeTexts.some((text) => !text)) return null;
  const data = await requestJson(
    endpointFor(provider),
    {
      model: modelFor(provider),
      input: safeTexts,
      ...(provider === "jina" ? { task: "retrieval.passage" } : {}),
    },
    apiKey,
  );
  return parseEmbeddings(data, safeTexts.length);
}

export async function rerankDocuments(
  query: string,
  documents: string[],
): Promise<RerankResult[] | null> {
  const env = getServerEnv();
  if (env.RERANK_PROVIDER !== "jina" || !env.JINA_API_KEY || documents.length === 0) return null;
  const data = await requestJson(
    "https://api.jina.ai/v1/rerank",
    {
      model: env.RERANK_MODEL,
      query: query.slice(0, MAX_TEXT_LENGTH),
      documents: documents
        .slice(0, MAX_BATCH)
        .map((document) => document.slice(0, MAX_TEXT_LENGTH)),
      top_n: Math.min(documents.length, MAX_BATCH),
    },
    env.JINA_API_KEY,
  );
  const raw = asRecord(data)["results"];
  if (!Array.isArray(raw)) return null;
  return raw
    .map((item) => {
      const record = asRecord(item);
      return {
        index: typeof record["index"] === "number" ? record["index"] : -1,
        score: typeof record["relevance_score"] === "number" ? record["relevance_score"] : 0,
      };
    })
    .filter((item) => item.index >= 0 && Number.isFinite(item.score));
}
