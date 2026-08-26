#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/mago-bot.com}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "ERRO: crie $APP_DIR/.env antes do deploy" >&2
  exit 1
fi

mkdir -p backups
cp .env "backups/.env.$(date +%Y%m%d-%H%M%S)"

git fetch --prune origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build:production

if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrRestart deploy/mago-bot.ecosystem.config.cjs --update-env
  pm2 save
else
  echo "ERRO: PM2 não encontrado. Instale o gerenciador Node pelo aaPanel antes de iniciar." >&2
  exit 1
fi

curl --fail --silent --show-error http://127.0.0.1:3080/login >/dev/null
echo "Deploy concluído e /login respondeu em 127.0.0.1:3080"
