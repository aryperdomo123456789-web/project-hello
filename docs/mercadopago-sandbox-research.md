# Pesquisa oficial — Mercado Pago Sandbox

**Data da consulta:** 26 de agosto de 2026.

## Fontes consultadas

[1] [Criar e configurar uma preferência de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference)

[2] [Referência da API — criar preferência em `checkout/preferences`](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post)

[3] [Checkout Pro — visão geral](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview)

[4] [Webhooks do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks)

[5] [Contas de teste](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts)

[6] [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials)

## Achados verificados

A documentação oficial descreve a preferência de pagamento como o objeto que reúne as informações do produto/serviço e permite iniciar o fluxo do Checkout Pro. A aplicação deve criar uma preferência no backend para cada pedido ou fluxo de pagamento e guardar o identificador retornado na propriedade `id` da resposta [1].

O Checkout Pro para web usa redirecionamento para o Mercado Pago. A documentação lista como etapas criar a preferência, configurar URLs de retorno, inicializar o checkout no frontend, configurar notificações de pagamento, testar a integração e só depois subir para produção [1] [3].

A documentação oficial de Webhooks informa que as notificações incluem assinatura no header `x-signature`; essa assinatura deve ser validada no backend antes de aceitar mudança de estado de pagamento [4]. O endpoint de webhook precisa ser idempotente: receber o mesmo evento novamente não pode duplicar cobrança, assinatura ou crédito de plano.

A documentação de contas de teste afirma que é possível criar contas de usuário de teste e que a conta vendedora é necessária para configurar a aplicação e as credenciais de cobrança [5]. A documentação de credenciais informa que as credenciais de teste ficam disponíveis para uso no ambiente de desenvolvimento e não devem ser tratadas como credenciais de produção [6].

## Decisões para o Mago Bot

A primeira implementação usará **Checkout Pro sandbox**, com Access Token exclusivamente no backend. A Public Key não será necessária para criar a preferência no servidor e não será colocada em documentação com valor real. O produto não deve transformar `approved` de teste em receita real: o webhook sandbox atualizará apenas o estado de billing da organização de teste e registrará o evento idempotente.

O gateway será isolado atrás da interface de billing já existente. O código deve usar `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` apenas por ambiente server-side, além de `MP_ENVIRONMENT=test`/equivalente para impedir produção acidental. Nenhuma credencial fornecida pelo usuário será commitada, exibida em logs, colocada em `.env.example` com valor real ou enviada ao frontend.

## Limitações e homologação pendente

A pesquisa não autoriza inferir campos ou headers além dos confirmados pela documentação. Antes do checkout real, será necessário configurar as URLs públicas de retorno e webhook no painel do Mercado Pago, criar preferência sandbox, concluir um pagamento com usuário/cartão de teste compatível e confirmar a notificação assinada, a transição de trial para ativo e a proteção contra replay.

## Detalhes adicionais confirmados em Webhooks

A documentação informa que cada aplicação pode ter uma URL de teste para validar notificações com credenciais de teste antes da produção [4]. O exemplo de notificação `payment` contém `type`, `action` e `data.id`; o servidor deve usar o ID para consultar o recurso na API e não confiar somente no corpo recebido [4].

O header `x-signature` usa o formato `ts=...,v1=...`; a documentação mostra que a assinatura secreta deve ser extraída e comparada com a chave da aplicação. Após receber a notificação, o endpoint deve responder HTTP 200 ou 201 para confirmar o recebimento [4].

A implementação do Mago Bot, portanto, validará o HMAC com os campos documentados, recusará assinatura ausente/inválida, consultará o pagamento no Mercado Pago usando Access Token server-side, aplicará transição idempotente e responderá 200 somente após persistir a notificação aceita.

## Referência de API consultada

A referência oficial lista o endpoint `POST https://api.mercadopago.com/checkout/preferences` para criar uma preferência. O exemplo de request usa `Content-Type: application/json` e `Authorization: Bearer APP_USR-...`; o corpo contém `items` e a resposta inclui o identificador que será usado pelo Checkout Pro [2].

A mesma referência separa APIs de Preferences, Pagamentos, cancelamentos, reembolsos e Assinaturas. Para o Mago Bot, a primeira etapa será Checkout Pro com preferência por plano; a assinatura recorrente/preapproval não será presumida até a homologação do produto e do contrato comercial escolhido [2].

## Contas de teste

A página oficial informa que é necessário ter pelo menos duas contas para testar: **vendedor**, que configura a aplicação e as credenciais de cobrança, e **comprador**, que executa o processo de compra. A documentação também recomenda cartões de teste e saldo na conta de usuário de teste; informa ainda limite de até 15 contas de teste simultâneas [5].

Os dados específicos enviados pelo usuário não serão escritos neste arquivo, no GitHub, no frontend ou em logs. Eles devem permanecer somente no cofre/ambiente server-side de teste e ser rotacionados caso tenham sido colados em local não confiável.

## Assinaturas recorrentes

A referência oficial de assinaturas define `POST https://api.mercadopago.com/preapproval`. O request exige `Authorization: Bearer ...` e `payer_email`; aceita `preapproval_plan_id` quando o plano foi criado no Mercado Pago, além de `reason` e `external_reference` para sincronizar a assinatura com o sistema [7]. A resposta inclui o `id` da assinatura e campos de checkout como `init_point`/configuração recorrente no exemplo oficial.

A implementação do Mago Bot começará com assinatura sem presumir um `preapproval_plan_id` já criado: a preferência será criada por organização com referência externa estável. O painel deve guardar somente referências/IDs do Mercado Pago, nunca Access Token, senha de usuário de teste ou código de verificação.

## Reconciliação após o webhook

O trecho oficial de Webhooks confirma que a validação sem SDK recebe `x-signature`, `x-request-id` e o `data.id` da notificação; o exemplo oficial de SDK chama um validador HMAC com esses três valores e a chave secreta da aplicação [4]. A documentação também indica que eventos `payment` devem ser consultados em `https://api.mercadopago.com/v1/payments/{id}` e eventos `subscription_preapproval` em `https://api.mercadopago.com/preapproval/search` [4].

Após a assinatura ser validada, o Mago Bot persistirá o evento com chave única antes de atualizar a organização. A consulta do recurso será feita usando o Access Token server-side; somente estados retornados pela API serão aceitos para mudar o billing local.

## Referências

[1]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/create-payment-preference "Criar e configurar uma preferência de pagamento"
[2]: https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro/preferences/create-preference/post "API — criar preferência"
[3]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview "Checkout Pro — visão geral"
[4]: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/notifications/webhooks "Webhooks do Checkout Pro"
[5]: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/accounts "Contas de teste"
[6]: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/credentials "Credenciais"
[7]: https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post "API — criar assinatura"
