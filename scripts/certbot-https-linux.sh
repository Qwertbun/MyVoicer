#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-run}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DOMAIN="${DOMAIN:-lan.mine-souls.ru}"
EMAIL="${EMAIL:-}"
PORT="${PORT:-3001}"
HOST="${HOST:-0.0.0.0}"
NETWORK_MODE="${NETWORK_MODE:-server}"
STAGING="${STAGING:-0}"
CERTBOT_BIN="${CERTBOT_BIN:-certbot}"
CERT_SOURCE="${CERT_SOURCE:-auto}"
CERTBOT_STOP_SERVICES="${CERTBOT_STOP_SERVICES:-nginx apache2 caddy}"
CERTBOT_PRECHECK_DNS="${CERTBOT_PRECHECK_DNS:-1}"
GIT_AUTO_UPDATE="${GIT_AUTO_UPDATE:-0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-}"
GIT_RUN_NPM_CI="${GIT_RUN_NPM_CI:-1}"

STOPPED_SERVICES=()

print_usage() {
  cat <<'EOF'
Usage:
  DOMAIN=voice.example.com EMAIL=admin@example.com ./scripts/certbot-https-linux.sh [run|issue|start]

Modes:
  run    Issue/renew Let's Encrypt cert (standalone) and start HTTPS backend on PORT (default: 3001).
  issue  Issue/renew cert only.
  start  Start HTTPS backend with existing cert only.

Environment:
  DOMAIN         Domain name (default: lan.mine-souls.ru).
  EMAIL          Required for run/issue.
  PORT           HTTPS backend port (default: 3001).
  HOST           Backend bind host (default: 0.0.0.0).
  NETWORK_MODE   server | p2p | relay (default: server).
  STAGING        1 to use Let's Encrypt staging endpoint (default: 0).
  CERTBOT_BIN    Certbot command name/path (default: certbot).
  CERT_SOURCE    auto | repo | system (default: auto).
  CERTBOT_STOP_SERVICES
                Space-separated services to stop during http-01 challenge
                (default: "nginx apache2 caddy").
  CERTBOT_PRECHECK_DNS
                1 to validate DOMAIN A-record points to this host public IPv4.
  GIT_AUTO_UPDATE
                1 to auto-update repository from git before backend start (default: 0).
  GIT_REMOTE    Git remote used for auto-update (default: origin).
  GIT_BRANCH    Target branch for auto-update. Empty means current branch.
  GIT_RUN_NPM_CI
                1 to run npm ci --omit=dev after successful git pull (default: 1).
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

normalize_cert_source() {
  case "${1}" in
    auto|repo|system) echo "${1}" ;;
    *)
      echo "[certbot-linux] invalid CERT_SOURCE='${1}'. Allowed: auto, repo, system." >&2
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

get_public_ipv4() {
  if command -v curl >/dev/null 2>&1; then
    curl -4fsS https://api.ipify.org 2>/dev/null || true
    return
  fi
  echo ""
}

get_domain_a_record() {
  if command -v dig >/dev/null 2>&1; then
    dig +short A "$DOMAIN" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1
    return
  fi
  if command -v host >/dev/null 2>&1; then
    host "$DOMAIN" 2>/dev/null | awk '/has address/ { print $4; exit }'
    return
  fi
  echo ""
}

precheck_domain_points_to_host() {
  if [[ "$CERTBOT_PRECHECK_DNS" != "1" ]]; then
    return
  fi

  local public_ip
  local domain_ip
  public_ip="$(get_public_ipv4)"
  domain_ip="$(get_domain_a_record)"

  if [[ -z "$public_ip" || -z "$domain_ip" ]]; then
    echo "[certbot-linux] DNS/IP precheck skipped (cannot resolve public_ip or domain A-record)."
    return
  fi

  if [[ "$public_ip" != "$domain_ip" ]]; then
    echo "[certbot-linux] DOMAIN DNS mismatch detected." >&2
    echo "  domain: $DOMAIN" >&2
    echo "  DNS A : $domain_ip" >&2
    echo "  host IP: $public_ip" >&2
    echo "[certbot-linux] update DNS A record or run on the server behind $domain_ip." >&2
    exit 1
  fi
}

stop_challenge_services() {
  if [[ -z "${CERTBOT_STOP_SERVICES// }" ]]; then
    return
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    return
  fi

  for service in $CERTBOT_STOP_SERVICES; do
    if ! systemctl list-unit-files "${service}.service" >/dev/null 2>&1; then
      continue
    fi
    if systemctl is-active --quiet "$service"; then
      echo "[certbot-linux] stopping service: $service"
      systemctl stop "$service" || true
      if ! systemctl is-active --quiet "$service"; then
        STOPPED_SERVICES+=("$service")
      fi
    fi
  done
}

start_challenge_services() {
  if [[ "${#STOPPED_SERVICES[@]}" -eq 0 ]]; then
    return
  fi

  for service in "${STOPPED_SERVICES[@]}"; do
    echo "[certbot-linux] starting service: $service"
    systemctl start "$service" || true
  done

  STOPPED_SERVICES=()
}

issue_certificate() {
  if [[ -z "$EMAIL" ]]; then
    echo "[certbot-linux] EMAIL is required for certificate issue." >&2
    print_usage
    exit 1
  fi

  ensure_certbot_installed
  precheck_domain_points_to_host
  stop_challenge_services
  trap 'start_challenge_services' RETURN
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
  set +e
  "$CERTBOT_BIN" "${certbot_args[@]}"
  local certbot_exit="$?"
  set -e
  start_challenge_services
  trap - RETURN
  if [[ "$certbot_exit" -ne 0 ]]; then
    echo "[certbot-linux] certbot failed with exit code $certbot_exit" >&2
    exit "$certbot_exit"
  fi
  echo "[certbot-linux] certificate is ready."
}

sync_certificate_to_repo() {
  local source_cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  local source_key="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
  local target_dir="${REPO_ROOT}/certs/letsencrypt/export/${DOMAIN}"
  local target_cert="${target_dir}/fullchain.pem"
  local target_key="${target_dir}/privkey.pem"

  if [[ ! -f "$source_cert" || ! -f "$source_key" ]]; then
    echo "[certbot-linux] skip repo sync, source cert not found in /etc/letsencrypt/live/${DOMAIN}" >&2
    return
  fi

  mkdir -p "$target_dir"
  cp -f "$source_cert" "$target_cert"
  cp -f "$source_key" "$target_key"
  echo "[certbot-linux] synced certs to repo path: certs/letsencrypt/export/${DOMAIN}/"
}

resolve_certificate_paths() {
  local normalized_source="$1"
  local repo_cert="${REPO_ROOT}/certs/letsencrypt/export/${DOMAIN}/fullchain.pem"
  local repo_key="${REPO_ROOT}/certs/letsencrypt/export/${DOMAIN}/privkey.pem"
  local system_cert="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  local system_key="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"

  if [[ "$normalized_source" == "repo" ]]; then
    echo "${repo_cert}|${repo_key}"
    return
  fi

  if [[ "$normalized_source" == "system" ]]; then
    echo "${system_cert}|${system_key}"
    return
  fi

  if [[ -f "$repo_cert" && -f "$repo_key" ]]; then
    echo "${repo_cert}|${repo_key}"
    return
  fi

  echo "${system_cert}|${system_key}"
}

start_https_backend() {
  local normalized_mode
  local normalized_cert_source
  normalized_mode="$(normalize_network_mode "$NETWORK_MODE")"
  normalized_cert_source="$(normalize_cert_source "$CERT_SOURCE")"

  local resolved_pair
  resolved_pair="$(resolve_certificate_paths "$normalized_cert_source")"
  local cert_path="${resolved_pair%%|*}"
  local key_path="${resolved_pair##*|}"

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

auto_update_repo_from_git() {
  if [[ "$GIT_AUTO_UPDATE" != "1" ]]; then
    return
  fi

  require_cmd git

  local current_branch
  current_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  local target_branch="${GIT_BRANCH:-$current_branch}"

  if [[ "$current_branch" != "$target_branch" ]]; then
    echo "[certbot-linux] GIT_BRANCH='$target_branch' does not match current branch '$current_branch'." >&2
    echo "[certbot-linux] switch branch manually or clear GIT_BRANCH to use current branch." >&2
    exit 1
  fi

  echo "[certbot-linux] auto-update: fetching ${GIT_REMOTE}/${target_branch}"
  git -C "$REPO_ROOT" fetch --prune "$GIT_REMOTE"
  git -C "$REPO_ROOT" pull --ff-only "$GIT_REMOTE" "$target_branch"

  if [[ "$GIT_RUN_NPM_CI" == "1" ]]; then
    require_cmd npm
    echo "[certbot-linux] auto-update: running npm ci --omit=dev"
    (cd "$REPO_ROOT" && npm ci --omit=dev)
  fi
}

case "$MODE" in
  run)
    issue_certificate
    sync_certificate_to_repo
    auto_update_repo_from_git
    start_https_backend
    ;;
  issue)
    issue_certificate
    sync_certificate_to_repo
    ;;
  start)
    auto_update_repo_from_git
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
