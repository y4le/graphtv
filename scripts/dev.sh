#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5175}"
TAILNET_TARGET_HOST="${TAILNET_TARGET_HOST:-127.0.0.1}"
TAILNET_PATH="${TAILNET_PATH:-/graphtv}"
TAILNET_EXPOSE="${TAILNET_EXPOSE:-1}"
TAILSCALE_DNS_NAME=""

prepare_client_secrets() {
  echo "[dev] preparing client-side provider credentials."
  (
    cd "$REPO_ROOT"
    npm run prepare:client-secrets
  )
}

detect_tailscale_dns_name() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi

  tailscale status --json 2>/dev/null | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      try {
        const dnsName = JSON.parse(raw)?.Self?.DNSName ?? "";
        process.stdout.write(dnsName.replace(/\.$/, ""));
      } catch {}
    });
  '
}

configure_vite_allowed_hosts() {
  local dns_name=""

  dns_name="$(detect_tailscale_dns_name || true)"
  if [[ -z "$dns_name" ]]; then
    return 0
  fi

  TAILSCALE_DNS_NAME="$dns_name"
  if [[ -n "${__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS:-}" ]]; then
    export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS},${dns_name}"
  else
    export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="$dns_name"
  fi
}

expose_on_tailnet() {
  if [[ "$TAILNET_EXPOSE" == "0" ]]; then
    echo "[dev] tailnet exposure disabled (TAILNET_EXPOSE=0)."
    return 0
  fi

  if [[ -z "$TAILSCALE_DNS_NAME" ]]; then
    echo "[dev] Tailscale is unavailable; starting the local server only." >&2
    return 0
  fi

  if ! command -v tailnet-dev-host >/dev/null 2>&1; then
    echo "[dev] tailnet-dev-host is unavailable; starting the local server only." >&2
    return 0
  fi

  if tailnet-dev-host expose \
    --name graphtv \
    --repo "$REPO_ROOT" \
    --path "$TAILNET_PATH" \
    --host "$TAILNET_TARGET_HOST" \
    --port "$PORT"; then
    echo "[dev] tailnet URL: https://${TAILSCALE_DNS_NAME}${TAILNET_PATH}/"
    echo "[dev] remove route: tailnet-dev-host unexpose --name graphtv --repo ${REPO_ROOT} --path ${TAILNET_PATH}"
  else
    echo "[dev] tailnet exposure failed; the local server will still start." >&2
  fi
}

if [[ "$TAILNET_PATH" != /* || "$TAILNET_PATH" == "/" || "$TAILNET_PATH" == */ ]]; then
  echo "[dev] TAILNET_PATH must be a non-root path without a trailing slash (received ${TAILNET_PATH})." >&2
  exit 1
fi

prepare_client_secrets
configure_vite_allowed_hosts
expose_on_tailnet

# Tailscale Serve strips the matched path before proxying. Vite still needs the
# public path to generate browser URLs, so vite.config.js restores it internally.
export GRAPHTV_DEV_PATH="$TAILNET_PATH"

echo "[dev] local URL: http://${HOST}:${PORT}${TAILNET_PATH}/"
echo "[dev] using a strict Vite port; set PORT=... to choose another."

exec "$REPO_ROOT/node_modules/.bin/vite" \
  --host "$HOST" \
  --port "$PORT" \
  --strictPort \
  --clearScreen false \
  "$@"
