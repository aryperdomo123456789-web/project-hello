# Auditoria do appapiwppmago e plano de integração com o Mago Bot

**Autor:** Manus AI
**Data:** 26 de agosto de 2026
**Repositório auditado:** `aryperdomo123456789-web/appapiwppmago`
**Método:** leitura somente, inventário de branches, análise de documentação, templates, rotas e adapters; nenhum serviço foi executado e nenhum `.env` ou segredo foi aberto.

## 1. Veredito executivo

O `appapiwppmago` é o repositório de uma camada de plataforma/licenciamento e de uma implantação da Evolution API v2.3.7. Ele contém documentação de produto, templates Docker/Nginx, licenciamento por projeto/escopo e, em uma branch mais avançada, um Operations Console com PostgreSQL, Redis, providers, webhook worker, rate limit, circuit breaker e criptografia de segredos.

A descoberta crítica é que **a documentação promete mais do que o código de integração efetivamente executa**. A branch `feat/operations-console-admin-migration` possui adapter Evolution para envio de texto e integração com recursos, mas o adapter não implementa QR, criação de instância, listagem, logout, recebimento de webhook Evolution ou mídia. As branches `main`, `app/licenciamento`, `docs/operacao`, `evolution/integracao` e `infra/producao` possuem principalmente a base de licenciamento e planos/documentos; as afirmações de “Evolution implementada” aparecem em grande parte como contrato, auditoria ou plano.

Por isso, o próximo passo correto **não é copiar ou fazer merge do repositório inteiro**. É usar o material como especificação e completar primeiro o produto do Mago Bot. Quando a Evolution operacional estiver pronta, deve-se homologar o contrato real e conectar o adapter já existente do Mago Bot, que foi desenhado justamente para listar/criar/conectar/desconectar/enviar/normalizar, mas permanece em `stub` até a API real ser fornecida.

## 2. Branches remotas encontradas

O GitHub retornou seis branches remotas. Nenhuma foi alterada.

| Branch | Commit observado | Arquivos | Leitura |
|---|---|---:|---|
| `main` | `4d84e4c` | 46 | Base de licenciamento e documentação operacional |
| `app/licenciamento` | `82eb588` | 46 | Variação de aplicação/licenciamento; sem salto relevante de integração Evolution |
| `docs/operacao` | `e0f4145` | 46 | Branch documental de operação e acesso |
| `evolution/integracao` | `5d16a9b` | 46 | Branch documental de integração Evolution; contrato descrito, pouco código novo |
| `infra/producao` | `b08e73a` | 46 | Branch documental/infraestrutura de produção |
| `feat/operations-console-admin-migration` | `0b20023` | 116 | Branch mais avançada; Operations Console, providers, workers e controles de plataforma |

O caminho enviado anteriormente, `tree/backup/deploy`, não corresponde a uma branch deste repositório. O `appapiwppmago` não possui uma branch chamada `backup`; a referência relevante de Evolution é `evolution/integracao`, enquanto o código mais rico está em `feat/operations-console-admin-migration`.

## 3. Arquitetura encontrada

As branches de 46 arquivos combinam uma aplicação FastAPI/Flask de licenciamento com a Evolution API v2.3.7 em Node.js, bancos separados para plataforma e Evolution e Redis para cache/deduplicação. Os templates usam Docker Compose, volumes persistentes e Nginx/aaPanel. A branch de Operations Console adiciona workers Python, PostgreSQL 16, Redis 7, redes Docker internas e superfícies administrativas separadas por hostname.

| Camada | Evidência | Estado real |
|---|---|---|
| Licenciamento | `service/app/routes/licenses.py`, `public.py`, `models.py` | Implementado nas branches-base |
| Plataforma/tenants | `service/app/platform_models.py`, `platform_rbac.py`, `routes/resources.py` | Implementado na branch de Operations Console |
| Evolution | `service/deploy/docker-compose.production.yml`, imagem `evoapicloud/evolution-api:v2.3.7` | Preparada por Compose; operação real depende de secrets, banco, Redis e validação |
| Provider adapter | `service/app/providers/evolution.py` | Implementado somente para envio de texto e health superficial |
| Webhook inbound Meta | `service/app/routes/webhooks.py` | Implementado para Meta Cloud com `X-Hub-Signature-256` |
| Webhook worker | `service/app/webhook_worker.py` | Worker de entrega de webhooks da plataforma para assinantes; não é o inbound Evolution |
| Deploy canário | `service/deploy/docker-compose.staging.yml`, `PLANO_DEPLOY_CANARIO.md` | Estruturado/documentado na branch de Operations Console |
| Segurança de rede | redes Docker internas e validação SSRF | Parcialmente implementada; precisa validar ambiente real |

## 4. Contrato Evolution observado

Os documentos e templates citam o seguinte conjunto de endpoints e convenções:

| Operação | Contrato citado | Evidência | Classificação |
|---|---|---|---|
| Autenticação | header `apikey` | `service/app/providers/evolution.py`, `evolution.env.example` | Confirmado no adapter |
| Listar instâncias | `GET /instance/fetchInstances` | auditorias/documentos operacionais | Documentado; não implementado no adapter da branch avançada |
| Criar instância | `POST /instance/create` | planos/auditorias | Documentado; não implementado no adapter da branch avançada |
| Conectar/QR | `/instance/connect/{instance}` | planos/guia operacional | Documentado; não implementado no adapter da branch avançada |
| Logout | `/instance/logout/{instance}` | contrato dos documentos | Documentado; não implementado no adapter da branch avançada |
| Enviar texto | `POST /message/sendText/{resource_id}` com `{number,text}` | `service/app/providers/evolution.py` | Implementado no adapter |
| Mensagem recebida | webhook Evolution global citado | auditorias/guia | Não há handler inbound Evolution equivalente em `routes/webhooks.py` |
| Mídia | rotas Evolution citadas como suporte | auditoria técnica | Não implementada no adapter avançado |
| Status/reconexão | eventos de conexão/QR citados | planos/documentos | Não implementado como fluxo de ingestão no código avançado |

O adapter de `feat/operations-console-admin-migration` faz uma chamada para `message/sendText/{resource_id}`, envia `apikey`, trata timeout/erro HTTP e marca erros temporários como `retryable=True`. A resposta precisa conter `key.id` ou `id`. Ele rejeita qualquer mensagem que não seja texto. A rota de criação de recurso apenas persiste `provider_resource_id`; ela não chama `/instance/create` nem retorna QR.

> **Conclusão técnica:** “Evolution instalada em Docker” e “API pronta para o Mago Bot” são coisas diferentes. A primeira aparece nos templates; a segunda ainda exige contrato comprovado por chamadas de homologação.

## 5. Webhooks e workers: distinção importante

A rota `service/app/routes/webhooks.py` da branch avançada valida o webhook da **Meta Cloud API**, usando `META_WEBHOOK_VERIFY_TOKEN` no GET de verificação e `META_APP_SECRET` no HMAC `X-Hub-Signature-256` do POST. Ela identifica `phone_number_id`, encontra um `ProviderResource` `meta_cloud`, grava `WebhookEvent` com deduplicação e cria `WebhookDelivery` para assinantes da plataforma.

O arquivo `service/app/webhook_worker.py` entrega esses eventos a URLs de terceiros. Ele usa lease com `skip_locked`, assinatura própria `X-Mago-Signature`, validação anti-SSRF, retry exponencial e dead letter após `WEBHOOK_MAX_ATTEMPTS`. Isso é uma boa referência de entrega de eventos, mas **não processa mensagens recebidas da Evolution**.

No Mago Bot, essa distinção já está mais bem separada: Redis/BullMQ processa jobs e eventos; PostgreSQL guarda `webhook_events`, mensagens e conexões; o adaptador normaliza eventos de mensagem, status, conexão e QR. O gap é homologar a forma real da Evolution e ativar o provider sem abandonar o stub antes da hora.

## 6. O que já está pronto no Mago Bot para receber essa API

O Mago Bot já possui um contrato server-side em `src/services/whatsapp.server.ts` com as operações `listInstances`, `createInstance`, `getQrCode`, `disconnectInstance`, `sendText` e `normalizeWebhook`. O adapter HTTP usa `apikey`, timeout, paths configuráveis e suporta respostas variantes de instância, QR, status e mensagem.

A persistência também está preparada: `channel_connections` associa organização, provider, `providerInstanceId`, status e metadados; `conversations` e `messages` guardam o tenant/conexão; `webhook_events` possui deduplicação por provider/evento e controle de tentativas. O envio do operador já cria a mensagem pendente, chama o adapter e atualiza `sent`/`failed` com `externalId`.

| Área | Mago Bot atual | O que falta com a Evolution real |
|---|---|---|
| Configuração de provider | Adapter HTTP + paths por ambiente | URL, header, paths e credencial operacionais |
| Criar número | Server function já chama `createInstance` | Confirmar nome do campo, resposta e provisioning real |
| QR | Server function já chama `getQrCode` | Confirmar formato/base64, expiração e polling/evento |
| Envio | Texto persistido e enviado pelo adapter | Confirmar resposta, status, rate limit e idempotência |
| Inbound | Normalizador preparado | Ligar webhook Evolution ao endpoint de ingestão e worker |
| Status | Modelo e normalização preparados | Mapear estados reais e reconexão |
| Mídia | Não é contrato mínimo atual | Adicionar depois de texto/inbound estáveis |
| Resiliência | Redis/BullMQ, retry, DLQ, monitor | Testar comportamento real sob timeout/429/5xx |
| Multiempresa | Filtro por organização em schema/functions | Garantir que a API externa nunca permita cruzamento de instâncias |

## 7. Riscos encontrados no appapiwppmago

A branch de Operations Console tem boas práticas, como Fernet para segredos de provider, SHA-256 para chaves, rate limiting distribuído, circuit breaker, validação de SSRF, redes Docker internas e canário. Ainda assim, os próprios documentos apontam riscos que devem ser tratados antes de uma exposição pública.

Os riscos principais são: processamento síncrono em partes do webhook legado; ausência de retry automático completo no adapter Evolution; suporte somente a texto; afirmações de integração baseadas em documentação sem prova de endpoint; possível dependência de banco remoto para a Evolution em alguns templates; configurações de pool SQL grandes; e histórico de templates que exige permissões rígidas em `.env` e portas públicas. A regra para o Mago Bot é manter secrets server-side, reduzir portas públicas ao mínimo, usar filas para inbound e não confiar em `provider_resource_id` recebido pelo cliente sem validar tenant/projeto.

## 8. Próximo passo recomendado

Como a Evolution ainda está sendo construída, o próximo passo do Mago Bot deve ser **fechar o produto e preparar o canário de integração**, não trocar o provider agora. O Mago Bot deve continuar em `WHATSAPP_PROVIDER=stub` até receber uma instância operacional com contrato verificável.

Quando a API estiver pronta, o proprietário deve fornecer, por canal seguro de configuração e não em commit:

| Informação necessária | Exemplo de conteúdo, sem segredo |
|---|---|
| Base URL | host HTTPS ou URL interna Docker |
| Autenticação | header usado, por exemplo `apikey` |
| Criação | método, path, body e resposta real |
| QR/conexão | path, formato, expiração, polling ou evento |
| Logout | método, path e estados de retorno |
| Mensagem | texto, mídia, destinatário, resposta e limites |
| Webhook | URL pública, eventos, assinatura/token e retry do provedor |
| Reconexão | estados, heartbeat, desconexão e reautenticação |
| Limites | 429, rate limit, tamanho de mídia e timeout |
| Homologação | instância de teste, casos inbound/outbound e repetição de evento |

A sequência de integração será: criar uma instância de teste; listar e obter QR; conectar; enviar texto para o próprio número de teste; receber uma mensagem; repetir o mesmo webhook; confirmar uma única conversa/mensagem; testar status; desconectar/reconectar; simular timeout/429/5xx; verificar retry/DLQ; e só então trocar o ambiente do Mago Bot para `evolution` no canário.

## 9. Decisão de arquitetura

O `appapiwppmago` deve ser usado como **referência e fonte do contrato**, não como dependência de runtime do Mago Bot. O stack do Mago Bot — TanStack/Node, Drizzle/PostgreSQL, Redis/BullMQ e PM2 — já é adequado para o SaaS multiempresa. A integração futura deve portar somente contratos, mapeamentos e controles comprovados.

A branch mais útil para estudo é `feat/operations-console-admin-migration`, principalmente `service/app/providers/evolution.py`, `service/app/webhook_worker.py`, `service/app/platform_crypto.py`, `service/app/platform_resilience.py`, `service/app/platform_ssrf.py`, `service/app/routes/resources.py` e `service/deploy/docker-compose.production.yml`. As branches `evolution/integracao`, `docs/operacao` e `infra/producao` são úteis para documentação e planejamento, mas não devem ser tratadas como prova de integração completa.

Não deve ser mesclado código inteiro entre os projetos. São stacks, modelos de dados, fronteiras de tenant e ciclos de deploy diferentes. A importação segura é seletiva e sempre acompanhada de testes do Mago Bot.

## Referências

[1]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/main "appapiwppmago — main"
[2]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/app/licenciamento "appapiwppmago — app/licenciamento"
[3]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/docs/operacao "appapiwppmago — docs/operacao"
[4]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/evolution/integracao "appapiwppmago — evolution/integracao"
[5]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/infra/producao "appapiwppmago — infra/producao"
[6]: https://github.com/aryperdomo123456789-web/appapiwppmago/tree/feat/operations-console-admin-migration "appapiwppmago — Operations Console"
[7]: https://github.com/aryperdomo123456789-web/project-hello/tree/feat/saas-multiwhatsapp-flow-builder "Mago Bot — branch de desenvolvimento"
[8]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/src/services/whatsapp.server.ts "Mago Bot — adapter WhatsApp"
[9]: https://github.com/aryperdomo123456789-web/project-hello/blob/feat/saas-multiwhatsapp-flow-builder/docs/evolution-provider-contract.md "Mago Bot — contrato Evolution"
