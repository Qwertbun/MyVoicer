#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-run}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
NETWORK_MODE="${NETWORK_MODE:-server}"
STAGING="${STAGING:-0}"
CERTBOT_BIN="${CERTBOT_BIN:-certbot}"

print_usage() {
  cat <<'EOF'
Usage:
  DOMAIN=voice.example.com EMAIL=admin@example.com ./scripts/certbot-https-linux.sh [run|issue|start]

Modes:
  run    Issue/renew Let's Encrypt cert (standalone) and start HTTPS backend on PORT (default: 3001).
  issue  Issue/renew cert only.
  start  Start HTTPS backend with existing cert only.

Environment:
  DOMAIN         Required for run/issue/start.
  EMAIL          Required for run/issue.
  PORT           HTTPS backend port (default: 3001).
  HOST           Backend bind host (default: 0.0.0.0).
  NETWORK_MODE   server | p2p | relay (default: server).
  STAGING        1 to use Let's Encrypt staging endpoint (default: 0).
  CERTBOT_BIN    Certbot command name/path (default: certbot).
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[certbot-linux] missing command: $cmd" >&2
    exit 1
  fi
}

normalize_network_mode() {
  case "${1}" in
    server|p2p|relay) echo "${1}" ;;
    *)
      echo "[certbot-linux] invalid NETWORK_MODE='${1}'. Allowed: server, p2p, relay." >&2
      exit 1
      ;;
  esac
}

ensure_certbot_installed() {
  if command -v "$CERTBOT_BIN" >/dev/null 2>&1; then
    return
  fi

  echo "[certbot-linux] certbot is not installed."
  echo "[certbot-linux] install example (Ubuntu/Debian): sudo apt-get update && sudo apt-get install -y certbot"
  exit 1
}

ensure_port80_free() {
  require_cmd ss
  if ss -ltn '( sport = :80 )' | grep -q ":80"; then
    echo "[certbot-linux] port 80 is busy. Stop nginx/apache/other service and retry." >&2
    exit 1
  fi
}

issue_certificate() {
  if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
    echo "[certbot-linux] DOMAIN and EMAIL are required for certificate issue." >&2
    print_usage
    exit 1
  fi

  ensure_certbot_installed
  ensure_port80_free

  local certbot_args=(
    certonly
    --standalone
    --preferred-challenges http
    --non-interactive
    --agree-tos
    --email "$EMAIL"
    --cert-name "$DOMAIN"
    -d "$DOMAIN"
    --keep-until-expiring
  )

  if [[ "$STAGING" == "1" ]]; then
    certbot_args+=(--staging)
  fi

  echo "[certbot-linux] requesting certificate for $DOMAIN ..."
  "$CERTBOT_BIN" "${certbot_args[@]}"
  echo "[certbot-linux] certificate is ready."
}

start_https_backend() {
  if [[ -z "$DOMAIN" ]]; then
    echo "[certbot-linux] DOMAIN is required for start mode." >&2
    print_usage
    exit 1
  fi

  local normalized_mode
  normalized_mode="$(normalize_network_mode "$NETWORK_MODE")"

  local cert_path="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  local key_path="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

  if [[ ! -f "$cert_path" || ! -f "$key_path" ]]; then
    echo "[certbot-linux] certificate files not found:" >&2
    echo "  $cert_path" >&2
    echo "  $key_path" >&2
    echo "[certbot-linux] run issue/run mode first." >&2
    exit 1
  fi

  echo "[certbot-linux] starting HTTPS backend on ${HOST}:${PORT} (mode=${normalized_mode})"
  export SSL_CERT_PATH="$cert_path"
  export SSL_KEY_PATH="$key_path"
  export PORT="$PORT"
  export HOST="$HOST"
  export NETWORK_MODE="$normalized_mode"

  exec node "$REPO_ROOT/scripts/run-web-server.js" "$normalized_mode"
}

case "$MODE" in
  run)
    issue_certificate
    start_https_backend
    ;;
  issue)
    issue_certificate
    ;;
  start)
    start_https_backend
    ;;
  -h|--help|help)
    print_usage
    ;;
  *)
    echo "[certbot-linux] unknown mode: $MODE" >&2
    print_usage
    exit 1
    ;;
esac
