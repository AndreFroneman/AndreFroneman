# syntax=docker/dockerfile:1.7
# Stage 1: build the React/MapLibre dashboard.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Stage 2: hardened, unprivileged Nginx gateway (static UI + reverse proxy + TLS).
FROM nginxinc/nginx-unprivileged:1.27-alpine
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/sash.conf /etc/nginx/conf.d/sash.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/proxy.conf /etc/nginx/snippets/proxy.conf
COPY nginx/10-sash-tls.sh /docker-entrypoint.d/10-sash-tls.sh
COPY --from=build /src/dist /usr/share/nginx/html
RUN chmod 0755 /docker-entrypoint.d/10-sash-tls.sh && mkdir -p /etc/nginx/certs && touch /etc/nginx/snippets/force-https.conf \
    && chown -R nginx:nginx /etc/nginx/certs /etc/nginx/snippets
USER nginx
EXPOSE 8080 8443
