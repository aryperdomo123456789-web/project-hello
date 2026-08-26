# Roadmap de paridade e superioridade

## Princípio

O Mago Bot não precisa esperar a Evolution para se aproximar do valor operacional do benchmark. A plataforma deve provar primeiro que organiza pessoas, conversas, jornadas e decisões; o provedor entra depois como transporte homologado.

## Fase A — Beta interno sem canal real

**Objetivo:** provar o domínio com laboratório e dados persistidos.

| Entrega | Critério de aceite |
|---|---|
| Organização e equipe | Owner convida agente; agente só acessa organização autorizada |
| Inbox | Conversas simuladas de três números aparecem em uma lista sem mistura |
| CRM | Contato possui estágio, tags, tarefa e timeline coerentes |
| Filas | Estratégia respeita capacidade, skill, horário e SLA |
| Fluxo | Especialista recebe entrada, decide, envia efeito e faz handoff |
| Resiliência | Duplicação, timeout e payload inválido são visíveis e recuperáveis |
| Governança | Ações sensíveis aparecem na auditoria |

**Saída:** demonstração reproduzível e treinamento interno, não promessa de WhatsApp conectado.

## Fase B — Homologação do canal

**Objetivo:** substituir o stub pelo provedor operacional real sem mudar o domínio.

| Cenário | Critério de aceite |
|---|---|
| Instância | Criar, listar, obter QR, conectar e desconectar |
| Inbound | Evento assinado cria ou atualiza contato/conversa |
| Outbound | Resposta sai pela instância correta e volta com externalId |
| Idempotência | Repetição do webhook não cria mensagem duplicada |
| Status | Enviado, entregue, lido e falha atualizam a mensagem |
| Recuperação | Timeout entra em retry e falha permanente em DLQ |
| Mídia | Contratos de imagem, áudio e documento respeitam limites |

## Fase C — Beta comercial controlado

**Objetivo:** três a cinco clientes pagantes usando a plataforma com acompanhamento próximo.

O onboarding deve concluir organização, primeira equipe, primeira fila, primeiro fluxo e primeiro teste em menos de uma sessão. Devem existir métricas de ativação, mensagens processadas, conversas resolvidas, primeira resposta, satisfação, erros do provedor e uso por plano.

O beta só deve avançar quando houver duas semanas de uso real, nenhum vazamento cross-tenant, restauração de backup exercitada e um runbook capaz de explicar quem age diante de indisponibilidade do banco, Redis ou provedor.

## Fase D — Escala

**Objetivo:** operar mais clientes sem multiplicar suporte manual.

As prioridades são paginação e índices da inbox, code splitting, limites e cobrança server-side, observabilidade externa, rotação de secrets, DLQ operável, retenção por organização, exportação de dados, múltiplos provedores e adaptação omnichannel.

## Métricas de produto

| Métrica | Definição |
|---|---|
| Ativação | Organização com número, fluxo e primeira conversa testados |
| Tempo até valor | Tempo entre cadastro e primeira conversa resolvida |
| SLA | Percentual de conversas respondidas dentro do alvo da fila |
| Automação útil | Conversas concluídas pelo fluxo sem reabertura ou reclamação |
| Handoff saudável | Transferências sem perda de contexto ou duplicidade |
| Retenção | Organizações ativas no período seguinte |
| Qualidade | Nota média, distribuição e taxa de avaliação |
| Confiabilidade | Erros por mil eventos, retries, DLQ e disponibilidade |

## Diferenciais que devem superar o benchmark

O benchmark público enfatiza omnichannel, multiatendimento, filas, CRM, chatbot, agente de IA, agendamento, etiquetas e relatórios [1] [2] [3] [4]. O Mago Bot deve competir nesses fundamentos e se diferenciar em pontos verificáveis: simulador operacional antes do canal real, replay de eventos, diagnóstico de erro para gestor, versionamento e rollback de especialistas, políticas compostas de distribuição, auditoria por ação, limites de plano server-side e laboratório de caos.

## Bloqueio atual

Sem o contrato operacional da Evolution, não é possível certificar QR, envio, recebimento, mídia ou status real. O caminho correto é concluir a Fase A, obter os dados de homologação e executar a Fase B em ambiente controlado. A documentação do contrato está em `docs/evolution-provider-contract.md`.

## Referências

[1]: https://sacmais.com.br/ "SacMais — Plataforma de Atendimento WhatsApp, CRM e IA"
[2]: https://sacmais.com.br/blog/sacmais-whatsapp-atendimento-plataforma-recursos-ia-precos-2026/ "SacMais — Plataformas WhatsApp para Empresas"
[3]: https://sacmais.com.br/blog/chatbots-hibridos-humanos-ia-whatsapp/ "SacMais — Chatbots híbridos"
[4]: https://sacmais.com.br/blog/crm-whatsapp-centralizar-vendas-atendimento/ "SacMais — CRM WhatsApp"
