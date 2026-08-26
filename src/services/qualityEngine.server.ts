import type { AssistiveMessage, AssistiveResult } from "@/services/assistiveEngine.server";

export type QualityReviewResult = {
  score: number;
  sentiment: "positive" | "neutral" | "negative";
  intent: AssistiveResult["intent"];
  summary: string;
  policyViolations: string[];
  recommendations: string[];
};

const negativeTerms = [
  "péssimo",
  "horrível",
  "absurdo",
  "reclamação",
  "procon",
  "cancelar",
  "nunca mais",
  "não resolveram",
  "enganado",
];

const sensitiveTerms = ["senha", "token", "cartão", "código de segurança", "documento completo"];
const resolutionTerms = ["resolvido", "obrigado", "perfeito", "deu certo", "consegui", "agradeço"];

function normalize(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function reviewConversation(messages: AssistiveMessage[]): QualityReviewResult {
  const safeMessages = messages.filter((message) => message.text.trim()).slice(-40);
  const inbound = safeMessages.filter((message) => message.sender === "contact");
  const outbound = safeMessages.filter((message) => message.sender === "me");
  const allText = normalize(safeMessages.map((message) => message.text).join(" "));
  const lastInbound = inbound.at(-1)?.text ?? "";
  const lastOutbound = outbound.at(-1)?.text ?? "";
  const negativeCount = negativeTerms.filter((term) => allText.includes(normalize(term))).length;
  const sensitiveCount = sensitiveTerms.filter((term) => allText.includes(normalize(term))).length;
  const resolved = resolutionTerms.some((term) => allText.includes(normalize(term)));
  const hasResponse = outbound.length > 0;
  const responseAfterInbound =
    hasResponse && inbound.length > 0 && safeMessages.at(-1)?.sender === "me";

  const violations: string[] = [];
  if (sensitiveCount > 0)
    violations.push("Conteúdo potencialmente sensível exige revisão e canal seguro.");
  if (negativeCount >= 2) violations.push("Sinais de insatisfação ou escalada detectados.");
  if (!hasResponse && inbound.length > 0)
    violations.push("Mensagem recebida ainda sem resposta registrada.");

  const recommendations: string[] = [];
  if (!hasResponse && inbound.length > 0)
    recommendations.push("Priorizar a conversa e enviar uma primeira resposta.");
  if (!responseAfterInbound && hasResponse && inbound.length > 0)
    recommendations.push("Confirmar que a última mensagem do cliente recebeu retorno.");
  if (negativeCount > 0) recommendations.push("Acionar supervisor e registrar a causa do atrito.");
  if (resolved)
    recommendations.push("Solicitar avaliação pós-atendimento e registrar o motivo da resolução.");
  if (!outbound.length && !inbound.length)
    recommendations.push("Aguardar dados de conversa antes de avaliar qualidade.");

  const score = Math.max(
    0,
    Math.min(
      100,
      55 +
        (hasResponse ? 15 : -25) +
        (responseAfterInbound ? 10 : 0) +
        (resolved ? 15 : 0) -
        negativeCount * 10 -
        sensitiveCount * 8,
    ),
  );

  const sentiment: QualityReviewResult["sentiment"] =
    negativeCount >= 2 ? "negative" : resolved || negativeCount === 0 ? "positive" : "neutral";

  return {
    score,
    sentiment,
    intent: "other",
    summary: `${safeMessages.length} mensagens analisadas; ${inbound.length} recebidas e ${outbound.length} enviadas.`,
    policyViolations: violations,
    recommendations,
  };
}
