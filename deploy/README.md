# Mago Bot — publicação no aaPanel

## Estado desta entrega

A aplicação compila para Node com `npm run build:production`, possui login, PostgreSQL, inbox persistente, webhooks idempotentes, filas, posse de atendimento, editor visual de especialistas e runtime determinístico. A integração operacional da Evolution continua configurável porque a documentação pública fornecida expõe a central de licenças, não um contrato completo dos endpoints de instância.

## Instalação no servidor

```bash
cd /www/wwwroot/mago-bot.com
git fetch origin
git checkout <branch-ou-commit-da-entrega>
npm ci
cp .env.example .env
nano .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build:production
pm2 start deploy/mago-bot.ecosystem.config.cjs
pm2 save
pm2 status
curl -fsS http://127.0.0.1:3080/api/health
```

## Proxy e HTTPS

No aaPanel, o domínio `mago-bot.com` deve apontar para `127.0.0.1:3080` com proxy reverso. O certificado deve ser emitido pelo painel antes de testar login e webhook. O endpoint público esperado é `/api/webhooks/whatsapp`, e o health check operacional é `/api/health`. O arquivo PM2 sobe dois processos: `mago-bot-web` para HTTP e `mago-bot-worker` para retries e retomada de timers; ambos precisam aparecer como `online`.

## Variáveis que precisam existir

`DATABASE_URL`, `SESSION_SECRET` com pelo menos 32 caracteres, `WHATSAPP_WEBHOOK_SECRET` com pelo menos 16 caracteres, `WHATSAPP_PROVIDER=evolution`, `WHATSAPP_API_BASE_URL`, `WHATSAPP_API_KEY` quando o provedor exigir, e os cinco paths `EVOLUTION_*_PATH` compatíveis com a API operacional. O token de licenciamento deve entrar em `WHATSAPP_LICENSE_TOKEN` quando os scopes forem ativados.

## Segurança operacional

Não coloque chave da Evolution, segredo de sessão ou token de licença no frontend, no Git ou em mensagens do webhook. Restrinja PostgreSQL e Redis ao loopback ou à rede privada, faça backup diário do banco, monitore os logs dos dois processos PM2 e mantenha o webhook atrás de HTTPS. Configure rotação dos arquivos em `/www/wwwlogs` e alerte quando `/api/health` responder `503`. O endpoint valida segredo e deduplica eventos; ainda assim, a API operacional precisa ser homologada com payloads reais antes de abrir o beta.

## Smoke test pós-deploy

1. Rode `curl -fsS https://mago-bot.com/api/health` e confirme `ok: true`, banco e Redis saudáveis.
2. Acesse `/login` e entre com o administrador criado pelo seed.
3. Crie uma conexão em **Conexões & Números** e valide QR Code.
4. Crie um especialista comercial em **Automações**, simule, salve, publique e vincule ao número.
5. Envie uma mensagem de teste para o WhatsApp conectado.
6. Confirme no banco que o webhook criou contato, conversa e mensagem somente uma vez.
7. Assuma a conversa, envie resposta, transfira para outra fila e resolva.
8. Reenvie o mesmo webhook e confirme que nenhuma mensagem ou execução duplicada foi criada.
9. Force um efeito falho em ambiente de homologação e confirme que o `mago-bot-worker` agenda retry sem duplicar a mensagem.

A aplicação não deve ser considerada pronta para cliente pagante enquanto esse smoke test não passar com uma conexão operacional real.

## Manual completo do aaPanel

O procedimento detalhado de produção está em [`docs/deploy/aapanel-production-manual.md`](../docs/deploy/aapanel-production-manual.md). Ele cobre primeira instalação, atualização por commit, `.env`, PostgreSQL, Redis, PM2 web + worker, Nginx, HTTPS, webhook, Evolution, health check, backup, rollback, incidentes e critérios de go-live.

Sempre use a branch publicada no GitHub e registre o commit executado no VPS. Não faça edição manual de arquivos versionados dentro de `/www/wwwroot/mago-bot.com`.

## Monitoramento externo do health

O arquivo `deploy/mago-bot-health-monitor.sh` verifica a cada cinco minutos o endpoint `/api/health`, banco e Redis. Ele registra o estado no journald e envia alerta apenas quando ocorre transição entre saudável e indisponível, caso `ALERT_WEBHOOK_URL` esteja configurado no `.env`. As unidades `mago-bot-health-monitor.service` e `.timer` podem ser instaladas em `/etc/systemd/system`; o script deve ficar em `/usr/local/sbin/mago-bot-health-monitor.sh`.

```bash
install -m 750 deploy/mago-bot-health-monitor.sh /usr/local/sbin/mago-bot-health-monitor.sh
install -m 644 deploy/mago-bot-health-monitor.service deploy/mago-bot-health-monitor.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mago-bot-health-monitor.timer
systemctl start mago-bot-health-monitor.service
systemctl status mago-bot-health-monitor.timer --no-pager
journalctl -u mago-bot-health-monitor.service -n 20 --no-pager
```

O monitor não substitui o health check nem reinicia processos automaticamente; ele alerta a operação para que o runbook seja seguido com backup e rollback controlados.
