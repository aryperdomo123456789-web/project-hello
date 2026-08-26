# Central de APIs e Integrações

A Central de APIs fica no painel em **Ajustes → APIs** e é restrita a `owner` e `admin` por RBAC server-side. Ela mantém um catálogo único de providers do produto, mostra capabilities e o estado real de runtime, e permite salvar credenciais por organização.

## Segurança

As credenciais são cifradas com AES-256-GCM antes de entrar no PostgreSQL. A chave do envelope fica em `INTEGRATION_ENCRYPTION_KEY`, exclusivamente no ambiente server-side. O navegador recebe apenas campos mascarados. Rotacionar uma chave substitui o envelope; desativar interrompe o uso lógico; limpar remove o envelope armazenado.

Nunca grave Access Tokens, API Keys, App Secrets, senhas ou Webhook Secrets no GitHub, no frontend, em screenshots ou em logs. O `endpointUrl` é validado para HTTP/HTTPS e não aceita usuário/senha embutidos na URL. Endpoints customizados ainda exigem validação SSRF e allowlist antes de chamadas remotas.

## Estados exibidos

| Estado | Significado |
|---|---|
| Integrado | Existe caminho de runtime no Mago Bot para aquela capability, sujeito à configuração e aos limites do provider |
| Opcional | Há adapter ou uso parcial; o produto continua funcionando sem a chave |
| Preparado | A interface/contrato está reservado, mas a operação precisa de implementação/homologação |
| Planejado | Provider catalogado para uma decisão futura, sem executor no runtime atual |
| Stub / homologação | A função existe somente para laboratório até contrato externo real, como a Evolution atual |

`Configurado` significa que o envelope foi salvo e validado localmente; não significa que uma chamada externa foi executada. O health remoto por provider deve ser habilitado somente com endpoints oficiais e testes seguros definidos.

## Providers no catálogo

| Categoria | Providers |
|---|---|
| IA e modelos | DeepSeek, Gemini, Groq, OpenRouter, Cohere, Mistral, Hugging Face, SiliconFlow, Whisper |
| Conhecimento e busca | Jina, Tavily, Firecrawl, Exa |
| Observabilidade | Langfuse |
| Canais e billing | Evolution API, Meta Cloud API, Mercado Pago |
| Infraestrutura | Cloudflare Workers AI, LamaTok, Custom API |

Na primeira versão, DeepSeek, Gemini, Groq e OpenRouter são os providers de chat com caminho de runtime existente; Jina e Langfuse são opcionais; Mercado Pago tem adapter sandbox; Meta Cloud tem base de webhook; Evolution permanece stub até homologação. Tavily, Firecrawl, Cohere, Mistral, Hugging Face, Cloudflare, Exa, SiliconFlow, Whisper e LamaTok ficam catalogados para integração incremental, sem serem marcados como prontos.

## Próximas ondas

A Central é a fundação de governança. A próxima onda deve fazer o runtime consultar credenciais por organização, aplicar seleção explícita de provider, limite de custo, timeout, circuit breaker e tracing por tenant. Depois entram transcrição de áudio, ingestão controlada de URL, health checks oficiais e benchmark comparativo de qualidade/latência.
