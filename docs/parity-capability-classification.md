# Classificação de capacidades: sem Evolution, simulação e bloqueios

**Projeto:** Mago Bot  
**Data:** 26 de agosto de 2026

## Regra de decisão

Uma capacidade entra em **implementável sem Evolution** quando depende apenas de domínio, banco, interface, filas internas, permissões ou regras de negócio. Entra em **simulável** quando precisa reproduzir eventos de provedor, mas pode ser validada com fixtures determinísticas. Fica **bloqueada pelo canal** quando exige conexão, autenticação ou confirmação real do WhatsApp.

## Matriz principal

| Capacidade | Classificação | Situação do Mago Bot | Próximo critério |
|---|---|---|---|
| Multiempresa e isolamento | Implementável sem Evolution | Base pronta | Teste com duas organizações e tentativa cross-tenant |
| Papéis owner/admin/supervisor/agent | Implementável sem Evolution | Base server-side pronta | UI completa por papel e convite aceito |
| Turno/disponibilidade | Implementável sem Evolution | Disponibilidade e capacidade prontas | Escala semanal, feriados e pausa automática |
| Inbox única | Implementável sem Evolution | Pronta com dados persistidos | Busca global, filtros salvos e ações em lote |
| Notas internas | Implementável sem Evolution | Persistência pronta | Menções, edição e trilha de leitura |
| Macros/respostas rápidas | Implementável sem Evolution | Base pronta | CRUD, categorias, permissões e uso por fila |
| CRM | Implementável sem Evolution | Pipeline e tarefas prontas | Campos, timeline, importação e segmentação |
| Follow-up | Implementável sem Evolution | Tarefas e worker preparados | Campanha, opt-out, janela e políticas de frequência |
| Filas | Implementável sem Evolution | Estratégia, skill, SLA e horário | Editor visual de política e feriados |
| Chatbot visual | Implementável sem Evolution | Editor e runtime prontos | Variáveis, menu, fallback, teste e rollback |
| IA assistiva | Implementável sem Evolution | Contrato preparado | Classificação, sugestão, resumo e aprovação humana |
| Métricas | Implementável sem Evolution | Volume, SLA, carga e satisfação | Exportação, metas e conversão por funil |
| Avaliação | Implementável sem Evolution | RPC e métrica pronta | Coletor de resposta e relatório por agente |
| Auditoria | Implementável sem Evolution | Ações críticas registradas | Retenção, busca e exportação para gestor |
| Saúde/observabilidade | Implementável sem Evolution | Health check e error drawer prontos | Alertas, histórico e integração com monitoramento |
| Replay de webhook | Simulável | Laboratório pronto | Fixtures versionadas por provedor |
| Duplicação de evento | Simulável | Replay idempotente pronto | Teste com status e mensagens fora de ordem |
| Timeout/retry | Simulável | Worker e caos controlado prontos | Backoff, DLQ e alerta operacional |
| QR Code | Bloqueado pelo canal | Stub disponível | Homologar endpoint operacional Evolution |
| Conexão do número | Bloqueado pelo canal | Adaptador configurável | Criar, conectar, reconectar e desconectar |
| Mensagem inbound | Simulável/bloqueado | Normalizador + laboratório | Validar payload real e assinatura |
| Mensagem outbound | Simulável/bloqueado | Efeito e stub preparados | Confirmar endpoint, status e idempotência |
| Mídia/documento/áudio | Bloqueado pelo canal | Contrato ainda parcial | Upload, storage, download e limites |
| Recibo de entrega/leitura | Bloqueado pelo canal | Modelo de status preparado | Mapear eventos reais e atualização de mensagem |
| Presença/reconexão | Bloqueado pelo canal | Estado de conexão modelado | Testar eventos reais e recuperação |
| Instagram/Messenger/WebChat | Bloqueado por integração | Domínio permite adaptadores | Implementar provedores específicos |

## Resultado prático

Sem a Evolution, é possível chegar a um **beta técnico de operação** cobrindo onboarding, equipe, inbox, CRM, filas, SLA, automações, laboratório, métricas, auditoria e governança. O que não pode ser chamado de pronto é o transporte do WhatsApp real.

A implementação deve permanecer orientada por contratos. O domínio não pode conhecer detalhes de QR, payload ou endpoint. O provedor deve normalizar eventos e receber efeitos por fila, com timeout, retry, redaction e idempotência.

## Referências do benchmark

[1]: https://sacmais.com.br/ "SacMais — Plataforma de Atendimento WhatsApp, CRM e IA"

[2]: https://sacmais.com.br/blog/sacmais-whatsapp-atendimento-plataforma-recursos-ia-precos-2026/ "SacMais — Plataformas WhatsApp para Empresas: Qual Escolher em 2026?"

[3]: https://sacmais.com.br/blog/chatbots-hibridos-humanos-ia-whatsapp/ "SacMais — Chatbots híbridos: quando humanos e IA trabalham juntos no WhatsApp"

[4]: https://sacmais.com.br/blog/crm-whatsapp-centralizar-vendas-atendimento/ "SacMais — CRM WhatsApp: Como Centralizar Vendas e Atendimento"

[5]: https://sacmais.com.br/blog/como-criar-relatorios-de-desempenho-para-equipes-no-whatsapp/ "SacMais — Como criar relatórios de desempenho para equipes no WhatsApp"
