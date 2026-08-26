import { conversations, contactTasks, contacts, conversationRatings, tickets } from "@/db/schema";

export type CustomerIntelligenceInput = {
  contact: typeof contacts.$inferSelect;
  conversations: Array<{ status: string; priority: number; createdAt: Date; lastMessageAt: Date }>;
  tasks: Array<{ status: string; dueAt: Date | null }>;
  tickets: Array<{ status: string; priority: number }>;
  ratings: Array<{ rating: number }>;
};

export type CustomerIntelligenceResult = {
  leadScore: number;
  intent: "sales" | "support" | "finance" | "scheduling" | "other";
  lifecycle: "new" | "engaged" | "at_risk" | "active" | "customer";
  nextBestAction: string;
  signals: string[];
  stats: {
    conversations: number;
    openTasks: number;
    openTickets: number;
    averageRating: number | null;
    lastInteractionAt: string | null;
  };
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asString(attributes: Record<string, unknown>, key: string) {
  const value = attributes[key];
  return typeof value === "string" ? value.trim() : "";
}

export function buildCustomerIntelligence(
  input: CustomerIntelligenceInput,
): CustomerIntelligenceResult {
  const attributes = input.contact.attributes ?? {};
  const tags = input.contact.tags ?? [];
  const normalizedTags = tags.map(normalize);
  const openTasks = input.tasks.filter((task) => task.status === "open").length;
  const openTickets = input.tickets.filter(
    (ticket) => !["resolved", "closed"].includes(ticket.status),
  ).length;
  const averageRating = input.ratings.length
    ? Math.round(
        (input.ratings.reduce((total, item) => total + item.rating, 0) / input.ratings.length) * 10,
      ) / 10
    : null;
  const lastInteraction = [...input.conversations].sort(
    (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
  )[0]?.lastMessageAt;
  const text = normalize(
    [
      asString(attributes, "productOfInterest"),
      asString(attributes, "intent"),
      asString(attributes, "region"),
      asString(attributes, "readiness"),
      ...tags,
    ].join(" "),
  );

  let intent: CustomerIntelligenceResult["intent"] = "other";
  if (text.match(/compr|plano|proposta|contrat|venda|lead/)) intent = "sales";
  else if (text.match(/suporte|erro|problema|bug|tecnico/)) intent = "support";
  else if (text.match(/fatura|pagamento|cobranca|financeiro/)) intent = "finance";
  else if (text.match(/agenda|agendar|reuniao|consulta/)) intent = "scheduling";

  const signals: string[] = [];
  let score = 20;
  if (input.conversations.length > 0) score += 15;
  if (input.conversations.some((conversation) => conversation.priority >= 3)) score += 15;
  if (openTasks > 0) score += 10;
  if (openTickets > 0) score += 10;
  if (normalizedTags.some((tag) => tag.match(/enterprise|quente|vip|prioridade/))) score += 20;
  if (normalizedTags.some((tag) => tag.match(/risco|churn|reclamacao/))) score -= 20;
  if (asString(attributes, "readiness").match(/alto|quente|ready/i)) score += 15;
  if (averageRating !== null && averageRating <= 2) score -= 15;

  if (openTickets > 0) signals.push(`${openTickets} ticket(s) exigem acompanhamento.`);
  if (openTasks > 0) signals.push(`${openTasks} follow-up(s) ainda estão abertos.`);
  if (averageRating !== null && averageRating <= 3)
    signals.push("Satisfação abaixo do nível desejado.");
  if (intent !== "other") signals.push(`Intenção dominante: ${intent}.`);
  if (asString(attributes, "source")) signals.push(`Origem: ${asString(attributes, "source")}.`);
  if (asString(attributes, "productOfInterest"))
    signals.push(`Interesse: ${asString(attributes, "productOfInterest")}.`);

  score = Math.max(0, Math.min(100, score));
  const lifecycle: CustomerIntelligenceResult["lifecycle"] =
    averageRating !== null && averageRating <= 2
      ? "at_risk"
      : input.conversations.length === 0
        ? "new"
        : input.conversations.some((conversation) => conversation.status === "resolved")
          ? "customer"
          : openTickets > 0 || openTasks > 0
            ? "engaged"
            : "active";

  let nextBestAction = "Iniciar uma conversa de descoberta e registrar o próximo passo.";
  if (openTickets > 0)
    nextBestAction = "Priorizar os tickets abertos e confirmar prazo de resolução.";
  else if (averageRating !== null && averageRating <= 3)
    nextBestAction = "Acionar supervisor e recuperar a satisfação do contato.";
  else if (intent === "sales")
    nextBestAction = "Qualificar necessidade, prazo e valor antes de enviar proposta.";
  else if (intent === "scheduling")
    nextBestAction = "Confirmar data, período e disponibilidade no calendário.";
  else if (intent === "finance")
    nextBestAction = "Validar identidade e encaminhar a situação financeira com segurança.";
  else if (intent === "support")
    nextBestAction = "Completar a triagem técnica e registrar evidências.";
  else if (openTasks > 0)
    nextBestAction = "Executar o próximo follow-up vencendo ou mais próximo do prazo.";

  return {
    leadScore: score,
    intent,
    lifecycle,
    nextBestAction,
    signals,
    stats: {
      conversations: input.conversations.length,
      openTasks,
      openTickets,
      averageRating,
      lastInteractionAt: lastInteraction?.toISOString() ?? null,
    },
  };
}
