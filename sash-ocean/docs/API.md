# SASH Ocean API

Interactive OpenAPI documentation: **`/docs`** (Swagger UI) and **`/redoc`**; the schema is
at `/v1/openapi.json`. All endpoints are versioned under `/v1`.

## Authentication

| Method | Header | Used by |
|---|---|---|
| JWT bearer | `Authorization: Bearer <token>` | Dashboard users (ADMIN, ANALYST, CUSTOMER) |
| API key | `X-API-Key: sash_<prefix>_<secret>` | Customer integrations (API_USER), sensors/edge nodes (SENSOR) |

```bash
TOKEN=$(curl -s -X POST https://sash.example.com/v1/auth/login \
  -H 'content-type: application/json' -d '{"email":"analyst@sash.demo","password":"…"}' | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" https://sash.example.com/v1/vessels?limit=5
```

MFA (TOTP): `POST /v1/auth/mfa/enroll` → scan the `otpauth_uri`; `POST /v1/auth/mfa/activate`
with a code. Afterwards `/login` returns `{"mfa_required": true, "mfa_token": …}` and the
token is obtained with `POST /v1/auth/mfa/verify`.

API keys are issued by an ADMIN (`POST /v1/admin/api-keys`) or the CLI
(`python -m app.cli create-api-key NAME --org ORG`). The secret is shown **once**; only a
SHA-256 hash is stored. Keys can expire and be revoked. The design maps onto OAuth2 client
credentials later (a key ≙ a client with role + scopes).

## Roles, tiers and rate limits

| Role | Can |
|---|---|
| ADMIN | everything, API keys, audit log, demo reseed |
| ANALYST | all intelligence; create incidents/zones/assets; run analytics; confirm contact identity; reports |
| CUSTOMER | entitlement-gated read access, own-organisation watchlists, acknowledge alerts |
| API_USER | customer API (ENTERPRISE tier required) |
| SENSOR | ingestion and heartbeat endpoints only |

Tiers (`backend/config/entitlements.yaml`): COMMUNITY (incident map, 72 h delayed), PROFESSIONAL
(watchlists, alerts, Voyage Replay, exposure), ENTERPRISE (+ API, reports, fleet analytics),
SENSOR (+ sensor ingestion, edge nodes). Rate limits: per API key (key override or tier
default, e.g. ENTERPRISE 1,200/min), per user 600/min, login 10/min/IP; the gateway adds
per-IP limits. `429` responses include `Retry-After`.

## Endpoint overview

| Method & path | Purpose |
|---|---|
| `GET /v1/vessels` | Search/list (`q`, `vessel_type`, `min_risk`, `watchlist_id`, `bbox`) |
| `GET /v1/vessels/{ref}` | Identity + latest state. `ref` = UUID, IMO (7 digits), MMSI (9 digits) or exact name |
| `GET /v1/vessels/{ref}/track` | Raw AIS history (decimated to `max_points`) |
| `GET /v1/vessels/{ref}/risk` | Current explainable indicator; `?as_of=` recomputes point-in-time |
| `GET /v1/vessels/{ref}/risk/history` | Hourly indicator series |
| `GET /v1/vessels/{ref}/risk/at?t=` | Stored explanation at a time |
| `GET /v1/vessels/{ref}/risk/why` | Evidence timeline + contributor diff (`from`, `to`) |
| `GET /v1/vessels/{ref}/voyages` | Voyages derived from port stays |
| `GET /v1/vessels/{ref}/anomalies` | AIS gaps, loitering, deviations, stops, zone exposures, asset proximity |
| `GET /v1/vessels/{ref}/replay` | Voyage Replay bundle |
| `GET /v1/vessels/{ref}/profile` | Vessel Security Profile + 12-month exposure |
| `GET /v1/vessels/{ref}/report.pdf` · `.csv` | Historical exposure report (audited) |
| `GET /v1/incidents` · `/nearby` · `/{id}` | Incidents (tier delay applies), vessels near an incident at incident time |
| `POST /v1/incidents` · `/import` | Analyst entry (JSON / CSV) with explicit provenance |
| `GET /v1/risk-zones` · `POST /v1/risk-zones` | GeoJSON FeatureCollection; analyst creation |
| `GET /v1/area-risk?lat&lon&radius_km&days` | SASH AREA RISK |
| `POST /v1/voyage-risk` | Planned-voyage exposure |
| `GET /v1/alerts` · `POST /v1/alerts/{id}/acknowledge` · `/close` | Alerts |
| `GET/POST /v1/watchlists`, `POST /v1/watchlists/{id}/items`, `DELETE …` | Watchlists |
| `GET /v1/contacts` · `/{id}` · `POST /{id}/confirm` | Generic contacts, raw observations, hypotheses |
| `GET/POST /v1/sensors`, `POST /v1/sensors/heartbeat`, `GET /v1/edge-nodes` | Sensor abstraction |
| `POST /v1/ingest/ais` · `/v1/ingest/sensor-observations` | Ingestion (SENSOR role, gzip accepted) |
| `GET /v1/assets` · `POST /v1/assets` | Offshore assets |
| `GET /v1/timeline`, `/v1/threat-status`, `/v1/data-sources` | Operational views |
| `POST /v1/admin/analytics/run`, `/demo/reseed`; `GET /v1/admin/audit`, `/runs`, `/datasets/vessel-days.csv` | Administration & ML dataset export |
| `GET /health`, `GET /metrics` | Liveness/readiness, Prometheus (internal only) |

## Examples

### Vessel risk

```bash
curl -H "X-API-Key: $KEY" https://sash.example.com/v1/vessels/1102116/risk
```

```json
{
  "indicator": "SASH Maritime Risk Indicator",
  "score": 74, "band": "HIGH", "trend": "Increasing", "confidence": 0.9,
  "components": {"regional_threat": {"label": "Regional threat", "points": 30, "cap": 45}, "...": {}},
  "contributors": [{
    "rule": "ais_gap", "component": "vessel_behaviour", "label": "AIS reporting anomaly", "points": 12,
    "observation": "No AIS position reports received for 4h 09m (last 2026-09-21 22:33Z at 7.65°N 51.87°E; …)",
    "inference": "Unexpected AIS reporting gap; 13 reports from 2 other vessels nearby … Cause undetermined …",
    "assessment": "+12 vessel behaviour",
    "evidence": [{"type": "ais_gap", "id": "…", "label": "AIS reporting anomaly"}]
  }],
  "model_version": "0.1.0-rules", "config_hash": "f1764600c6b94d14",
  "disclaimer": "SASH Maritime Risk Indicators provide decision-support intelligence and do not constitute insurance underwriting advice. …"
}
```

### Area risk

```bash
curl -H "X-API-Key: $KEY" "https://sash.example.com/v1/area-risk?lat=12.6&lon=48.0&radius_km=250"
```

Returns `risk_indicator`, `band`, `contributors`, `risk_zones`, `recent_incidents`,
`threat_categories`, `incident_density_per_10k_km2`, `trend`, `confidence`, `sources`.

### Voyage risk

```bash
curl -X POST -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  https://sash.example.com/v1/voyage-risk \
  -d '{"origin":"Yanbu","destination":"Durban","departure_time":"2026-10-01T06:00:00Z","speed_kn":13,"vessel_type":"crude oil tanker"}'
```

Returns `overall_risk_indicator` with its explanation, `highest_risk_segments` (ETA window,
peak score, zones, why), `risk_zones_crossed` (entry/exit ETA, hours),
`recent_incidents_near_route`, `estimated_exposure_hours`, the modelled `route` (GeoJSON)
and stated assumptions.

### Sensor ingestion (edge node)

```bash
curl -X POST -H "X-API-Key: $SENSOR_KEY" -H 'content-type: application/json' \
  https://sash.example.com/v1/ingest/sensor-observations -d '{
  "sensor_code": "KESTREL-RADAR-01", "edge_node_code": "EDGE-KESTREL-01", "edge_backlog": 120,
  "observations": [{"observed_at": "2026-09-29T08:00:00Z", "dedup_key": "EDGE-KESTREL-01:42817",
    "lat": -11.33, "lon": 41.39, "position_uncertainty_m": 150, "speed_kn": 16.5, "course_deg": 315,
    "sensor_track_id": "731", "detection_type": "RADAR_PLOT", "classification": "SMALL CRAFT", "confidence": 0.7}]}'
```

Resending the same `dedup_key` is a no-op (`duplicates` counter) — safe after outages.

## Errors

Standard HTTP codes with `{"detail": "..."}`: 401 (unauthenticated), 403 (role/tier),
404, 409, 413 (payload too large), 422 (validation), 423 (account locked), 429 (rate limit).
