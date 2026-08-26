import { createHash } from "node:crypto";

import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db/client.server";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import {
  configuredEmbeddingProviderForOrganization,
  embedTexts,
  normalizedCosineSimilarity,
  rerankDocuments,
} from "@/services/embedding.server";
import { getServerEnv } from "@/server/env.server";
import { getOrganizationIntegrationRuntime } from "@/services/integrations.server";

const CHUNK_SIZE = 1200;
const MAX_SOURCE_LENGTH = 200_000;
const EMBEDDING_BATCH_SIZE = 32;
const MAX_CANDIDATES = 200;
const MAX_RERANK_CANDIDATES = 20;

export type KnowledgeHit = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  score: number;
  ranking: "lexical" | "hybrid";
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitKnowledgeText(content: string) {
  const normalized = content.trim().slice(0, MAX_SOURCE_LENGTH);
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= CHUNK_SIZE) {
      current = [current, paragraph].filter(Boolean).join("\n\n");
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= CHUNK_SIZE) {
      current = paragraph;
      continue;
    }
    for (let index = 0; index < paragraph.length; index += CHUNK_SIZE) {
      chunks.push(paragraph.slice(index, index + CHUNK_SIZE).trim());
    }
    current = "";
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export function knowledgeHash(title: string, content: string, sourceUrl?: string) {
  return createHash("sha256")
    .update(`${title}\n${sourceUrl ?? ""}\n${content}`)
    .digest("hex");
}

async function populateEmbeddings(
  organizationId: string,
  chunks: Array<{ id: string; content: string }>,
) {
  if (!(await configuredEmbeddingProviderForOrganization(organizationId))) return;
  for (let start = 0; start < chunks.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(start, start + EMBEDDING_BATCH_SIZE);
    try {
      const vectors = await embedTexts(
        batch.map((chunk) => chunk.content),
        organizationId,
      );
      if (!vectors) return;
      await Promise.all(
        batch.map((chunk, index) => {
          const embedding = vectors[index];
          return embedding
            ? db
                .update(knowledgeChunks)
                .set({ embedding })
                .where(
                  and(
                    eq(knowledgeChunks.id, chunk.id),
                    eq(knowledgeChunks.organizationId, organizationId),
                  ),
                )
            : Promise.resolve();
        }),
      );
    } catch (error) {
      console.warn(
        `[knowledge] embedding unavailable; lexical fallback preserved: ${
          error instanceof Error ? error.message : "provider error"
        }`,
      );
      return;
    }
  }
}

export async function saveKnowledgeDocument(input: {
  organizationId: string;
  userId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  flowId?: string;
}) {
  const content = input.content.trim().slice(0, MAX_SOURCE_LENGTH);
  const chunks = splitKnowledgeText(content);
  if (!chunks.length) throw new Error("Knowledge document cannot be empty");
  const contentHash = knowledgeHash(input.title, content, input.sourceUrl);
  const [document] = await db
    .insert(knowledgeDocuments)
    .values({
      organizationId: input.organizationId,
      flowId: input.flowId,
      title: input.title.trim().slice(0, 180),
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceUrl ? "url" : "manual",
      status: "published",
      contentHash,
      createdBy: input.userId,
    })
    .onConflictDoNothing({
      target: [knowledgeDocuments.organizationId, knowledgeDocuments.contentHash],
    })
    .returning({ id: knowledgeDocuments.id });
  if (!document) return { created: false, chunks: 0, contentHash };
  const insertedChunks = await db
    .insert(knowledgeChunks)
    .values(
      chunks.map((chunk, position) => ({
        organizationId: input.organizationId,
        documentId: document.id,
        position,
        content: chunk,
        metadata: { tokenizer: "character-window", version: 1 },
      })),
    )
    .returning({ id: knowledgeChunks.id, content: knowledgeChunks.content });
  await populateEmbeddings(input.organizationId, insertedChunks);
  return { created: true, documentId: document.id, chunks: insertedChunks.length, contentHash };
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/[\[\]]/g, "");
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  )
    return true;
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized))
    return true;
  const private172 = normalized.match(/^172\.(\d{1,3})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

export function isSafeKnowledgeUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !isPrivateHostname(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function parseProviderContent(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const data = record["data"];
  if (typeof record["markdown"] === "string") return record["markdown"].trim();
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    if (typeof nested["markdown"] === "string") return nested["markdown"].trim();
    if (typeof nested["content"] === "string") return nested["content"].trim();
  }
  if (typeof record["content"] === "string") return record["content"].trim();
  return "";
}

async function ingestWithFirecrawl(
  url: string,
  runtime: Awaited<ReturnType<typeof getOrganizationIntegrationRuntime>>,
) {
  const apiKey = runtime?.credentials["apiKey"];
  if (!apiKey) return null;
  const baseUrl = (runtime.endpointUrl ?? "https://api.firecrawl.dev").replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/scrape") ? baseUrl : `${baseUrl}/v1/scrape`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
    signal: AbortSignal.timeout(Math.min(getServerEnv().AI_TIMEOUT_MS * 2, 30_000)),
  });
  if (!response.ok) throw new Error(`Firecrawl returned HTTP ${response.status}`);
  const content = parseProviderContent(await response.json());
  if (!content) throw new Error("Firecrawl returned empty content");
  return content.slice(0, MAX_SOURCE_LENGTH);
}

async function ingestWithJina(
  parsed: URL,
  runtime: Awaited<ReturnType<typeof getOrganizationIntegrationRuntime>>,
) {
  const env = getServerEnv();
  const apiKey = runtime?.credentials["apiKey"] ?? env.JINA_API_KEY;
  const headers: Record<string, string> = { Accept: "text/markdown, text/plain;q=0.9" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await fetch(`https://r.jina.ai/${parsed.toString()}`, {
    headers,
    signal: AbortSignal.timeout(Math.min(env.AI_TIMEOUT_MS * 2, 30_000)),
  });
  if (!response.ok) throw new Error(`Knowledge source returned HTTP ${response.status}`);
  return (await response.text()).slice(0, MAX_SOURCE_LENGTH);
}

export async function ingestKnowledgeUrl(organizationId: string, url: string) {
  if (!isSafeKnowledgeUrl(url))
    throw new Error("Only safe public HTTP(S) knowledge URLs are allowed");
  const parsed = new URL(url);
  let firecrawlRuntime = null;
  try {
    firecrawlRuntime = await getOrganizationIntegrationRuntime(organizationId, "firecrawl");
  } catch {
    firecrawlRuntime = null;
  }
  let content: string | null = null;
  if (firecrawlRuntime) content = await ingestWithFirecrawl(parsed.toString(), firecrawlRuntime);
  if (!content) {
    let jinaRuntime = null;
    try {
      jinaRuntime = await getOrganizationIntegrationRuntime(organizationId, "jina");
    } catch {
      jinaRuntime = null;
    }
    content = await ingestWithJina(parsed, jinaRuntime);
  }
  return { content, title: parsed.hostname, sourceUrl: parsed.toString() };
}

export async function searchKnowledge(input: {
  organizationId: string;
  query: string;
  limit?: number;
}) {
  const query = normalize(input.query);
  if (!query) return [];
  const terms = query
    .split(" ")
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  const providerEnabled = Boolean(
    await configuredEmbeddingProviderForOrganization(input.organizationId),
  );
  const lexicalFilter = terms.length
    ? or(...terms.map((term) => ilike(knowledgeChunks.content, `%${term}%`)))
    : undefined;
  const candidates = await db
    .select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      title: knowledgeDocuments.title,
      content: knowledgeChunks.content,
      embedding: knowledgeChunks.embedding,
      sourceUrl: knowledgeDocuments.sourceUrl,
      createdAt: knowledgeChunks.createdAt,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
    .where(
      and(
        eq(knowledgeChunks.organizationId, input.organizationId),
        eq(knowledgeDocuments.status, "published"),
        ...(providerEnabled || !lexicalFilter ? [] : [lexicalFilter]),
      ),
    )
    .orderBy(desc(knowledgeChunks.createdAt))
    .limit(MAX_CANDIDATES);

  let queryEmbedding: number[] | null = null;
  if (providerEnabled) {
    try {
      queryEmbedding = (await embedTexts([input.query], input.organizationId))?.[0] ?? null;
    } catch (error) {
      console.warn(
        `[knowledge] query embedding unavailable; lexical fallback preserved: ${
          error instanceof Error ? error.message : "provider error"
        }`,
      );
    }
  }

  const scored = candidates
    .map((candidate) => {
      const haystack = normalize(`${candidate.title} ${candidate.content}`);
      const matched = terms.filter((term) => haystack.includes(term)).length;
      const lexicalScore = terms.length ? matched / terms.length : 0;
      const semanticScore =
        queryEmbedding && candidate.embedding.length
          ? normalizedCosineSimilarity(queryEmbedding, candidate.embedding)
          : 0;
      const score = queryEmbedding ? lexicalScore * 0.35 + semanticScore * 0.65 : lexicalScore;
      return {
        id: candidate.id,
        documentId: candidate.documentId,
        title: candidate.title,
        content: candidate.content,
        ...(candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
        score,
        lexicalScore,
        ranking: queryEmbedding ? ("hybrid" as const) : ("lexical" as const),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const rerankCandidates = scored.slice(0, MAX_RERANK_CANDIDATES);
  try {
    const reranked = await rerankDocuments(
      input.query,
      rerankCandidates.map((candidate) => `${candidate.title}\n${candidate.content}`),
      input.organizationId,
    );
    if (reranked?.length) {
      const rerankByIndex = new Map(reranked.map((item) => [item.index, item.score]));
      for (const [index, candidate] of rerankCandidates.entries()) {
        const rerankScore = rerankByIndex.get(index);
        if (rerankScore !== undefined)
          candidate.score = candidate.score * 0.75 + rerankScore * 0.25;
      }
      rerankCandidates.sort((left, right) => right.score - left.score);
    }
  } catch (error) {
    console.warn(
      `[knowledge] reranker unavailable; hybrid ranking preserved: ${
        error instanceof Error ? error.message : "provider error"
      }`,
    );
  }

  return scored.slice(0, input.limit ?? 5).map(({ lexicalScore: _lexicalScore, ...candidate }) => ({
    ...candidate,
    score: Math.round(candidate.score * 100) / 100,
  })) satisfies KnowledgeHit[];
}
