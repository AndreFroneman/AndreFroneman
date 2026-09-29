# Deployment

## 1. Local / demo deployment from scratch

Prerequisites: Linux, macOS or Windows (WSL2) with Docker Engine 24+ and Compose v2, 4 GB
free RAM, ~3 GB disk, ports 8080 and 8443 free (3000/9090 for monitoring on localhost).

```bash
git clone <this repository>
cd <repo>/sash-ocean
./scripts/init-env.sh           # writes .env (mode 600) with random secrets; prints demo logins
docker compose up -d --build    # builds sash-ocean/api and sash-ocean/web, starts 8 services
docker compose ps               # api should be "healthy"; tls-init "exited (0)"
docker compose logs -f worker   # wait for: "demo seed: {...}"
```

Then open http://localhost:8080 (or https://localhost:8443 — accept the self-signed
certificate). Useful commands (see `Makefile`):

```bash
make reseed       # regenerate the synthetic world now
make analytics    # run detection / risk / alerts now
make logs         # follow api, worker, web logs
docker compose down        # stop (data kept)
docker compose down -v     # stop and delete all data volumes
```

### Building behind a TLS-inspecting corporate proxy

The Dockerfiles accept an optional CA bundle as a BuildKit secret (it is never stored in
an image layer):

```bash
DOCKER_BUILDKIT=1 docker build --secret id=ca_bundle,src=/path/corp-ca.pem -t sash-ocean/api:0.1.0 backend
DOCKER_BUILDKIT=1 docker build --secret id=ca_bundle,src=/path/corp-ca.pem -t sash-ocean/web:0.1.0 frontend
docker compose up -d
```

## 2. Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | — (required) | Database password |
| `SASH_JWT_SECRET` | — (required) | ≥32 random chars; required when `SASH_ENV=production` |
| `GRAFANA_ADMIN_PASSWORD` | — (required) | Grafana admin |
| `SASH_ENV` | development | `production` enforces a strong JWT secret |
| `SASH_DEMO_MODE` | true | Synthetic demo world + UI demo badge |
| `SASH_DEMO_LIVE_FEED` | true | Release queued synthetic AIS every minute |
| `SASH_DEMO_*_PASSWORD` | random if empty | Demo account passwords (created once) |
| `SASH_DEMO_RESEED_HOURS` | 24 | Regenerate synthetic world when older than this |
| `SASH_ANALYTICS_INTERVAL` | 600 | Seconds between analytics runs |
| `SASH_HTTP_PORT` / `SASH_HTTPS_PORT` | 8080 / 8443 | Published gateway ports |
| `SASH_TLS_CN` | localhost | CN/SAN of the generated development certificate |
| `SASH_FORCE_HTTPS` | false | Redirect HTTP to HTTPS at the gateway |
| `AIS_API_KEY`, `AISSTREAM_BBOX` | empty | Enable AISStream connector / area of interest |
| `SASH_CONNECTOR_NGA_ASAM`, `SASH_CONNECTOR_OFAC_SDN`, `SASH_CONNECTOR_OPEN_METEO` | false | Optional public connectors |
| `OPEN_METEO_API_KEY` | empty | Commercial Open-Meteo endpoint |
| `SASH_ALERT_WEBHOOK_URL` | empty | POST new alerts (SOAR/Teams/Slack bridge) |
| `SASH_RATE_LIMIT_DEFAULT`, `SASH_RATE_LIMIT_LOGIN` | 600, 10 | Per-user and per-IP login limits per minute |
| `SASH_CORS_ORIGINS` | empty | Comma-separated origins (not needed behind the gateway) |

Risk weights, detection thresholds, alert rules and tier entitlements live in
`backend/config/*.yaml` (mount a directory and set `SASH_CONFIG_DIR` to override without
rebuilding).

## 3. Production checklist

- [ ] `SASH_ENV=production`, `SASH_DEMO_MODE=false`, `SASH_DEMO_SEED_ON_START=false`.
- [ ] Real TLS certificate: place `tls.crt`/`tls.key` in the `webcerts` volume or replace it
      with a bind mount (`./certs:/etc/nginx/certs:ro`); set `SASH_FORCE_HTTPS=true`; do not
      publish port 8080 (or put a load balancer in front and terminate TLS there).
- [ ] Secrets from a secret manager (Docker/K8s secrets, Vault) rather than a plain `.env`.
- [ ] Create named users (`python -m app.cli create-user`), enforce MFA enrolment; remove demo users.
- [ ] Managed PostgreSQL/PostGIS with automated backups (`pg_dump -Fc` daily + WAL archiving),
      tested restores; Redis can be ephemeral.
- [ ] Restrict Grafana/Prometheus to the ops network (they bind to 127.0.0.1 by default).
- [ ] Ship logs (JSON stdout) and the `audit_log` table to your SIEM.
- [ ] Load licensed data sources and real risk zones; review each source's redistribution terms.
- [ ] Run the CI security jobs (pip-audit, npm audit, image scan) on every release.

## 4. Upgrades and migrations

The API container runs `python -m app.cli migrate` (Alembic `upgrade head`) at start.
Create new migrations with `alembic revision --autogenerate -m "..."` inside `backend/`
(PostGIS helper tables are excluded automatically). Evidence tables are append-only;
migrations that need to rewrite them must drop and recreate the trigger explicitly.

## 5. Running without Docker

PostgreSQL 16 + PostGIS 3.4, Redis 7 (optional — falls back to in-process), Python 3.11+,
Node 22:

```bash
cd backend && pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://sash:***@db-host:5432/sash SASH_JWT_SECRET=***
python -m app.cli migrate && python -m app.cli seed-demo
uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers   # API
python -m app.cli worker                                          # worker (separate process)
cd ../frontend && npm ci && npm run build                        # serve dist/ behind Nginx using frontend/nginx/sash.conf
```

## 6. Scaling notes

- API is stateless (JWT, Redis-backed limits): run N replicas behind the gateway.
- Run exactly one worker for scheduled analytics (a PostgreSQL advisory lock also prevents
  concurrent runs). Split connectors into their own workers as volumes grow.
- For high-volume AIS: time-partition `ais_observations` (or TimescaleDB), move the event bus
  to Kafka/Redpanda, and switch analytics to the incremental path (ARCHITECTURE.md §5).

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `web` exits: "no TLS certificate" | `tls-init` failed — check `docker compose logs tls-init`, or mount a certificate |
| Map shows no land / labels | Browser blocked `/basemap/*` or `/fonts/*` — check the gateway logs |
| Map blank with "Worker failed to load" | Gateway must serve `/maplibre/*.mjs` as `text/javascript` (already configured in `frontend/nginx/sash.conf`) |
| Login says "Account temporarily locked" | 5 failed attempts → 15 min lock (configurable) |
| No vessels after start | Worker still seeding (first run ≈ 30–60 s) — `docker compose logs worker` |
| Demo data looks stale | `make reseed` |
