# Comparação de produção e benchmark

**Data:** 26 de agosto de 2026  
**Projeto:** Mago Bot  
**Branch:** `feat/saas-multiwhatsapp-flow-builder`

## Estado verificável

| Fonte | Commit/estado |
|---|---|
| Branch local | `c03a740` com o documento de referências em desenvolvimento |
| Branch remota | `c03a740c4f4a...` |
| VPS aaPanel | `963598b` |
| Health público | HTTP 200; PostgreSQL e Redis saudáveis |
| Login público | HTTP 200 |
| PM2 | `mago-bot-web` e `mago-bot-worker` online como `www` |
| Estudo isolado | `/www/wwwroot/mago-bot.com/isonado` preservado |

A documentação de benchmark mais recente e a matriz comparativa ainda precisam ser commitadas e publicadas. O VPS permanece estável no último commit de código implantado; mudanças posteriores devem ser aplicadas somente após validação local e sincronização controlada.

## Cobertura funcional atual

O Mago Bot possui inbox por múltiplos números em modo stub, filas com capacidade/skill/horário/SLA, equipe e papéis, CRM com pipeline/importação/follow-up, notas e respostas rápidas, editor de fluxos versionado, simulador, campanhas sandbox, IA híbrida com fallback e aprovação humana, base de conhecimento, RAG lexical em evolução, métricas, satisfação, exportação CSV, auditoria, rate limit, DLQ, health check, error drawer e documentação de deploy.

## Gaps prioritários observados nas referências

1. Ticketing separado da conversa, com prioridade, categoria, SLA, status, responsável e histórico.
2. Customer intelligence reunindo eventos, atributos, origem, valor, intenção e próxima melhor ação.
3. QA assistido por IA para pontuar atendimento humano e automatizado, detectar políticas rompidas e sugerir treinamento.
4. RAG realmente conectado à execução de especialistas, com citação de fonte e cobertura de intents.
5. Workflows comportamentais e sequências de ativação/retenção baseados em eventos e atributos.
6. Centro de recomendações que converta alertas em ações operacionais.
7. Integrações por receitas, webhooks e ações configuráveis.
8. Trial, billing, add-ons e limites comerciais para completar o ciclo de monetização.
9. Testes E2E, carga com banco/Redis reais, backup/restauração e alertas externos.
10. Homologação do canal real, que permanece bloqueada pela documentação operacional da Evolution.

## Referências

- SAC Mais: https://sacmais.com.br/
- Zendesk Service: https://www.zendesk.com/service/
- Zendesk Omnichannel: https://www.zendesk.com/blog/customer-experience/expectations/omnichannel-experience/
- Intercom: https://www.intercom.com/
- respond.io: https://respond.io/
