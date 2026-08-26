# Arquitetura de IA e RAG do Mago Bot

## Decisão de produto

A IA do Mago Bot deve ser um **copiloto controlado por fluxo**, não um agente solto. O fluxo determina quando a IA pode classificar, resumir ou sugerir; políticas de confiança determinam quando a saída pode ser exibida ao atendente; somente um fluxo publicado e explicitamente autorizado pode enviar uma mensagem automática. Se a confiança for baixa, se houver dado sensível ou se o provedor falhar, o atendimento vai para humano.

## Matriz de responsabilidades

| Capacidade | Provedor primário | Fallback | Papel no produto | Bloqueio Evolution |
|---|---|---|---|---|
| Classificação e roteamento | Groq | OpenRouter ou regras locais | Identificar intenção, prioridade e fila | Não |
| Sugestão de resposta | OpenRouter | DeepSeek ou regras locais | Copiloto com aprovação humana | Não |
| Documentos e multimodalidade | Gemini | OpenRouter | Ler FAQ/PDF/imagem e apoiar especialista | Não |
| Raciocínio complexo | DeepSeek | OpenRouter | Resolver casos de suporte e análise | Não |
| Busca na web | Tavily | Exa/Jina Search | Recuperar fonte atual sob política | Não |
| Ingestão de URL/PDF | Firecrawl | Jina Reader | Transformar conhecimento em Markdown estruturado | Não |
| Embeddings/reranking | Jina ou Cloudflare AI | Hugging Face | Busca semântica na base de cada organização | Não |
| Modelos abertos | Hugging Face/SiliconFlow | Cloudflare AI | Redução de custo e alternativa de provedor | Não |
| Áudio | Whisper | Cloudflare/Hub compatível | Transcrever áudio recebido | Sim para áudio real; não para arquivos de teste |
| Tracing e avaliação | Langfuse | logs internos | Custos, latência, prompt, retrieval e qualidade | Não |

## Fluxo de execução

1. O servidor identifica organização, número, fluxo publicado e conversa.
2. O contexto é minimizado e passa por redaction de tokens, senhas, documentos e dados desnecessários.
3. O runtime decide a tarefa: `classify`, `suggest`, `summarize` ou `extract`.
4. O router tenta o provedor primário dentro de timeout e orçamento; se falhar, tenta o fallback; se ambos falharem, usa regra local ou encaminha para humano.
5. A saída é validada por schema. Texto livre, JSON inválido ou conteúdo proibido não pode atravessar para o fluxo.
6. A sugestão aparece no painel para aprovação. A IA não chama a Evolution diretamente.
7. O trace registra modelo, latência, tokens, custo estimado, versão do prompt, fontes recuperadas e resultado sanitizado.

## Limites obrigatórios

Cada organização deve ter orçamento diário, limite de tokens por tarefa, timeout, máximo de tentativas, allowlist de modelos e política de retenção. O prompt não deve incluir todo o histórico por padrão; deve usar janela recente, resumo persistido e trechos recuperados. Dados pessoais devem ser minimizados antes de enviar ao provedor e removidos do trace quando não forem necessários.

## RAG por especialista

Cada fluxo publicado pode apontar para uma base de conhecimento da organização. A ingestão aceita texto colado, Markdown, URL e PDF. Firecrawl ou Jina normalizam a fonte; o sistema separa documentos em trechos, gera embeddings, recupera candidatos e opcionalmente reordena; o modelo recebe somente os trechos selecionados com URL/título e instrução para declarar quando não houver evidência. A base é sempre filtrada por `organizationId` e nunca pode recuperar conteúdo de outro cliente.

## Diferenciais sobre uma central convencional

O Mago Bot pode superar uma central tradicional ao oferecer **roteamento por número e especialista, fallback entre provedores, replay de eventos, diagnóstico de falhas, aprovação humana, trace de custo/qualidade, RAG isolado por organização e simulação antes de publicação**. O diferencial não é colocar “IA” em toda tela; é fazer a IA trabalhar dentro de governança e métricas.
