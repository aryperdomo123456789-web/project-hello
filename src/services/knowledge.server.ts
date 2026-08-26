import { createHash } from "node:crypto";

import { and, desc, eq, ilike } from "drizzle-orm";

import { db } from "@/db/client.server";
import { knowledgeChunks, knowledgeDocuments } from "@/db/schema";
import { getServerEnv } from "@/server/env.server";

const CHUNK_SIZE = 1200;
const MAX_SOURCE_LENGTH = 200_000;

export type KnowledgeHit = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  sourceUrl?: string;
  score: number;
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
  await db.insert(knowledgeChunks).values(
    chunks.map((chunk, position) => ({
      organizationId: input.organizationId,
      documentId: document.id,
      position,
      content: chunk,
      metadata: { tokenizer: "character-window", version: 1 },
    })),
  );
  return { created: true, documentId: document.id, chunks: chunks.length, contentHash };
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
  const terms = query
    .split(" ")
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  if (!terms.length) return [];
  const candidates = await db
    .select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      title: knowledgeDocuments.title,
      content: knowledgeChunks.content,
      sourceUrl: knowledgeDocuments.sourceUrl,
      createdAt: knowledgeChunks.createdAt,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocuments.id, knowledgeChunks.documentId))
    .where(
      and(
        eq(knowledgeChunks.organizationId, input.organizationId),
        eq(knowledgeDocuments.status, "published"),
        ilike(knowledgeChunks.content, `%${terms[0]}%`),
      ),
    )
    .orderBy(desc(knowledgeChunks.createdAt))
    .limit(200);
  return candidates
    .map((candidate) => {
      const haystack = normalize(`${candidate.title} ${candidate.content}`);
      const matched = terms.filter((term) => haystack.includes(term)).length;
      return {
        id: candidate.id,
        documentId: candidate.documentId,
        title: candidate.title,
        content: candidate.content,
        ...(candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
        score: Math.round((matched / terms.length) * 100) / 100,
      } satisfies KnowledgeHit;
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 5);
}
