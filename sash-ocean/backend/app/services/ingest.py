"""Normalised ingestion pipeline for AIS and generic sensor observations.

Every connector (demo feed, AISStream, edge nodes, customer sensors) goes through here,
so validation, provenance and live/synthetic separation are enforced in one place.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.eventbus import get_bus
from app.core.metrics import INGEST_REJECTED, INGESTED_OBSERVATIONS
from app.models import AisObservation, DataSource, Sensor, SensorObservation, Vessel

log = logging.getLogger(__name__)
STATIC_FIELDS = ("name", "imo", "callsign", "vessel_type", "flag", "length_m", "beam_m", "draught_m", "destination", "eta")


def point(lat: float, lon: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


@dataclass
class IngestResult:
    accepted: int = 0
    rejected: int = 0
    duplicates: int = 0
    new_vessels: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"accepted": self.accepted, "rejected": self.rejected, "duplicates": self.duplicates,
                "new_vessels": self.new_vessels, "errors": self.errors[:20]}


def _parse_ts(v: Any) -> datetime:
    if isinstance(v, datetime):
        ts = v
    else:
        ts = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def validate_ais(msg: dict, now: datetime) -> str | None:
    mmsi = str(msg.get("mmsi", ""))
    if len(mmsi) != 9 or not mmsi.isdigit():
        return "invalid_mmsi"
    try:
        lat, lon = float(msg["lat"]), float(msg["lon"])
    except (KeyError, TypeError, ValueError):
        return "missing_position"
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 91 or lon == 181):
        return "invalid_position"
    try:
        ts = _parse_ts(msg["ts"])
    except (KeyError, ValueError):
        return "invalid_timestamp"
    if ts > now + timedelta(minutes=5):
        return "future_timestamp"
    sog = msg.get("sog")
    if sog is not None and not (0 <= float(sog) <= 102.2):
        return "invalid_sog"
    return None


def ingest_ais(db: Session, messages: list[dict], source: DataSource, now: datetime | None = None) -> IngestResult:
    """Validate, resolve vessel identity and append observations (never overwrite)."""
    now = now or datetime.now(timezone.utc)
    res = IngestResult()
    synthetic = source.licensing_category == "SYNTHETIC-DEMO"
    mode = "SYNTHETIC" if synthetic else "LIVE"
    cache: dict[str, Vessel] = {}
    rows = []
    for msg in messages:
        reason = validate_ais(msg, now)
        if reason:
            res.rejected += 1
            INGEST_REJECTED.labels(kind="ais", reason=reason).inc()
            if len(res.errors) < 20:
                res.errors.append(f"{msg.get('mmsi')}: {reason}")
            continue
        mmsi = str(msg["mmsi"])
        ts = _parse_ts(msg["ts"])
        v = cache.get(mmsi) or db.scalar(select(Vessel).where(Vessel.mmsi == mmsi, Vessel.data_mode == mode))
        if v is None:
            v = Vessel(id=uuid.uuid4(), mmsi=mmsi, data_mode=mode, is_synthetic=synthetic, field_provenance={})
            db.add(v)
            res.new_vessels += 1
        cache[mmsi] = v
        # Static/voyage data: update only when provided, and record field provenance.
        prov = dict(v.field_provenance or {})
        for f in STATIC_FIELDS:
            val = msg.get(f)
            if val not in (None, ""):
                if f == "eta":
                    val = _parse_ts(val)
                if getattr(v, f) != val:
                    setattr(v, f, val)
                    prov[f] = {"source": source.key, "retrieved_at": now.isoformat()}
        v.field_provenance = prov
        lat, lon = float(msg["lat"]), float(msg["lon"])
        if v.last_seen_at is None or ts > v.last_seen_at:
            v.last_lat, v.last_lon, v.last_position = lat, lon, point(lat, lon)
            v.last_sog, v.last_cog, v.last_heading = msg.get("sog"), msg.get("cog"), msg.get("heading")
            v.last_nav_status, v.last_seen_at = msg.get("nav_status"), ts
        rows.append(dict(
            vessel_id=v.id, mmsi=mmsi, ts=ts, lat=lat, lon=lon, position=f"SRID=4326;POINT({lon} {lat})",
            sog=msg.get("sog"), cog=msg.get("cog"), heading=msg.get("heading"), nav_status=msg.get("nav_status"),
            receiver_class=msg.get("receiver_class"), ingested_at=now, raw=msg.get("raw"),
            source_id=source.id, source_name=source.name, source_type=source.source_type,
            licensing_category=source.licensing_category, retrieved_at=now, original_timestamp=ts,
            confidence=float(msg["confidence"] if msg.get("confidence") is not None else source.default_confidence),
            is_synthetic=synthetic,
        ))
        res.accepted += 1
    if rows:
        db.flush()  # vessels must exist before their observations (FK)
        db.execute(AisObservation.__table__.insert(), rows)
        source.records_ingested = (source.records_ingested or 0) + len(rows)
        source.last_success_at = now
        source.health_status = "HEALTHY"
        INGESTED_OBSERVATIONS.labels(kind="ais", source=source.key).inc(len(rows))
        get_bus().publish("sash.observations.ais", {"source": source.key, "count": len(rows), "synthetic": synthetic})
    return res


def ingest_sensor_observations(db: Session, sensor: Sensor, observations: list[dict], edge_node_id=None,
                               now: datetime | None = None) -> IngestResult:
    """Common pipeline for radar/EO/IR/RF/satellite/acoustic/quantum sensor observations.

    Idempotent on `dedup_key` so an edge node can safely resend its backlog after an outage.
    """
    now = now or datetime.now(timezone.utc)
    res = IngestResult()
    lic = "SYNTHETIC-DEMO" if sensor.is_synthetic else "SASH-SENSOR"
    for o in observations:
        try:
            ts = _parse_ts(o["observed_at"])
        except (KeyError, ValueError):
            res.rejected += 1
            INGEST_REJECTED.labels(kind="sensor", reason="invalid_timestamp").inc()
            continue
        if ts > now + timedelta(minutes=5):
            res.rejected += 1
            INGEST_REJECTED.labels(kind="sensor", reason="future_timestamp").inc()
            continue
        lat, lon = o.get("lat"), o.get("lon")
        if lat is not None and not (-90 <= float(lat) <= 90 and -180 <= float(lon) <= 180):
            res.rejected += 1
            INGEST_REJECTED.labels(kind="sensor", reason="invalid_position").inc()
            continue
        dedup = str(o.get("dedup_key") or f"{sensor.sensor_code}:{ts.isoformat()}:{o.get('sensor_track_id', '')}")
        stmt = insert(SensorObservation).values(
            sensor_id=sensor.id, edge_node_id=edge_node_id, dedup_key=dedup[:128], observed_at=ts, received_at=now,
            lat=lat, lon=lon, position=f"SRID=4326;POINT({lon} {lat})" if lat is not None else None,
            position_uncertainty_m=o.get("position_uncertainty_m"), speed_kn=o.get("speed_kn"),
            course_deg=o.get("course_deg"), heading_deg=o.get("heading_deg"),
            sensor_track_id=o.get("sensor_track_id"), detection_type=o.get("detection_type", "DETECTION"),
            classification=o.get("classification"), attributes=o.get("attributes") or {}, raw=o.get("raw"),
            source_name=sensor.name, source_type=sensor.sensor_type, licensing_category=lic, retrieved_at=now,
            original_timestamp=ts,
            confidence=float(o["confidence"] if o.get("confidence") is not None else sensor.trust_level),
            is_synthetic=sensor.is_synthetic,
        ).on_conflict_do_nothing(index_elements=["dedup_key"]).returning(SensorObservation.id)
        if db.execute(stmt).first() is None:
            res.duplicates += 1
        else:
            res.accepted += 1
    sensor.last_heartbeat_at = now
    sensor.status = "ONLINE"
    if res.accepted:
        INGESTED_OBSERVATIONS.labels(kind="sensor", source=sensor.sensor_type).inc(res.accepted)
        get_bus().publish("sash.observations.sensor", {"sensor": sensor.sensor_code, "count": res.accepted})
    return res
