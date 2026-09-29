# Commercial Roadmap

## Positioning

SASH Ocean sells *explainable maritime security exposure*, not vessel positions. Buyers
need to know which of their assets are exposed, why, and on what evidence — in a form they
can defend to underwriters, boards, charterers and regulators.

## Product modules

| Module | Scope | Status in MVP |
|---|---|---|
| **SASH Ocean Watch** | Operations picture, watchlists, alerts, timeline | Implemented |
| **SASH Ocean Risk** | SASH Maritime Risk Indicator, area & voyage risk | Implemented (rules v0.1) |
| **SASH Ocean Intelligence** | Incidents, zones, Voyage Replay, exposure reports, WHY? | Implemented |
| **SASH Ocean API** | Customer API with keys, tiers, rate limits | Implemented |
| **SASH Ocean Sensor** | Customer radar/AIS/EO/RF integration, generic contacts | Framework implemented |
| **SASH Ocean Edge** | Offshore store-and-forward node | Reference agent implemented |
| **SASH Ocean Fusion** | Multi-sensor correlation, dark contacts | Baseline implemented |

## Tiers (entitlements implemented, billing not yet)

| Tier | For | Includes |
|---|---|---|
| COMMUNITY | Public / awareness | Incident map & zones with 72 h delay, area risk |
| PROFESSIONAL | Brokers, small fleets, security firms | Watchlists, alerts, Voyage Replay, historical exposure, voyage risk, contacts, assets |
| ENTERPRISE | Insurers, large fleets, energy majors | + Customer API, PDF/CSV reports, fleet analytics, custom feeds |
| SENSOR | Offshore operators, ports, authorities | + Sensor ingestion, edge nodes, fused contacts at their assets |

Entitlements live in `backend/config/entitlements.yaml`; billing (Stripe/contract) can
later set an organisation's tier and overrides without code changes.

## Initial customers and use cases

| Segment | Use case |
|---|---|
| Marine insurers / brokers | Portfolio exposure to war/piracy areas, per-voyage risk evidence, renewal data (historical exposure reports) |
| Fleet operators / shipping companies | Watchlists & alerts, routing decisions (voyage risk), incident proximity |
| Offshore oil & gas, offshore wind | Asset monitoring radius alerts, unidentified contacts, sensor integration |
| Ports | Approach/anchorage risk, suspicious loitering |
| Maritime security companies | Transit planning, evidence packs |
| Government maritime authorities | Regional picture, dark-contact cueing from coastal sensors |
| Fisheries / environmental organisations | Loitering and AIS-gap evidence (non-accusatory) |

Initial focus: South Africa, Namibia, Angola, Mozambique & the Channel, Madagascar, East
Africa, Somalia, Gulf of Aden, Arabian Sea, Red Sea — on a globally generic platform.

## Data moat

Every run accumulates, with provenance: voyage histories, risk-zone exposure, incident
correlations (who was within 25/50/100/250 km), behavioural anomalies, sensor observations,
risk histories under versioned configurations and — where customers share them — recorded
outcomes. The long-term asset is **VESSEL + ROUTE + LOCATION + TIME + BEHAVIOUR + THREAT +
ENVIRONMENT + OUTCOME**. Outcomes are never fabricated; the ML dataset export
(`/v1/admin/datasets/vessel-days.csv`) only contains recorded outcomes.

## Delivery phases

| Phase | Content | Status |
|---|---|---|
| 1 | Repository, Compose, PostGIS, FastAPI, React, MapLibre, auth, migrations | ✅ |
| 2 | Vessels, AIS observations, map, tracks, search | ✅ |
| 3 | Incident ingestion, incident map, risk zones, proximity | ✅ |
| 4 | Risk engine, explanations, risk history | ✅ |
| 5 | AIS gaps, loitering, route deviation (+ stops) | ✅ |
| 6 | Watchlists, alerts, offshore assets | ✅ |
| 7 | Voyage Replay, Vessel Security Profile, historical exposure | ✅ |
| 8 | Customer API, API keys, rate limiting | ✅ |
| 9 | Generic contacts, sensor abstraction, sensor observations | ✅ |
| 10 | Multi-sensor correlation framework | ✅ baseline |

### Next 6–12 months

1. **Live data**: licensed satellite AIS, curated incident feed (analyst desk + NGA ASAM +
   licensed IMB/UKMTO arrangements), JWC listed areas as zones, registry data.
2. **Calibration**: back-test the indicator against outcomes; publish methodology; advisory
   board with underwriters. No underwriting claims until independently validated.
3. **Scale**: incremental analytics on Kafka/Redpanda, time-partitioned storage.
4. **Enterprise**: Keycloak/OIDC SSO, organisation admin, billing, SLA monitoring, SOC 2.
5. **Sensor pilots**: one offshore operator (radar + AIS + EO at an FPSO) using SASH Edge
   over LEO; mTLS, signed batches, proper multi-target tracking.
6. **Explainable ML**: anomaly scoring, route prediction and regional forecasting with
   monotonic constraints and SHAP explanations, always alongside the rules baseline.
7. **Quantum programme**: research partnership only; integrates through the reserved
   sensor interface when (and if) hardware exists.
