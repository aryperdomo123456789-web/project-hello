import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ingestKnowledgeUrl,
  saveKnowledgeDocument,
  searchKnowledge,
} from "@/services/knowledge.server";
import { requireRole, requireUser } from "@/server/auth.server";

const saveSchema = z.object({
  title: z.string().trim().min(2).max(180),
  content: z.string().trim().min(20).max(200_000),
  sourceUrl: z.string().url().max(2_000).optional(),
  flowId: z.string().uuid().optional(),
});

export const createKnowledgeDocumentFn = createServerFn({ method: "POST" })
  .validator(saveSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    return saveKnowledgeDocument({
      organizationId: user.organizationId,
      userId: user.id,
      title: data.title,
      content: data.content,
      ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
      ...(data.flowId ? { flowId: data.flowId } : {}),
    });
  });

export const createKnowledgeFromUrlFn = createServerFn({ method: "POST" })
  .validator(z.object({ url: z.string().url().max(2_000), flowId: z.string().uuid().optional() }))
  .handler(async ({ data }) => {
    const user = await requireRole("owner", "admin", "manager");
    const source = await ingestKnowledgeUrl(data.url);
    return saveKnowledgeDocument({
      organizationId: user.organizationId,
      userId: user.id,
      title: source.title,
      content: source.content,
      sourceUrl: source.sourceUrl,
      ...(data.flowId ? { flowId: data.flowId } : {}),
    });
  });

export const searchKnowledgeFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      query: z.string().trim().min(2).max(500),
      limit: z.number().int().min(1).max(10).default(5),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    return searchKnowledge({
      organizationId: user.organizationId,
      query: data.query,
      limit: data.limit,
    });
  });
