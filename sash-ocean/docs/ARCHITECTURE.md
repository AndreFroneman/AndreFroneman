# SASH Ocean — Architecture

## 1. System context

```
   Offshore platforms / coastal sites / vessels                 External OSINT & licensed data
 ┌──────────────────────────────────────────┐        ┌─────────────────────────────────────────┐
 │ SASH OCEAN EDGE                          │        │ AIS (AISStream, licensed sat-AIS)       │
 │  AIS rx · radar · EO/IR · RF/SDR · wx    │        │ Incidents (NGA ASAM, analyst import)    │
 │  adapters → local rules → SQLite queue   │        │ Sanctions (OFAC SDN) · Weather          │
 │  (store & forward, link-aware priority)  │        │ Risk zones (analyst / licensed)         │
 └───────────────────┬──────────────────────┘        └──────────────────┬──────────────────────┘
                     │ TLS · API key (SENSOR role) · gzip               │ connectors (env-configured)
                     ▼                                                  ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────┐
 │ INGESTION  /v1/ingest/ais · /v1/ingest/sensor-observations · connector framework          │
 │   validation · identity resolution · provenance stamping · idempotency (dedup keys)       │
 ├────────────────────────────────────────────────────────────────────────────────────────────┤
 │ NORMALISATION → EVENT BUS (Redis Streams today; Kafka/Redpanda interface-compatible)       │
 ├───────────────────────────────┬────────────────────────────────────────────────────────────┤
 │ STORAGE  PostgreSQL + PostGIS │ FUSION  contacts · gating · noisy-OR correlation           │
 │  append-only observations     │  UNIDENTIFIED MARITIME CONTACT when nothing correlates     │
 ├───────────────────────────────┴────────────────────────────────────────────────────────────┤
 │ ANALYTICS  voyages · AIS gaps · loitering · route deviation · stops · zone exposure ·      │
 │            incident proximity · asset proximity                                            │
 ├────────────────────────────────────────────────────────────────────────────────────────────┤
 │ RISK ENGINE  config-driven rules · point-in-time · explainable contributors · history      │
 ├────────────────────────────────────────────────────────────────────────────────────────────┤
 │ ALERT ENGINE  idempotent alerts · O/I/A evidence · analyst actions · webhook               │
 ├────────────────────────────────────────────────────────────────────────────────────────────┤
 │ API  FastAPI /v1 (OpenAPI) · JWT + API keys · RBAC · entitlements · rate limits · audit    │
 └──────────────┬───────────────────────────────────────────────────┬─────────────────────────┘
                ▼                                                   ▼
      Dashboard (React/MapLibre via Nginx TLS gateway)     Customer API (X-API-Key, ENTERPRISE)
```

## 2. Runtime components (docker-compose)

| Service | Image | Role |
|---|---|---|
| `db` | postgis/postgis:16-3.4 | System of record; spatial indexes (GIST) on every geometry |
| `redis` | redis:7 | Rate-limit counters, event bus (Streams); no persistence required |
| `api` | `sash-ocean/api` | FastAPI; runs migrations at start; `/health`, `/metrics` |
| `worker` | `sash-ocean/api` | Demo feed release, connectors, scheduled analytics, demo seeding; metrics on :9101 |
| `tls-init` | `sash-ocean/api` | One-shot: creates a self-signed dev certificate if none is supplied |
| `web` | `sash-ocean/web` | Unprivileged Nginx: static UI, reverse proxy, TLS, CSP, request limits |
| `prometheus`, `grafana` | upstream | Metrics and the provisioned *Platform Operations* dashboard |

Networks: `frontend` (web ↔ api) and `backend` (api, worker, db, redis, monitoring). The
database and Redis are never published; Prometheus/Grafana bind to 127.0.0.1 only.

## 3. Data model (PostGIS)

| Table | Notes |
|---|---|
| `vessels` | Identity + latest state + cached current risk. Unique `(mmsi, data_mode)` so LIVE and SYNTHETIC records never merge. Field-level provenance JSON |
| `ais_observations` | **Append-only** (DB trigger rejects UPDATE). Raw message kept in `raw` |
| `incidents` | 15 categories, casualties/boarding/hijacking/weapons, verification status, provenance |
| `risk_zones` | `MULTIPOLYGON`, severity, category, effective period (zones may overlap) |
| `zone_exposures` | Entry/exit (interpolated), duration, distance, max threat level |
| `ais_gap_events`, `loitering_events`, `route_deviation_events`, `stop_events`, `asset_proximity_events` | Each stores `observation_text` and `inference_text` separately |
| `incident_proximities` | Vessels within 25/50/100/250 km at incident time (interpolated position) |
| `risk_assessments` | Score, band, components, contributors (O/I/A + evidence refs), confidence, model version, **config hash** |
| `alerts` | Severity, evidence list, risk before/after, recommended analyst action, status, dedup key |
| `watchlists`, `watchlist_items` | VESSEL / IMO / MMSI / FLEET (operator) / AREA (polygon) |
| `offshore_assets` | Security + monitoring radius, authorised vessels |
| `sensors`, `edge_nodes`, `sensor_observations` (append-only), `contacts`, `contact_observations`, `correlation_hypotheses` | Generic sensing + fusion evidence |
| `data_sources` | Registry: licensing category, redistribution rights, health |
| `audit_log` | Append-only; every mutating call, API-key call, login, export |
| `environment_observations`, `sanctions_entries`, `ports`, `voyages`, `analytics_runs`, `synthetic_feed_queue` | Supporting data |

## 4. Observation → Inference → Assessment

This separation is enforced in storage and in the UI:

- **Observation** — what the data shows (`AIS signal absent for 3h 14m`), stored on the event.
- **Inference** — cautious interpretation (`unexpected reporting gap; cause undetermined`),
  stored on the event. Inference text never asserts intent.
- **Assessment** — the effect on the indicator (`+12 vessel behaviour`), stored on the
  risk-assessment contributor, together with references to the evidence records.

## 5. Analytics pipeline

`app/services/pipeline.py`, run by the worker every `SASH_ANALYTICS_INTERVAL` seconds and on
demand (`POST /v1/admin/analytics/run`).

1. Load each vessel's recent track (14 days + margin) — pure-Python detectors run on it.
2. Replace the vessel's derived rows. Event IDs are **uuid5 of the natural key**, so reruns
   produce identical IDs and alert references stay valid.
3. Compute hourly risk history with the risk engine (point-in-time), the current assessment
   and trend; cache the current score on the vessel.
4. Build alerts; insert with `ON CONFLICT (dedup_key) DO NOTHING` → idempotent, analyst
   acknowledgements survive recomputation.
5. Compute incident proximity bands; run sensor association/correlation (fusion).

A PostgreSQL advisory lock guarantees one analytics run (and one demo seed) at a time
across processes.

**Scaling path.** The MVP recomputes a rolling window, which is simple and correct for
hundreds of vessels. For live global AIS: partition `ais_observations` by time (or move to
TimescaleDB hypertables), consume `sash.observations.*` from the event bus with per-vessel
incremental detectors (gap/loiter state machines are already stream-friendly), and
recompute risk only for vessels with new observations or new nearby intelligence.

## 6. Event bus

`app/core/eventbus.py` exposes `publish(topic, event)` / `recent(topic)`. The MVP uses Redis
Streams (bounded length) with an in-memory fallback. Producers (ingestion) don't know the
backend, so Kafka/Redpanda can replace Redis for high-volume sensor streams without code
changes outside that module.

## 7. Fusion

`app/fusion/correlator.py`:

1. **Association** — detections become contacts by sensor track ID, otherwise by
   spatio-temporal gating whose radius grows with the detection's position uncertainty
   (so an RF emitter fix joins the radar track it belongs to).
2. **Correlation** — for each detection, AIS positions are interpolated to the detection
   time; a pair score combines Gaussian position likelihood (σ from uncertainty) with speed
   and course consistency; per-sensor best scores are weighted by sensor trust and combined
   by noisy-OR across independent sensors.
3. Best hypothesis ≥ 0.6 → *probable identity* (`CORRELATED`), otherwise
   **UNIDENTIFIED MARITIME CONTACT**. All hypotheses and raw observations are retained.
   Analysts can confirm or clear an identity (`POST /v1/contacts/{id}/confirm`).

This is deliberately simple (nearest-neighbour gating, no Kalman tracking); it defines the
data contracts a proper multi-target tracker will plug into.

## 8. Frontend

React 18 + TypeScript + MapLibre GL 6, no UI framework. The basemap is bundled (Natural
Earth, public domain) so the dashboard works air-gapped. Layout: left (search, watchlists,
layers & filters, tools), centre (map), right (intelligence panel), top (search, threat
status, alerts, user), bottom (72 h timeline; replay controls + risk chart in replay mode).
The UI polls every 30 s; the demo feed moves vessels every minute.

## 9. Architectural decisions (ADR log)

| # | Decision | Rationale |
|---|---|---|
| 1 | PostGIS as the single system of record | Spatial queries (zones, proximity) + relational integrity; simple ops for an MVP |
| 2 | Detectors and risk engine in pure Python over in-memory context | Testable without a database; identical code for live, history and replay |
| 3 | Point-in-time risk evaluation (knowledge time = max(occurred, reported)) | Honest replay, no hindsight leakage, auditability |
| 4 | Weights/thresholds in YAML with a config hash stored per result | Explainability and reproducibility; change control without code releases |
| 5 | Strict LIVE vs SYNTHETIC separation (`data_mode`, `is_synthetic`, licensing category) | Never silently mix provenance; demo can never contaminate live assessments |
| 6 | Append-only evidence tables enforced by DB triggers | Raw observations and audit trail cannot be rewritten |
| 7 | Deterministic event IDs + dedup keys | Idempotent recomputation; stable alert references and analyst status |
| 8 | Generic CONTACT + SENSOR model, one observation pipeline | Radar/EO/RF/satellite/quantum sensors join without redesign |
| 9 | Redis Streams behind an EventBus interface | Cheap now; Kafka/Redpanda later without touching producers |
| 10 | Built-in JWT/API-key auth (MFA-ready) instead of Keycloak in the MVP | Fewer moving parts; claims model maps cleanly onto OIDC later |
| 11 | Offline Natural Earth basemap | Works in air-gapped / restricted maritime operations centres |
| 12 | Simulated live feed via `synthetic_feed_queue` through the real ingestion path | Demo exercises production code paths |
