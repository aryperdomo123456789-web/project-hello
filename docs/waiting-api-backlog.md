# Backlog independente enquanto a API externa não está pronta

## Objetivo

Maximizar a prontidão comercial e técnica do Mago Bot sem depender de `app.mago-bot.com`, Evolution ou Meta Cloud. Toda entrega deve ser executável em modo local/stub, testável com PostgreSQL/Redis isolados e reversível em produção.

## Já entregue nesta fase

| Bloco | Situação | Evidência |
|---|---|---|
| Licenciamento local | Pronto | `LICENSE_MODE=local` por padrão |
| Vault por organização | Pronto | AES-256-GCM, RBAC e auditoria |
| IA por organização | Pronto | AI router tenant-aware com fallback |
| RAG híbrido | Pronto | Lexical + embeddings/reranking opcional |
| Ingestão de URL | Pronto | Firecrawl/Jina opcional e bloqueio SSRF |
| Áudio | Pronto | Job assíncrono Whisper/Groq, retry/DLQ |
| E2E | Pronto | Postgres/Redis isolados e cross-tenant |
| CI | Pronto | Migrations, seed, 33 testes, E2E e build |
| Dashboard | Pronto | Métricas reais e onboarding por execução |

## Próximas entregas independentes

### P0 — Confiança operacional

Revisar as dependências que o `npm ci` sinalizou como vulnerabilidades moderadas, sem aplicar `npm audit fix --force` às cegas. Adicionar limites explícitos para jobs, timeouts por provider, circuit breaker por organização e métricas de backlog/DLQ. Completar uma matriz endpoint-a-endpoint de tenant isolation e garantir que cada mutation use idempotência.

Criar smoke tests locais para o modo stub: inbound simulado, duplicidade de webhook, outbound bloqueado quando provider não é homologado, falha de Redis, falha de PostgreSQL, retry e replay de DLQ.

### P1 — Produto vendável antes do canal

Construir um simulador de atendimento com cenários editáveis por organização: lead novo, suporte, financeiro, handoff, timeout, opt-out e falha de provider. O simulador deve alimentar as mesmas tabelas de conversa, mensagens e execuções, deixando a demonstração comercial honesta e reproduzível.

Criar um wizard de onboarding em etapas: workspace, fila, equipe, macro, fluxo, base de conhecimento, teste e checklist de publicação. Cada etapa deve ler dados persistidos e permitir retomar depois.

Adicionar templates prontos de fluxo, macros, filas, scorecards de QA e base de conhecimento por nicho, todos editáveis e clonáveis por organização.

### P1 — IA mensurável

Adicionar catálogo de modelos por tenant, seleção de modelo por caso de uso, orçamento mensal, contagem de tokens, latência, fallback e custo estimado. Criar avaliação offline com perguntas/respostas aprovadas pelo cliente, score de groundedness/citação e comparação entre providers.

Ligar transcrição a uma caixa de revisão humana, permitir corrigir o texto, registrar confiança e impedir que transcrição com baixa confiança seja usada automaticamente em decisões sensíveis.

### P1 — Receita e retenção

Completar atribuição de conversão por conversa/canal/campanha, funil de oportunidade e cohort de retenção. Criar exportação de dados, solicitação de exclusão, status de retenção, legal hold e relatório de dry-run para o owner.

### P2 — Enterprise e ecossistema

Adicionar PWA/mobile responsivo para agentes, SSO/SCIM, allowlist de IP, mascaramento de PII, política de LGPD, marketplace/OAuth e add-ons de consumo por número, mensagens, IA e transcrição.

## Bloqueado até a API externa

QR e conexão real, criação de instância Evolution, inbound/outbound WhatsApp, mídia real, status de entrega, reconexão, templates Meta, WABA/phone number ID, webhooks oficiais e canário de produção dependem do contrato operacional da API externa.

## Critério de conclusão da espera

Antes de ativar Evolution/Meta, o Mago Bot deve conseguir demonstrar em modo stub: criar organização, convidar equipe, criar fila, configurar macro, publicar fluxo, simular conversa, executar handoff, gerar ticket, consultar RAG com citação, transcrever áudio de teste, medir SLA/QA/ROI, exportar dados, apagar dados em dry-run e recuperar jobs com retry/DLQ.
