# Auditoria do gentle-aid e inventário de reutilização para o Mago Bot

**Autor:** Manus AI
**Data da auditoria:** 26 de agosto de 2026
**Escopo:** branches remotas do repositório `aryperdomo123456789-web/gentle-aid`, comparação com o produto Mago Bot e classificação das APIs informadas pelo proprietário.
**Regra de segurança:** nenhum `.env`, token, senha, valor de chave ou arquivo de segredo foi aberto, reproduzido ou copiado para o Mago Bot.

## 1. Conclusão executiva

O `gentle-aid` é um produto diferente do Mago Bot. Ele é uma plataforma de produção e automação de mídia para criadores de conteúdo, com frontend React/TanStack Start, backend Flask/Gunicorn, FFmpeg, yt-dlp, jobs assíncronos e um cofre centralizado de chaves. O Mago Bot é um SaaS multiempresa de atendimento, inbox multi-WhatsApp, CRM, filas, fluxos, IA, tickets e governança. Portanto, a reutilização correta é de **padrões de infraestrutura**, não de identidade, código de negócio ou fluxos de mídia inteiros.

A branch `backup` contém a fotografia mais completa e mais recente do ecossistema de mídia, com documentação extensa de APIs e uma nova ferramenta de transcrição de vídeo. A `main` é a base estável de 8 de agosto de 2026. A `audit-codex` é uma variante reduzida: possui apenas 174 arquivos contra 273 na `main`, remove vários módulos de mídia, laboratórios e documentos, e inclui artefatos `__pycache__` versionados. Ela deve ser tratada como snapshot de auditoria/teste, não como fonte para merge integral.

O achado mais útil para o Mago Bot é a combinação de **cofre de provedores**, **contratos explícitos por API**, **jobs assíncronos com polling**, **degradação por fallback**, **runbooks de aaPanel/systemd** e **diagnóstico operacional**. O Mago Bot, porém, já possui uma infraestrutura de produção mais apropriada para atendimento: PostgreSQL/Drizzle, Redis/BullMQ, retries, timers, DLQ, isolamento por organização, RBAC e auditoria. Não faz sentido trocar essa base por jobs persistidos em JSON do `gentle-aid`.

## 2. Branches remotas encontradas

A API do GitHub retornou três branches remotas no momento da auditoria. Nenhuma alteração foi feita no repositório `gentle-aid`.

| Branch | Commit observado | Data/descrição | Leitura técnica |
|---|---|---|---|
| `main` | `4d4a5fe` | 08/08/2026 — `merge: sync origin/main into aaPanel` | Base principal, 273 arquivos, arquitetura completa de mídia e APIs |
| `backup` | `679b125` | 18/08/2026 — snapshot do aaPanel | 275 arquivos; adiciona transcrição de vídeo e ajustes no centro de jobs |
| `audit-codex` | `1c7a057` | Merge de novidades para aaPanel | 174 arquivos; variante reduzida, com remoções extensas e `__pycache__` versionado |

A diferença entre `main` e `backup` é pequena e concentrada: 12 arquivos, principalmente `backend/app/blueprints/transcribe_video.py`, a rota `src/routes/transcrever.tsx`, componentes de status/histórico e ajustes do job runner. Já a diferença entre `main` e `audit-codex` é estrutural: essa branch remove ou reduz módulos de recapitulação, dublagem, legendagem, streaming, laboratórios, APIs de feature e vários documentos de operação.

> **Diagnóstico:** não existe uma “branch secreta” adicional no repositório além das três retornadas pelo GitHub. O caminho enviado pelo usuário, `tree/backup/deploy`, significa a branch `backup` e a pasta `deploy` dentro dela; não é uma quarta branch.

## 3. O que existe no gentle-aid

A arquitetura confirmada nas branches `main` e `backup` é composta por React 19/TanStack Start no frontend e Flask/Gunicorn no backend. Nginx faz proxy entre o frontend Node e a API Python; FFmpeg e yt-dlp executam o processamento local. Os jobs são assíncronos, com armazenamento persistido em disco e polling no frontend. A branch `backup` documenta o fluxo em `audit/01-fluxo-e-infra.md`, `audit/06-checklist-deploy.md` e `docs/JOBS-LONGOS.md`.

| Área | Evidência no gentle-aid | Utilidade para o Mago Bot |
|---|---|---|
| Cofre de APIs | `backend/app/services/api_keys.py`, `backend/app/blueprints/apis.py` | Alta: adaptar como vault de credenciais server-side por organização/provedor |
| Contratos externos | `audit/09-auditoria-apis-completa.md` | Alta: documentar método, endpoint, autenticação, payload, resposta e falha |
| Jobs longos | `backend/app/services/jobs.py`, `backend/app/blueprints/jobs.py` | Alta como padrão conceitual; manter Redis/BullMQ do Mago Bot como motor real |
| Transcrição | `backend/app/services/transcribe.py`, `backend/app/blueprints/transcribe_video.py` | Média: transcrever áudios/mídias recebidos no WhatsApp |
| Legendas e FFmpeg | `backend/app/services/captions.py`, `backend/app/services/beatsync.py` | Média: recursos de mídia, acessibilidade e indexação; não é núcleo do atendimento |
| Voz/TTS | `backend/app/services/voice.py`, `voice_engine.py`, `voice_forge.py`, `edge_tts.py` | Média: notas de voz, transcrição e respostas de voz com consentimento |
| Pesquisa/descoberta | `backend/app/services/discovery.py`, `trends.py` | Baixa para atendimento; pode inspirar enriquecimento de contexto, não scraping indiscriminado |
| Deploy | `deploy/safe-update.sh`, `deploy/update.sh`, templates systemd/Nginx | Alta: runbook, rollback, permissões, health checks e timers |
| Segurança de ambiente | `audit/05-seguranca-env.md` | Alta: nunca varrer diretórios legados no boot e nunca versionar secrets |

A documentação do `gentle-aid` descreve também recursos de clonagem de conteúdo, esterilização de metadados e técnicas de alteração para redes sociais. Esses módulos **não devem ser portados para o Mago Bot como mecanismos de evasão, anti-detecção ou contorno de políticas**. Se houver um produto legítimo de mídia no futuro, ele deverá trabalhar com conteúdo autorizado, direitos claros e conformidade com as regras das plataformas.

## 4. O que já foi feito no Mago Bot frente aos benchmarks

A matriz de referência do próprio projeto compara SAC Mais, Zendesk, Intercom e respond.io. O resultado atual está bem mais próximo de um produto vendável do que o snapshot inicial indicava.

| Capacidade de mercado | Estado atual do Mago Bot | Limite honesto |
|---|---|---|
| Inbox unificada | Implementada como fundação multiempresa e multi-número | Canal WhatsApp real ainda está em `stub`, aguardando Evolution operacional |
| Filas e distribuição | Implementadas com skills, capacidade, horário, posse, transferência e SLA | Homologação real depende de eventos do provedor |
| CRM e jornada | Implementados pipeline, contatos, tags, tarefas, CSV e Customer Intelligence | Atribuição automática de receita ainda depende de dados informados |
| Ticketing | Implementado com tickets, prioridade, estado e SLA | Precisa seguir recebendo testes E2E reais |
| Fluxos no-code | Editor React Flow, versionamento, templates e runtime implementados | Publicação real no WhatsApp depende do canal homologado |
| IA/copiloto | Copiloto com aprovação humana, fallback e router server-side | Não é agente autônomo livre; envio sensível continua sob aprovação |
| Base de conhecimento | Chunks, busca lexical, embeddings opcionais, cosine híbrido e reranking Jina opcional | Provider sem chave permanece em fallback lexical |
| QA | Reviews, score, sentimento, violações, histórico por equipe/fila e relatórios | Amostragem contínua e calibração por negócio ainda podem evoluir |
| Campanhas/sequências | Sequências comportamentais, worker, delays, opt-out, frequência e efeitos internos | Outbound real permanece bloqueado no provider stub |
| Onboarding | Landing pública, `/signup`, trial, criação de organização/owner e catálogo de planos | Verificação de e-mail e antifraude avançado ainda são upgrades |
| Workforce | Capacidade, disponibilidade, skills, horários e distribuição | Scheduling avançado de escala ainda é backlog |
| Insights/ROI | Eventos de conversão, custos de marketing, QA e dashboard por período | Não inventa receita; depende de registro real de conversão/custo |
| Macros | CRUD auditável, categorias, busca, arquivamento e restauração | Pode ganhar variáveis dinâmicas e permissões por fila |
| Governança | RBAC owner/admin/manager/supervisor/agent, auditoria e tenant isolation | E2E cross-tenant completo ainda é necessário |
| Resiliência | Error drawer, boundaries, rate limits, retries, DLQ, replay, health, monitor e retenção dry-run | Alertas externos dependem de URL de destino configurada |
| Billing | Trial, catálogo editável pelo owner e Mercado Pago sandbox com webhook HMAC | Cobrança de produção está desligada; não afirmar pagamento real |

A matriz original está em [`docs/market-reference-matrix.md`](https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/docs/market-reference-matrix.md). A landing pública e o cadastro foram separados em `/`, `/signup`, `/login`, `/owner/login` e `/app`, preservando o owner fora da vitrine.

## 5. APIs fornecidas: o que já foi feito no Mago Bot

A classificação abaixo é baseada no código atual, não apenas na existência de nomes no `.env.example`. “Integrado” significa que existe caminho de runtime no Mago Bot; “opcional” significa que o caminho existe, mas só é usado quando a configuração server-side está presente; “não integrado” significa que não há executor no runtime atual.

| API/provedor | Estado no Mago Bot | Evidência/uso atual | Próximo uso recomendado |
|---|---|---|---|
| **DeepSeek** | Integrado | `src/services/aiProvider.server.ts`: chat/completions, fallback por organização | Classificação, resumo e copiloto de baixo custo |
| **Gemini** | Integrado | Router server-side com `x-goog-api-key` e modelo configurável | Visão/extração somente após contrato específico; hoje o caminho é chat/interactions |
| **Groq** | Integrado | Chat/completions no router híbrido | Respostas rápidas e classificação; áudio Whisper ainda não foi ligado no Mago |
| **OpenRouter** | Integrado | Chat/completions, `HTTP-Referer`, fallback e telemetria | Roteamento de modelos e experimentos controlados |
| **Jina** | Integrado opcional | `embedding.server.ts` para embeddings e reranking; `knowledge.server.ts` para contexto | Ativar com chave server-side e medir custo/latência; fallback lexical permanece |
| **Langfuse** | Integrado opcional | `aiTelemetry.server.ts` envia telemetria sem conteúdo sensível quando as três variáveis existem | Monitorar latência, erro, provider e uso por organização |
| **Tavily** | Preparado somente | Nome/configuração no `env.server.ts`, sem chamada de pesquisa no runtime atual | Implementar pesquisa assistida apenas para usuário autorizado e com cache |
| **Firecrawl** | Preparado somente | Variável no ambiente, sem executor no runtime atual | Ingestão controlada de URLs na base de conhecimento, com consentimento e limites |
| **Cohere** | Não integrado | Não há runtime no Mago Bot para chat, rerank ou validação Cohere | Só adicionar se houver ganho comprovado sobre Jina/roteador atual |
| **Mistral** | Não integrado | Não aparece no runtime atual | Candidato a provider adicional compatível, não prioridade imediata |
| **Hugging Face** | Não integrado | Não aparece no runtime atual | Avaliar modelos self-hosted/embeddings apenas com custo e latência medidos |
| **Cloudflare Workers API** | Não integrado | Não há cliente Workers no runtime atual | Útil para edge/webhooks, mas não necessário na fase atual |
| **Exa** | Não integrado | Não aparece no runtime atual | Alternativa de pesquisa; evitar duplicar Tavily sem caso de uso |
| **SiliconFlow** | Não integrado | Não aparece no runtime atual | Provider opcional futuro, depois de comparar qualidade/preço |
| **Whisper** | Não integrado no Mago Bot | Não há serviço de transcrição neste repo; o `gentle-aid` tem Groq/Whisper API documentados | Prioridade média: transcrição de áudio do WhatsApp e busca em mensagens de voz |
| **Lamatok** | Não integrado | Não aparece no runtime atual | Não tem relação direta com o núcleo de SAC/WhatsApp |
| **Mercado Pago** | Sandbox integrado | Adapter de preapproval, consulta, webhook HMAC e reconciliação idempotente | Configurar segredo HMAC; produção exige credenciais e homologação próprias |
| **Evolution/WhatsApp** | Stub/preparado | Adaptador configurável e contrato documentado | Só ativar quando base URL, auth, payloads, webhook e reconexão forem homologados |

As APIs listadas no `gentle-aid` não devem ser interpretadas como “credenciais ativas”. O relatório `audit/02-inventario-apis.md` registra catálogo, nomes de variáveis, prefixos e heurísticas de validade, mas não encontrou valores inteiros de chaves versionados. Isso é diferente de uma validação ao vivo do provedor.

## 6. O que vale reutilizar imediatamente

A prioridade alta é criar no Mago Bot uma **Central de Integrações server-side** inspirada no cofre do `gentle-aid`, mas multiempresa e com escopo explícito. O owner deveria conseguir cadastrar uma integração por organização, validar a conexão, visualizar apenas metadados mascarados, rotacionar/revogar, auditar alterações e aplicar limites de custo. O valor secreto não deve voltar para o frontend nem aparecer em logs.

A segunda prioridade é fortalecer o contrato de job. O `gentle-aid` documenta cada API com método, endpoint, headers, payload, resposta e comportamento de erro. Esse padrão deve virar uma ficha de integração do Mago Bot para Evolution, Mercado Pago, IA, embeddings e futuras integrações. O worker Redis/BullMQ atual continua sendo a base, com `attempts`, backoff, lease, idempotency key e DLQ.

A terceira prioridade é adicionar uma pipeline legítima de mídia para WhatsApp: receber áudio, armazenar referência segura, transcrever via Groq ou Whisper, anexar a transcrição à conversa, permitir busca e gerar resumo com aprovação. O módulo do `gentle-aid` oferece ideias de chunking e normalização de timestamps; não é necessário copiar o backend Flask nem trocar PostgreSQL/Redis por arquivos JSON.

A quarta prioridade é importar os padrões de deploy seguro: paths explícitos, não escanear `/root` ou diretórios legados no boot, `EnvironmentFile` com permissões mínimas, backups verificáveis, rollback e health monitorado. O Mago Bot já possui boa parte disso; a auditoria do `gentle-aid` confirma que path confusion e boot scan são riscos concretos, não detalhe cosmético.

## 7. O que não deve ser copiado

Não deve ser copiada a identidade visual, a marca, textos ou telas do `gentle-aid`, SAC Mais, Zendesk, Intercom ou respond.io. Também não deve ser copiada a automação de clonagem, bypass de plataformas, alteração para evitar detecção ou qualquer fluxo que dependa de conteúdo sem autorização. O Mago Bot pode aprender com o padrão técnico de filas, jobs e contratos sem importar o risco de abuso ou violação de termos.

Também não se deve copiar o modelo de persistência de jobs em JSON para o núcleo do Mago Bot. Ele é adequado para uma ferramenta de mídia local/aaPanel, mas não oferece o isolamento, concorrência, lease e recuperação que uma central multiempresa de atendimento exige. O Redis/BullMQ/PostgreSQL atuais são a escolha correta.

## 8. Backlog recomendado após a auditoria

| Prioridade | Entrega | Motivo |
|---|---|---|
| P0 | Homologar Evolution com contrato operacional completo | É o único bloqueio para o produto operar WhatsApp real |
| P0 | Central de integrações/vault por organização | Permite usar com segurança Jina, Langfuse, providers de IA e futuros conectores |
| P0 | E2E Postgres/Redis cross-tenant | Confirma que signup, convites, RBAC, tickets, macros, sequências e billing não vazam dados |
| P1 | Transcrição de áudio WhatsApp | Usa a ideia mais diretamente aproveitável do `gentle-aid` e aumenta valor do SAC |
| P1 | Ingestão de URL para RAG com Tavily/Firecrawl | Transforma documentação do cliente em base de conhecimento, com revisão e citações |
| P1 | Integração Mistral/Cohere/Hugging Face somente por benchmark | Evita acumular conectores sem ganho medido |
| P1 | Alertas externos e incidentes | Completa a operação 24/7 do worker/web |
| P2 | Marketplace/OAuth de integrações | Necessário quando clientes passarem a conectar seus próprios canais/contas |
| P2 | Add-ons de IA, consumo e números | Monetização depois de observar custo real por organização |

## 9. Fontes e evidências

[1]: https://github.com/aryperdomo123456789-web/gentle-aid/tree/main "gentle-aid — branch main"
[2]: https://github.com/aryperdomo123456789-web/gentle-aid/tree/backup "gentle-aid — branch backup"
[3]: https://github.com/aryperdomo123456789-web/gentle-aid/tree/audit-codex "gentle-aid — branch audit-codex"
[4]: https://github.com/aryperdomo123456789-web/project-hello/tree/feat/saas-multiwhatsapp-flow-builder "Mago Bot — branch de desenvolvimento"
[5]: https://github.com/aryperdomo123456789-web/gentle-aid/blob/backup/audit/02-inventario-apis.md "gentle-aid — inventário de APIs"
[6]: https://github.com/aryperdomo123456789-web/gentle-aid/blob/backup/audit/09-auditoria-apis-completa.md "gentle-aid — auditoria completa de APIs"
[7]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/src/services/aiProvider.server.ts "Mago Bot — router de IA"
[8]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/src/services/embedding.server.ts "Mago Bot — embeddings e reranking"
[9]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/src/services/mercadopago.server.ts "Mago Bot — Mercado Pago sandbox"
[10]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/docs/market-reference-matrix.md "Mago Bot — matriz de referências de mercado"
