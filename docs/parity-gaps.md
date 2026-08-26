# Gaps para beta e escala

## Severidade e leitura

**P0** bloqueia o beta operacional ou pode causar perda de dados, mistura de organizações ou atendimento incorreto. **P1** reduz valor comercial ou aumenta custo operacional, mas permite piloto controlado. **P2** melhora diferenciação, escala ou conveniência depois que o núcleo estiver provado.

## Gaps técnicos

| Prioridade | Gap | Risco | Critério de aceite |
|---:|---|---|---|
| P0 | Homologação do provedor WhatsApp | O produto não recebe nem envia mensagens reais | Criar/conectar instância, receber, responder e atualizar status reais |
| P0 | Migrations e banco no VPS | Telas e RPCs não têm persistência em produção | PostgreSQL com backup e restauração testados |
| P0 | Redis/worker no VPS | Timers e retries podem parar | PM2 sobe web e worker; health acusa Redis indisponível |
| P0 | Permissões completas por tela e ação | Usuário comum pode visualizar operação indevida | Matriz de RBAC testada por endpoint e navegação |
| P1 | Code splitting | Bundle inicial pesado em equipes menores | Dashboard, editor e worker carregados por chunks sob demanda |
| P1 | Busca e paginação | Inbox degrada com volume alto | Consulta paginada e índices testados com carga representativa |
| P1 | Storage de mídia | Imagens, áudios e documentos ainda não são operação | Upload, limite, antivírus/validação e URL expirada |
| P2 | Canais adicionais | Paridade omnichannel incompleta | Adaptadores de Instagram, Messenger e WebChat com fixtures |

## Gaps operacionais

| Prioridade | Gap | Risco | Critério de aceite |
|---:|---|---|---|
| P0 | Onboarding de primeira conexão | Cliente não chega ao primeiro valor | Wizard conduz organização, equipe, fila, fluxo e teste |
| P0 | Convite e aceite de usuário | Gestor precisa cadastrar manualmente | Link expira, aceita uma vez e cria membership correto |
| P0 | Reconexão e incidentes | Atendimento fica invisivelmente parado | Estado, alerta, retry e runbook testados |
| P1 | Turnos, feriados e pausas | SLA calculado fora do horário | Calendário por fila e teste de fronteira |
| P1 | Avaliação pós-atendimento real | Qualidade não fecha o ciclo | Conversa resolvida gera coleta e métrica por agente/fila |
| P1 | Chat interno | Equipe usa canal externo paralelo | Mensagem interna não aparece para o cliente |
| P1 | Exportação e retenção | Gestor não consegue operar dados | CSV/JSON com filtros e política de retenção |
| P2 | Implantação assistida | Adoção depende de suporte manual | Checklist, ajuda contextual e documentação dentro do produto |

## Gaps comerciais

| Prioridade | Gap | Risco | Critério de aceite |
|---:|---|---|---|
| P0 | ICP e caso de uso inicial | Produto tenta servir todo mundo | Um segmento, uma promessa e um fluxo de demonstração |
| P0 | Cobrança e entitlement | Não há receita recorrente controlada | Plano, limite, upgrade/downgrade e bloqueio server-side |
| P0 | Métrica de ativação | Não sabemos quem chegou ao valor | Conexão, primeiro fluxo, primeira conversa e primeira resolução medidos |
| P1 | Retenção e saúde do cliente | Vendas pontuais sem recorrência | Uso semanal, conversas, SLA e churn acompanhados |
| P1 | Suporte e SLA comercial | Operação interna vira gargalo | Base de ajuda, canal de suporte e tempos definidos |
| P2 | Canais de aquisição | Escala depende de indicação manual | Demonstração, trial, conteúdo e CRM comercial instrumentados |

## Gaps de segurança e confiabilidade

| Prioridade | Gap | Risco | Critério de aceite |
|---:|---|---|---|
| P0 | Assinatura/autenticação de webhook | Injeção de evento externo | Evento inválido é recusado antes da persistência |
| P0 | Rate limiting | Abuso de login, webhook ou RPC | Limites por IP, organização e endpoint sensível |
| P0 | Segredos e rotação | Vazamento paralisa ou compromete contas | Secrets server-side, rotação e ausência no bundle |
| P0 | Isolamento multi-tenant profundo | Dados de uma empresa podem vazar | Testes cross-tenant em todas as consultas/mutações |
| P1 | Dead-letter queue | Falhas permanentes desaparecem | DLQ, alerta, reprocessamento manual e auditoria |
| P1 | Observabilidade externa | Health interno pode não ser visto | Logs estruturados, métricas e alerta fora da aplicação |
| P1 | Política de dados | Mensagens podem conter dados sensíveis | Retenção, exportação, exclusão e acesso auditado |
| P2 | Testes de recuperação | Incidente pode virar indisponibilidade longa | RTO/RPO definidos e restore periódico exercitado |

## Ordem recomendada

A ordem correta é primeiro eliminar risco de operação e isolamento, depois aumentar produtividade e só então adicionar diferenciais de escala. O caminho mínimo é: **RBAC completo → onboarding → webhook seguro → Evolution real → banco/Redis no VPS → observabilidade externa → beta com três clientes → cobrança e retenção**.

As capacidades públicas do benchmark foram extraídas do [SAC Mais][1], dos materiais sobre distribuição [2], chatbot híbrido [3], CRM [4] e relatórios [5].

[1]: https://sacmais.com.br/ "SacMais — Plataforma de Atendimento WhatsApp, CRM e IA"
[2]: https://sacmais.com.br/blog/distribuicao-automatica-de-atendimentos-cinco-modelos-para-testar/ "SacMais — Distribuição automática de atendimentos"
[3]: https://sacmais.com.br/blog/chatbots-hibridos-humanos-ia-whatsapp/ "SacMais — Chatbots híbridos"
[4]: https://sacmais.com.br/blog/crm-whatsapp-centralizar-vendas-atendimento/ "SacMais — CRM WhatsApp"
[5]: https://sacmais.com.br/blog/como-criar-relatorios-de-desempenho-para-equipes-no-whatsapp/ "SacMais — Relatórios de desempenho"
