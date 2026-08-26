#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/mago-bot.com/mago-bot"
STATE_DIR="/var/lib/mago-bot"
STATE_FILE="$STATE_DIR/health.state"
LOG_TAG="mago-bot-health"
URL="${MAGO_BOT_HEALTH_URL:-https://mago-bot.com/api/health}"
TIMEOUT="${MAGO_BOT_HEALTH_TIMEOUT:-15}"

mkdir -p "$STATE_DIR"
chmod 750 "$STATE_DIR"

read_env_value() {
  local key="$1"
  if [[ -r "$APP_DIR/.env" ]]; then
    sed -n -E "s/^${key}=//p" "$APP_DIR/.env" | tail -n 1
  fi
}

ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-$(read_env_value ALERT_WEBHOOK_URL)}"
previous="unknown"
if [[ -r "$STATE_FILE" ]]; then
  previous="$(cat "$STATE_FILE" 2>/dev/null || true)"
fi

body_file="$(mktemp)"
trap 'rm -f "$body_file"' EXIT
http_code="000"
if http_code="$(curl -ksS --max-time "$TIMEOUT" -o "$body_file" -w '%{http_code}' "$URL" 2>/dev/null)" \
  && [[ "$http_code" == "200" ]] \
  && grep -q '"ok":true' "$body_file" \
  && grep -q '"database":true' "$body_file" \
  && grep -q '"redis":true' "$body_file"; then
  current="healthy"
else
  current="unhealthy"
fi

printf '%s\n' "$current" > "$STATE_FILE"
chmod 640 "$STATE_FILE"
logger -t "$LOG_TAG" "status=$current previous=$previous http=$http_code"

if [[ "$current" != "$previous" && -n "$ALERT_WEBHOOK_URL" ]]; then
  if [[ "$current" == "healthy" ]]; then
    message="Mago Bot recuperado: health=200, banco e Redis saudáveis."
  else
    message="Mago Bot com falha: health=$http_code ou banco/Redis indisponível. Verifique PM2, logs e o runbook de incidentes."
  fi
  payload=$(printf '{"text":"%s"}' "$message")
  curl -ksS --max-time 10 -X POST -H 'Content-Type: application/json' --data "$payload" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || logger -t "$LOG_TAG" "alert_delivery=failed"
fi

[[ "$current" == "healthy" ]]
