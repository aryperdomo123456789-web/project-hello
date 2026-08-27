import type { IntegrationProvider } from "@/db/schema";

export type IntegrationField = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  secret: boolean;
};

export type IntegrationDefinition = {
  provider: IntegrationProvider;
  label: string;
  category:
    | "IA e modelos"
    | "Conhecimento e busca"
    | "Observabilidade"
    | "Canais e billing"
    | "Infraestrutura";
  description: string;
  capabilities: string[];
  fields: IntegrationField[];
  defaultEndpoint?: string;
  docsUrl: string;
  runtimeStatus: "integrated" | "optional" | "prepared" | "planned" | "stub";
};

export const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  {
    provider: "deepseek",
    label: "DeepSeek",
    category: "IA e modelos",
    description: "LLM server-side para copiloto, classificação, resumo e automações controladas.",
    capabilities: ["chat", "classification", "summarization"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.deepseek.com",
    docsUrl: "https://api-docs.deepseek.com/",
    runtimeStatus: "integrated",
  },
  {
    provider: "gemini",
    label: "Gemini",
    category: "IA e modelos",
    description: "Modelos Google para geração, análise e futuras capacidades multimodais.",
    capabilities: ["chat", "multimodal", "classification"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "AIza...", required: true, secret: true },
    ],
    defaultEndpoint: "https://generativelanguage.googleapis.com",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
    runtimeStatus: "integrated",
  },
  {
    provider: "groq",
    label: "Groq",
    category: "IA e modelos",
    description: "Inferência de baixa latência para respostas rápidas e transcrição compatível.",
    capabilities: ["chat", "fast-inference", "transcription-ready"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "gsk_...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.groq.com/openai/v1",
    docsUrl: "https://console.groq.com/docs",
    runtimeStatus: "integrated",
  },
  {
    provider: "openrouter",
    label: "OpenRouter",
    category: "IA e modelos",
    description: "Gateway de modelos com fallback e roteamento controlado por política.",
    capabilities: ["chat", "routing", "fallback"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-or-...", required: true, secret: true },
    ],
    defaultEndpoint: "https://openrouter.ai/api/v1",
    docsUrl: "https://openrouter.ai/docs",
    runtimeStatus: "integrated",
  },
  {
    provider: "jina",
    label: "Jina",
    category: "Conhecimento e busca",
    description: "Embeddings e reranking semântico para a base de conhecimento do tenant.",
    capabilities: ["embeddings", "reranking", "retrieval"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "jina_...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.jina.ai/v1",
    docsUrl: "https://jina.ai/embeddings/",
    runtimeStatus: "optional",
  },
  {
    provider: "tavily",
    label: "Tavily",
    category: "Conhecimento e busca",
    description: "Pesquisa web assistida para enriquecer fontes aprovadas e contextos do RAG.",
    capabilities: ["web-search", "retrieval"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "tvly-...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.tavily.com",
    docsUrl: "https://docs.tavily.com/",
    runtimeStatus: "prepared",
  },
  {
    provider: "firecrawl",
    label: "Firecrawl",
    category: "Conhecimento e busca",
    description: "Extração controlada de URLs autorizadas para ingestão na base de conhecimento.",
    capabilities: ["url-ingestion", "scraping-authorized", "retrieval"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "fc-...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.firecrawl.dev",
    docsUrl: "https://docs.firecrawl.dev/",
    runtimeStatus: "prepared",
  },
  {
    provider: "exa",
    label: "Exa",
    category: "Conhecimento e busca",
    description: "Busca semântica alternativa para pesquisa e descoberta de fontes.",
    capabilities: ["semantic-search", "retrieval"],
    fields: [{ key: "apiKey", label: "API Key", placeholder: "...", required: true, secret: true }],
    defaultEndpoint: "https://api.exa.ai",
    docsUrl: "https://exa.ai/docs/reference/search-api-guide",
    runtimeStatus: "planned",
  },
  {
    provider: "cohere",
    label: "Cohere",
    category: "IA e modelos",
    description: "Opção futura para reranking e modelos de linguagem após benchmark de qualidade.",
    capabilities: ["reranking", "chat"],
    fields: [{ key: "apiKey", label: "API Key", placeholder: "...", required: true, secret: true }],
    defaultEndpoint: "https://api.cohere.com",
    docsUrl: "https://docs.cohere.com/",
    runtimeStatus: "planned",
  },
  {
    provider: "mistral",
    label: "Mistral",
    category: "IA e modelos",
    description: "Provider alternativo de LLM para comparação de custo, latência e qualidade.",
    capabilities: ["chat", "classification", "summarization"],
    fields: [{ key: "apiKey", label: "API Key", placeholder: "...", required: true, secret: true }],
    defaultEndpoint: "https://api.mistral.ai/v1",
    docsUrl: "https://docs.mistral.ai/",
    runtimeStatus: "planned",
  },
  {
    provider: "huggingface",
    label: "Hugging Face",
    category: "IA e modelos",
    description: "Modelos open source e inferência alternativa para workloads específicos.",
    capabilities: ["inference", "embeddings"],
    fields: [
      { key: "apiKey", label: "Access Token", placeholder: "hf_...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api-inference.huggingface.co",
    docsUrl: "https://huggingface.co/docs/api-inference/index",
    runtimeStatus: "planned",
  },
  {
    provider: "cloudflare_workers",
    label: "Cloudflare Workers AI",
    category: "Infraestrutura",
    description: "Inferência edge e serviços auxiliares para workloads de alto volume.",
    capabilities: ["edge-inference", "embeddings"],
    fields: [
      { key: "accountId", label: "Account ID", placeholder: "...", required: true, secret: false },
      { key: "apiToken", label: "API Token", placeholder: "...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.cloudflare.com/client/v4",
    docsUrl: "https://developers.cloudflare.com/workers-ai/",
    runtimeStatus: "planned",
  },
  {
    provider: "langfuse",
    label: "Langfuse",
    category: "Observabilidade",
    description: "Tracing e avaliação de chamadas de IA sem enviar conteúdo sensível por padrão.",
    capabilities: ["tracing", "evaluation", "cost-observability"],
    fields: [
      {
        key: "publicKey",
        label: "Public Key",
        placeholder: "pk-lf-...",
        required: true,
        secret: false,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        placeholder: "sk-lf-...",
        required: true,
        secret: true,
      },
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://cloud.langfuse.com",
        required: true,
        secret: false,
      },
    ],
    defaultEndpoint: "https://cloud.langfuse.com",
    docsUrl: "https://langfuse.com/docs",
    runtimeStatus: "optional",
  },
  {
    provider: "siliconflow",
    label: "SiliconFlow",
    category: "IA e modelos",
    description: "Provider alternativo para comparação de modelos open source e custo.",
    capabilities: ["chat", "embeddings", "inference"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-...", required: true, secret: true },
    ],
    defaultEndpoint: "https://api.siliconflow.com/v1",
    docsUrl: "https://docs.siliconflow.com/en/userguide/introduction",
    runtimeStatus: "planned",
  },
  {
    provider: "whisper",
    label: "Whisper",
    category: "IA e modelos",
    description: "Transcrição de áudios recebidos no WhatsApp, com timestamps e fallback.",
    capabilities: ["transcription", "audio"],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "...", required: false, secret: true },
    ],
    defaultEndpoint: "https://api.openai.com/v1",
    docsUrl: "https://developers.openai.com/api/docs/guides/speech-to-text",
    runtimeStatus: "planned",
  },
  {
    provider: "lamatok",
    label: "LamaTok",
    category: "Infraestrutura",
    description: "Integração futura e opcional de social listening, fora do núcleo WhatsApp.",
    capabilities: ["social-listening"],
    fields: [{ key: "apiKey", label: "API Key", placeholder: "...", required: true, secret: true }],
    docsUrl: "#",
    runtimeStatus: "planned",
  },
  {
    provider: "mercadopago",
    label: "Mercado Pago",
    category: "Canais e billing",
    description: "Checkout e assinaturas SaaS com webhook assinado e reconciliação idempotente.",
    capabilities: ["checkout", "subscriptions", "webhooks"],
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "APP_USR-...",
        required: true,
        secret: true,
      },
      {
        key: "publicKey",
        label: "Public Key",
        placeholder: "APP_USR-...",
        required: false,
        secret: false,
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret",
        placeholder: "Segredo HMAC",
        required: true,
        secret: true,
      },
    ],
    defaultEndpoint: "https://api.mercadopago.com",
    docsUrl: "https://www.mercadopago.com.br/developers/pt/docs",
    runtimeStatus: "optional",
  },
  {
    provider: "mago_bot_api",
    label: "API Mago Bot",
    category: "Canais e billing",
    description:
      "Control plane multi-tenant para canais WhatsApp, mensagens, conversas, webhooks e auditoria.",
    capabilities: ["channels", "qr", "text", "media", "webhooks", "idempotency", "usage"],
    fields: [
      {
        key: "apiKey",
        label: "API Key project-scoped",
        placeholder: "mb_live_...",
        required: true,
        secret: true,
      },
      {
        key: "webhookSigningSecret",
        label: "Webhook signing secret",
        placeholder: "whsec_...",
        required: true,
        secret: true,
      },
      {
        key: "apiProjectId",
        label: "API Project UUID",
        placeholder: "00000000-0000-0000-0000-000000000000",
        required: true,
        secret: false,
      },
    ],
    defaultEndpoint: "https://app.mago-bot.com",
    docsUrl: "https://app.mago-bot.com/docs",
    runtimeStatus: "prepared",
  },
  {
    provider: "evolution",
    label: "Evolution API",
    category: "Canais e billing",
    description: "Gateway de WhatsApp para instâncias, QR, mensagens, mídia e eventos.",
    capabilities: ["instances", "qr", "text", "media", "webhooks"],
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Chave do gateway",
        required: true,
        secret: true,
      },
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://evo-api.exemplo.com",
        required: true,
        secret: false,
      },
    ],
    docsUrl: "https://app.mago-bot.com/docs#/",
    runtimeStatus: "stub",
  },
  {
    provider: "meta_cloud",
    label: "Meta Cloud API",
    category: "Canais e billing",
    description: "Canal oficial Meta para WhatsApp Business, templates, mídia e webhooks.",
    capabilities: ["official-whatsapp", "templates", "media", "webhooks"],
    fields: [
      {
        key: "accessToken",
        label: "Access Token",
        placeholder: "Token Meta",
        required: true,
        secret: true,
      },
      {
        key: "appSecret",
        label: "App Secret",
        placeholder: "Segredo da aplicação",
        required: true,
        secret: true,
      },
      {
        key: "verifyToken",
        label: "Verify Token",
        placeholder: "Token de verificação",
        required: true,
        secret: true,
      },
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api/",
    runtimeStatus: "prepared",
  },
  {
    provider: "custom",
    label: "Custom API",
    category: "Infraestrutura",
    description:
      "Endpoint controlado para um conector específico, sujeito a validação e allowlist.",
    capabilities: ["custom"],
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        placeholder: "Chave server-side",
        required: true,
        secret: true,
      },
      {
        key: "baseUrl",
        label: "Base URL",
        placeholder: "https://api.exemplo.com",
        required: true,
        secret: false,
      },
    ],
    docsUrl: "#",
    runtimeStatus: "planned",
  },
];

export const INTEGRATION_DEFINITION_MAP = new Map(
  INTEGRATION_DEFINITIONS.map((definition) => [definition.provider, definition]),
);

export function getIntegrationDefinition(provider: IntegrationProvider): IntegrationDefinition {
  const definition = INTEGRATION_DEFINITION_MAP.get(provider);
  if (!definition) throw new Error(`Provider de integração não suportado: ${provider}`);
  return definition;
}
