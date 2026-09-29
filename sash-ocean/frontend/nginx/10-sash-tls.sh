#!/bin/sh
# TLS material is provided in /etc/nginx/certs (tls.crt + tls.key): either mounted by the
# operator (production) or generated once by the compose "tls-init" service (development).
set -eu
if [ ! -s /etc/nginx/certs/tls.crt ] || [ ! -s /etc/nginx/certs/tls.key ]; then
  echo "sash: ERROR - no TLS certificate in /etc/nginx/certs (mount tls.crt/tls.key or run tls-init)" >&2
  exit 1
fi

# Optional HTTP -> HTTPS redirect (production).
if [ "${SASH_FORCE_HTTPS:-false}" = "true" ]; then
  printf 'if ($scheme = http) { return 301 https://$host:%s$request_uri; }\n' "${SASH_PUBLIC_HTTPS_PORT:-443}" > /etc/nginx/snippets/force-https.conf
else
  : > /etc/nginx/snippets/force-https.conf
fi
