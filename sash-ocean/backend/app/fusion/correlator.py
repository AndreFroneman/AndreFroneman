"""Basic multi-sensor correlation framework.

1. Association: raw sensor detections (radar, EO/IR, RF, satellite, future quantum
   sensors) are grouped into CONTACTS by sensor track id and spatio-temporal gating.
2. Correlation: each contact is scored against AIS vessels whose interpolated position
   at the detection time lies inside a gate. Evidence from independent sensors is
   combined (noisy-OR, weighted by sensor trust). The best hypothesis above threshold
   becomes the contact's *probable* identity; all hypotheses are kept as evidence.
3. A contact with no AIS correlation is an UNIDENTIFIED MARITIME CONTACT — never a
   "hostile" vessel. Raw observations are never discarded.

This is intentionally simple (nearest-neighbour gating, no Kalman tracking). It is the
integration point for a proper tracker once proprietary sensors come online.
"""
from __future__ import annotations

import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.geo.core import haversine_km, interpolate_position

GATE_KM = 3.0
ASSOCIATION_GATE_KM = 2.0
ASSOCIATION_WINDOW = timedelta(minutes=20)
CORRELATION_THRESHOLD = 0.6


@dataclass
class Detection:
    obs_id: int
    sensor_id: str
    sensor_type: str
    trust: float
    ts: datetime
    lat: float
    lon: float
    uncertainty_m: float | None = None
    speed_kn: float | None = None
    course_deg: float | None = None


@dataclass
class AisCandidate:
    vessel_id: uuid.UUID
    name: str | None
    mmsi: str | None
    lat: float
    lon: float
    sog: float | None
    cog: float | None


@dataclass
class Hypothesis:
    vessel_id: uuid.UUID
    name: str | None
    mmsi: str | None
    score: float
    per_sensor: list[dict] = field(default_factory=list)


def _angle_diff(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def score_pair(det: Detection, cand: AisCandidate, gate_km: float = GATE_KM) -> tuple[float, dict]:
    d = haversine_km(det.lat, det.lon, cand.lat, cand.lon)
    sigma = max(0.3, (det.uncertainty_m or 300) / 1000.0)
    if d > max(gate_km, 3 * sigma):
        return 0.0, {"distance_km": round(d, 2), "gated_out": True}
    pos = math.exp(-0.5 * (d / sigma) ** 2)
    spd = 0.7
    if det.speed_kn is not None and cand.sog is not None:
        spd = math.exp(-0.5 * ((det.speed_kn - cand.sog) / 3.0) ** 2)
    crs = 0.7
    if det.course_deg is not None and cand.cog is not None and (cand.sog or 0) > 2:
        crs = math.exp(-0.5 * (_angle_diff(det.course_deg, cand.cog) / 30.0) ** 2)
    s = (pos ** 0.6) * (spd ** 0.2) * (crs ** 0.2)
    return s, {"distance_km": round(d, 2), "position_score": round(pos, 3), "speed_score": round(spd, 3), "course_score": round(crs, 3)}


def correlate(detections: list[Detection], candidates_by_obs: dict[int, list[AisCandidate]]) -> list[Hypothesis]:
    """Combine per-detection evidence into per-vessel hypotheses (noisy-OR over sensors)."""
    per_vessel: dict[uuid.UUID, Hypothesis] = {}
    best_by_sensor: dict[tuple[uuid.UUID, str], tuple[float, dict]] = {}
    for det in detections:
        for cand in candidates_by_obs.get(det.obs_id, []):
            s, ev = score_pair(det, cand)
            if s <= 0:
                continue
            key = (cand.vessel_id, det.sensor_id)
            weighted = s * det.trust
            if key not in best_by_sensor or weighted > best_by_sensor[key][0]:
                best_by_sensor[key] = (weighted, {**ev, "sensor_type": det.sensor_type, "time": det.ts.isoformat()})
            per_vessel.setdefault(cand.vessel_id, Hypothesis(cand.vessel_id, cand.name, cand.mmsi, 0.0))
    for (vid, sensor), (w, ev) in best_by_sensor.items():
        h = per_vessel[vid]
        h.per_sensor.append({"sensor_id": sensor, "weighted_score": round(w, 3), **ev})
    for h in per_vessel.values():
        miss = 1.0
        for p in h.per_sensor:
            miss *= 1.0 - min(0.97, p["weighted_score"])
        h.score = round(1.0 - miss, 3)
    return sorted(per_vessel.values(), key=lambda h: -h.score)


# ----------------------------------------------------------------------------------
# Database integration
# ----------------------------------------------------------------------------------
def _ais_candidates(db: Session, det: Detection, synthetic: bool) -> list[AisCandidate]:
    dlat = 15 / 111.0
    dlon = 15 / (111.0 * max(0.2, math.cos(math.radians(det.lat))))
    rows = db.execute(
        text(
            "SELECT o.vessel_id, o.ts, o.lat, o.lon, o.sog, o.cog, v.name, v.mmsi FROM ais_observations o "
            "JOIN vessels v ON v.id = o.vessel_id WHERE o.is_synthetic = :syn AND o.ts BETWEEN :t0 AND :t1 "
            "AND o.position && ST_MakeEnvelope(:w, :s, :e, :n, 4326) ORDER BY o.vessel_id, o.ts"
        ),
        {"syn": synthetic, "t0": det.ts - timedelta(minutes=45), "t1": det.ts + timedelta(minutes=45),
         "w": det.lon - dlon, "s": det.lat - dlat, "e": det.lon + dlon, "n": det.lat + dlat},
    ).all()
    by_v: dict = {}
    for r in rows:
        by_v.setdefault(r.vessel_id, []).append(r)
    out = []
    for vid, obs in by_v.items():
        before = [o for o in obs if o.ts <= det.ts]
        after = [o for o in obs if o.ts > det.ts]
        if before and after:
            a, b = before[-1], after[0]
            lat, lon = interpolate_position(det.ts, a.ts, a.lat, a.lon, b.ts, b.lat, b.lon)
            ref = a
        else:
            ref = min(obs, key=lambda o: abs((o.ts - det.ts).total_seconds()))
            lat, lon = ref.lat, ref.lon
        out.append(AisCandidate(vid, ref.name, ref.mmsi, lat, lon, ref.sog, ref.cog))
    return out


def _associate(db: Session, now: datetime) -> int:
    """Attach unlinked sensor observations to contacts (create contacts as needed)."""
    from app.models import Contact, ContactObservation

    rows = db.execute(
        text(
            "SELECT so.id, so.sensor_id, so.observed_at, so.lat, so.lon, so.speed_kn, so.course_deg, so.heading_deg, "
            "so.sensor_track_id, so.classification, so.confidence, so.is_synthetic, s.sensor_type, so.position_uncertainty_m "
            "FROM sensor_observations so JOIN sensors s ON s.id = so.sensor_id "
            "LEFT JOIN contact_observations co ON co.sensor_observation_id = so.id "
            "WHERE co.contact_id IS NULL AND so.lat IS NOT NULL AND so.observed_at > :since "
            "AND so.observed_at <= :now AND s.sensor_type <> 'WEATHER' "
            # Tracked (radar/ARPA) plots first so imprecise detections (RF bearings) join them.
            "ORDER BY so.observed_at, (so.sensor_track_id IS NULL), so.position_uncertainty_m NULLS LAST"
        ),
        {"since": now - timedelta(days=2), "now": now},
    ).all()
    if not rows:
        return 0
    active = db.scalars(select(Contact).where(Contact.last_seen > now - timedelta(days=2))).all()
    track_map: dict[tuple[str, str], Contact] = {}
    for c in active:
        for key in (c.source_sensor_ids or []):
            if isinstance(key, str) and "|" in key:
                s, t = key.split("|", 1)
                track_map[(s, t)] = c
    n_created = 0
    seq = db.execute(text("SELECT count(*) FROM contacts")).scalar() or 0
    for r in rows:
        contact = None
        if r.sensor_track_id:
            contact = track_map.get((str(r.sensor_id), r.sensor_track_id))
        if contact is None:
            # Gate widens with the detection's position uncertainty (e.g. RF emitter fixes).
            gate = max(ASSOCIATION_GATE_KM, 2.5 * (r.position_uncertainty_m or 0) / 1000.0)
            cands = [
                c for c in active
                if c.is_synthetic == r.is_synthetic and abs((r.observed_at - c.last_seen).total_seconds()) <= ASSOCIATION_WINDOW.total_seconds()
                and haversine_km(r.lat, r.lon, c.lat, c.lon) <= gate
            ]
            contact = min(cands, key=lambda c: haversine_km(r.lat, r.lon, c.lat, c.lon)) if cands else None
        if contact is None:
            seq += 1
            code = f"C-{r.sensor_track_id}" if r.sensor_track_id and r.sensor_track_id.isdigit() else f"C-{9000 + seq}"
            if db.execute(text("SELECT 1 FROM contacts WHERE contact_code = :c"), {"c": code}).first():
                code = f"{code}-{seq}"
            contact = Contact(
                id=uuid.uuid4(), contact_code=code, first_seen=r.observed_at, last_seen=r.observed_at,
                lat=r.lat, lon=r.lon, position=f"SRID=4326;POINT({r.lon} {r.lat})",
                classification=r.classification or "UNKNOWN", identity_status="UNIDENTIFIED",
                detection_confidence=r.confidence, source_types=[], source_sensor_ids=[], is_synthetic=r.is_synthetic,
            )
            db.add(contact)
            active.append(contact)
            n_created += 1
        key = f"{r.sensor_id}|{r.sensor_track_id}" if r.sensor_track_id else str(r.sensor_id)
        if key not in (contact.source_sensor_ids or []):
            contact.source_sensor_ids = [*(contact.source_sensor_ids or []), key]
            if r.sensor_track_id:
                track_map[(str(r.sensor_id), r.sensor_track_id)] = contact
        if r.sensor_type not in (contact.source_types or []):
            contact.source_types = [*(contact.source_types or []), r.sensor_type]
        if r.observed_at >= contact.last_seen:
            contact.last_seen = r.observed_at
            contact.lat, contact.lon = r.lat, r.lon
            contact.position = f"SRID=4326;POINT({r.lon} {r.lat})"
            if r.speed_kn is not None:
                contact.speed_kn = r.speed_kn
            if r.course_deg is not None:
                contact.course_deg = r.course_deg
            if r.heading_deg is not None:
                contact.heading_deg = r.heading_deg
        if r.classification and contact.classification == "UNKNOWN":
            contact.classification = r.classification
        contact.detection_confidence = max(contact.detection_confidence or 0, r.confidence or 0)
        db.flush()
        db.add(ContactObservation(contact_id=contact.id, sensor_observation_id=r.id))
    db.flush()
    return n_created


def run_fusion(db: Session, now: datetime) -> dict:
    from app.alerts.engine import AlertDraft, persist_alerts
    from app.core.yamlconfig import alert_config
    from app.models import Contact, CorrelationHypothesis, OffshoreAsset, Sensor

    created = _associate(db, now)
    contacts = db.scalars(select(Contact).where(Contact.last_seen > now - timedelta(days=1))).all()
    sensors = {s.id: s for s in db.scalars(select(Sensor)).all()}
    assets = db.scalars(select(OffshoreAsset)).all()
    rule = alert_config()["rules"]["DARK_CONTACT"]
    correlated = dark = 0
    drafts = []
    for c in contacts:
        obs_rows = db.execute(
            text(
                "SELECT so.id, so.sensor_id, so.observed_at, so.lat, so.lon, so.position_uncertainty_m, so.speed_kn, so.course_deg "
                "FROM sensor_observations so JOIN contact_observations co ON co.sensor_observation_id = so.id "
                "WHERE co.contact_id = :c ORDER BY so.observed_at DESC LIMIT 12"
            ),
            {"c": c.id},
        ).all()
        dets = []
        for r in obs_rows:
            s = sensors.get(r.sensor_id)
            dets.append(Detection(r.id, str(r.sensor_id), s.sensor_type if s else "OTHER", s.trust_level if s else 0.5,
                                  r.observed_at, r.lat, r.lon, r.position_uncertainty_m, r.speed_kn, r.course_deg))
        cands = {d.obs_id: _ais_candidates(db, d, c.is_synthetic) for d in dets}
        hyps = correlate(dets, cands)
        db.execute(delete(CorrelationHypothesis).where(CorrelationHypothesis.contact_id == c.id))
        for k, h in enumerate(hyps[:3]):
            db.add(CorrelationHypothesis(
                contact_id=c.id, vessel_id=h.vessel_id, score=h.score, method="gated-nn/noisy-or v0.1",
                evidence={"per_sensor": h.per_sensor, "mmsi": h.mmsi, "name": h.name},
                selected=(k == 0 and h.score >= CORRELATION_THRESHOLD),
            ))
        # Nearest AIS vessel (for dark-contact context), independent of correlation.
        nearest = None
        if dets:
            latest = dets[0]
            wide = _ais_candidates(db, latest, c.is_synthetic)
            if wide:
                nv = min(wide, key=lambda a: haversine_km(latest.lat, latest.lon, a.lat, a.lon))
                nearest = (nv.vessel_id, haversine_km(latest.lat, latest.lon, nv.lat, nv.lon))
        c.nearest_ais_vessel_id = nearest[0] if nearest else None
        c.nearest_ais_distance_km = round(nearest[1], 2) if nearest else None
        if c.identity_status != "CONFIRMED":
            if hyps and hyps[0].score >= CORRELATION_THRESHOLD:
                c.identity_status = "CORRELATED"
                c.correlated_vessel_id = hyps[0].vessel_id
                c.correlation_confidence = hyps[0].score
                correlated += 1
            else:
                c.identity_status = "UNIDENTIFIED"
                c.correlated_vessel_id = None
                c.correlation_confidence = hyps[0].score if hyps else None
                dark += 1
                for a in assets:
                    if a.is_synthetic != c.is_synthetic:
                        continue
                    d = haversine_km(c.lat, c.lon, a.lat, a.lon)
                    if d <= a.monitoring_radius_km and rule["enabled"]:
                        src = "+".join(sorted(c.source_types or []))
                        drafts.append(AlertDraft(
                            dedup_key=f"DARK_CONTACT:{c.id}:{a.id}", alert_type="DARK_CONTACT", severity=rule["severity"],
                            title=rule["title"].format(asset=a.name), event_time=c.first_seen, contact_id=c.id, asset_id=a.id,
                            lat=c.lat, lon=c.lon, location_description=f"{d:.1f} km from {a.name}",
                            evidence=[
                                {"kind": "OBSERVATION", "text": f"Contact {c.contact_code} detected by {src} at {d:.1f} km from {a.name}; "
                                 f"speed {c.speed_kn or 0:.0f} kn, classification {c.classification}.", "ref_type": "contact", "ref_id": str(c.id)},
                                {"kind": "INFERENCE", "text": "No AIS track correlates with this contact. Identity unknown: this may be a small "
                                 "craft not required to carry AIS, a vessel with AIS off or malfunctioning, or a false detection."},
                            ],
                            recommended_action=rule["action"].strip(), source_event_type="contact", source_event_id=str(c.id),
                            is_synthetic=c.is_synthetic,
                        ))
    persist_alerts(db, drafts)
    return {"contacts_created": created, "correlated": correlated, "unidentified": dark}
