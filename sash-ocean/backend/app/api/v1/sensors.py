from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_feature, require_roles
from app.core.audit import audit
from app.core.config import get_settings
from app.core.security import Principal
from app.db.session import get_db
from app.models import (
    Contact,
    CorrelationHypothesis,
    DataSource,
    EdgeNode,
    OffshoreAsset,
    Sensor,
    Vessel,
)
from app.models.common import SENSOR_TYPES
from app.services.ingest import ingest_ais, ingest_sensor_observations
from app.services.serialize import iso, provenance

router = APIRouter(tags=["sensors & contacts"])


def _syn(synthetic: bool | None) -> bool:
    return get_settings().demo_mode if synthetic is None else synthetic


# --- Contacts ----------------------------------------------------------------------------------
def _contact_json(c: Contact, names: dict) -> dict:
    label = "UNIDENTIFIED MARITIME CONTACT" if c.identity_status == "UNIDENTIFIED" else (
        "PROBABLE IDENTITY" if c.identity_status == "CORRELATED" else "CONFIRMED IDENTITY")
    return {
        "id": str(c.id), "contact_code": c.contact_code, "label": label, "identity_status": c.identity_status,
        "first_seen": iso(c.first_seen), "last_seen": iso(c.last_seen),
        "duration_s": (c.last_seen - c.first_seen).total_seconds(),
        "position": {"lat": c.lat, "lon": c.lon}, "speed_kn": c.speed_kn, "course_deg": c.course_deg,
        "heading_deg": c.heading_deg, "classification": c.classification,
        "correlated_vessel": {"id": str(c.correlated_vessel_id), "name": names.get(c.correlated_vessel_id)}
        if c.correlated_vessel_id else None,
        "correlation_confidence": c.correlation_confidence, "detection_confidence": c.detection_confidence,
        "detection_sources": c.source_types, "nearest_ais_vessel": {
            "id": str(c.nearest_ais_vessel_id), "name": names.get(c.nearest_ais_vessel_id),
            "distance_km": c.nearest_ais_distance_km} if c.nearest_ais_vessel_id else None,
        "status": c.status, "synthetic": c.is_synthetic,
    }


@router.get("/contacts", summary="Generic contacts from any sensor (AIS, radar, EO/IR, RF, satellite, ...)")
def list_contacts(hours: int = Query(24, ge=1, le=720), identity_status: str | None = None, synthetic: bool | None = None,
                  p: Principal = Depends(require_feature("contacts")), db: Session = Depends(get_db)):
    stmt = select(Contact).where(Contact.last_seen >= datetime.now(timezone.utc) - timedelta(hours=hours),
                                 Contact.is_synthetic == _syn(synthetic))
    if identity_status:
        stmt = stmt.where(Contact.identity_status == identity_status)
    names = dict(db.execute(select(Vessel.id, Vessel.name)).all())
    return {"contacts": [_contact_json(c, names) for c in db.scalars(stmt.order_by(Contact.last_seen.desc())).all()]}


@router.get("/contacts/{contact_id}", summary="Contact detail with raw observations and correlation hypotheses")
def get_contact(contact_id: uuid.UUID, p: Principal = Depends(require_feature("contacts")), db: Session = Depends(get_db)):
    c = db.get(Contact, contact_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    names = dict(db.execute(select(Vessel.id, Vessel.name)).all())
    obs = db.execute(text(
        "SELECT so.observed_at, so.lat, so.lon, so.speed_kn, so.course_deg, so.detection_type, so.classification, "
        "so.position_uncertainty_m, so.confidence, s.sensor_code, s.sensor_type FROM sensor_observations so "
        "JOIN contact_observations co ON co.sensor_observation_id = so.id JOIN sensors s ON s.id = so.sensor_id "
        "WHERE co.contact_id = :c ORDER BY so.observed_at DESC LIMIT 500"), {"c": c.id}).all()
    hyps = db.scalars(select(CorrelationHypothesis).where(CorrelationHypothesis.contact_id == c.id)
                      .order_by(CorrelationHypothesis.score.desc())).all()
    out = _contact_json(c, names)
    out["observations"] = [{"t": iso(o.observed_at), "lat": o.lat, "lon": o.lon, "speed_kn": o.speed_kn,
                            "course_deg": o.course_deg, "detection_type": o.detection_type,
                            "classification": o.classification, "uncertainty_m": o.position_uncertainty_m,
                            "confidence": o.confidence, "sensor": o.sensor_code, "sensor_type": o.sensor_type} for o in obs]
    out["hypotheses"] = [{"vessel_id": str(h.vessel_id), "vessel_name": names.get(h.vessel_id), "score": h.score,
                          "method": h.method, "selected": h.selected, "evidence": h.evidence} for h in hyps]
    out["statement"] = {
        "observation": f"Detected by {', '.join(c.source_types or [])} between {c.first_seen:%H:%MZ} and {c.last_seen:%H:%MZ}.",
        "inference": ("No AIS track correlates with this contact; identity unknown." if c.identity_status == "UNIDENTIFIED"
                      else f"Probable identity {names.get(c.correlated_vessel_id)} ({(c.correlation_confidence or 0):.0%})."),
    }
    return out


class ConfirmIn(BaseModel):
    vessel_id: uuid.UUID | None = None
    note: str | None = Field(None, max_length=1000)


@router.post("/contacts/{contact_id}/confirm", summary="Analyst confirms (or clears) a contact's identity")
def confirm_contact(contact_id: uuid.UUID, body: ConfirmIn, request: Request,
                    p: Principal = Depends(require_roles("ADMIN", "ANALYST")), db: Session = Depends(get_db)):
    c = db.get(Contact, contact_id)
    if c is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if body.vessel_id:
        c.identity_status, c.correlated_vessel_id, c.correlation_confidence = "CONFIRMED", body.vessel_id, 1.0
    else:
        c.identity_status, c.correlated_vessel_id = "UNIDENTIFIED", None
    db.commit()
    audit("contact.confirm", p.kind, p.id, p.label, "contact", str(c.id), ip=client_ip(request),
          details={"vessel_id": str(body.vessel_id) if body.vessel_id else None, "note": body.note})
    return {"id": str(c.id), "identity_status": c.identity_status}


# --- Sensors / edge nodes -------------------------------------------------------------------------
@router.get("/sensors", summary="Registered sensors (generic sensor abstraction)")
def list_sensors(synthetic: bool | None = None, p: Principal = Depends(require_feature("contacts")), db: Session = Depends(get_db)):
    rows = db.scalars(select(Sensor).where(Sensor.is_synthetic == _syn(synthetic)).order_by(Sensor.sensor_code)).all()
    now = datetime.now(timezone.utc)
    return {"sensors": [{
        "id": str(s.id), "sensor_code": s.sensor_code, "name": s.name, "type": s.sensor_type, "owner": s.owner,
        "platform": s.platform, "position": {"lat": s.lat, "lon": s.lon} if s.lat is not None else None,
        "coverage_radius_km": s.coverage_radius_km,
        "status": s.status if s.last_heartbeat_at and now - s.last_heartbeat_at < timedelta(minutes=15) else "STALE",
        "trust_level": s.trust_level, "timestamp_accuracy_ms": s.timestamp_accuracy_ms, "time_source": s.time_source,
        "last_heartbeat_at": iso(s.last_heartbeat_at), "edge_node_id": str(s.edge_node_id) if s.edge_node_id else None,
        "capabilities": s.capabilities, "synthetic": s.is_synthetic,
    } for s in rows], "supported_types": list(SENSOR_TYPES)}


@router.get("/edge-nodes", summary="SASH Ocean Edge nodes")
def list_edge(p: Principal = Depends(require_feature("contacts")), db: Session = Depends(get_db)):
    return {"edge_nodes": [{
        "id": str(e.id), "node_code": e.node_code, "name": e.name, "platform": e.platform,
        "position": {"lat": e.lat, "lon": e.lon} if e.lat is not None else None, "comms_links": e.comms_links,
        "software_version": e.software_version, "status": e.status, "last_sync_at": iso(e.last_sync_at),
        "backlog_reported": e.backlog_reported, "synthetic": e.is_synthetic,
    } for e in db.scalars(select(EdgeNode).order_by(EdgeNode.node_code)).all()]}


class SensorRegisterIn(BaseModel):
    sensor_code: str = Field(pattern=r"^[A-Z0-9][A-Z0-9_-]{2,59}$")
    name: str = Field(max_length=200)
    sensor_type: str
    platform: str | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    coverage_radius_km: float | None = Field(None, ge=0, le=5000)
    trust_level: float = Field(0.5, ge=0, le=1)
    timestamp_accuracy_ms: float | None = None
    time_source: str | None = None
    edge_node_code: str | None = None
    capabilities: dict = Field(default_factory=dict)

    @field_validator("sensor_type")
    @classmethod
    def _t(cls, v):
        if v not in SENSOR_TYPES:
            raise ValueError(f"sensor_type must be one of {SENSOR_TYPES}")
        return v


@router.post("/sensors", status_code=201, summary="Register a sensor (radar, EO, RF, ..., QUANTUM_SENSOR reserved)")
def register_sensor(body: SensorRegisterIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "SENSOR")),
                    db: Session = Depends(get_db)):
    if db.scalar(select(Sensor).where(Sensor.sensor_code == body.sensor_code)):
        raise HTTPException(status_code=409, detail="Sensor code already registered")
    edge = db.scalar(select(EdgeNode).where(EdgeNode.node_code == body.edge_node_code)) if body.edge_node_code else None
    s = Sensor(sensor_code=body.sensor_code, name=body.name, sensor_type=body.sensor_type, platform=body.platform,
               lat=body.lat, lon=body.lon,
               position=f"SRID=4326;POINT({body.lon} {body.lat})" if body.lat is not None and body.lon is not None else None,
               coverage_radius_km=body.coverage_radius_km, trust_level=body.trust_level,
               timestamp_accuracy_ms=body.timestamp_accuracy_ms, time_source=body.time_source,
               edge_node_id=edge.id if edge else None, capabilities=body.capabilities,
               organisation_id=uuid.UUID(p.org_id) if p.org_id else None, status="REGISTERED")
    db.add(s)
    db.commit()
    audit("sensor.register", p.kind, p.id, p.label, "sensor", str(s.id), ip=client_ip(request))
    return {"id": str(s.id), "sensor_code": s.sensor_code}


# --- Ingestion ---------------------------------------------------------------------------------------
class AisMessageIn(BaseModel):
    mmsi: str = Field(pattern=r"^\d{9}$")
    ts: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    sog: float | None = Field(None, ge=0, le=102.3)
    cog: float | None = Field(None, ge=0, le=360)
    heading: float | None = Field(None, ge=0, le=511)
    nav_status: str | None = Field(None, max_length=60)
    receiver_class: str | None = Field(None, pattern=r"^(TERRESTRIAL|SATELLITE|SASH-SENSOR)$")
    name: str | None = Field(None, max_length=120)
    imo: str | None = Field(None, pattern=r"^\d{7}$")
    callsign: str | None = Field(None, max_length=20)
    vessel_type: str | None = Field(None, max_length=60)
    destination: str | None = Field(None, max_length=120)
    raw: dict | None = None


class AisBatchIn(BaseModel):
    source_key: str = Field("edge-ais", max_length=80)
    messages: list[AisMessageIn] = Field(max_length=10_000)


@router.post("/ingest/ais", summary="Ingest decoded AIS position reports (SENSOR / edge nodes)")
def ingest_ais_endpoint(body: AisBatchIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "SENSOR")),
                        db: Session = Depends(get_db)):
    src = db.scalar(select(DataSource).where(DataSource.key == body.source_key))
    if src is None:
        src = DataSource(key=body.source_key, name=f"Sensor feed {body.source_key}", source_type="AIS",
                         licensing_category="SASH-SENSOR", enabled=True, default_confidence=0.85)
        db.add(src)
        db.flush()
    if src.licensing_category == "SYNTHETIC-DEMO":
        raise HTTPException(status_code=403, detail="Synthetic sources cannot be written via the API")
    res = ingest_ais(db, [m.model_dump() for m in body.messages], src)
    db.commit()
    audit("ingest.ais", p.kind, p.id, p.label, "data_source", src.key, ip=client_ip(request), details=res.as_dict())
    return res.as_dict()


class SensorObsIn(BaseModel):
    observed_at: datetime
    dedup_key: str | None = Field(None, max_length=128)
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    position_uncertainty_m: float | None = Field(None, ge=0)
    speed_kn: float | None = Field(None, ge=0, le=150)
    course_deg: float | None = Field(None, ge=0, le=360)
    heading_deg: float | None = Field(None, ge=0, le=360)
    sensor_track_id: str | None = Field(None, max_length=60)
    detection_type: str = Field("DETECTION", max_length=40)
    classification: str | None = Field(None, max_length=60)
    confidence: float | None = Field(None, ge=0, le=1)
    attributes: dict = Field(default_factory=dict)
    raw: dict | None = None


class SensorBatchIn(BaseModel):
    sensor_code: str
    edge_node_code: str | None = None
    edge_backlog: int | None = Field(None, ge=0)
    observations: list[SensorObsIn] = Field(max_length=10_000)


@router.post("/ingest/sensor-observations", summary="Common observation pipeline for all non-AIS sensors")
def ingest_sensor_endpoint(body: SensorBatchIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "SENSOR")),
                           db: Session = Depends(get_db)):
    sensor = db.scalar(select(Sensor).where(Sensor.sensor_code == body.sensor_code))
    if sensor is None:
        raise HTTPException(status_code=404, detail="Unknown sensor_code (register the sensor first)")
    if sensor.is_synthetic:
        raise HTTPException(status_code=403, detail="Synthetic sensors cannot be written via the API")
    edge = db.scalar(select(EdgeNode).where(EdgeNode.node_code == body.edge_node_code)) if body.edge_node_code else None
    if body.edge_node_code and edge is None:
        edge = EdgeNode(node_code=body.edge_node_code, name=body.edge_node_code, status="ONLINE")
        db.add(edge)
        db.flush()
    if edge:
        edge.last_sync_at = datetime.now(timezone.utc)
        edge.status = "ONLINE"
        edge.backlog_reported = body.edge_backlog
    res = ingest_sensor_observations(db, sensor, [o.model_dump() for o in body.observations], edge.id if edge else None)
    db.commit()
    audit("ingest.sensor", p.kind, p.id, p.label, "sensor", sensor.sensor_code, ip=client_ip(request), details=res.as_dict())
    return res.as_dict()


class HeartbeatIn(BaseModel):
    sensor_code: str
    status: str = Field("ONLINE", pattern=r"^(ONLINE|DEGRADED|OFFLINE)$")


@router.post("/sensors/heartbeat", summary="Sensor health heartbeat")
def heartbeat(body: HeartbeatIn, p: Principal = Depends(require_roles("ADMIN", "SENSOR")), db: Session = Depends(get_db)):
    s = db.scalar(select(Sensor).where(Sensor.sensor_code == body.sensor_code))
    if s is None:
        raise HTTPException(status_code=404, detail="Unknown sensor")
    s.status, s.last_heartbeat_at = body.status, datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# --- Offshore assets ----------------------------------------------------------------------------------
@router.get("/assets", summary="Offshore assets with security and monitoring radii")
def list_assets(synthetic: bool | None = None, p: Principal = Depends(require_feature("assets")), db: Session = Depends(get_db)):
    rows = db.scalars(select(OffshoreAsset).where(OffshoreAsset.is_synthetic == _syn(synthetic)).order_by(OffshoreAsset.name)).all()
    return {"assets": [{
        "id": str(a.id), "name": a.name, "operator": a.operator, "asset_type": a.asset_type,
        "position": {"lat": a.lat, "lon": a.lon}, "security_radius_km": a.security_radius_km,
        "monitoring_radius_km": a.monitoring_radius_km, "authorised_vessels": len(a.authorised_mmsis or []),
        "provenance": provenance(a),
    } for a in rows]}


class AssetIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    operator: str | None = Field(None, max_length=200)
    asset_type: str = Field(pattern=r"^(oil_rig|FPSO|offshore_wind|subsea_infrastructure|port|terminal|other)$")
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    security_radius_km: float = Field(1.0, gt=0, le=100)
    monitoring_radius_km: float = Field(10.0, gt=0, le=500)
    authorised_mmsis: list[str] = Field(default_factory=list)


@router.post("/assets", status_code=201, summary="Register an offshore asset")
def create_asset(body: AssetIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "ANALYST")),
                 db: Session = Depends(get_db)):
    a = OffshoreAsset(**body.model_dump(), position=f"SRID=4326;POINT({body.lon} {body.lat})", source_name=p.label,
                      source_type="CUSTOMER", licensing_category="CUSTOMER", confidence=1.0,
                      organisation_id=uuid.UUID(p.org_id) if p.org_id else None, is_synthetic=False)
    db.add(a)
    db.commit()
    audit("asset.create", p.kind, p.id, p.label, "asset", str(a.id), ip=client_ip(request))
    return {"id": str(a.id), "name": a.name}
