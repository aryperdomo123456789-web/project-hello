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

export async function ingestKnowledgeUrl(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Only HTTP(S) knowledge URLs are allowed");
  const env = getServerEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS * 2);
  try {
    const headers: Record<string, string> = { Accept: "text/markdown, text/plain;q=0.9" };
    if (env.JINA_API_KEY) headers["Authorization"] = `Bearer ${env.JINA_API_KEY}`;
    const response = await fetch(`https://r.jina.ai/${parsed.toString()}`, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Knowledge source returned HTTP ${response.status}`);
    const content = (await response.text()).slice(0, MAX_SOURCE_LENGTH);
    return { content, title: parsed.hostname, sourceUrl: parsed.toString() };
  } finally {
    clearTimeout(timer);
  }
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
