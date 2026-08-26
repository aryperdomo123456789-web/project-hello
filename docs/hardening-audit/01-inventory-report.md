# Deep Audit — Inventário e Fluxos

**Projeto:** Mago Bot  
**Branch auditada:** `feat/saas-multiwhatsapp-flow-builder`  
**Escopo:** frontend React/TanStack Start, SSR Node/Nitro, PostgreSQL/Drizzle, Redis/BullMQ, adaptador WhatsApp, webhooks e operação PM2.

## 1. Mapa estrutural

A aplicação está organizada em cinco superfícies principais. `src/routes` contém a composição SSR, o painel autenticado, login, health check e webhook público. `src/components` contém as telas de inbox, conexões, relatórios, kanban e construtor de especialistas, além dos componentes de UI. `src/functions` concentra RPCs server-side serializáveis para autenticação, canais, conversas, filas, fluxos e métricas. `src/services`, `src/server` e `src/queue` concentram o adaptador WhatsApp, runtime de fluxos, webhook processor, sessão, autorização, licenciamento, auditoria e worker. `src/db` contém o schema PostgreSQL e a conexão server-side.

| Superfície | Arquivos principais | Responsabilidade |
|---|---|---|
| Rotas | `src/routes/__root.tsx`, `index.tsx`, `login.tsx`, `api/health.ts`, `api/webhooks/whatsapp.ts` | Shell, autenticação, painel, health e ingestão |
| Inbox | `src/hooks/useChat.ts`, `ChatList.tsx`, `ChatMessageArea.tsx`, `ContactDetails.tsx` | Estado visual, histórico, ações e envio |
| Conexões | `ConnectionsView.tsx`, `channel.functions.ts`, `whatsapp.server.ts` | Instâncias, QR, desconexão e envio |
| Automações | `FlowBuilderView.tsx`, `flow.functions.ts`, `flowRuntime.server.ts`, `flows/*` | Editor, publicação, simulação e runtime |
| Atendimento | `assignment.functions.ts`, `queues` e `assignmentEvents` | Posse, fila, transferência e resolução |
| Plataforma | `auth.server.ts`, `session.server.ts`, `audit.server.ts`, `license.server.ts` | Identidade, papéis, auditoria e licenciamento |
| Infraestrutura | `db/client.server.ts`, `queue/*`, `scripts/worker.ts`, `deploy/*` | Banco, Redis, retries, timers e PM2 |

## 2. Rotas e fronteiras

| Rota | Acesso | Dependências críticas | Fallback atual |
|---|---|---|---|
| `/` | Sessão obrigatória | `requireUser`, `listConversations`, conexões, métricas e telas | Boundary único do TanStack Start |
| `/login` | Público | RPC de autenticação, banco e cookie de sessão | Toast/local state |
| `/api/health` | Público | PostgreSQL e Redis | HTTP 503 com checks booleanos |
| `/api/webhooks/whatsapp` | Público autenticado por segredo | licença, normalizador, banco, runtime e dispatcher | HTTP 401/erro do handler |

O fluxo de entrada é: provedor WhatsApp → `POST /api/webhooks/whatsapp` → validação do segredo → `normalizeWebhook` → `processWebhookEvents` → deduplicação em `webhookEvents` → contato/conversa/mensagem → `startOrResumeFlow` → efeitos do fluxo ou distribuição por capacidade → atualização da inbox. O fluxo de saída é: ação do atendente ou efeito do runtime → RPC server-side → adapter WhatsApp → mensagem persistida → atualização de estado.

## 3. Pontos únicos de falha identificados

| ID | Ponto | Impacto | Evidência | Prioridade |
|---|---|---|---|---|
| SPOF-01 | Boundary global único no root | Erro de tela pode substituir o shell inteiro | `src/routes/__root.tsx` | P0 |
| SPOF-02 | `useChat` engole erros do polling | Inbox pode ficar congelada sem diagnóstico | `src/hooks/useChat.ts` | P0 |
| SPOF-03 | Tela de conversa assume `contact.name` e arrays válidos | Payload incompleto pode derrubar componente | `ChatMessageArea.tsx` | P0 |
| SPOF-04 | `JSON.parse` de gráficos carregados do banco | Draft corrompido pode quebrar Automações | `FlowBuilderView.tsx` | P0 |
| SPOF-05 | RPCs e métricas sem fallback visual granular | Falha de uma consulta contamina tela inteira | `src/functions/*`, `ReportsView.tsx` | P1 |
| SPOF-06 | Promessas disparadas por efeitos e handlers | Rejeições podem ser somente toast ou invisíveis | `useChat.ts`, telas de conexões e fluxos | P1 |
| SPOF-07 | Interceptor global atual registra console, mas não correlaciona contexto | Diagnóstico não chega à UI nem possui ação de recuperação | `src/lib/error-capture.ts` | P1 |
| SPOF-08 | Dependência única de PostgreSQL/Redis no caminho operacional | Falha externa interrompe autenticação, inbox ou worker | `db/client.server.ts`, `queue/*` | P1 |
| SPOF-09 | Bundle inicial pesado | Falha de carregamento/performance pode parecer tela branca | build: Recharts, React Flow e BullMQ | P2 |

## 4. Riscos de estado e nullability

Os pontos mais sensíveis são transformações de DTO para modelos visuais, acesso a propriedades aninhadas vindas de banco ou provedor, `JSON.parse` de grafos, uso de `.map` em listas que dependem de resposta RPC, seleção manual de contato após atualização da lista e o modal de QR Code que assume imagem válida. O risco não é eliminar todo `?.`; é garantir que cada fronteira externa valide o contrato e que cada tela possa renderizar estado vazio, carregando ou erro.

O código também possui um mock legado em `src/services/evolutionApi.ts`, separado do adaptador server-side atual. Ele deve ser isolado ou removido do caminho de produção para não criar duas fontes de verdade. A integração principal é `src/services/whatsapp.server.ts`.

## 5. Estratégia de correção

A implementação seguirá quatro camadas. A primeira será um contrato único de diagnóstico com redaction e ID de correlação. A segunda será o `ErrorBoundary` global e boundaries de tela/componente. A terceira será o interceptor de `window.error`, `unhandledrejection`, erros de rede e falhas de RPC. A quarta será a gaveta flutuante, com estado seguro, contexto sanitizado, stack, origem e ações de recuperação. Em paralelo, os pontos críticos de `useChat`, `JSON.parse`, QR Code e componentes de conversa receberão guards defensivos.

## Referências internas

[1]: ../../src/routes/__root.tsx — shell e boundary atual.  
[2]: ../../src/hooks/useChat.ts — polling, mapeamento de DTOs e estado da inbox.  
[3]: ../../src/components/chat/ChatMessageArea.tsx — renderização e ações da conversa.  
[4]: ../../src/lib/error-capture.ts — captura server/client existente.  
[5]: ../../src/services/whatsapp.server.ts — adaptador e normalização de eventos.
