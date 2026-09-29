#!/usr/bin/env sh
# Generates .env with strong random secrets for a local SASH Ocean deployment.
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ] && [ "${1:-}" != "--force" ]; then
  echo ".env already exists (use --force to regenerate)"; exit 0
fi
rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
ADMIN="Adm-$(rand 14)1a"
ANALYST="Ana-$(rand 14)1a"
CUSTOMER="Cus-$(rand 14)1a"
sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rand 32)|" \
    -e "s|^SASH_JWT_SECRET=.*|SASH_JWT_SECRET=$(rand 64)|" \
    -e "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(rand 20)|" \
    -e "s|^SASH_DEMO_ADMIN_PASSWORD=.*|SASH_DEMO_ADMIN_PASSWORD=$ADMIN|" \
    -e "s|^SASH_DEMO_ANALYST_PASSWORD=.*|SASH_DEMO_ANALYST_PASSWORD=$ANALYST|" \
    -e "s|^SASH_DEMO_CUSTOMER_PASSWORD=.*|SASH_DEMO_CUSTOMER_PASSWORD=$CUSTOMER|" \
    .env.example > .env
chmod 600 .env
cat <<MSG
Created .env with random secrets (mode 600).

Demo logins (http://localhost:8080):
  admin@sash.demo     $ADMIN
  analyst@sash.demo   $ANALYST
  customer@sash.demo  $CUSTOMER
Grafana (http://localhost:3000): admin / see GRAFANA_ADMIN_PASSWORD in .env
MSG
