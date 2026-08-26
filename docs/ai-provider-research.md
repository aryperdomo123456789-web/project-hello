# Pesquisa de provedores de IA

## Groq

A documentação oficial descreve a Groq API como uma API de inferência rápida e compatível com OpenAI. A base URL compatível informada é `https://api.groq.com/openai/v1`, com autenticação Bearer via `GROQ_API_KEY` [1]. Isso favorece classificação, roteamento e sugestões de baixa latência, desde que o modelo escolhido seja validado no catálogo atual.

## Gemini

A documentação oficial do Google informa que a Gemini API suporta texto, imagens, entradas multimodais, agentes conversacionais, saídas estruturadas, function calling, compreensão de documentos e ferramentas como busca e contexto de URL [2]. A documentação atual recomenda a Interactions API como interface padrão para projetos novos e lista variantes Flash para baixa latência/alto volume e Pro para raciocínio e tarefas complexas. A chave deve permanecer no servidor.

## OpenRouter

A documentação oficial descreve um endpoint unificado compatível com Chat Completions, acesso a centenas de modelos e roteamento com fallback. O endpoint principal é `POST https://openrouter.ai/api/v1/chat/completions`; os parâmetros `models` e `route: "fallback"` permitem configurar alternativas, e respostas incluem uso/custo quando disponível [3] [4]. Isso é útil como camada de fallback do copiloto, mas exige allowlist de modelos, limite de custo e política de privacidade por organização.

## Recomendação provisória

Para o Mago Bot, a arquitetura deve separar tarefa de provedor. **Groq** é candidato para classificação e triagem de baixa latência; **Gemini** é candidato para documentos, multimodalidade, contexto longo e agentes; **OpenRouter** é candidato a fallback e roteamento controlado. DeepSeek, Mistral, SiliconFlow e Hugging Face podem entrar como provedores adicionais depois que autenticação, modelo, preço, residência de dados e contrato de saída forem verificados oficialmente. Tavily, Jina, Firecrawl e Exa pertencem à camada de recuperação/web, não devem ser misturados diretamente ao gerador de resposta. Langfuse pertence à observabilidade/evaluação. Whisper pertence à transcrição de áudio. Cloudflare Workers pode hospedar adaptadores leves ou edge functions, mas não deve receber segredos do cliente.

## Guardrails obrigatórios

Toda chamada deve ser server-side, receber apenas o contexto mínimo, aplicar redaction antes do prompt, usar timeout e retry limitado, validar saída estruturada, registrar custo/latência sem guardar segredo e permitir fallback para operador humano. Nenhum modelo deve enviar mensagem sem aprovação ou sem um fluxo publicado explicitamente autorizado.

## Referências

[1]: https://console.groq.com/docs/overview "GroqDocs — Overview"
[2]: https://ai.google.dev/gemini-api/docs "Google AI for Developers — Gemini API"
[3]: https://openrouter.ai/docs/quickstart "OpenRouter — Quickstart"
[4]: https://openrouter.ai/docs/api_reference/overview "OpenRouter — API Reference"

## Tavily, Firecrawl e Langfuse

A documentação oficial do Tavily informa a base `https://api.tavily.com`, autenticação por API key e endpoints de busca, extração, crawl/map e research [5]. Isso o torna adequado para pesquisa web controlada e enriquecimento de uma base de conhecimento, não para responder diretamente sem política de fontes.

A documentação oficial do Firecrawl descreve Search, Scrape, Interact, Map, Crawl, Parse e Webhooks, com saída em Markdown, HTML ou dados estruturados [6]. Isso é útil para o gestor cadastrar uma URL de FAQ, política ou catálogo e gerar material para um especialista, com revisão antes de publicar.

A documentação oficial do Langfuse descreve tracing de aplicações LLM, capturando prompt, resposta, uso de tokens, latência, ferramentas e etapas de recuperação; também oferece scores, dashboards, alertas e possibilidade de self-hosting [7] [8]. Ele deve receber metadados e traces sanitizados, nunca segredos ou conteúdo sem política de retenção.

## Arquitetura recomendada

O fluxo sugerido é: **mensagem → redaction → classificação → recuperação opcional → resposta estruturada → política de confiança → aprovação humana ou fluxo publicado → auditoria**. OpenRouter pode ser fallback de geração; Groq pode atender triagem de baixa latência; Gemini pode atender documentos e multimodalidade; Tavily/Firecrawl podem alimentar conhecimento; Langfuse pode medir qualidade e custo. Nenhum desses provedores substitui a Evolution, que continua sendo o transporte de WhatsApp.

## Referências adicionais

[5]: https://docs.tavily.com/documentation/api-reference/introduction "Tavily — API Introduction"
[6]: https://docs.firecrawl.dev/introduction "Firecrawl — Introduction"
[7]: https://langfuse.com/docs/observability/overview "Langfuse — Observability Overview"
[8]: https://langfuse.com/docs/observability/get-started "Langfuse — Get Started with Tracing"

## DeepSeek, Jina, Hugging Face e Cloudflare

A documentação oficial do DeepSeek informa compatibilidade com os formatos OpenAI e Anthropic, base URL `https://api.deepseek.com` e suporte a chat completions com streaming e raciocínio configurável [9]. Ele pode ser um candidato de geração/reasoning, mas deve entrar por adapter e allowlist de modelos.

A documentação do Jina Reader descreve conversão de URLs em conteúdo limpo para LLMs, busca SERP, embeddings e reranking; também informa endpoints `r.jina.ai`, `s.jina.ai` e APIs de embedding/rerank [10]. Isso é adequado para ingestão e recuperação de conhecimento, especialmente em português e documentos longos, com controle de cache e privacidade.

A documentação do Hugging Face Inference Providers informa acesso unificado a centenas de modelos e provedores, suporte a chat, visão, embeddings, classificação e speech-to-text, além de seleção automática ou explícita de provedor [11]. Ele pode funcionar como catálogo/fallback para modelos abertos, mas aumenta a necessidade de controlar custo, modelo permitido e localização do dado.

A documentação do Cloudflare Workers AI apresenta um catálogo de modelos hospedados na rede da Cloudflare, incluindo geração, function calling, embeddings, reranking, speech e modelos multimodais [12]. Pode servir para edge inference ou embeddings de baixa latência, mas no VPS aaPanel deve ser tratado como serviço externo e não como substituto automático do runtime Node.

## Priorização final provisória

**P0:** OpenRouter ou um provider compatível com OpenAI para camada inicial de roteamento, Groq para classificação rápida, Gemini para documentos/multimodalidade e Langfuse para tracing. **P1:** Jina ou Firecrawl para ingestão de URLs/PDFs e embeddings/reranking. **P2:** DeepSeek, Mistral, Cohere, Hugging Face e Cloudflare como alternativas depois de validar contratos, custo, latência e políticas de dados. Whisper entra quando a camada Evolution entregar áudio; sem canal real, pode ser testado com arquivos enviados ao laboratório.

## Referências adicionais

[9]: https://api-docs.deepseek.com/ "DeepSeek API Docs"
[10]: https://jina.ai/reader/ "Jina AI Reader"
[11]: https://huggingface.co/docs/inference-providers/en/index "Hugging Face Inference Providers"
[12]: https://developers.cloudflare.com/workers-ai/models/ "Cloudflare Workers AI Models"
