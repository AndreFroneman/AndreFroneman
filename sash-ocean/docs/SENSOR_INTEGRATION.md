# Sensor Integration, Fusion and SASH Ocean Edge

## 1. The generic model

Not every tracked object has an MMSI. SASH separates:

- **SENSOR** — `sensor_code, type, owner, platform, position, coverage (radius/polygon),
  status, trust_level (0–1), timestamp_accuracy_ms, time_source, edge_node`. Types:
  `AIS, RADAR, RF, EO, IR, SATELLITE, ACOUSTIC, WEATHER, QUANTUM_SENSOR,
  QUANTUM_TIMING_SOURCE, OTHER`.
- **SENSOR OBSERVATION** — one detection in the common pipeline: time, position (+
  uncertainty), speed, course, heading, sensor track id, detection type, classification,
  confidence, attributes, raw payload, dedup key. Append-only.
- **CONTACT** — a tracked object built from one or more sensors' observations: position,
  velocity, classification, identity status (`UNIDENTIFIED` / `CORRELATED` / `CONFIRMED`),
  correlated vessel + confidence, detection sources, nearest AIS vessel.
- **CORRELATION HYPOTHESIS** — every candidate identity with its score and per-sensor
  evidence. Nothing used to produce a fused contact is discarded.

## 2. Integrating a sensor

1. Register it: `POST /v1/sensors` (ADMIN or SENSOR role) with type, position, coverage and
   trust. Trust should reflect calibration and sensor class (e.g. calibrated ARPA radar 0.85,
   passive RF bearing fix 0.6).
2. Issue a SENSOR-role API key for the site/edge node.
3. Stream observations to `POST /v1/ingest/sensor-observations` (≤10,000 per batch,
   `Content-Encoding: gzip` accepted). Provide a stable `dedup_key` per observation so
   resends are idempotent.
4. Send `POST /v1/sensors/heartbeat` (or keep uploading) — sensors with no heartbeat for
   15 minutes are shown as STALE and exported to Prometheus (`sash_sensor_online`).

AIS receivers use `POST /v1/ingest/ais` (decoded messages; the edge agent decodes NMEA).

## 3. Fusion (Phase 10 framework)

```
AIS:    MMSI 650991296 at X                 ┐
RADAR:  contact 728 near X (σ≈150 m)        ├─► CONTACT C-728 — probable identity MMSI 650991296 (94%)
EO:     vessel detected near X              ┘      evidence: radar 0.09 km, EO 0.05 km, speed/course consistent
RADAR+RF: contact 731, no AIS within gate   ──► UNIDENTIFIED MARITIME CONTACT (not "hostile")
```

Association gates widen with each detection's position uncertainty; correlation uses
position likelihood, speed and course consistency, weighted by sensor trust and combined
across independent sensors (noisy-OR). Threshold for a probable identity: 0.6. Analysts can
confirm/clear identities. Uncorrelated contacts inside an asset's monitoring radius raise a
`DARK_CONTACT` alert whose inference lists benign explanations (small craft without AIS
obligation, AIS off/faulty, false detection).

## 4. SASH Ocean Edge (`edge/`)

Reference implementation of an offshore node (x86/ARM, Linux, Docker):

```
 sensors ─► adapters ─► local rules ─► SQLite store-and-forward ─► uplink ─► SASH central API
 (AIS UDP/NMEA, radar,    (promote       (WAL, dedup keys,          (link profile,
  EO, RF, weather …)       near-asset     priorities EVENT >         batching, gzip,
                           → EVENT)       TRACK > RAW, bounded)      exponential backoff)
```

- **Keeps collecting during outages**: the queue is on local disk (WAL), survives restarts,
  and is bounded — when full, RAW data is pruned first, EVENTs are kept.
- **Link-aware**: profiles for `ETHERNET, MICROWAVE, PRIVATE_5G, LTE, LEO_SATELLITE,
  GEO_SATELLITE` set batch size, sync interval and which priority classes may cross the link
  (GEO satellite: events only). Satellite uploads are gzip-compressed.
- **Metadata first**: raw sensor data (video, IQ samples) stays at the edge; only detections,
  tracks and events are sent unless a good link is available.
- **Encrypted comms**: HTTPS to the central API with a SENSOR key; custom CA supported
  (`SASH_EDGE_CA_BUNDLE`). Roadmap: mTLS with per-node certificates and signed batches.
- **Local analytics**: deterministic prioritisation rules only (e.g. detections inside the
  asset's protected radius become EVENTs). No intent classification at the edge.

Run it:

```bash
cd edge && docker build -t sash-ocean/edge:0.1.0 .
docker run -d --name sash-edge -v sash-edge:/var/lib/sash-edge -p 10110:10110/udp \
  -e SASH_CENTRAL_URL=https://sash.example.com -e SASH_EDGE_API_KEY=*** \
  -e SASH_EDGE_NODE=EDGE-KESTREL-01 -e SASH_EDGE_LINK=LEO_SATELLITE \
  -e SASH_EDGE_ASSET=-11.30,41.35,12 sash-ocean/edge:0.1.0
```

Point the platform's AIS receiver NMEA UDP output at port 10110. Additional adapters
implement `SensorAdapter.poll()` and yield normalised observations.

## 5. Offshore communications

| Link | Typical use | Edge profile |
|---|---|---|
| Ethernet / fibre | Coastal sites, ports | Everything, frequent |
| Microwave / private 5G | Near-shore platforms, ports | Everything |
| LTE / 5G | Coastal, near-shore | Tracks + events |
| LEO satellite | Offshore platforms, vessels | Tracks + events, compressed |
| GEO satellite (VSAT) | Remote / backup | Events only |

Assume links are slow, expensive and intermittent: prioritise events and metadata,
compress, batch, and never lose data on disconnect.

## 6. Future quantum sensing — reserved interfaces only

`QUANTUM_SENSOR` and `QUANTUM_TIMING_SOURCE` exist as sensor types and edge adapter classes
that raise `NotImplementedError`. **SASH Ocean does not implement or claim any quantum
sensing capability.** The interface guarantees that if such a sensor is developed, it will
contribute observations through exactly the same path as radar/RF/EO:

```
QUANTUM SENSOR → SASH EDGE (adapter) → OBSERVATION API → FUSION ENGINE → risk / alerts
```

A quantum timing source would populate `time_source` / `timestamp_accuracy_ms` for
sensors that use it, improving multi-sensor association — again through existing fields.
Quantum technology is an additional capability, never a dependency.
