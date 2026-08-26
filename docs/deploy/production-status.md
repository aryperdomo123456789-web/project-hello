# Estado de produção — Mago Bot

**Data:** 26 de agosto de 2026  
**Domínio:** https://mago-bot.com

**Branch:** `feat/saas-multiwhatsapp-flow-builder`

**Último commit do aplicativo no VPS:** `d1f6d55`

**Migration de retenção:** `0015_lyrical_scream.sql` aplicada; `retention_policies` e `retention_runs` existem.

## Estado verificado

| Item               | Estado                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Login público      | HTTP 200 em `/login`                                                         |
| Health público     | HTTP 200 em `/api/health`                                                    |
| PostgreSQL         | Saudável pelo health check                                                   |
| Redis              | Saudável pelo health check                                                   |
| Processo web       | PM2 online como usuário `www`                                                |
| Processo worker    | PM2 online como usuário `www`                                                |
| Node               | 22.16.0 isolado do Node global                                               |
| Nginx              | Proxy HTTPS para `127.0.0.1:3080`                                            |
| HTTP               | Redireciona para HTTPS                                                       |
| Arquivos sensíveis | `.env` retorna 404                                                           |
| Migration          | Aplicada, incluindo chat interno e sequências                                |
| Pasta de estudo    | `/www/wwwroot/mago-bot.com/isonado` preservada                               |
| Monitor systemd    | Timer ativo a cada 5 minutos; serviço oneshot conclui com `status=0/SUCCESS` |

## Entregas operacionais

| Área                                     | Estado                           | Observação                                                                                                                                                                        |
| ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticação, sessão e RBAC multiempresa | Operacional                      | Owner, admin, manager, supervisor e agent com validação server-side.                                                                                                              |
| Inbox, filas, posse, transferência e SLA | Operacional em sandbox           | A persistência está ativa; mensagens reais dependem do contrato operacional do provedor.                                                                                          |
| Fluxos e templates                       | Operacional em sandbox           | Runtime determinístico com efeitos e retomada por timer.                                                                                                                          |
| Sequências comportamentais               | Operacional                      | Scheduler integrado ao `mago-bot-worker` a cada 30 segundos; enrollment com lease, eventos idempotentes, delays, opt-out, janela silenciosa, frequência, tarefas, tags e handoff. |
| Mensagens de sequência                   | Bloqueadas com segurança no stub | Com `WHATSAPP_PROVIDER=stub`, o passo é marcado como `skipped` em modo sandbox; nenhum falso envio é apresentado como real.                                                       |
| Billing/trial                            | Preparado                        | Trial e ciclo de cancelamento existem; cobrança real ainda exige gateway e webhooks assinados.                                                                                    |
| Monitoramento                            | Operacional local                | Timer systemd a cada 5 minutos, estado em `/var/lib/mago-bot/health.state` e journald; webhook externo só será usado quando uma URL de destino for fornecida.                     |
| Retenção de dados                        | Seguro por padrão                | Política por organização, pisos/tetos, `legalHold`, dry-run auditável e limpeza bloqueada por `RETENTION_CLEANUP_ENABLED=false`.                                                  |
| Pasta `isonado/whatsender`               | Preservada                       | Mantida isolada e fora do fluxo de execução.                                                                                                                                      |

## Executor de sequências

O worker procura enrollments ativos vencidos, faz um lease concorrente de dez minutos e cria uma chave única `sequence:{enrollmentId}:step:{stepId}`. Cada efeito muda de `pending` para `processing` e depois `completed`, `skipped` ou `failed`. Falhas agendam nova tentativa em cinco minutos; um evento em `processing` com idade superior ao lease pode ser retomado.

Passos `task`, `tag` e `handoff` são persistidos em transações. Passos `message` respeitam `contact_policies`; sem opt-out, quiet window ou bloqueio de frequência, procuram conversa e conexão da mesma organização. O envio só é chamado quando a conexão está `connected` e o provider não é `stub`. A mensagem usa o mesmo idempotency key como `clientMessageId` para impedir duplicação no banco em replays.

## Monitoramento e diagnóstico

O serviço `mago-bot-health-monitor.service` é `Type=oneshot`; por isso, aparecer como `inactive (dead)` após uma execução bem-sucedida é esperado. A unidade que deve permanecer `active` é `mago-bot-health-monitor.timer`.

```bash
systemctl status mago-bot-health-monitor.service --no-pager
journalctl -u mago-bot-health-monitor.service -n 30 --no-pager
cat /var/lib/mago-bot/health.state
systemctl is-active mago-bot-health-monitor.timer
systemctl list-timers mago-bot-health-monitor.timer --no-pager
```

O webhook de alerta é opcional e não foi inventado nem preenchido sem destino fornecido pelo proprietário. Quando configurado como `ALERT_WEBHOOK_URL` no ambiente do servidor, o monitor alerta somente em transições saudável/indisponível ou indisponível/recuperado.

## Retenção e privacidade

A política de retenção tem defaults conservadores: mensagens e eventos de sequência por 365 dias, webhooks por 90 dias, avaliações e auditoria por 730 dias. A API aplica pisos por categoria e teto de 3.650 dias, registra alterações em auditoria e oferece dry-run com contagem de candidatos. `legalHold=true` bloqueia contagens destrutivas e `dryRunOnly=true` impede exclusão. O worker só considera políticas explicitamente fora de dry-run quando `RETENTION_CLEANUP_ENABLED=true`; essa chave permanece desativada no ambiente de produção até backup, dry-run revisado e autorização operacional.

## Limitações conhecidas

A aplicação está publicada com `WHATSAPP_PROVIDER=stub`. A interface, CRM, filas, especialistas, IA, laboratório e operação funcionam, mas QR Code, inbound, outbound, mídia, recibos e reconexão reais aguardam os endpoints operacionais da Evolution.

A senha inicial do proprietário não é armazenada neste documento nem no GitHub. Deve ser trocada no primeiro acesso. Nenhum segredo de produção deve entrar em commits, logs ou arquivos públicos.

## Smoke test recomendado

1. Abrir `/login` e autenticar como owner.
2. Confirmar a aba Equipe e o Chat interno.
3. Abrir Base de Conhecimento e criar um documento manual de teste.
4. Abrir Automações e executar o simulador.
5. Abrir Laboratório e reproduzir três números virtuais.
6. Criar uma sequência com `task`, `tag` ou `handoff`, ativá-la, inscrever um contato de teste e verificar o próximo ciclo do worker.
7. Verificar `/api/health` antes e depois de reiniciar os processos PM2.
8. Conferir logs do web, worker e monitor após cada etapa.

## Rollback

O vhost anterior está em `/www/server/panel/vhost/nginx/backup/`. O checkout do Mago Bot usa Git, portanto o rollback deve apontar para um commit conhecido, recompilar, reaplicar migrations somente quando necessário e reiniciar apenas `mago-bot-web` e `mago-bot-worker`.

Todo código e documentação devem ser enviados à branch de desenvolvimento antes de qualquer deploy. A pasta `/www/wwwroot/mago-bot.com/isonado/whatsender` permanece intocada.

## Limites honestos do go-live

A solução **não deve ser vendida como WhatsApp real** enquanto a API Evolution operacional não tiver base URL, autenticação, paths, payloads de QR, conexão, inbound, outbound, mídia, status e reconexão homologados. Da mesma forma, trial não equivale a cobrança: checkout, customer portal, assinatura e webhook assinado dependem do gateway escolhido.
