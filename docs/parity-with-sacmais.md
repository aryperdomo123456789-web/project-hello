# Mago Bot — Paridade funcional e diferenciação

A referência do SAC Mais será usada como benchmark de cobertura e jornada, não como cópia de código, marca ou ativos. O Mago Bot deve superar a referência no ponto que o projeto já escolheu: **um único centro operacional, com vários números e um especialista/fluxo próprio para cada número**.

| Capacidade | Referência | Mago Bot atual | Próximo avanço sem Evolution | Dependência real |
|---|---|---|---|---|
| Inbox unificada | Sim | Base persistente | filtros salvos, macros e notas | Não |
| Multiatendimento | Sim | Filas e posse | visão por equipe e supervisor | Não |
| Distribuição | chegada, igualdade, setor, habilidade, histórico | capacidade básica | regras configuráveis e prioridade | Não |
| Filas/setores | Sim | filas ativas | horários, SLA e escala | Não |
| Transferências | Sim | transferência e auditoria | motivo, aprovação e trilha visual | Não |
| CRM | multifunil | Kanban inicial | campos, etiquetas, notas e timeline | Não |
| Follow-up | Sim | timers no worker | campanhas internas simuladas e agenda | Não |
| Chatbot visual | Sim | editor e runtime | variáveis, testes, import/export e biblioteca | Não |
| Respostas rápidas | Sim | ainda parcial | macros com permissão e versão | Não |
| Avaliação | Sim | ainda parcial | pesquisa simulada e relatório por agente | Não |
| Chat interno | Sim | ainda parcial | comentários privados e menções | Não |
| Relatórios | Sim | métricas operacionais | filtros por número/fila/agente e exportação | Não |
| Saúde operacional | parcial | health banco/Redis | status por conexão simulada | Não |
| QR e mensagens reais | Sim | adaptador/stub | fixtures e replay de eventos | Evolution |
| Integrações externas | API | adaptador configurável | contratos, mocks e webhooks de teste | Evolution/API |
| Onboarding e planos | Sim | licenciamento base | limites visíveis e wizard | Não |

## Diferencial próprio

A unidade de automação do produto não será apenas a empresa ou a caixa de entrada: será a combinação **organização → número → fluxo publicado → fila → equipe**. Isso permite operar, no mesmo painel, um número comercial com especialista de vendas, um número de suporte com triagem técnica e um número financeiro com regras próprias, sem misturar estado ou permissões.

## O que pode chegar a beta sem Evolution

O produto pode chegar a beta técnico com dados simulados e eventos reproduzidos: onboarding de empresa, cadastro de números fictícios, inbox, CRM, filas, SLA, distribuição, macros, notas, especialistas, simulador, métricas, auditoria, permissões, import/export e teste de falhas. A única parte que não deve ser apresentada como real é o transporte WhatsApp: QR, envio, recebimento, mídia, recibos e reconexão.

## Referências

[1]: https://sacmais.com.br/ — SAC Mais, referência pública de central de atendimento, equipes, CRM, automações e relatórios.  
[2]: https://sacmais.com.br/blog/distribuicao-automatica-de-atendimentos-cinco-modelos-para-testar/ — Modelos públicos de distribuição automática.  
[3]: https://sacmais.com.br/blog/controle-fila-importancia-aplicacao-digital/ — Operação de filas, prioridade, handoff e métricas.
