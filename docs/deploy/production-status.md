# Estado de produção — Mago Bot

**Data:** 26 de agosto de 2026  
**Domínio:** https://mago-bot.com  
**Branch:** `feat/saas-multiwhatsapp-flow-builder`  
**Commit aplicado no VPS:** `963598b`

## Estado verificado

| Item | Estado |
|---|---|
| Login público | HTTP 200 em `/login` |
| Health público | HTTP 200 em `/api/health` |
| PostgreSQL | Saudável pelo health check |
| Redis | Saudável pelo health check |
| Processo web | PM2 online como usuário `www` |
| Processo worker | PM2 online como usuário `www` |
| Node | 22.16.0 isolado do Node global |
| Nginx | Proxy HTTPS para `127.0.0.1:3080` |
| HTTP | Redireciona para HTTPS |
| Arquivos sensíveis | `.env` retorna 404 |
| Migration | Aplicada, incluindo chat interno |
| Pasta de estudo | `/www/wwwroot/mago-bot.com/isonado` preservada |

## Limitações conhecidas

A aplicação está publicada com `WHATSAPP_PROVIDER=stub`. A interface, CRM, filas, especialistas, IA, laboratório e operação funcionam, mas QR Code, inbound, outbound, mídia, recibos e reconexão reais aguardam os endpoints operacionais da Evolution.

A senha inicial do proprietário não é armazenada neste documento nem no GitHub. Deve ser trocada no primeiro acesso. Nenhum segredo de produção deve entrar em commits, logs ou arquivos públicos.

## Smoke test recomendado

1. Abrir `/login` e autenticar como owner.
2. Confirmar a aba Equipe e o Chat interno.
3. Abrir Base de Conhecimento e criar um documento manual de teste.
4. Abrir Automações e executar o simulador.
5. Abrir Laboratório e reproduzir três números virtuais.
6. Verificar `/api/health` antes e depois de reiniciar os processos PM2.
7. Conferir logs do web e worker após cada etapa.

## Rollback

O vhost anterior está em `/www/server/panel/vhost/nginx/backup/`. O checkout do Mago Bot usa Git, portanto o rollback deve apontar para um commit conhecido, recompilar, reaplicar migrations somente quando necessário e reiniciar apenas `mago-bot-web` e `mago-bot-worker`.
