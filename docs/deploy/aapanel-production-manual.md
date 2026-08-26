# Manual de Produção — Mago Bot no aaPanel

**Projeto:** Mago Bot  
**Repositório:** `aryperdomo123456789-web/project-hello`  
**Branch de implantação:** `feat/saas-multiwhatsapp-flow-builder`  
**Diretório alvo:** `/www/wwwroot/mago-bot.com`  
**Domínio:** `mago-bot.com`  
**Runtime:** Node.js + Nitro SSR  
**Processos:** servidor web e worker BullMQ separados  
**Autor:** Manus AI

> Este documento descreve uma implantação reproduzível e auditável. Ele não pressupõe que a Evolution esteja homologada. O sistema pode subir em modo `stub` para validação do painel; o transporte WhatsApp real somente deve ser ativado depois de confirmar base URL, autenticação, paths, payloads e webhooks do provedor.

## 1. Topologia recomendada

O aaPanel deve operar como camada de entrada e supervisão, não como local para executar lógica manualmente dentro do navegador. O Nginx recebe HTTPS em `mago-bot.com`, encaminha para o processo Node em `127.0.0.1:3080`, e o PM2 mantém dois processos: `mago-bot-web` para SSR/API e `mago-bot-worker` para BullMQ/Redis.

| Componente        | Endereço/processo                | Responsabilidade                               |
| ----------------- | -------------------------------- | ---------------------------------------------- |
| Nginx/aaPanel     | `https://mago-bot.com`           | TLS, proxy reverso, headers e limite de upload |
| Web Node/Nitro    | `127.0.0.1:3080`                 | SSR, RPCs, inbox, health e webhook             |
| Worker            | PM2 separado                     | retries, timers, efeitos e DLQ                 |
| PostgreSQL        | `127.0.0.1:5432` ou host privado | dados multiempresa, mensagens e auditoria      |
| Redis             | `127.0.0.1:6379` ou host privado | rate limit, BullMQ e filas                     |
| Evolution         | URL privada/pública configurada  | conexão e transporte WhatsApp real             |
| Langfuse opcional | URL externa ou self-hosted       | traces de IA, latência e uso sanitizados       |

O processo web nunca deve escutar em `0.0.0.0` quando o Nginx está no mesmo servidor. Use `HOST=127.0.0.1` e deixe apenas as portas 80/443 públicas. Redis e PostgreSQL devem aceitar conexões somente locais ou da rede privada necessária.

## 2. Pré-requisitos

Antes de iniciar, confirme no aaPanel ou por SSH:

| Requisito  | Valor recomendado                                               |
| ---------- | --------------------------------------------------------------- |
| Sistema    | Ubuntu 22.04/24.04 LTS                                          |
| Node.js    | 22.x                                                            |
| npm        | compatível com Node 22                                          |
| PM2        | versão atual estável                                            |
| PostgreSQL | 15+                                                             |
| Redis      | 7+                                                              |
| Memória    | 2 GB mínimo para beta; 4 GB recomendado com worker e PostgreSQL |
| DNS        | `mago-bot.com` apontando para o IP do VPS                       |
| TLS        | certificado válido configurado no aaPanel                       |
| Git        | acesso de leitura ao repositório                                |

A versão atual usa os scripts reais abaixo; não substitua por comandos inventados:

```text
npm run build:production   # NITRO_PRESET=node-server vite build
npm start                  # node .output/server/index.mjs
npm run db:migrate         # migrations Drizzle
npm run db:seed            # seed idempotente
npm run worker             # worker contínuo
npm run worker:once        # execução única de diagnóstico
npm run typecheck
npm test
```

## 3. Criar o site no aaPanel

No aaPanel, crie um site para `mago-bot.com` com raiz `/www/wwwroot/mago-bot.com`. A raiz é o diretório do projeto, não o diretório `.output` e não uma pasta pública estática.

No menu de runtime Node.js do aaPanel, se o módulo estiver disponível, selecione Node 22 e configure o projeto para não iniciar pela porta pública. Caso o gerenciador Node do aaPanel não mantenha o worker corretamente, use PM2 conforme a seção 7.

Por SSH, valide o diretório:

```bash
sudo mkdir -p /www/wwwroot/mago-bot.com
sudo chown -R www:www /www/wwwroot/mago-bot.com
cd /www/wwwroot/mago-bot.com
```

Se o usuário do site no teu aaPanel não for `www`, descubra-o no painel e substitua em todos os comandos. Não execute a aplicação como `root` em produção.

## 4. Baixar sempre a branch publicada no GitHub

Toda entrega de código deve entrar primeiro no GitHub. No servidor, nunca faça alterações manuais em arquivos versionados. O procedimento de primeira instalação é:

```bash
cd /www/wwwroot
sudo -u www git clone \
  --branch feat/saas-multiwhatsapp-flow-builder \
  --single-branch \
  https://github.com/aryperdomo123456789-web/project-hello.git \
  mago-bot.com
cd /www/wwwroot/mago-bot.com
```

Para atualização posterior, use um commit fixado e registre o valor antes de reiniciar:

```bash
cd /www/wwwroot/mago-bot.com
sudo -u www git fetch origin feat/saas-multiwhatsapp-flow-builder
sudo -u www git rev-parse HEAD
sudo -u www git checkout --detach origin/feat/saas-multiwhatsapp-flow-builder
```

Em ambientes que exigem branch local, mantenha a branch rastreável:

```bash
sudo -u www git switch feat/saas-multiwhatsapp-flow-builder
sudo -u www git reset --hard origin/feat/saas-multiwhatsapp-flow-builder
```

Antes de atualizar, faça backup do `.env`, do banco e do commit atual. Nunca use `git pull` sem saber qual commit será executado.

## 5. Instalar dependências e compilar

A build precisa das dependências de desenvolvimento, pois Vite, Nitro, TypeScript e Drizzle Kit estão no `devDependencies`. O worker atual também é iniciado pelo `tsx`, então mantenha as dependências instaladas até existir uma etapa própria de compilação do worker.

```bash
cd /www/wwwroot/mago-bot.com
sudo -u www npm ci
sudo -u www npm run typecheck
sudo -u www npm test
sudo -u www npm run build:production
```

A saída esperada é `.output/server/index.mjs`. Não publique `.output` diretamente como site estático; a aplicação contém SSR, RPCs, webhooks e sessão HTTP-only.

## 6. Configurar variáveis de ambiente

Crie o arquivo `/www/wwwroot/mago-bot.com/.env` usando `.env.example` como referência. Segredos nunca entram no GitHub, no bundle ou em mensagens de chat.

Exemplo mínimo de beta sem Evolution:

```env
NODE_ENV=production
APP_URL=https://mago-bot.com
PORT=3080
HOST=127.0.0.1
SESSION_SECRET=gere-uma-chave-aleatoria-com-pelo-menos-32-caracteres

DATABASE_URL=postgres://mago_bot:SENHA_FORTE@127.0.0.1:5432/mago_bot
DATABASE_SSL=false
REDIS_URL=redis://127.0.0.1:6379

LICENSE_API_BASE_URL=https://app.mago-bot.com
LICENSE_PROJECT_SLUG=mago-bot
LICENSE_DOMAIN=mago-bot.com
LICENSE_ADMIN_TOKEN=
WHATSAPP_LICENSE_TOKEN=

WHATSAPP_PROVIDER=stub
WHATSAPP_API_BASE_URL=
WHATSAPP_API_KEY=
WHATSAPP_WEBHOOK_SECRET=segredo-exclusivo-com-no-minimo-16-caracteres

AI_PRIMARY_PROVIDER=stub
AI_FALLBACK_PROVIDER=stub
AI_PRIMARY_MODEL=openai/gpt-oss-20b
AI_FALLBACK_MODEL=openai/gpt-oss-20b
AI_TIMEOUT_MS=12000
AI_MAX_OUTPUT_TOKENS=512
AI_REQUESTS_PER_MINUTE=60
OPENROUTER_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
GEMINI_API_KEY=

JINA_API_KEY=
FIRECRAWL_API_KEY=
TAVILY_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=

RATE_LIMIT_WEBHOOK_PER_MINUTE=120
RATE_LIMIT_LOGIN_PER_MINUTE=10
```

Quando os provedores de IA forem ativados, configure as chaves somente no `.env` do servidor. O roteamento primário/fallback fica no ambiente e não exige rebuild. Para o primeiro teste controlado, use um provedor de baixa latência como primário e um compatível com OpenAI como fallback, sempre medindo qualidade, latência e custo no Langfuse.

Proteja o arquivo:

```bash
sudo chown www:www /www/wwwroot/mago-bot.com/.env
sudo chmod 600 /www/wwwroot/mago-bot.com/.env
```

## 7. PostgreSQL, migrations e seed

Crie uma base e um usuário exclusivos para o Mago Bot. Não reutilize o superusuário do PostgreSQL na aplicação.

```sql
CREATE USER mago_bot WITH PASSWORD 'SENHA_FORTE_E_UNICA';
CREATE DATABASE mago_bot OWNER mago_bot;
REVOKE ALL ON DATABASE mago_bot FROM PUBLIC;
```

Com `.env` configurado, aplique as migrations versionadas:

```bash
cd /www/wwwroot/mago-bot.com
sudo -u www npm run db:migrate
sudo -u www npm run db:seed
```

O seed é destinado à inicialização idempotente. Troque imediatamente a senha criada pelo seed e remova qualquer credencial de teste. Nunca use `db:push` como substituto de migration em produção; use a migration gerada no GitHub e registre o commit aplicado.

Após a migração, confirme a versão pelo journal Drizzle e faça uma consulta somente de saúde. Não exponha dados de clientes em logs de deploy.

## 8. Redis e worker

O Redis deve iniciar antes do worker e do web. Teste a conexão:

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

A resposta esperada é `PONG`. Suba os dois processos com o arquivo versionado:

```bash
cd /www/wwwroot/mago-bot.com
sudo -u www pm2 start deploy/mago-bot.ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

O comando `pm2 startup` imprime um comando adicional que deve ser executado uma vez com privilégio administrativo. Execute exatamente o comando exibido pelo PM2; depois repita `pm2 save`.

Valide:

```bash
pm2 status
pm2 logs mago-bot-web --lines 80
pm2 logs mago-bot-worker --lines 80
```

O worker é obrigatório para timers, retries e efeitos assíncronos. Se ele estiver parado, o painel pode continuar respondendo, mas follow-ups e jobs podem acumular. O health check deve sinalizar essa condição quando a verificação operacional estiver ligada.

## 9. Nginx e proxy reverso no aaPanel

No aaPanel, abra a configuração do site e configure proxy reverso para `http://127.0.0.1:3080`. Se preferir editar o bloco Nginx, use a estrutura abaixo dentro do `server` do domínio. Ajuste o caminho conforme o aaPanel gerar o arquivo final.

```nginx
location / {
    proxy_pass http://127.0.0.1:3080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-ID $request_id;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    client_max_body_size 20m;
}

location = /api/health {
    proxy_pass http://127.0.0.1:3080/api/health;
    proxy_set_header Host $host;
    proxy_set_header X-Request-ID $request_id;
}
```

Depois teste e recarregue o Nginx pelo aaPanel. Não exponha a porta 3080 no firewall se o proxy estiver no mesmo VPS.

## 10. HTTPS, cookies e domínio

Ative o certificado no aaPanel para `mago-bot.com` e redirecione HTTP para HTTPS. A sessão usa cookie HTTP-only; portanto, `APP_URL`, domínio, protocolo e proxy precisam estar coerentes.

Teste:

```bash
curl -I https://mago-bot.com/login
curl -i https://mago-bot.com/api/health
```

A resposta de `/api/health` deve ser HTTP 200 quando banco e Redis estiverem saudáveis. Se retornar 502, verifique PM2 e a porta 3080. Se retornar 403/404, verifique o site/proxy selecionado no aaPanel. Se login entrar em loop, confira HTTPS, `APP_URL`, `SESSION_SECRET` e os headers `X-Forwarded-Proto`.

## 11. Evolution e webhook

A Evolution só deve sair de `stub` depois de confirmar o contrato operacional. O mínimo necessário é:

| Item                   |       Obrigatório |
| ---------------------- | ----------------: |
| URL base operacional   |               Sim |
| Autenticação e header  |               Sim |
| Criar/listar instância |               Sim |
| QR Code/conectar       |               Sim |
| Enviar texto           |               Sim |
| Evento inbound         |               Sim |
| Evento status          |       Recomendado |
| Mídia                  |   Depois do texto |
| Reconexão              | Sim para produção |

O endpoint preparado pelo Mago Bot é:

```text
POST https://mago-bot.com/api/webhooks/whatsapp
```

Configure na Evolution a URL do webhook, o segredo correspondente a `WHATSAPP_WEBHOOK_SECRET` e os eventos necessários. Faça primeiro um teste com uma única instância e um número de homologação. Verifique no painel: conexão correta, número de origem, deduplicação por `externalId`, fluxo especialista, fila, handoff, resposta e auditoria.

Não aponte clientes reais para o webhook antes de testar duplicação, timeout, payload inválido, queda do worker e indisponibilidade temporária do provedor.

## 12. Checklist de smoke test

Execute nesta ordem após o primeiro deploy:

```bash
cd /www/wwwroot/mago-bot.com
pm2 status
curl -fsS https://mago-bot.com/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://mago-bot.com/login
sudo -u www npm run worker:once
```

Depois, no navegador, valide login, logout, navegação por papel, onboarding, Base de Conhecimento, Laboratório, CRM, Equipe, Filas, Automações, Relatórios e Diagnóstico. Para o laboratório, simule três números e confirme que cada mensagem preserva `connectionId`, fila e especialista.

## 13. Backup

Faça backup antes de migration, troca de versão, ativação de provedor ou alteração de `.env`. Exemplo de dump PostgreSQL:

```bash
sudo install -d -m 700 /var/backups/mago-bot
sudo -u postgres pg_dump --format=custom --file=/var/backups/mago-bot/mago-bot-$(date +%Y%m%d-%H%M%S).dump mago_bot
sudo cp -p /www/wwwroot/mago-bot.com/.env /var/backups/mago-bot/env-$(date +%Y%m%d-%H%M%S).bak
sudo chmod 600 /var/backups/mago-bot/*
```

O Redis contém filas e rate limits; a fonte de verdade é o PostgreSQL. Para produção, configure retenção e cópia dos dumps para armazenamento externo. Teste restauração periodicamente em uma base separada. Backup que nunca foi restaurado é apenas decoração de servidor.

## 14. Atualização segura

Use este procedimento para cada publicação:

```bash
cd /www/wwwroot/mago-bot.com
PREVIOUS=$(sudo -u www git rev-parse HEAD)
sudo -u postgres pg_dump --format=custom --file=/var/backups/mago-bot/predeploy-$(date +%Y%m%d-%H%M%S).dump mago_bot
sudo cp -p .env /var/backups/mago-bot/env-predeploy-$(date +%Y%m%d-%H%M%S).bak
sudo -u www git fetch origin feat/saas-multiwhatsapp-flow-builder
sudo -u www git checkout --detach origin/feat/saas-multiwhatsapp-flow-builder
sudo -u www npm ci
sudo -u www npm run typecheck
sudo -u www npm test
sudo -u www npm run db:migrate
sudo -u www npm run build:production
pm2 reload deploy/mago-bot.ecosystem.config.cjs --update-env
curl -fsS https://mago-bot.com/api/health
pm2 status
printf 'Versão anterior: %s\nVersão atual: ' "$PREVIOUS"
sudo -u www git rev-parse HEAD
```

Se migration, build ou smoke test falhar, pare o processo. Não apague tabelas e não execute rollback destrutivo automaticamente. Restaure o banco em base separada, avalie compatibilidade da migration e só então decida o retorno da aplicação ao commit anterior.

## 15. Rollback de aplicação

Para retornar o código, use um commit conhecido e faça backup antes:

```bash
cd /www/wwwroot/mago-bot.com
sudo -u www git log --oneline -10
sudo -u www git checkout --detach COMMIT_CONHECIDO
sudo -u www npm ci
sudo -u www npm run build:production
pm2 reload deploy/mago-bot.ecosystem.config.cjs --update-env
curl -fsS https://mago-bot.com/api/health
```

Rollback de código não desfaz migration de banco. Migrations devem ser compatíveis para frente; alterações destrutivas exigem plano de expansão/contração, backup validado e janela de manutenção.

## 16. Runbook de incidentes

| Sintoma               | Primeira ação                                          | Diagnóstico                                      |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| Tela branca           | abrir gaveta de diagnóstico e verificar `x-request-id` | `pm2 logs mago-bot-web`, build e erro de rota    |
| HTTP 502              | conferir `pm2 status` e porta 3080                     | `ss -ltnp`, logs do PM2 e proxy Nginx            |
| Login em loop         | conferir `APP_URL`, HTTPS e sessão                     | cookie, `X-Forwarded-Proto`, `SESSION_SECRET`    |
| Health 503            | verificar PostgreSQL e Redis                           | `systemctl status postgresql redis-server`, logs |
| Mensagens paradas     | verificar worker e Redis                               | `pm2 logs mago-bot-worker`, fila e DLQ           |
| IA lenta              | verificar timeout/fallback                             | Langfuse, latência por provider e rate limit     |
| Eventos duplicados    | preservar `externalId` e não apagar registros          | webhook_events, flow events e idempotency key    |
| Cross-tenant suspeito | bloquear acesso e preservar auditoria                  | logs, audit_logs, membership e organizationId    |

Ao abrir incidente, registre horário, commit, request ID, processo afetado, sintoma, ação executada e resultado. Nunca coloque token, senha, payload integral de cliente ou licença em chamado público.

## 17. Segurança mínima antes de clientes

Confirme firewall com somente SSH, HTTP e HTTPS públicos; PostgreSQL e Redis privados; usuário de execução sem root; `.env` com permissão 600; certificado válido; backup restaurável; rate limit ativo; segredo de webhook rotacionável; logs sem tokens; sessão com `SESSION_SECRET` forte; migrations versionadas; branch/commit registrado; e acesso ao aaPanel protegido por MFA quando disponível.

Para IA, mantenha aprovação humana para sugestão de resposta, limite por organização, timeout, fallback e tracing sanitizado. Para conhecimento, confirme que todo documento e chunk carregam `organizationId` e que busca nunca cruza tenant.

## 18. Critério de go-live

A implantação não é considerada pronta somente porque a tela abriu. O go-live exige: health 200 por 30 minutos; web e worker estáveis; migration aplicada; restauração de backup verificada; login por pelo menos dois papéis; três números no laboratório; teste de fluxo por número; teste de handoff; teste de retry/DLQ; rate limit; Base de Conhecimento; relatório; e, quando Evolution estiver disponível, teste real de inbound/outbound, status e reconexão.

Sem Evolution, o ambiente pode ser publicado como **beta de demonstração e operação sandbox**. Não deve ser anunciado como central WhatsApp real até a homologação do provedor.
