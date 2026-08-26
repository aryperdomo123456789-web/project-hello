# Contrato do provedor WhatsApp

O Mago Bot mantém o domínio desacoplado do fornecedor por meio de `WhatsAppProviderAdapter`. A aplicação exige apenas operações de instância, QR Code, desconexão, envio de texto e normalização de webhook.

## Operações necessárias

| Operação | Variável | Contrato esperado |
|---|---|---|
| Listar instâncias | `EVOLUTION_INSTANCES_PATH` | `GET`, resposta em array ou `{ instances: [] }` |
| Criar instância | `EVOLUTION_CREATE_PATH` | `POST`, corpo com `instanceName` e `qrcode: true` |
| Conectar/QR | `EVOLUTION_CONNECT_PATH` | path com `{instance}`, resposta com `base64`/`qrcode` e opcionalmente `code` |
| Logout | `EVOLUTION_LOGOUT_PATH` | `DELETE`, path com `{instance}` |
| Enviar texto | `EVOLUTION_SEND_TEXT_PATH` | `POST`, corpo `{ number, text }`, resposta com `key.id` ou `id` |
| Webhook | `WEBHOOK_PUBLIC_URL` | payload normalizado para entrada, status e atualização de conexão |

## Variáveis de ambiente

```dotenv
WHATSAPP_PROVIDER=evolution
WHATSAPP_API_BASE_URL=https://api-operacional.exemplo
WHATSAPP_API_KEY=segredo-no-servidor
EVOLUTION_INSTANCES_PATH=/instance/fetchInstances
EVOLUTION_CREATE_PATH=/instance/create
EVOLUTION_CONNECT_PATH=/instance/connect/{instance}
EVOLUTION_LOGOUT_PATH=/instance/logout/{instance}
EVOLUTION_SEND_TEXT_PATH=/message/sendText/{instance}
WEBHOOK_PUBLIC_URL=https://mago-bot.com/api/webhooks/whatsapp
```

Os paths acima são exemplos de configuração e **não devem ser considerados homologados** até serem confrontados com o contrato operacional real do provedor utilizado. A documentação pública recebida em `app.mago-bot.com/docs` descreve a central de licenciamento, não todos os endpoints de WhatsApp.

## Regras de segurança

A chave do provedor permanece server-side. O navegador recebe apenas DTOs de conexão, nunca URL operacional, chave, credencial ou payload bruto. Webhooks devem possuir verificação de assinatura/token quando o provedor oferecer esse recurso, limite de tamanho de corpo, timeout e deduplicação por provedor + evento externo.

A normalização é deliberadamente tolerante a variações de nomes de campo, mas payload desconhecido vira evento `unknown` e não é executado como mensagem. O adaptador não executa URL enviada pelo usuário como ação arbitrária: endpoints devem vir da configuração segura do servidor.

## Critérios de homologação

A homologação só é considerada concluída quando uma instância puder ser criada e desconectada, o QR puder ser obtido, uma mensagem inbound criar/atualizar uma conversa, o mesmo webhook repetido permanecer idempotente, uma resposta outbound retornar ao número correto, status de entrega atualizar a mensagem e uma indisponibilidade do provedor entrar em retry sem duplicar efeito.
