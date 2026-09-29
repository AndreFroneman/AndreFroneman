# SASH Maritime Risk Indicator — Risk Model

> SASH Maritime Risk Indicators provide decision-support intelligence and do not constitute
> insurance underwriting advice. The indicator is an explainable, expert-rules heuristic with
> illustrative default weights. **It has not been actuarially validated.**

## Output

`0–100` with a band, a confidence, a 24-hour trend and the full list of contributors:

```
RISK: 80/100 (SEVERE) · trend Increasing · confidence 90%
  +20 Recent security incident nearby     (regional threat)
  +12 Inside designated risk zone         (regional threat)
  +12 AIS reporting anomaly               (vessel behaviour)
  +10 Time spent in elevated-risk areas   (voyage exposure)
   +9 Deviation from expected route       (vessel behaviour)
   +8 Historical regional incident density(regional threat)
   +5 Vessel type vulnerability           (vessel profile)
   +4 Sea state conducive to small-craft operations (environment)
```

Every contributor carries three separate statements and evidence references:

| Layer | Example |
|---|---|
| OBSERVATION | "No AIS position reports received for 4h 09m (last 22:33Z at 7.65°N 51.87°E; next 02:42Z …)" |
| INFERENCE | "Unexpected AIS reporting gap; 13 reports from 2 other vessels nearby suggest coverage was available. Cause undetermined …" |
| ASSESSMENT | "+12 vessel behaviour" |

## Bands

| Band | Floor |
|---|---|
| LOW | 0 |
| MODERATE | 25 |
| ELEVATED | 45 |
| HIGH | 65 |
| SEVERE | 85 |

## Components and caps

| Component | Cap | Rules |
|---|---|---|
| Regional threat | 45 | zone presence, recent incident proximity, incident density |
| Vessel behaviour | 30 | AIS reporting anomaly, route deviation, loitering, unexpected stop, identity inconsistency |
| Voyage exposure | 20 | time in elevated-risk areas (7 days), night transit in a threat area |
| Vessel profile | 12 | vessel-type vulnerability, low transit speed in a threat area, prior incidents |
| Environment | 8 | calm sea state, reduced visibility |

**Context gating.** Profile, environment and exposure factors describe vulnerability; they
only apply when the vessel is actually exposed — inside a designated risk zone or near a
recent incident (`context_gate_rules`). Otherwise they are listed under *not applied* with
the reason, so an analyst can still see them.

## Rules (defaults in `backend/config/risk_model.yaml`)

| Rule | Logic | Default points |
|---|---|---|
| zone_presence | Highest-severity active zone at the position | LOW 3 · MODERATE 8 · ELEVATED 12 · HIGH 16 · CRITICAL 20 |
| incident_proximity | Best incident in 30 days: tier(≤50 km 24, ≤150 km 20, ≤300 km 10) × recency (1.0 → 0.4 linearly) × category weight × 0.8 if unverified | ≤ 24 |
| incident_density | Incidents within 400 km in 90 days × 1.5 | ≤ 8 |
| ais_gap | Gap events in 48 h with anomaly confidence ≥ 0.35: 12 × min(1, conf/0.8), +3 if ongoing, +2 per extra gap | ≤ 15 |
| route_deviation | 10 × min(1, conf/0.8), 48 h | ≤ 10 |
| loitering | 8 × min(1, conf/0.8), 24 h | ≤ 8 |
| unexpected_stop | 6 × min(1, conf/0.8), 24 h | ≤ 6 |
| identity_inconsistency | 3 per issue (IMO check digit, MID ≠ flag, position discontinuity) | ≤ 6 |
| zone_exposure_time | 0.12 per hour in ELEVATED+ areas over 7 days | ≤ 10 |
| night_transit | Sun < −6° while inside ELEVATED+ area | 7 |
| vessel_type | Table by type (tankers 5, bulk/general cargo 4, …) | ≤ 5 |
| low_transit_speed | 3–15 kn while in threat context | 4 |
| vessel_incident_history | 4 per incident affecting the vessel in 2 years | ≤ 8 |
| sea_state | Wave height ≤ 1.5 m within 300 km / 9 h | 4 |
| low_visibility | Visibility ≤ 2 km | 3 |

Category weights for incidents: hijacking, kidnapping, missile/drone attack, piracy 1.0;
armed robbery, boarding, maritime conflict, mine 0.9; sabotage 0.8; suspicious approach 0.7;
cargo theft, infrastructure incident 0.5; collisions/groundings 0 (safety, not security).

## Point-in-time semantics

The engine is evaluated *as of* a time `t` using only what was knowable at `t`:

- an incident counts from `max(occurred_at, reported_at)`;
- an AIS gap counts once it exceeds its detection threshold (e.g. 4× the vessel's own
  reporting cadence after the last report);
- a route deviation / loitering / stop counts once its minimum duration has elapsed.

This makes Voyage Replay honest and lets the same engine produce current risk, the stored
hourly history and ad-hoc `GET /v1/vessels/{ref}/risk?as_of=…` evaluations.

## Anomaly confidence (examples)

AIS gaps: base 0.2 + up to 0.25 for duration beyond the adaptive threshold + 0.4 when other
vessels demonstrably kept reporting within 150 km during the gap (GOOD coverage), 0.2 when
coverage evidence is partial, 0 when unknown; −0.3 if in port. A coastal dhow gap with no
nearby reporting therefore stays below the 0.5 alert threshold — AIS silence alone is
never treated as malicious.

## Confidence and trend

Confidence starts at 0.9 and is reduced for stale positions (>6 h: −0.25), missing
environmental data (−0.05) and unknown vessel type (−0.05). Trend compares with the score
24 h earlier (±5 points → Increasing/Decreasing).

## Traceability

Each stored assessment records `model_version` and `config_hash` (SHA-256 prefix of the
YAML). Changing any weight changes the hash; historical results remain attributable to the
configuration that produced them.

## Validation roadmap

1. Accumulate outcomes (confirmed incidents, claims where customers share them) — never
   fabricated.
2. Back-test bands against outcomes by region/vessel type; calibrate weights; publish
   reliability diagrams.
3. Introduce ML components only where they remain explainable (monotonic GBMs with SHAP,
   or rules learned from data), keeping the O/I/A contract and the rules model as baseline.
4. Independent actuarial review before any underwriting-grade claim.
