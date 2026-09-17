#!/usr/bin/env bash
# Re-point the deployed RexOps stack at a new public origin.
#
#   ./scripts/set-origin.sh https://app.example.com   # domain + automatic HTTPS
#   ./scripts/set-origin.sh http://34.131.58.28       # bare IP over plain HTTP
#
# The web bundle bakes VITE_* at build time, so changing the origin rebuilds it.
set -euo pipefail

ORIGIN="${1:?usage: set-origin.sh <origin>   e.g. https://app.example.com}"
ORIGIN="${ORIGIN%/}"

case "$ORIGIN" in
  https://*) HOST="${ORIGIN#https://}"; SITE_ADDRESS="$HOST" ;;
  http://*)  HOST="${ORIGIN#http://}";  SITE_ADDRESS=":80" ;;
  *) echo "origin must start with http:// or https://" >&2; exit 1 ;;
esac

cd "$(dirname "$0")/.."
[ -f .env ] && [ -f .env.production ] || { echo "run this on the server in /opt/rexops" >&2; exit 1; }

# Portable in-place edit: rewrite key=value, appending the key if absent.
set_key() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file"; then
    local tmp; tmp="$(mktemp)"
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        "${key}="*) printf '%s=%s\n' "$key" "$value" ;;
        *) printf '%s\n' "$line" ;;
      esac
    done < "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
  chmod 600 "$file"
}

set_key .env PUBLIC_ORIGIN "$ORIGIN"
set_key .env SITE_ADDRESS "$SITE_ADDRESS"

# Send browsers that arrive on the raw IP to the canonical origin, so an
# HTTPS-forcing browser hitting the bare address does not dead-end.
SERVER_IP="$(curl -fsS -m 3 -H 'Metadata-Flavor: Google' \
  http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || true)"
if [ -n "$SERVER_IP" ] && [ "$SERVER_IP" != "$HOST" ]; then
  set_key .env LEGACY_ADDRESS "http://${SERVER_IP}"
else
  set_key .env LEGACY_ADDRESS "http://127.0.0.1:8099"
fi

set_key .env.production API_URL "$ORIGIN"
set_key .env.production WEB_URL "$ORIGIN"
set_key .env.production BETTER_AUTH_URL "$ORIGIN"

echo "==> origin set to $ORIGIN (Caddy site address: $SITE_ADDRESS)"

if [ "${SKIP_APPLY:-}" = "1" ]; then
  echo "==> SKIP_APPLY=1, not rebuilding"
  exit 0
fi

DC="docker compose -f docker-compose.prod.yml"
$DC build web
$DC up -d --force-recreate web caddy api worker

echo
echo "==> live at $ORIGIN"
if [ "$SITE_ADDRESS" != ":80" ]; then
  echo "    Caddy will fetch a Let's Encrypt certificate for $HOST on first request."
  echo "    Point the DNS A record at this server BEFORE hitting the URL, or issuance fails."
fi
