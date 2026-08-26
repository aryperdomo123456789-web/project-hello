# Benchmark comercial e configuração de preços — Mago Bot

**Autor:** Manus AI

**Data de referência:** 26 de agosto de 2026

**Moeda do catálogo:** BRL, armazenada em centavos no PostgreSQL
**Escopo:** preço mensal do SaaS de atendimento, sem incluir tarifas variáveis da Meta/WhatsApp ou custos de provedores de IA.

## Resumo executivo

A recomendação inicial para o Mago Bot é **Starter R$ 149/mês, Growth R$ 297/mês e Scale R$ 597/mês**. Esses valores são uma âncora comercial inicial, não uma promessa de margem ou uma cotação definitiva. O owner pode alterar nome, descrição, preço, limites, benefícios, destaque e disponibilidade no painel **Configurações → Preços e planos comerciais**.

O catálogo é multiempresa e protegido em duas camadas: a interface só aparece para o papel `owner`, e as server functions rejeitam qualquer edição que não venha do owner da organização. O preço usado pelo Checkout Mercado Pago vem do catálogo persistido do tenant; o frontend não envia o valor final para o gateway. Alterar o catálogo não altera retroativamente uma assinatura já criada.

## Dados públicos observados

A referência prioritária do usuário, o SAC Mais, apresenta três planos mensais: Basic por R$ 197 com 1 número e até 3 atendentes; Premium por R$ 297 com 1 número e até 6 atendentes; e Business por R$ 497 com 1 número e até 10 atendentes. A página também informa opção anual com 20% de desconto, agente de IA como adicional e conexão por QR Code ou infraestrutura oficial da Meta [1].

O UnderChat apresenta três faixas públicas — Start, Pro e Empresarial — e informa que os valores e recursos foram revisados em 18 de julho de 2026. A página destaca teste gratuito, API oficial, CRM, chatbot, integrações, usuários adicionais e a separação entre mensalidade e tarifas de mensagens da Meta; condições comerciais e disponibilidade podem variar [2]. A página de resultados públicos também posiciona a entrada na faixa de R$ 149,90/mês, mas essa informação dinâmica deve ser revalidada no momento de uma decisão comercial [2].

O respond.io, como referência global, separa usuários adicionais, Monthly Active Contacts e AI Credits; a página oferece cobrança mensal/anual e anuncia economia anual de até 20% [3]. Não foi feita conversão cambial desse benchmark para não misturar uma lista internacional em dólar com uma política de preço brasileira.

| Referência | Estrutura pública observada                                        | Leitura para o Mago Bot                                          | Confiança                                     |
| ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------------- |
| SAC Mais   | R$ 197/R$ 297/R$ 497; pacotes por número e atendentes              | Âncora nacional direta para entrada, equipe e escala             | Alta; página pública consultada em 26/08/2026 |
| UnderChat  | Start/Pro/Empresarial; recursos, teste e custos de canal separados | Reforça entrada competitiva e separação de tarifa Meta           | Média; preços dinâmicos devem ser revalidados |
| respond.io | Usuários, contatos ativos e créditos de IA como unidades distintas | Sugere cobrar capacidade e tratar consumo variável separadamente | Alta para estrutura; sem conversão de moeda   |

## Catálogo inicial recomendado

| Plano Mago Bot | Preço mensal | Números | Agentes | Fluxos ativos | Retenção padrão | Posicionamento                                                    |
| -------------- | -----------: | ------: | ------: | ------------: | --------------: | ----------------------------------------------------------------- |
| Starter        |   **R$ 149** |       2 |       3 |             5 |         30 dias | Entrada para inbox única, CRM essencial e especialistas iniciais  |
| Growth         |   **R$ 297** |      10 |      20 |            30 |        180 dias | Plano principal para multi-WhatsApp, SLA, automações e supervisão |
| Scale          |   **R$ 597** |      50 |     100 |           200 |        730 dias | Operações multiunidade com governança, workers, retries e QA      |

O Starter foi colocado abaixo do Basic do SAC Mais para reduzir fricção de entrada sem transformar o produto em uma solução de preço predatório. O Growth repete a âncora pública de R$ 297, mas entrega uma capacidade multi-número maior e captura o diferencial central do Mago Bot. O Scale fica acima do Business para pagar a complexidade adicional de governança, infraestrutura, suporte e operação multiunidade.

Os preços de código correspondem a **14.900, 29.700 e 59.700 centavos**. O catálogo é semeado na primeira leitura de cada organização e depois passa a ser editável pelo owner. O campo `currency` é `BRL`; não há conversão cambial automática.

## Regras comerciais implementadas

O owner pode editar preço, nome, descrição, limites operacionais, recursos, destaque e disponibilidade para novas assinaturas. Cada alteração gera auditoria com organização, plano, preço e estado ativo. Recursos repetidos são normalizados e o servidor valida limites máximos para evitar configurações absurdas ou overflow.

Um plano arquivado não é apagado do banco e deixa de ser oferecido para novos checkouts. Assinaturas anteriores continuam identificadas pelo `external_reference` do Mercado Pago. A alteração do catálogo vale para novos checkouts; a assinatura já criada não é reprecificada silenciosamente.

O desconto anual de 20% é apenas uma hipótese comercial futura, inspirada nas páginas observadas. Não foi ativado no checkout atual porque exige definir contrato anual, política de cancelamento, período de cobrança e tratamento contábil. Primeiro valide conversão, churn, custo de suporte, volume de mensagens e consumo de IA.

## Como preencher o print do Mercado Pago

A tela enviada está em **Mercado Pago Developers → Webhooks → Modo de teste**. No campo **URL para teste**, coloque exatamente:

```text
https://mago-bot.com/api/webhooks/mercadopago
```

Depois, abra a seção **Outros eventos** e marque **Planos e assinaturas**. Esse é o evento relevante para o fluxo `preapproval` mensal implementado. Não é necessário marcar agora `Order`, `Pagamentos (legacy)`, `Delivery`, `Point`, `Wallet Connect` ou `Self Service`, porque eles não fazem parte deste checkout. Se o painel exibir uma opção específica para **subscription_preapproval**, selecione-a; se houver também **payment**, pode marcar payment apenas quando quiser testar a reconciliação de pagamentos recorrentes.

Role até o final e salve a configuração. Na mesma área, abra a configuração/segredo dos Webhooks e copie o **segredo HMAC** gerado pela aplicação. Esse segredo não é a Public Key, não é o Access Token e não é a senha do usuário de teste. Ele precisa ser colocado no servidor como `MP_WEBHOOK_SECRET`; sem ele, a rota do Mago Bot responde `503` intencionalmente.

O endpoint valida `x-signature` e `x-request-id`, consulta o recurso no Mercado Pago e persiste o evento antes de atualizar a organização. A documentação oficial recomenda responder HTTP 200/201 depois de aceitar a notificação e consultar o recurso completo pela API [4]. O Mago Bot responde 401 para assinatura inválida e permite retry quando a API externa não pode ser consultada.

## Homologação segura

O ambiente já está com `MP_ENVIRONMENT=test`, `MP_LIVE_ENABLED=false` e as credenciais de integração sandbox no `.env` server-side do VPS. O Access Token e a Public Key não foram gravados no GitHub, frontend, documentação ou logs. As credenciais do usuário comprador de teste não são armazenadas pelo Mago Bot; use-as somente na tela do checkout sandbox.

A sequência de teste recomendada é: configurar a URL acima no modo de teste; inserir o segredo HMAC no servidor; definir os valores dos três planos no painel do owner; abrir o checkout de teste; usar conta vendedor e conta comprador de teste distintas; concluir com cartão de teste; observar `pending` e `authorized`; conferir o evento no painel do Mercado Pago; reenviar a mesma notificação; e confirmar que o evento não duplica nem altera outra organização.

Não habilite `MP_LIVE_ENABLED=true` nem troque para `MP_ENVIRONMENT=production` durante esta homologação. A cobrança real exige credenciais de produção, contrato comercial, política de cancelamento, reconciliação de falhas, reembolsos e validação jurídica/contábil própria.

## Implementação entregue

A entrega está publicada na branch `feat/saas-multiwhatsapp-flow-builder` até o commit `981135f`, com o aplicativo no VPS em `59eb099` e documentação sincronizada no GitHub. Os principais artefatos são `src/db/schema.ts`, migration `drizzle/0016_brown_sunset_bain.sql`, `src/services/plan-catalog.server.ts`, `src/functions/plan-catalog.functions.ts`, `src/components/settings/PlanCatalogEditor.tsx`, `src/services/mercadopago.server.ts`, `src/services/mercadopago-billing.server.ts` e `src/routes/api/webhooks/mercadopago.ts`.

Typecheck, build de produção e **26 testes** passaram. Em produção, health e login retornaram HTTP 200, PostgreSQL e Redis estão saudáveis, PM2 web/worker permanecem online, o timer de monitoramento está ativo, e a pasta `isonado/whatsender` foi preservada. O webhook POST continua 503 até o segredo HMAC ser configurado, que é o comportamento seguro esperado.

## Basis, time, assumptions and compliance

**Basis:** os preços recomendados usam mensalidade fixa em BRL, sem incluir tarifa Meta/WhatsApp, IA, impostos, suporte premium ou add-ons. Limites de números, agentes e fluxos são capacidade operacional do produto, não consumo financeiro medido.

**Time:** benchmarks e status foram considerados em **26 de agosto de 2026**. Preços de terceiros podem mudar; revalide antes de publicar campanhas ou contratos.

**Assumptions:** foi aplicado um catálogo de três níveis, com Growth como plano destacado, desconto anual ainda desligado, trial mantido separado da cobrança e preço armazenado em centavos. O preço inicial é uma hipótese comercial testável, não uma garantia de lucro.

**Sources & confidence:** SAC Mais é a âncora nacional de maior confiança porque os três preços e limites estavam visíveis na página pública. UnderChat foi usado como confirmação de categoria e faixa de entrada, com confiança média para preço por causa de conteúdo dinâmico. respond.io foi usado para estrutura de métricas globais, sem conversão cambial. As fontes oficiais do Mercado Pago sustentam o contrato de assinatura, webhook, HMAC e contas de teste [4] [5] [6] [7].

**Compliance:** isto é análise e implementação técnica de preço comercial, não aconselhamento financeiro personalizado. Não publique credenciais de teste, segredos HMAC ou credenciais de produção em repositórios, screenshots, tickets ou logs.

## Referências

[1]: https://sacmais.com.br/ "SAC Mais — planos, preços e recursos"
[2]: https://underchat.com.br/precos/ "UnderChat — planos e preços"
[3]: https://respond.io/pricing "respond.io — Pricing"
[4]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks "Mercado Pago — Webhooks do Checkout Pro"
[5]: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts "Mercado Pago — Contas de teste"
[6]: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post "Mercado Pago — Criar preferência"
[7]: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post "Mercado Pago — Criar assinatura"
