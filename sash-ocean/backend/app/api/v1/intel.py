from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field, field_validator
from shapely.geometry import shape
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, incident_delay_hours, require_feature, require_roles
from app.core.audit import audit
from app.core.config import get_settings
from app.core.security import Principal
from app.db.session import get_db
from app.models import (
    AisGapEvent,
    Alert,
    DataSource,
    Incident,
    IncidentProximity,
    LoiteringEvent,
    RiskZone,
    RouteDeviationEvent,
    Vessel,
)
from app.models.common import INCIDENT_CATEGORIES, LICENSING_CATEGORIES, SEVERITIES, SEVERITY_RANK, VERIFICATION_STATUSES
from app.services.intel import area_risk, voyage_risk
from app.services.serialize import incident_json, iso, zone_feature

router = APIRouter(tags=["intelligence"])


def _dataset(synthetic: bool | None) -> bool:
    """Which intelligence world to query. Defaults to the demo world in demo mode."""
    if synthetic is not None:
        return synthetic
    return get_settings().demo_mode


# --- Incidents ---------------------------------------------------------------------------
@router.get("/incidents", summary="Maritime security incidents with provenance")
def list_incidents(
    since: datetime | None = None,
    until: datetime | None = None,
    category: list[str] | None = Query(None),
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    synthetic: bool | None = None,
    limit: int = Query(500, ge=1, le=5000),
    p: Principal = Depends(require_feature("incident_map")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    delay = incident_delay_hours(p)
    stmt = select(Incident).where(Incident.is_synthetic == _dataset(synthetic))
    stmt = stmt.where(Incident.occurred_at >= (since or now - timedelta(days=90)))
    upper = min(until or now, now - timedelta(hours=delay))
    stmt = stmt.where(Incident.occurred_at <= upper)
    if category:
        stmt = stmt.where(Incident.category.in_(category))
    if bbox:
        w, s, e, n = (float(x) for x in bbox.split(","))
        stmt = stmt.where(Incident.lon.between(w, e), Incident.lat.between(s, n))
    rows = db.scalars(stmt.order_by(Incident.occurred_at.desc()).limit(limit)).all()
    return {"incidents": [incident_json(i, delayed=delay > 0) for i in rows], "delay_hours": delay,
            "categories": list(INCIDENT_CATEGORIES)}


@router.get("/incidents/nearby", summary="Incidents near a position")
def incidents_nearby(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(250, gt=0, le=2000),
    days: int = Query(90, ge=1, le=3650),
    synthetic: bool | None = None,
    p: Principal = Depends(require_feature("incident_map")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    pt = func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326)
    dist = func.ST_Distance(func.Geography(Incident.position), func.Geography(pt))
    rows = db.execute(
        select(Incident, dist.label("d")).where(
            Incident.is_synthetic == _dataset(synthetic),
            Incident.occurred_at >= now - timedelta(days=days),
            Incident.occurred_at <= now - timedelta(hours=incident_delay_hours(p)),
            func.ST_DWithin(func.Geography(Incident.position), func.Geography(pt), radius_km * 1000),
        ).order_by("d")
    ).all()
    return {"incidents": [{**incident_json(i), "distance_km": round(d / 1000, 1)} for i, d in rows]}


@router.get("/incidents/{incident_id}", summary="Incident detail with vessels nearby at the incident time")
def get_incident(incident_id: str, p: Principal = Depends(require_feature("incident_map")), db: Session = Depends(get_db)):
    i = db.get(Incident, incident_id)
    if i is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    prox = db.execute(select(IncidentProximity, Vessel.name).join(Vessel, Vessel.id == IncidentProximity.vessel_id)
                      .where(IncidentProximity.incident_id == i.id).order_by(IncidentProximity.distance_km)).all()
    out = incident_json(i)
    out["vessels_nearby_at_incident_time"] = [
        {"vessel_id": str(x.vessel_id), "name": name, "distance_km": x.distance_km, "band_km": x.band_km,
         "position": {"lat": x.vessel_lat, "lon": x.vessel_lon}, "position_method": x.position_method}
        for x, name in prox
    ]
    bands = {b: 0 for b in (25, 50, 100, 250)}
    for x, _ in prox:
        for b in bands:
            if x.distance_km <= b:
                bands[b] += 1
    out["vessel_counts_by_band_km"] = bands
    return out


class IncidentIn(BaseModel):
    occurred_at: datetime
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    category: str
    title: str = Field(min_length=3, max_length=300)
    narrative: str = Field("", max_length=5000)
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str | None = Field(None, max_length=1000)
    source_reference: str | None = Field(None, max_length=300)
    licensing_category: str = "PUBLIC-OSINT"
    confidence: float = Field(0.5, ge=0, le=1)
    verification_status: str = "UNVERIFIED"
    affected_vessel_name: str | None = None
    imo: str | None = Field(None, pattern=r"^\d{7}$")
    mmsi: str | None = Field(None, pattern=r"^\d{9}$")
    fatalities: int | None = Field(None, ge=0)
    injuries: int | None = Field(None, ge=0)
    hostages: int | None = Field(None, ge=0)
    boarding: bool | None = None
    hijacking: bool | None = None
    weapons_reported: str | None = Field(None, max_length=200)
    reported_at: datetime | None = None

    @field_validator("category")
    @classmethod
    def _cat(cls, v):
        if v not in INCIDENT_CATEGORIES:
            raise ValueError(f"category must be one of {INCIDENT_CATEGORIES}")
        return v

    @field_validator("licensing_category")
    @classmethod
    def _lic(cls, v):
        if v not in LICENSING_CATEGORIES or v == "SYNTHETIC-DEMO":
            raise ValueError("invalid licensing category")
        return v

    @field_validator("verification_status")
    @classmethod
    def _ver(cls, v):
        if v not in VERIFICATION_STATUSES:
            raise ValueError("invalid verification status")
        return v


def _create_incident(db: Session, body: IncidentIn) -> Incident:
    src = db.scalar(select(DataSource).where(DataSource.key == "analyst-import"))
    vessel = None
    if body.imo:
        vessel = db.scalar(select(Vessel).where(Vessel.imo == body.imo, Vessel.is_synthetic.is_(False)))
    elif body.mmsi:
        vessel = db.scalar(select(Vessel).where(Vessel.mmsi == body.mmsi, Vessel.is_synthetic.is_(False)))
    data = body.model_dump()
    i = Incident(
        **{k: data[k] for k in ("occurred_at", "lat", "lon", "category", "title", "narrative", "source_name", "source_url",
                                "source_reference", "licensing_category", "confidence", "verification_status",
                                "affected_vessel_name", "imo", "mmsi", "fatalities", "injuries", "hostages", "boarding",
                                "hijacking", "weapons_reported", "reported_at")},
        position=f"SRID=4326;POINT({body.lon} {body.lat})", source_id=src.id if src else None,
        source_type="ANALYST", original_timestamp=body.occurred_at, is_synthetic=False,
        affected_vessel_id=vessel.id if vessel else None, raw={"submitted": data | {"occurred_at": body.occurred_at.isoformat(),
                                                                                    "reported_at": iso(body.reported_at)}},
    )
    db.add(i)
    return i


@router.post("/incidents", status_code=201, summary="Record an incident (analyst) with explicit provenance")
def create_incident(body: IncidentIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "ANALYST")),
                    db: Session = Depends(get_db)):
    i = _create_incident(db, body)
    db.commit()
    audit("incident.create", p.kind, p.id, p.label, "incident", str(i.id), ip=client_ip(request))
    return incident_json(i)


@router.post("/incidents/import", summary="Bulk import incidents from CSV (columns match the incident schema)")
async def import_incidents(request: Request, file: UploadFile = File(...),
                           p: Principal = Depends(require_roles("ADMIN", "ANALYST")), db: Session = Depends(get_db)):
    raw = await file.read()
    if len(raw) > 5_000_000:
        raise HTTPException(status_code=413, detail="File too large (max 5 MB)")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    ok, errors = 0, []
    for n, row in enumerate(reader, start=2):
        try:
            body = IncidentIn(**{k: (v if v != "" else None) for k, v in row.items() if k})
            _create_incident(db, body)
            ok += 1
        except Exception as exc:
            errors.append(f"line {n}: {exc}"[:300])
    db.commit()
    audit("incident.import", p.kind, p.id, p.label, "incident", None, ip=client_ip(request),
          details={"imported": ok, "errors": len(errors), "filename": file.filename})
    return {"imported": ok, "errors": errors[:50]}


# --- Risk zones ----------------------------------------------------------------------------
@router.get("/risk-zones", summary="Risk zones as a GeoJSON FeatureCollection")
def risk_zones(
    active_at: datetime | None = None,
    synthetic: bool | None = None,
    p: Principal = Depends(require_feature("risk_zones")),
    db: Session = Depends(get_db),
):
    t = active_at or datetime.now(timezone.utc)
    rows = db.scalars(select(RiskZone).where(
        RiskZone.is_synthetic == _dataset(synthetic), RiskZone.effective_start <= t,
        (RiskZone.effective_end.is_(None)) | (RiskZone.effective_end >= t))).all()
    rows = sorted(rows, key=lambda z: SEVERITY_RANK.get(z.severity, 0))
    return {"type": "FeatureCollection", "features": [zone_feature(z) for z in rows]}


class ZoneIn(BaseModel):
    name: str = Field(min_length=3, max_length=200)
    geometry: dict
    category: str
    severity: str
    effective_start: datetime
    effective_end: datetime | None = None
    source_name: str = Field(min_length=2, max_length=200)
    source_url: str | None = None
    licensing_category: str = "PUBLIC-OSINT"
    confidence: float = Field(0.6, ge=0, le=1)
    description: str = Field("", max_length=3000)

    @field_validator("severity")
    @classmethod
    def _sev(cls, v):
        if v not in SEVERITIES:
            raise ValueError(f"severity must be one of {SEVERITIES}")
        return v


@router.post("/risk-zones", status_code=201, summary="Create a risk zone from GeoJSON (analyst)")
def create_zone(body: ZoneIn, request: Request, p: Principal = Depends(require_roles("ADMIN", "ANALYST")),
                db: Session = Depends(get_db)):
    try:
        geom = shape(body.geometry)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid GeoJSON geometry")
    if geom.geom_type == "Polygon":
        from shapely.geometry import MultiPolygon

        geom = MultiPolygon([geom])
    if geom.geom_type != "MultiPolygon" or not geom.is_valid:
        raise HTTPException(status_code=422, detail="Geometry must be a valid Polygon or MultiPolygon")
    z = RiskZone(name=body.name, geom=f"SRID=4326;{geom.wkt}", category=body.category, severity=body.severity,
                 effective_start=body.effective_start, effective_end=body.effective_end, description=body.description,
                 source_name=body.source_name, source_url=body.source_url, source_type="ANALYST",
                 licensing_category=body.licensing_category, confidence=body.confidence, is_synthetic=False)
    db.add(z)
    db.commit()
    audit("risk_zone.create", p.kind, p.id, p.label, "risk_zone", str(z.id), ip=client_ip(request))
    return zone_feature(z)


# --- Area & voyage risk --------------------------------------------------------------------------
@router.get("/area-risk", summary="SASH AREA RISK for a position")
def get_area_risk(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(250, gt=0, le=1500),
    days: int = Query(90, ge=7, le=730),
    synthetic: bool | None = None,
    p: Principal = Depends(require_feature("area_risk")),
    db: Session = Depends(get_db),
):
    return area_risk(db, lat, lon, radius_km, days, _dataset(synthetic))


class VoyageRiskIn(BaseModel):
    origin: str = Field(description="UN/LOCODE, port name, or 'lat,lon'", max_length=100)
    destination: str = Field(max_length=100)
    departure_time: datetime | None = None
    speed_kn: float = Field(12.0, gt=2, le=40)
    vessel_type: str | None = Field(None, max_length=60)
    synthetic: bool | None = None


@router.post("/voyage-risk", summary="Approximate route exposure for a planned voyage")
def post_voyage_risk(body: VoyageRiskIn, p: Principal = Depends(require_feature("voyage_risk")), db: Session = Depends(get_db)):
    dep = body.departure_time or datetime.now(timezone.utc)
    if dep.tzinfo is None:
        dep = dep.replace(tzinfo=timezone.utc)
    try:
        return voyage_risk(db, body.origin, body.destination, dep, body.speed_kn,
                           body.vessel_type.lower() if body.vessel_type else None, _dataset(body.synthetic))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


# --- Timeline & threat status ---------------------------------------------------------------------
@router.get("/timeline", summary="Unified event timeline (incidents, anomalies, alerts)")
def timeline(
    hours: int = Query(72, ge=1, le=720),
    vessel_id: str | None = None,
    synthetic: bool | None = None,
    limit: int = Query(300, ge=1, le=2000),
    p: Principal = Depends(require_feature("incident_map")),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(hours=hours)
    syn = _dataset(synthetic)
    names = dict(db.execute(select(Vessel.id, Vessel.name)).all())
    items = []
    delay = incident_delay_hours(p)
    for i in db.scalars(select(Incident).where(Incident.is_synthetic == syn, Incident.occurred_at >= since,
                                               Incident.occurred_at <= now - timedelta(hours=delay))).all():
        items.append({"time": iso(i.occurred_at), "type": "INCIDENT", "subtype": i.category, "title": i.title,
                      "severity": "HIGH" if i.category in ("hijacking", "missile_attack", "drone_attack", "kidnapping") else "MEDIUM",
                      "lat": i.lat, "lon": i.lon, "ref_id": str(i.id), "vessel_id": None, "vessel_name": i.affected_vessel_name})
    vf = [] if not vessel_id else [vessel_id]

    def vcond(model):
        c = [model.is_synthetic == syn]
        if vf:
            c.append(model.vessel_id.in_(vf))
        return c

    for g in db.scalars(select(AisGapEvent).where(AisGapEvent.gap_start >= since, *vcond(AisGapEvent))).all():
        items.append({"time": iso(g.gap_start), "type": "AIS_ANOMALY", "subtype": "AIS_GAP",
                      "title": f"AIS reporting anomaly ({int(g.duration_s // 3600)}h {int(g.duration_s % 3600 // 60):02d}m)",
                      "severity": "MEDIUM" if g.anomaly_confidence >= 0.5 else "LOW", "ref_id": str(g.id),
                      "vessel_id": str(g.vessel_id), "vessel_name": names.get(g.vessel_id)})
    for e in db.scalars(select(LoiteringEvent).where(LoiteringEvent.start_time >= since, *vcond(LoiteringEvent))).all():
        items.append({"time": iso(e.start_time), "type": "AIS_ANOMALY", "subtype": "LOITERING", "title": "Loitering",
                      "severity": "LOW", "lat": e.centre_lat, "lon": e.centre_lon, "ref_id": str(e.id),
                      "vessel_id": str(e.vessel_id), "vessel_name": names.get(e.vessel_id)})
    for e in db.scalars(select(RouteDeviationEvent).where(RouteDeviationEvent.start_time >= since, *vcond(RouteDeviationEvent))).all():
        items.append({"time": iso(e.start_time), "type": "AIS_ANOMALY", "subtype": "ROUTE_DEVIATION",
                      "title": f"Route deviation ({e.max_deviation_km:.0f} km)", "severity": "MEDIUM", "ref_id": str(e.id),
                      "vessel_id": str(e.vessel_id), "vessel_name": names.get(e.vessel_id)})
    aq = select(Alert).where(Alert.event_time >= since, Alert.is_synthetic == syn)
    if vf:
        aq = aq.where(Alert.vessel_id.in_(vf))
    for a in db.scalars(aq).all():
        items.append({"time": iso(a.event_time), "type": "ALERT", "subtype": a.alert_type, "title": a.title,
                      "severity": a.severity, "lat": a.lat, "lon": a.lon, "ref_id": str(a.id),
                      "vessel_id": str(a.vessel_id) if a.vessel_id else None, "vessel_name": names.get(a.vessel_id)})
    items.sort(key=lambda x: x["time"], reverse=True)
    return {"since": since.isoformat(), "items": items[:limit]}


@router.get("/threat-status", summary="Current maritime threat status by designated area")
def threat_status(synthetic: bool | None = None, p: Principal = Depends(require_feature("risk_zones")),
                  db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    syn = _dataset(synthetic)
    zones = db.scalars(select(RiskZone).where(RiskZone.is_synthetic == syn, RiskZone.effective_start <= now,
                                              (RiskZone.effective_end.is_(None)) | (RiskZone.effective_end >= now))).all()
    out = []
    for z in zones:
        n7 = db.scalar(select(func.count()).select_from(Incident).where(
            Incident.is_synthetic == syn, Incident.occurred_at >= now - timedelta(days=7),
            func.ST_Intersects(Incident.position, z.geom)))
        n30 = db.scalar(select(func.count()).select_from(Incident).where(
            Incident.is_synthetic == syn, Incident.occurred_at >= now - timedelta(days=30),
            func.ST_Intersects(Incident.position, z.geom)))
        vessels = db.scalar(select(func.count()).select_from(Vessel).where(
            Vessel.is_synthetic == syn, func.ST_Intersects(Vessel.last_position, z.geom)))
        out.append({"zone_id": str(z.id), "name": z.name, "severity": z.severity, "category": z.category,
                    "incidents_7d": n7, "incidents_30d": n30, "vessels_inside": vessels})
    out.sort(key=lambda x: (-SEVERITY_RANK.get(x["severity"], 0), -x["incidents_30d"]))
    top = max((SEVERITY_RANK.get(z["severity"], 0) for z in out), default=0)
    level = SEVERITIES[top] if out else "LOW"
    return {"overall": level, "areas": out, "dataset": "SYNTHETIC-DEMO" if syn else "LIVE", "as_of": now.isoformat()}


@router.get("/data-sources", summary="Registered data sources, licensing and health")
def data_sources(p: Principal = Depends(require_feature("incident_map")), db: Session = Depends(get_db)):
    rows = db.scalars(select(DataSource).order_by(DataSource.key)).all()
    return {"sources": [{
        "key": s.key, "name": s.name, "type": s.source_type, "licensing_category": s.licensing_category,
        "enabled": s.enabled, "health": s.health_status, "last_success_at": iso(s.last_success_at),
        "last_error": s.last_error if p.role in ("ADMIN", "ANALYST") else None, "records_ingested": s.records_ingested,
        "redistribution_allowed": s.redistribution_allowed, "terms_url": s.terms_url, "notes": s.notes,
    } for s in rows]}
