#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 server that will run RexOps.
#
#   sudo bash server-setup.sh ops.example.com
#
# Works on DigitalOcean, Hetzner, Lightsail and Oracle Cloud (including its free Arm servers).
# Installs Docker, opens ports 22/80/443, adds swap (image builds need the memory), creates
# /opt/rexops and writes /opt/rexops/.env.production with fresh random secrets. Safe to re-run:
# an existing .env.production is never overwritten. The code itself arrives via the GitHub
# "Deploy" workflow, which copies the repo here and starts the containers.
set -euo pipefail

DOMAIN="${1:-}"
APP_DIR=/opt/rexops
DEPLOY_USER="${SUDO_USER:-root}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: sudo bash server-setup.sh <domain, e.g. ops.example.com>" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run this with sudo." >&2
  exit 1
fi

echo "==> Firewall: allowing SSH, HTTP and HTTPS"
if [[ -f /etc/iptables/rules.v4 ]]; then
  # Oracle Cloud's Ubuntu images ship iptables rules that reject everything except SSH, and
  # Oracle advises against ufw on them. Open 80/443 in those rules instead. (Oracle also needs
  # ports 80 and 443 opened in the VCN security list, in the web console.)
  for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
    # shellcheck disable=SC2086
    iptables -C INPUT $rule -m state --state NEW -j ACCEPT 2>/dev/null ||
      iptables -I INPUT 1 $rule -m state --state NEW -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then
    netfilter-persistent save >/dev/null
  else
    iptables-save >/etc/iptables/rules.v4
  fi
elif command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
if [[ "$DEPLOY_USER" != "root" ]]; then
  usermod -aG docker "$DEPLOY_USER"
fi
apt-get install -y --no-install-recommends rsync >/dev/null

echo "==> Swap (2 GB) so image builds don't run out of memory"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> App directory $APP_DIR"
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

ENV_FILE="$APP_DIR/.env.production"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> $ENV_FILE already exists; leaving it alone"
else
  echo "==> Writing $ENV_FILE with fresh secrets"
  secret() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }
  PG_PASSWORD="$(secret)"
  ORIGIN="https://$DOMAIN"
  cat >"$ENV_FILE" <<EOF
SITE_ADDRESS=$DOMAIN
PUBLIC_ORIGIN=$ORIGIN

NODE_ENV=production
API_PORT=3000
API_URL=$ORIGIN
WEB_URL=$ORIGIN
BETTER_AUTH_URL=$ORIGIN

POSTGRES_PASSWORD=$PG_PASSWORD
BETTER_AUTH_SECRET=$(secret)
LOCAL_STORAGE_SIGNING_SECRET=$(secret)
DATABASE_URL=postgres://rexops:$PG_PASSWORD@postgres:5432/rexops
DATABASE_URL_UNPOOLED=postgres://rexops:$PG_PASSWORD@postgres:5432/rexops
REDIS_URL=redis://redis:6379

LOCAL_STORAGE_DIRECTORY=/app/.data/object-storage
MEDIA_WORKER_CONCURRENCY=2
NOTIFY_WORKER_CONCURRENCY=8
AUTOMATION_WORKER_CONCURRENCY=4
OPENFEATURE_PROVIDER=memory

FEATURE_FILES_VERSIONING=true
FEATURE_REVIEW_WEDGE=true
FEATURE_WORK_VIEWS=false
FEATURE_AUTOMATION=false
FEATURE_ANALYTICS=false
FEATURE_COLLABORATION_LIVE=false

# Optional services; see .env.production.example in the repo.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=
LIVEBLOCKS_SECRET_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
VITE_VAPID_PUBLIC_KEY=
POSTHOG_KEY=
SENTRY_DSN=
VITE_SENTRY_DSN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=rexops-media
R2_ENDPOINT=
R2_PUBLIC_BASE_URL=
EOF
  chmod 600 "$ENV_FILE"
  chown "$DEPLOY_USER":"$DEPLOY_USER" "$ENV_FILE"
fi

cat <<EOF

Server is ready.
  - Point a DNS A record for $DOMAIN at this server's IP address.
  - In GitHub, run the "Deploy" workflow (or merge to main) to ship the app here.
  - Then create your login once:  see docs/runbooks/deploy.md, step 5.
EOF
