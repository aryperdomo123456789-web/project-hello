# Benchmark de preços — Mago Bot

**Data de referência:** 26 de agosto de 2026. Os valores abaixo são preços públicos observados nas páginas consultadas e devem ser revalidados antes de uma campanha comercial.

## SAC Mais — referência prioritária

Fonte: [SAC Mais — planos](https://sacmais.com.br/).

| Plano público | Preço mensal observado | Limite anunciado            | Recursos destacados                                                         |
| ------------- | ---------------------: | --------------------------- | --------------------------------------------------------------------------- |
| Basic         |             R$ 197/mês | 1 número; até 3 atendentes  | Chatbot, automações, CRM, gestão de leads, relatórios, avaliações e suporte |
| Premium       |             R$ 297/mês | 1 número; até 6 atendentes  | Chatbot, automações, CRM, gestão de leads, relatórios, avaliações e suporte |
| Business      |             R$ 497/mês | 1 número; até 10 atendentes | Chatbot, automações, CRM, gestão de leads, relatórios, avaliações e suporte |

A página também anuncia opção anual com 20% de desconto, agente de IA como adicional e conexão via QR Code ou oficial Meta. A estrutura indica cobrança por pacote de equipe/número, com expansão negociada para operações maiores.

## Proposta inicial para o Mago Bot

A proposta não copia nome, identidade ou código de terceiros. Ela usa o benchmark apenas como âncora comercial e diferencia o Mago Bot pelo foco multi-WhatsApp, fluxos especialistas por número, filas/SLA, auditoria, IA/RAG e operação de equipe.

| Plano Mago Bot | Preço inicial sugerido | Números | Agentes | Posicionamento                                                                                    |
| -------------- | ---------------------: | ------: | ------: | ------------------------------------------------------------------------------------------------- |
| Starter        |             R$ 149/mês |       2 |       3 | Entrada abaixo do Basic, com inbox única, CRM essencial e fluxos iniciais                         |
| Growth         |             R$ 297/mês |      10 |      20 | Mesmo ponto de preço do Premium, mas com escala multi-número, SLA, automações e supervisão        |
| Scale          |             R$ 597/mês |      50 |     100 | Acima do Business por oferecer governança, workers, retries, QA histórico e operação multiunidade |

Os valores são uma **recomendação comercial inicial**, não uma cotação obrigatória. O owner poderá editar preços, nomes, descrições, limites, recursos e destaque de cada plano no painel do produto. O Mercado Pago receberá os valores salvos no catálogo server-side, em centavos de BRL, nunca valores vindos diretamente do frontend.

## Racional e limites da recomendação

O Starter a R$ 149 cria uma porta de entrada competitiva sem desvalorizar o produto. O Growth a R$ 297 aproveita uma âncora pública observada e monetiza o principal diferencial do Mago Bot: mais de um número com operação centralizada. O Scale a R$ 597 preserva margem para suporte, infraestrutura, workers e governança; desconto anual inicial de 20% pode ser aplicado apenas após validar churn, custo de suporte e consumo real.

O catálogo editável deve ter histórico de alterações, auditoria, valores não negativos, moeda BRL, preço mensal em centavos e opção de arquivar/descontinuar sem apagar planos já usados em assinaturas antigas. Alterar o preço do catálogo não deve alterar retroativamente uma assinatura ativa; novas assinaturas usarão o preço vigente e webhooks continuarão identificando a organização por referência externa.

## Referências

[1]: https://sacmais.com.br/ "SAC Mais — planos, preços e recursos"

## UnderChat — segunda referência nacional

Fonte: [UnderChat — planos e preços](https://underchat.com.br/precos/). A página informa que os valores e recursos foram revisados pela equipe em **18 de julho de 2026** e apresenta três faixas chamadas Start, Pro e Empresarial. O conteúdo público destaca teste gratuito, API oficial, CRM, chatbot, integrações, usuários adicionais e condições comerciais variáveis. A página informa que os valores exibidos são referências mensais e que impostos, disponibilidade e contratação podem variar.

A referência reforça a faixa de entrada próxima de R$ 149,90/mês para uma operação inicial e a necessidade de separar mensalidade da tarifa de mensagens da Meta. Por isso, o catálogo Mago Bot mantém a recomendação Starter em R$ 149/mês, mas deixa a moeda/preço editáveis e trata custos de canal oficial como item separado do plano.

## Respond.io — referência global

Fonte: [respond.io — Pricing](https://respond.io/pricing). A página pública apresenta cobrança mensal/anual com economia anual de até 20%, cobra usuários adicionais por faixa e acompanha **Monthly Active Contacts** e **AI Credits**. O comparativo mostra usuários, contatos ativos e créditos de IA como unidades distintas do plano, em vez de cobrar somente pelo número de números WhatsApp.

O benchmark global reforça que o Mago Bot deve manter o preço do plano ligado à capacidade operacional — números, agentes, automações e governança — e expor consumo de IA/canais separadamente quando houver custo variável. Não foi feita conversão cambial para formar preço brasileiro; a recomendação usa diretamente os benchmarks nacionais em BRL.
