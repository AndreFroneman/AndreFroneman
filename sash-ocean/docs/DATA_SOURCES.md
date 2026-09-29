# Data Sources, Licensing and Provenance

## Principles

1. **Legitimate sources only.** Public/open data, public-government data, licensed
   commercial feeds, customer data and SASH's own sensors. No scraping of protected systems.
2. **Respect terms.** API terms, copyright, rate limits and redistribution restrictions are
   recorded per source (`data_sources.redistribution_allowed`, `terms_url`, `notes`).
3. **Credentials only via environment variables** (`AIS_API_KEY=` …). Nothing in source control.
4. **Provenance on every record**: source, source type, licensing category, retrieval
   time, original timestamp, confidence, synthetic flag. Vessel identity fields also keep
   field-level provenance.
5. **Never mix provenance silently.** LIVE and SYNTHETIC worlds are stored side by side but
   never combined: a vessel's risk only uses intelligence of its own data mode; a live AIS
   message can never attach to a synthetic vessel (unique `(mmsi, data_mode)`).
6. **Never fabricate live information.** Demo data is synthetic, fictional and labelled.

## Licensing categories

| Category | Meaning |
|---|---|
| `OPEN` | Openly licensed data |
| `PUBLIC-GOVERNMENT` | Government publications (e.g. NGA ASAM, OFAC SDN) |
| `PUBLIC-OSINT` | Public OSINT (news, advisories) curated by analysts |
| `COMMERCIAL-LICENSED` | Paid/licensed feeds (satellite AIS, commercial weather, zone products) |
| `CUSTOMER` | Customer-supplied data (fleet lists, assets, own incidents) |
| `SASH-SENSOR` | SASH Edge / customer sensor networks |
| `SYNTHETIC-DEMO` | Generated demonstration data — never real |

## Connectors (backend/app/connectors)

| Key | Source | Category | Enable | Notes |
|---|---|---|---|---|
| `demo-synthetic-*` | SASH generator | SYNTHETIC-DEMO | `SASH_DEMO_MODE=true` | 23 vessels, 29 incidents, 8 zones, 6 assets, sensors, sea state |
| `aisstream` | AISStream.io websocket | PUBLIC-OSINT | `AIS_API_KEY` | Terrestrial AIS in `AISSTREAM_BBOX` (S,W,N,E); check provider terms before commercial redistribution |
| `nga-asam` | NGA MSI Anti-Shipping Activity Messages | PUBLIC-GOVERNMENT | `SASH_CONNECTOR_NGA_ASAM=true` | US Government public domain; categories mapped by keyword; stored as PARTIALLY_VERIFIED |
| `ofac-sdn` | OFAC SDN list (vessel entries) | PUBLIC-GOVERNMENT | `SASH_CONNECTOR_OFAC_SDN=true` | Compliance screening in the vessel profile only; **not** a security-risk input |
| `open-meteo-marine` | Open-Meteo Marine API | OPEN / COMMERCIAL-LICENSED | `SASH_CONNECTOR_OPEN_METEO=true` (+ `OPEN_METEO_API_KEY` for commercial use) | Free tier is non-commercial; wave height at lane nodes every 3 h |
| `analyst-import` | Analyst / customer CSV & JSON | CUSTOMER / PUBLIC-OSINT | always | `POST /v1/incidents`, `/v1/incidents/import`, `/v1/risk-zones` |
| `edge:<node>` | SASH Edge nodes | SASH-SENSOR | SENSOR API key | Created automatically on first upload |

Other valuable sources to license rather than scrape: ICC IMB Piracy Reporting Centre
(reports are copyrighted — use via agreement or analyst summarisation with attribution),
UKMTO / MSCHOA / MDAT-GoG advisories (analyst-curated), JWC Listed Areas (publicly
published by the LMA; load as zones with attribution), satellite AIS (Spire, exactEarth/
Kpler, ORBCOMM), IHS/S&P vessel registries, ACLED maritime-conflict events.

### Incident CSV import format

Header row with any of: `occurred_at, lat, lon, category, title, narrative, source_name,
source_url, source_reference, licensing_category, confidence, verification_status,
affected_vessel_name, imo, mmsi, fatalities, injuries, hostages, boarding, hijacking,
weapons_reported, reported_at`. `category` ∈ piracy, armed_robbery, hijacking,
suspicious_approach, kidnapping, boarding, maritime_conflict, drone_attack, missile_attack,
mine, sabotage, collision, grounding, cargo_theft, infrastructure_incident.

## Synthetic demonstration data

- Names, operators (suffix "(DEMO)"), incidents ("(synthetic)"), zones and assets are
  fictional; zones are *demonstration assessments*, not official designations.
- Synthetic IMO numbers use the `1xxxxxx` range with valid check digits (outside the ship
  numbers in use); synthetic MMSIs use `<MID>99xxxx`. They may still coincide with real
  identifiers, which is why synthetic records are isolated by `data_mode` and flagged
  everywhere in the UI, API (`synthetic: true`) and reports.
- Timestamps are generated relative to seed time; the worker reseeds automatically once the
  queued future feed (24 h) is exhausted or data is older than `SASH_DEMO_RESEED_HOURS`.

## Adding a connector

Subclass `Connector` (`app/connectors/base.py`): implement `enabled()` (env-driven) and
`run_once(db)`, normalise into SASH models through `app/services/ingest.py` (AIS) or the ORM
with full provenance, register a `DataSource` row (licensing category, terms URL,
redistribution flag) and append the instance to `ALL_CONNECTORS`. Health, last success and
errors are tracked automatically and exposed in the UI and Prometheus.
