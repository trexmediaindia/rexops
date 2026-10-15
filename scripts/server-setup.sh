#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 or Oracle Linux 9 server that will run RexOps.
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

# Ubuntu/Debian or the Red Hat family (Oracle Linux, Rocky, AlmaLinux, RHEL).
# shellcheck disable=SC1091
. /etc/os-release
case " ${ID:-} ${ID_LIKE:-} " in
  *" ubuntu "* | *" debian "*) FAMILY=debian ;;
  *" rhel "* | *" fedora "* | *" centos "*) FAMILY=rhel ;;
  *)
    echo "Unsupported Linux (${PRETTY_NAME:-unknown}). Use Ubuntu or Oracle Linux." >&2
    exit 1
    ;;
esac
echo "==> Detected ${PRETTY_NAME:-$ID}"

# Oracle Linux images don't always grow the root filesystem to the boot volume size.
if [[ -x /usr/libexec/oci-growfs ]]; then
  echo "==> Growing the root filesystem to the full boot volume"
  /usr/libexec/oci-growfs -y >/dev/null 2>&1 || true
fi

echo "==> Firewall: allowing SSH, HTTP and HTTPS"
if [[ "$FAMILY" == rhel ]]; then
  if systemctl is-active --quiet firewalld; then
    changed=0
    for service in http https; do
      if ! firewall-cmd --permanent --query-service="$service" >/dev/null 2>&1; then
        firewall-cmd --permanent --add-service="$service" >/dev/null
        changed=1
      fi
    done
    if ! firewall-cmd --permanent --query-port=443/udp >/dev/null 2>&1; then
      firewall-cmd --permanent --add-port=443/udp >/dev/null
      changed=1
    fi
    if ((changed)); then
      firewall-cmd --reload >/dev/null
      # A reload drops Docker's own rules; restarting Docker puts them back.
      if systemctl is-active --quiet docker; then systemctl restart docker; fi
    fi
  fi
elif [[ -f /etc/iptables/rules.v4 ]]; then
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
  if [[ "$FAMILY" == rhel ]]; then
    # Docker's install script doesn't cover Oracle Linux; its CentOS repository does, on Arm too.
    dnf -y -q install dnf-plugins-core
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf -y -q install --allowerasing \
      docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    curl -fsSL https://get.docker.com | sh
  fi
fi
systemctl enable --now docker >/dev/null 2>&1
if [[ "$DEPLOY_USER" != "root" ]]; then
  usermod -aG docker "$DEPLOY_USER"
fi
if [[ "$FAMILY" == rhel ]]; then
  dnf -y -q install rsync openssl
else
  apt-get install -y --no-install-recommends rsync >/dev/null
fi

echo "==> Swap (2 GB) so image builds don't run out of memory"
if ! swapon --show | grep -q /swapfile; then
  # dd rather than fallocate: XFS (Oracle Linux's filesystem) won't swap on a fallocated file.
  dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
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
