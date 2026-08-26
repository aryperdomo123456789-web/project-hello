import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "@/server/auth.server";
import { getServerEnv } from "@/server/env.server";
import { buildAssistSuggestions } from "@/services/assistiveEngine.server";
import { generateWithFallback } from "@/services/aiProvider.server";
import { searchKnowledge, type KnowledgeHit } from "@/services/knowledge.server";

const assistSchema = z.object({
  contactName: z.string().trim().max(160).default(""),
  messages: z
    .array(
      z.object({
        sender: z.enum(["me", "contact"]),
        text: z.string().max(4000),
      }),
    )
    .max(20),
});

const modelResultSchema = z.object({
  intent: z.enum(["sales", "support", "finance", "scheduling", "other"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(500),
  nextAction: z.string().max(500),
  suggestions: z.array(z.string().min(1).max(600)).min(1).max(3),
});

function parseModelResult(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return modelResultSchema.safeParse(parsed);
  } catch {
    return { success: false as const };
  }
}

export const suggestAssistFn = createServerFn({ method: "POST" })
  .validator(assistSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const deterministic = buildAssistSuggestions(data.contactName, data.messages);
    let knowledge: KnowledgeHit[] = [];
    try {
      const query = data.messages
        .slice(-6)
        .map((message) => message.text)
        .join(" ")
        .slice(0, 4_000);
      knowledge = await searchKnowledge({
        organizationId: user.organizationId,
        query,
        limit: 4,
      });
    } catch {
      knowledge = [];
    }
    const knowledgeContext = knowledge.length
      ? `\n\nBase de conhecimento autorizada:\n${knowledge
          .map((hit, index) => `[${index + 1}] ${hit.title}: ${hit.content}`)
          .join("\n")}`
      : "";
    const env = getServerEnv();
    if (env.AI_PRIMARY_PROVIDER === "stub" && env.AI_FALLBACK_PROVIDER === "stub") {
      return { ...deterministic, source: "rules" as const };
    }

    try {
      const response = await generateWithFallback({
        purpose: "suggest",
        organizationId: user.organizationId,
        system: `Você é um copiloto de atendimento. Responda somente JSON válido com intent, confidence, summary, nextAction e suggestions. Nunca envie mensagens, nunca invente dados pessoais e sempre recomende revisão humana. Se a base de conhecimento não trouxer a resposta, diga que é necessário revisar.${knowledgeContext}`,
        ...(data.contactName ? { userId: data.contactName } : {}),
        messages: data.messages.slice(-12).map((message) => ({
          role: message.sender === "contact" ? ("user" as const) : ("assistant" as const),
          content: message.text,
        })),
      });
      const parsed = parseModelResult(response.text);
      if (parsed.success)
        return {
          ...parsed.data,
          source: response.provider,
          knowledgeSources: knowledge.map((hit) => ({
            title: hit.title,
            ...(hit.sourceUrl ? { sourceUrl: hit.sourceUrl } : {}),
          })),
        };
    } catch {
      // O modo de regras mantém o atendimento operável quando o provedor falha.
    }
    return { ...deterministic, source: "rules" as const };
  });
