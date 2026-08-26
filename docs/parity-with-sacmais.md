# Paridade funcional com o SAC Mais

**Projeto:** Mago Bot
**Autor:** Manus AI
**Data:** 26 de agosto de 2026
**Objetivo:** usar o SAC Mais como benchmark funcional e construir uma plataforma própria, mais modular, auditável e preparada para múltiplos números de WhatsApp.

## Resumo executivo

A página pública do SAC Mais posiciona a solução como uma plataforma de atendimento que centraliza WhatsApp, Instagram, Messenger e WebChat, combinando multiatendimento, filas, CRM, automações, agentes de IA, follow-up, agenda, tarefas, relatórios, avaliações, etiquetas, notificações, chat interno e API/integrações [1]. Os conteúdos públicos de distribuição destacam cinco lógicas operacionais: ordem de chegada, equilíbrio de carga, setor/assunto, habilidade do agente e continuidade por carteira ou histórico [2]. A documentação pública sobre filas reforça prioridade, responsável, tempo de resposta, distribuição, horários e acompanhamento em tempo real [3] [4].

O Mago Bot já possui uma fundação equivalente para o núcleo multi-WhatsApp: inbox persistente, filas, distribuição por capacidade e skill, especialistas por número, editor visual, simulador, CRM inicial, notas, respostas rápidas, métricas, auditoria, health check, planos e hardening. O gap principal para a paridade comercial está em equipe/onboarding mais completo, CRM persistente mais rico, avaliação de atendimento, chat interno, canais adicionais e homologação do provedor WhatsApp real.

> A meta não é clonar o SAC Mais. A meta é alcançar a mesma cobertura operacional com uma arquitetura própria, mais transparente sobre estado, falhas, versões, limites e rastreabilidade.

## Matriz de paridade

| Capacidade observada no benchmark | Estado do Mago Bot          | Implementação sem Evolution | Diferencial planejado                                     |
| --------------------------------- | --------------------------- | --------------------------- | --------------------------------------------------------- |
| Inbox centralizada                | Parcialmente pronta         | Sim                         | Contexto explícito de número, fila, automação e posse     |
| WhatsApp multi-número             | Simulação pronta            | Sim, com laboratório        | Adaptador de provedor intercambiável                      |
| Instagram, Messenger e WebChat    | Não homologado              | Contratos e simuladores     | Canais como adaptadores, sem acoplar domínio              |
| Filas e setores                   | Pronto em fundação          | Sim                         | Skill, histórico, capacidade, horário e SLA               |
| Transferências                    | Pronto                      | Sim                         | Transferência auditada e concorrência segura              |
| Distribuição automática           | Pronto em fundação          | Sim                         | Política declarativa testável e fallback explícito        |
| CRM e gestão de leads             | MVP pronto                  | Sim                         | Pipeline, busca, tags e jornada evolutiva                 |
| Campos personalizados             | Contrato preparado          | Sim                         | Atributos tipados e histórico de alteração                |
| Chatbot visual                    | Pronto em fundação          | Sim                         | Fluxos versionados, importáveis, exportáveis e simuláveis |
| Agente de IA                      | Contrato preparado          | Simulação                   | IA com limites, aprovação e handoff rastreável            |
| Follow-up automático              | Runtime e timers preparados | Simulação                   | Jobs idempotentes e janela de contato configurável        |
| Agendamento                       | Blocos e timers preparados  | Simulação                   | Calendário e políticas de horário por fila                |
| Respostas rápidas                 | Persistência pronta         | Sim                         | Biblioteca por organização e categoria                    |
| Notas internas                    | Persistência pronta         | Sim                         | Visíveis só para equipe, com auditoria                    |
| Relatórios e SLA                  | Pronto em fundação          | Sim                         | Saúde, aging, carga e diagnóstico por request ID          |
| Avaliação de atendimento          | Pendente                    | Sim                         | Pesquisa pós-resolução e análise por agente/fila          |
| Chat interno                      | Pendente                    | Sim                         | Canal interno separado da conversa externa                |
| Planos e limites                  | Pronto em fundação          | Sim                         | Entitlements server-side e uso por organização            |
| Implantação acompanhada           | Checklist pronto            | Sim                         | Onboarding guiado e laboratório antes do canal real       |
| API e integrações                 | Adaptador preparado         | Sim                         | Contratos, replay de eventos e testes offline             |

## O que já foi implementado

A branch `feat/saas-multiwhatsapp-flow-builder` contém o laboratório de simulação para três números, com separação de fila e especialista, além de uma inbox que exibe origem, fila, não lidas, notas internas e respostas rápidas. O construtor de especialistas permite editar blocos, rotular saídas de condição, simular mensagens, importar/exportar JSON, duplicar fluxos e publicar versões.

A operação possui política de fila com menor carga, skill, continuidade por histórico, capacidade máxima e horário comercial. O CRM tem pipeline, busca e filtro por tags. O painel de governança mostra plano, limites e uso da organização. O centro de saúde consulta aplicação, PostgreSQL, Redis e indicadores de fila. A camada de hardening adiciona boundaries granulares, fallback local, gaveta global de diagnóstico, redaction e correlação SSR.

## Backlog prioritário sem Evolution

| Prioridade | Entrega                   | Critério de aceite                                                        |
| ---------: | ------------------------- | ------------------------------------------------------------------------- |
|         P0 | Equipe e papéis completos | Gestor convida agente, define disponibilidade e restringe ações por papel |
|         P0 | CRM persistente           | Contato possui campos, tags, notas, tarefas e histórico por organização   |
|         P0 | Avaliação pós-atendimento | Conversa resolvida gera avaliação e métrica por fila/agente               |
|         P1 | Biblioteca de macros      | Gestor cria, edita, categoriza e limita respostas rápidas                 |
|         P1 | Follow-up seguro          | Job agenda retorno, respeita opt-out, janela e idempotência               |
|         P1 | Chat interno              | Agentes conversam internamente sem contaminar o histórico do cliente      |
|         P1 | Replay de eventos         | Fixture reproduz inbound, outbound, duplicação, atraso e falha            |
|         P2 | Canais adicionais         | Contratos para Instagram, Messenger e WebChat sem alterar domínio         |
|         P2 | IA controlada             | Sugestão, classificação e resumo com aprovação e limite de custo          |
|         P2 | Code splitting            | Dashboard, React Flow e worker carregados em chunks menores               |

## Oportunidades para superar o benchmark

O Mago Bot deve transformar o vínculo por número em uma unidade de operação de primeira classe. Cada conexão terá fluxo publicado, fila, políticas, especialistas, permissões e métricas próprios, mas todas as conversas continuarão visíveis na mesma central. Isso evita a visão genérica de “uma caixa com vários canais” e permite configurar atendimento comercial, suporte técnico e financeiro com regras realmente diferentes.

A segunda vantagem será a rastreabilidade. Toda transferência, publicação, execução, retry, falha, pausa de automação e alteração de configuração deve possuir ator, horário, organização, correlação e estado. A terceira será o laboratório: o gestor poderá simular uma conversa inteira, reproduzir webhook duplicado e observar o caminho escolhido antes de ativar qualquer número real.

## O que permanece bloqueado pelo provedor

Sem a API operacional Evolution, não é possível homologar QR Code real, conexão, recebimento, envio, mídia, status de entrega, reconexão ou presença. Esses cenários podem ser simulados e testados offline, mas devem permanecer identificados como simulação até recebermos o contrato operacional real.

## Referências

[1]: https://sacmais.com.br/ "SacMais — Plataforma de Atendimento WhatsApp, CRM e IA"
[2]: https://sacmais.com.br/blog/distribuicao-automatica-de-atendimentos-cinco-modelos-para-testar/ "SacMais — Distribuição automática de atendimentos: cinco modelos para testar"
[3]: https://sacmais.com.br/blog/controle-fila-importancia-aplicacao-digital/ "SacMais — Controle de fila: por que importa e como aplicar no digital"
[4]: https://sacmais.com.br/blog/evitar-sobrecarga-agentes-distribuicao-atendimentos/ "SacMais — Como evitar a sobrecarga dos agentes na distribuição de atendimentos"

## Evidências adicionais do benchmark

A comunicação pública do SAC Mais também enfatiza integração oficial com WhatsApp Cloud API, distribuição automática, chatbot, agente de IA contextual, CRM, etiquetas, agendamento, métricas em tempo real e suporte de implantação [5]. O material sobre chatbot híbrido descreve uma separação clara: automação para triagem, perguntas frequentes, coleta e classificação; humanos para reclamações, negociação, exceções e oportunidades de alto valor [6].

O conteúdo de CRM trata conversa como parte da jornada comercial, com contato, estágio, tarefa, retorno agendado, origem, produto de interesse, região, prontidão de compra e histórico de atendimento [7]. O conteúdo sobre relatórios reforça volume, primeira resposta, tempo médio, conversas sem retorno, carga por agente, motivo de contato, conversão, período e comparação por equipe/turno [8].

Essas evidências elevam o backlog do Mago Bot em quatro pontos: a IA precisa ter limites e transbordo claros; o CRM precisa possuir tarefas e campos de jornada; relatórios precisam ser acionáveis e segmentáveis; e onboarding/suporte precisam fazer parte do produto, não ser improvisados depois da venda.

## Critérios de superioridade do Mago Bot

| Área         | Paridade mínima                | Superioridade desejada                                                              |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------- |
| Automação    | Fluxo visual e triagem         | Simulador, replay, versionamento, rollback e diagnóstico por execução               |
| IA           | Sugestão e resposta contextual | Aprovação humana, limites de custo, explicação da decisão e memória por organização |
| Distribuição | Fila, setor, carga e skill     | Política composta com histórico, prioridade, horário, SLA e auditoria               |
| CRM          | Contato, estágio e tarefa      | Jornada por número, atributos, timeline e ações acionáveis                          |
| Gestão       | Agentes, papéis e métricas     | Permissões server-side, capacidade, turnos, saúde e incidentes                      |
| Dados        | Relatórios básicos             | Métricas por canal/número/fila/agente, satisfação e exportação                      |
| Implantação  | Ajuda inicial                  | Wizard de ativação, laboratório sem canal e checklist de homologação                |
| Resiliência  | Operação normal                | Idempotência, retry, chaos test, error drawer e degradação parcial                  |

[5]: https://sacmais.com.br/blog/sacmais-whatsapp-atendimento-plataforma-recursos-ia-precos-2026/ "SacMais — Plataformas WhatsApp para Empresas: Qual Escolher em 2026?"
[6]: https://sacmais.com.br/blog/chatbots-hibridos-humanos-ia-whatsapp/ "SacMais — Chatbots híbridos: quando humanos e IA trabalham juntos no WhatsApp"
[7]: https://sacmais.com.br/blog/crm-whatsapp-centralizar-vendas-atendimento/ "SacMais — CRM WhatsApp: Como Centralizar Vendas e Atendimento"
[8]: https://sacmais.com.br/blog/como-criar-relatorios-de-desempenho-para-equipes-no-whatsapp/ "SacMais — Como criar relatórios de desempenho para equipes no WhatsApp"
