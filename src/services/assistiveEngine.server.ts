export type AssistiveMessage = {
  sender: "me" | "contact";
  text: string;
};

export type AssistiveResult = {
  intent: "sales" | "support" | "finance" | "scheduling" | "other";
  confidence: number;
  summary: string;
  nextAction: string;
  suggestions: string[];
};

const intentRules: Array<{
  intent: AssistiveResult["intent"];
  keywords: string[];
  nextAction: string;
  suggestions: string[];
}> = [
  {
    intent: "finance",
    keywords: ["boleto", "pagamento", "cobrança", "pix", "fatura", "segunda via", "preço"],
    nextAction: "Confirmar identidade e localizar a situação financeira antes de negociar.",
    suggestions: [
      "Claro. Vou verificar a situação financeira para te orientar com segurança. Pode me confirmar seu nome completo?",
      "Posso te ajudar com isso. Você precisa da segunda via, do status do pagamento ou de uma negociação?",
    ],
  },
  {
    intent: "scheduling",
    keywords: ["agendar", "agenda", "horário", "marcar", "disponibilidade", "consulta", "reunião"],
    nextAction: "Coletar preferência de data e horário e confirmar disponibilidade.",
    suggestions: [
      "Perfeito. Qual dia e período você prefere? Vou verificar os horários disponíveis.",
      "Consigo te ajudar a agendar. Você prefere manhã, tarde ou noite?",
    ],
  },
  {
    intent: "support",
    keywords: ["erro", "problema", "não funciona", "ajuda", "suporte", "falha", "bug"],
    nextAction: "Fazer triagem do problema, coletar evidência e definir prioridade.",
    suggestions: [
      "Entendi. Vou investigar isso com você. O problema acontece sempre ou começou agora?",
      "Vamos resolver. Pode me enviar uma descrição do que apareceu e, se possível, uma captura de tela?",
    ],
  },
  {
    intent: "sales",
    keywords: ["comprar", "quero", "interesse", "proposta", "plano", "contratar", "valor"],
    nextAction: "Qualificar necessidade, prazo e contexto antes de apresentar a proposta.",
    suggestions: [
      "Ótimo. Para te indicar a melhor opção, qual resultado você quer alcançar e para quando?",
      "Posso te apresentar as opções. Você está buscando algo para uso individual ou para uma equipe?",
    ],
  },
];

function normalize(value: string) {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buildAssistSuggestions(
  contactName: string,
  messages: AssistiveMessage[],
): AssistiveResult {
  const safeMessages = messages.filter((message) => message.text.trim()).slice(-12);
  const inbound = safeMessages.filter((message) => message.sender === "contact");
  const lastInbound = inbound.at(-1)?.text ?? "";
  const normalized = normalize(lastInbound);
  const matched = intentRules
    .map((rule) => ({
      rule,
      score: rule.keywords.filter((keyword) => normalized.includes(normalize(keyword))).length,
    }))
    .sort((a, b) => b.score - a.score)[0];
  const rule = matched && matched.score > 0 ? matched.rule : undefined;
  const name = contactName.trim() || "cliente";
  return {
    intent: rule?.intent ?? "other",
    confidence: rule ? Math.min(0.98, 0.55 + (matched?.score ?? 0) * 0.12) : 0.32,
    summary: lastInbound
      ? `${name} informou: “${lastInbound.slice(0, 180)}”`
      : "Ainda não há mensagem recebida para analisar.",
    nextAction:
      rule?.nextAction ?? "Ler o contexto completo e fazer uma pergunta aberta antes de responder.",
    suggestions: rule?.suggestions ?? [
      "Entendi. Vou analisar seu caso com atenção e já te faço uma pergunta para encaminhar corretamente.",
      "Obrigado por explicar. Pode me contar um pouco mais sobre o que você precisa?",
    ],
  };
}
