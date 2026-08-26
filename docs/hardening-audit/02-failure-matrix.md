# Deep Audit — Matriz de Falhas e Fluxos Assíncronos

## 1. Fluxos críticos

| Fluxo | Origem | Etapas | Dependências | Falha provável |
|---|---|---|---|---|
| Login | Formulário `/login` | RPC → banco → bcrypt → sessão | PostgreSQL, cookie | rejeição não exibida ou sessão inconsistente |
| Inbox | `useChat` | listar → selecionar → histórico → polling | RPC, banco, timer | polling silencioso, seleção perdida, DTO inválido |
| Envio humano | Composer | callback → RPC → adaptador → mensagem | provedor WhatsApp, banco | botão sem estado, dupla submissão ou erro só em toast |
| Conexão | Tela de números | listar/criar/QR/desconectar | licenciamento, provedor, QR | modal quebrado, URL inválida, falha de rede |
| Webhook | Provedor | segredo → normalização → transação → fluxo | HTTP, PostgreSQL, Redis opcional | payload inesperado, replay, timeout |
| Automação | Mensagem recebida | binding → execução → nó → efeito/worker | banco, provider, fila | loop, timer perdido, efeito duplicado |
| Relatório | Dashboard | agregações paralelas → cards/gráficos | PostgreSQL | uma consulta derruba toda a tela |

## 2. Operações assíncronas e contenção

| Arquivo | Operação | Risco | Tratamento atual | Hardening |
|---|---|---|---|---|
| `src/hooks/useChat.ts` | polling a cada 10s | rejeição engolida | `.catch(() => undefined)` | captura contextual + último dado válido + backoff |
| `src/hooks/useChat.ts` | carregamento de histórico | corrida entre seleções | estado manual | request generation key + cancelamento lógico |
| `ConnectionsView.tsx` | criar/QR/logout | modal e QR indefinidos | toast | boundary local + validação de URL + estado de ação |
| `FlowBuilderView.tsx` | carregar draft | `JSON.parse` fatal | catch no load | parser seguro e fallback de grafo vazio |
| `ReportsView.tsx` | agregações | erro total de tela | catch silencioso | boundary de widget + dados parciais |
| `api/webhooks/whatsapp.ts` | `request.json` | corpo inválido | exceção do handler | resposta 400 estruturada + correlation ID |
| `webhookProcessor.server.ts` | transação/evento | falha de banco | propaga erro | log estruturado + replay seguro |
| `flowRuntime.server.ts` | efeitos e timers | duplicação/loop | idempotência parcial | limite de passos + failure state + retry rastreável |
| `queue/worker.server.ts` | retry | Redis ou provider fora | job failed | backoff, dead-letter lógico e health |
| `src/server.ts` | SSR | falha catastrófica | HTML fallback | correlation ID + telemetria sanitizada |

## 3. Pontos únicos de falha prioritários

A interface principal concentra inbox, cabeçalho, conversa e área lateral em uma única árvore React. Sem boundaries por subárvore, uma exceção em `ChatMessageArea` ou `ContactDetails` pode substituir o painel inteiro. O polling atual também é um ponto de degradação silenciosa: a aplicação continua interativa, porém o operador trabalha com estado antigo sem saber.

O segundo grupo está nas fronteiras de dados. Drafts de fluxo vêm como JSON do banco e eventos do provedor são objetos externos. Qualquer suposição sobre shape, nome, telefone, texto ou status precisa ser validada antes de chegar ao componente. O terceiro grupo é assíncrono: callbacks de envio, RPCs e timers podem resolver fora de ordem e atualizar estado de uma conversa já trocada.

## 4. Política de severidade

| Severidade | Definição | Ação |
|---|---|---|
| P0 | Pode derrubar shell, causar tela branca ou perder operação | boundary imediato, fallback e diagnóstico obrigatório |
| P1 | Pode congelar uma área ou duplicar operação | isolamento por widget, retry controlado e alerta |
| P2 | degradação visual, dado parcial ou telemetria ausente | fallback local e correção programada |
| P3 | melhoria de ergonomia ou log | backlog sem bloquear release |

## 5. Critérios de aceitação do hardening

Uma falha de gráfico não pode esconder a inbox. Uma falha de polling deve mostrar estado desatualizado com aviso e permitir retry. Uma rejeição de RPC deve criar evento de diagnóstico com contexto sanitizado. Um erro de renderização deve preservar shell, navegação e gaveta. Um erro global deve possuir ID, timestamp, rota, origem, mensagem, stack limitada, dados redigidos e ação de recuperação. Nenhum diagnóstico pode carregar senha, token, cookie, header de autorização, chave de API ou conteúdo integral de mensagem sem redaction explícita.
