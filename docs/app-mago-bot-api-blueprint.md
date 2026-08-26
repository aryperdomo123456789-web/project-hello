# Blueprint da API central do Mago Bot

**Autor:** Manus AI
**Data:** 26 de agosto de 2026
**API analisada:** [app.mago-bot.com/docs](https://app.mago-bot.com/docs/)

## 1. Diagnóstico atual

A documentação pública atual está em OpenAPI 3.1, versão `1.2.0-alpha.1`. Ela já expõe uma base consistente de control plane: health/liveness/readiness, referências públicas, planos e trials, autenticação, usuários, projetos, licenças, mensagens, webhooks Meta, recursos, usage/billing, subscriptions de webhook, conversas, MFA, operações administrativas e uma configuração de `owner-whatsapp` [1].

O problema não é falta de endpoints administrativos. O problema é que a API ainda não representa todo o ciclo operacional que o Mago Bot precisa executar: conectar números, receber e enviar mensagens, processar mídia, distribuir conversas, executar fluxos, operar filas, consultar CRM, acionar IA, registrar custos e recuperar falhas.

> **Decisão arquitetural:** `app.mago-bot.com` deve ser a API central/control plane e operations plane. O frontend `mago-bot.com` deve consumi-la. Evolution e Meta Cloud devem ser providers atrás de adapters separados; nenhum payload específico de provider deve vazar para o domínio do produto.

## 2. Separação de responsabilidades

| Camada | Responsabilidade | Deve conhecer Evolution/Meta? |
|---|---|---|
| Control plane | Conta, organizações, usuários, papéis, licenças, planos, billing e integrações | Somente para configurar credentials e status |
| Operations plane | Canais, inbox, contatos, conversas, mensagens, filas, tickets, fluxos e campanhas | Não; usa contratos internos normalizados |
| AI plane | Copilot, agents, RAG, embeddings, reranking, transcrição, custo e fallback | Não; usa provider registry |
| Event plane | Webhooks, jobs, retries, DLQ, replay, auditoria e eventos externos | Adapters convertem payloads antes de entrar |
| Provider adapters | Evolution, Meta Cloud, Mercado Pago, LLMs, busca e storage | Sim; camada única autorizada |

A API não deve virar um proxy cego. Ela precisa aplicar autorização, isolamento de organização, validação de payload, idempotência, rate limits, auditoria e políticas antes de chamar qualquer provider.

## 3. Domínios obrigatórios da API

### 3.1 Identidade e organizações

A API precisa completar o ciclo de identidade e tenancy:

```text
POST   /v1/auth/login
POST   /v1/auth/logout
POST   /v1/auth/refresh
GET    /v1/auth/me
POST   /v1/auth/password-reset/request
POST   /v1/auth/password-reset/confirm
POST   /v1/auth/mfa/enroll
POST   /v1/auth/mfa/confirm

GET    /v1/organizations
POST   /v1/organizations
GET    /v1/organizations/{organization_id}
PATCH  /v1/organizations/{organization_id}
POST   /v1/organizations/{organization_id}/switch

GET    /v1/organizations/{organization_id}/members
POST   /v1/organizations/{organization_id}/invites
POST   /v1/invites/{token}/accept
PATCH  /v1/organizations/{organization_id}/members/{member_id}
DELETE /v1/organizations/{organization_id}/members/{member_id}
```

Toda requisição deve resolver a organização pelo token/sessão e pelo relacionamento de membership no servidor. O cliente não pode obter acesso a outra organização apenas trocando `organization_id` na URL.

### 3.2 Integrações e vault

A Central de APIs do painel já possui a fundação de credenciais cifradas e mascaradas. A API deve expor essa capacidade com escopos próprios:

```text
GET    /v1/organizations/{organization_id}/integrations
POST   /v1/organizations/{organization_id}/integrations
GET    /v1/integrations/{integration_id}
PATCH  /v1/integrations/{integration_id}
POST   /v1/integrations/{integration_id}/test
POST   /v1/integrations/{integration_id}/rotate
POST   /v1/integrations/{integration_id}/enable
POST   /v1/integrations/{integration_id}/disable
DELETE /v1/integrations/{integration_id}
```

A resposta deve devolver provider, capabilities, status, último teste, erro sanitizado e máscara. Nunca deve devolver o Access Token, Secret Key, App Secret ou qualquer envelope cifrado.

Providers cobertos no registry atual: DeepSeek, Gemini, Groq, OpenRouter, Jina, Tavily, Firecrawl, Exa, Cohere, Mistral, Hugging Face, Cloudflare Workers AI, Langfuse, SiliconFlow, Whisper, LamaTok, Mercado Pago, Evolution, Meta Cloud e Custom API.

### 3.3 Canais e números

Este é o coração do Mago Bot:

```text
GET    /v1/organizations/{organization_id}/channels
POST   /v1/organizations/{organization_id}/channels
GET    /v1/channels/{channel_id}
PATCH  /v1/channels/{channel_id}
POST   /v1/channels/{channel_id}/connect
GET    /v1/channels/{channel_id}/qr
GET    /v1/channels/{channel_id}/status
POST   /v1/channels/{channel_id}/disconnect
POST   /v1/channels/{channel_id}/reconnect
POST   /v1/channels/{channel_id}/rotate-credentials
DELETE /v1/channels/{channel_id}
```

O objeto interno `channel` deve conter `id`, `organization_id`, `provider`, `provider_instance_id`, `display_name`, `phone_number`, `status`, `last_seen_at`, `last_error`, `capabilities`, `flow_id`, `queue_id`, `knowledge_scope`, `created_at` e `updated_at`.

A API deve manter o mesmo modelo para Evolution e Meta Cloud. A diferença fica no adapter:

| Operação | Evolution | Meta Cloud oficial |
|---|---|---|
| Provisionar | Instância, API key e QR | WABA, phone number ID, app e token |
| Conectar | QR/conexão da instância | Verificação e registro oficial do número |
| Mensagem | Payload do gateway | `/messages`, templates, janela de 24 horas e mídia Meta |
| Webhook | Contrato da sua Evolution | Verificação e eventos oficiais Meta |
| Status | Estado da instância/gateway | Status oficial de mensagem e qualidade do número |

### 3.4 Inbox e mensagens

```text
GET    /v1/conversations
POST   /v1/conversations
GET    /v1/conversations/{conversation_id}
PATCH  /v1/conversations/{conversation_id}
GET    /v1/conversations/{conversation_id}/messages
POST   /v1/conversations/{conversation_id}/messages
POST   /v1/conversations/{conversation_id}/claim
POST   /v1/conversations/{conversation_id}/assign
POST   /v1/conversations/{conversation_id}/transfer
POST   /v1/conversations/{conversation_id}/snooze
POST   /v1/conversations/{conversation_id}/resolve
POST   /v1/conversations/{conversation_id}/reopen
GET    /v1/messages/{message_id}
POST   /v1/messages/{message_id}/retry
```

O objeto `message` precisa conter `id`, `organization_id`, `channel_id`, `conversation_id`, `contact_id`, `direction`, `type`, `text`, `media`, `provider_message_id`, `client_message_id`, `status`, `error_code`, `sent_at`, `delivered_at`, `read_at`, `created_at` e correlação.

Qualquer envio deve aceitar `Idempotency-Key`. Repetir a mesma chave deve devolver o mesmo resultado, nunca criar duas mensagens. Mensagens recebidas do provider devem ser deduplicadas por `organization_id + channel_id + provider_message_id`.

### 3.5 Mídia, arquivos e áudio

```text
POST   /v1/media/presign
POST   /v1/media/complete
GET    /v1/media/{media_id}
DELETE /v1/media/{media_id}
POST   /v1/messages/{message_id}/transcribe
GET    /v1/jobs/{job_id}
```

Uploads devem usar URL temporária, limite de tamanho, MIME allowlist, checksum, expiração e processamento assíncrono. A transcrição via Whisper deve ter estado `queued`, `processing`, `completed` ou `failed`, com retry, custo e provider registrados.

### 3.6 Contatos e CRM

```text
GET    /v1/contacts
POST   /v1/contacts
GET    /v1/contacts/{contact_id}
PATCH  /v1/contacts/{contact_id}
GET    /v1/contacts/{contact_id}/timeline
POST   /v1/contacts/{contact_id}/tags
DELETE /v1/contacts/{contact_id}/tags/{tag_id}
POST   /v1/contacts/import
GET    /v1/contacts/export
```

O CRM deve relacionar contato a todos os números, conversas, tickets, tarefas, campanhas, oportunidades, consentimentos, opt-out e receita atribuída. A identidade do contato precisa ser normalizada sem duplicar a pessoa quando ela conversa por dois canais da mesma organização.

### 3.7 Filas, skills, SLA e workforce

```text
GET    /v1/queues
POST   /v1/queues
PATCH  /v1/queues/{queue_id}
GET    /v1/queues/{queue_id}/members
POST   /v1/queues/{queue_id}/members
DELETE /v1/queues/{queue_id}/members/{member_id}
POST   /v1/conversations/{conversation_id}/assign
POST   /v1/conversations/{conversation_id}/transfer
GET    /v1/sla/policies
POST   /v1/sla/policies
GET    /v1/sla/events
GET    /v1/workforce/presence
```

O roteador precisa considerar canal/número, horário, skill, capacidade, prioridade, idioma, cliente VIP, round-robin, carga atual e SLA. Toda decisão deve gerar evento auditável explicando por que a conversa foi direcionada.

### 3.8 Tickets, macros e tarefas

```text
GET    /v1/tickets
POST   /v1/tickets
GET    /v1/tickets/{ticket_id}
PATCH  /v1/tickets/{ticket_id}
POST   /v1/tickets/{ticket_id}/resolve
POST   /v1/tickets/{ticket_id}/reopen
GET    /v1/macros
POST   /v1/macros
PATCH  /v1/macros/{macro_id}
POST   /v1/macros/{macro_id}/archive
GET    /v1/tasks
POST   /v1/tasks
PATCH  /v1/tasks/{task_id}
```

Tickets devem possuir prioridade, estado, fila, agente, SLA, tags, motivo, conversa relacionada, contato e histórico de mudanças. Macros devem ter escopo, versão, aprovação e auditoria.

### 3.9 Fluxos e sequências

```text
GET    /v1/flows
POST   /v1/flows
GET    /v1/flows/{flow_id}
PATCH  /v1/flows/{flow_id}
POST   /v1/flows/{flow_id}/validate
POST   /v1/flows/{flow_id}/publish
POST   /v1/flows/{flow_id}/pause
POST   /v1/flows/{flow_id}/simulate
GET    /v1/flow-runs/{run_id}
GET    /v1/sequences
POST   /v1/sequences
PATCH  /v1/sequences/{sequence_id}
POST   /v1/sequences/{sequence_id}/enroll
POST   /v1/sequences/{sequence_id}/pause
POST   /v1/sequences/{sequence_id}/resume
```

Cada fluxo publicado deve ser imutável por versão. O runtime precisa registrar input, versão, nó atual, decisões, efeitos, retry, DLQ, custo e resultado. Sequências devem respeitar opt-out, quiet window, frequência, cancelamento, lease e idempotência.

### 3.10 Base de conhecimento e IA

```text
GET    /v1/knowledge/sources
POST   /v1/knowledge/sources
POST   /v1/knowledge/sources/{source_id}/ingest
POST   /v1/knowledge/sources/{source_id}/reindex
PATCH  /v1/knowledge/sources/{source_id}
DELETE /v1/knowledge/sources/{source_id}
POST   /v1/ai/copilot
POST   /v1/ai/agent-runs
GET    /v1/ai/agent-runs/{run_id}
POST   /v1/ai/agent-runs/{run_id}/approve
POST   /v1/ai/agent-runs/{run_id}/reject
GET    /v1/ai/usage
```

O RAG deve filtrar por organização, canal, fonte publicada e permissão. Ingestão de arquivo/URL precisa de revisão e citações. O copilot deve continuar sob aprovação humana para envio e ações sensíveis. Agentes podem criar tarefa, classificar lead, atualizar CRM, transferir fila ou chamar ferramentas allowlisted, mas cada ação deve ter policy e auditoria.

### 3.11 QA, CSAT, conversão e ROI

```text
GET    /v1/quality/reviews
POST   /v1/quality/reviews
GET    /v1/quality/scorecards
POST   /v1/quality/scorecards
GET    /v1/quality/analytics
GET    /v1/csat
POST   /v1/conversions
GET    /v1/conversions
POST   /v1/marketing-spend
GET    /v1/roi
```

A API deve distinguir receita efetivamente registrada, custo informado, custo de provider, conversão atribuída e estimativa. Não deve inventar faturamento. Relatórios precisam filtrar por agente, fila, número, canal, campanha, período e organização.

### 3.12 Billing, planos e consumo

```text
GET    /v1/billing/summary
GET    /v1/billing/events
GET    /v1/plans
GET    /v1/organizations/{organization_id}/plan
PATCH  /v1/organizations/{organization_id}/plan
POST   /v1/billing/checkout
POST   /v1/billing/cancel
POST   /v1/webhooks/mercadopago
GET    /v1/usage
GET    /v1/usage/ledger
```

O webhook Mercado Pago deve validar HMAC, consultar o recurso oficial, usar `external_reference` para localizar a organização, persistir evento idempotente e atualizar billing somente após confirmação. Trial não deve ser confundido com pagamento.

## 4. Contrato técnico transversal

### Autenticação e autorização

Sessões de painel podem usar cookie seguro, `HttpOnly`, `SameSite=Lax/Strict`, CSRF protection e rotação. Integrações externas devem usar API keys escopadas ou OAuth. Toda chave precisa de nome, scopes, organização, criação, último uso, expiração, rotação e revogação.

Scopes mínimos:

```text
org:read              org:admin
members:read          members:write
integrations:read     integrations:manage
channels:read         channels:manage
conversations:read    conversations:write
messages:send         media:write
flows:read            flows:publish
billing:read          billing:manage
analytics:read        audit:read
```

### Paginação e filtros

Listagens devem usar cursor, limite máximo, ordenação estável e filtros por data/estado. O cursor não deve revelar IDs sequenciais ou dados de outra organização.

```http
GET /v1/conversations?cursor=...&limit=50&status=open&channel_id=...
```

### Idempotência e correlação

Toda mutação que cria recurso, envia mensagem, publica fluxo, inscreve sequência, cria checkout ou processa webhook deve aceitar:

```http
Idempotency-Key: chave-unica-da-operacao
X-Request-Id: correlacao-do-cliente
```

### Envelope de resposta e erro

```json
{
  "data": {},
  "request_id": "req_123",
  "meta": { "next_cursor": null }
}
```

```json
{
  "error": {
    "code": "provider_timeout",
    "message": "O provider não respondeu no prazo",
    "request_id": "req_123",
    "retryable": true,
    "details": {}
  }
}
```

Não retornar stack trace, token, SQL, payload cru de provider ou dados pessoais além do necessário.

## 5. Eventos e webhooks

A API deve receber e publicar eventos de forma assíncrona. O handler valida assinatura, timestamp, replay, schema e tenant; persiste o envelope; responde rapidamente; e entrega o processamento ao worker.

Eventos internos recomendados:

```text
channel.created
channel.connecting
channel.connected
channel.disconnected
channel.reconnected
message.received
message.queued
message.sent
message.delivered
message.read
message.failed
conversation.created
conversation.assigned
conversation.transferred
conversation.resolved
flow.published
flow.run.completed
flow.run.failed
sequence.step.completed
ticket.sla_breached
ai.run.completed
ai.action.approved
billing.subscription_updated
```

Cada evento deve conter `event_id`, `event_type`, `version`, `organization_id`, `occurred_at`, `producer`, `correlation_id` e `data`. Consumidores devem poder reprocessar eventos sem duplicar efeitos.

## 6. Resiliência e operação

A API precisa ter filas separadas para inbound, outbound, mídia, IA, transcrição, ingestão RAG, billing e webhooks. Cada job deve ter timeout, retry exponencial com jitter, limite de tentativas, DLQ, idempotency key, lease e replay manual.

Circuit breakers devem existir por provider e por organização. O health precisa distinguir:

| Endpoint | O que prova |
|---|---|
| `/health/live` | Processo responde |
| `/health/ready` | Banco, Redis e dependências mínimas disponíveis |
| `/health` | Estado agregado da aplicação |
| `/metrics` | Métricas para observabilidade |
| `/v1/ops/providers/{provider}` | Estado operacional do provider específico |

SLOs mínimos para go-live devem ser definidos antes da venda: disponibilidade, latência P95 de envio, tempo de ingestão de webhook, taxa máxima de duplicidade, tempo de recuperação e backlog máximo de fila.

## 7. Evolução do Swagger/OpenAPI

A documentação atual deve evoluir de `1.2.0-alpha.1` para uma API versionada com tags por domínio, schemas reutilizáveis, exemplos completos, erros, scopes, rate limits, webhooks, eventos, depreciações e changelog.

A estrutura recomendada é:

```text
/v1/auth/*
/v1/organizations/*
/v1/integrations/*
/v1/channels/*
/v1/conversations/*
/v1/messages/*
/v1/media/*
/v1/contacts/*
/v1/queues/*
/v1/tickets/*
/v1/flows/*
/v1/sequences/*
/v1/knowledge/*
/v1/ai/*
/v1/quality/*
/v1/analytics/*
/v1/billing/*
/v1/webhooks/*
/v1/jobs/*
/v1/ops/*
```

Também devem existir SDKs TypeScript e Python, coleção Postman/Insomnia, ambiente sandbox, exemplos de webhook e um changelog público. A documentação não pode prometer “mídia”, “QR” ou “Meta oficial” antes de cada capacidade ter teste de contrato automatizado.

## 8. Roadmap de implementação

| Fase | Entrega | Critério de aceite |
|---|---|---|
| P0.1 | Vault ligado ao runtime | Provider habilitado por organização é usado; token nunca aparece no frontend/log |
| P0.2 | Canais/Evolution adapter | Criar, QR, status, disconnect, send text e webhook passam em sandbox |
| P0.3 | Meta Cloud adapter | Verificação, inbound, outbound, templates, mídia e status passam em sandbox oficial |
| P0.4 | Inbox API operacional | Mensagem inbound vira conversa correta; outbound é idempotente |
| P0.5 | E2E Postgres/Redis | Signup, RBAC, cross-tenant, webhook, retry, DLQ e billing passam com banco separado |
| P0.6 | Onboarding | Cliente conecta canal, cria fila, publica fluxo e recebe primeiro evento sem ajuda manual |
| P1.1 | Mídia e Whisper | Áudio é transcrito de forma assíncrona, com retry e custo |
| P1.2 | RAG URL | URL autorizada é ingerida, revisada, indexada e citada no copilot |
| P1.3 | Agents com ações | Ação permitida é executada, ação sensível pede aprovação e tudo é auditado |
| P1.4 | QA/ROI avançado | Scorecard, conversão, custo, cohort e atribuição são filtráveis |
| P2.1 | Enterprise | SSO/SCIM, IP allowlist, PII masking, DPA/LGPD, pentest e status público |
| P2.2 | Ecossistema | OAuth, marketplace, SDKs, webhooks de saída e add-ons por consumo |

## 9. Critério de “API completa”

A API pode ser considerada completa para o Mago Bot quando uma organização nova conseguir, usando apenas documentação e API:

1. criar conta e organização;
2. configurar integração server-side;
3. criar e conectar um canal Evolution ou Meta Cloud;
4. receber webhook e criar contato/conversa;
5. distribuir a conversa para fila/agente;
6. responder texto e mídia sem duplicidade;
7. executar fluxo, ticket, macro e sequência;
8. consultar copiloto/RAG e aprovar ação;
9. medir SLA, QA, conversão e ROI;
10. pagar, consultar consumo e administrar membros;
11. verificar eventos, retries, DLQ e auditoria;
12. exportar/apagar dados conforme política e operar sem acesso ao banco.

Esse teste de ponta a ponta vale mais que adicionar dezenas de endpoints isolados. Se qualquer etapa depender de editar `.env`, consultar SQL manualmente ou entrar no servidor, a API ainda não serve completamente o produto.

## Referências

[1]: https://app.mago-bot.com/docs/ "Mago Bot Platform — OpenAPI pública atual"
[2]: https://developers.facebook.com/docs/whatsapp/cloud-api/ "Meta — WhatsApp Cloud API"
[3]: https://www.mercadopago.com.br/developers/pt/docs "Mercado Pago — documentação oficial"
[4]: https://spec.openapis.org/oas/v3.1.0 "OpenAPI Specification 3.1"
[5]: https://owasp.org/API-Security/ "OWASP API Security Project"
