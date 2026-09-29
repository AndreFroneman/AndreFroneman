from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from geoalchemy2.shape import to_shape
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_feature
from app.core.audit import audit
from app.core.security import Principal
from app.core.yamlconfig import risk_model
from app.db.session import get_db
from app.models import (
    AisGapEvent,
    AssetProximityEvent,
    Incident,
    IncidentProximity,
    LoiteringEvent,
    OffshoreAsset,
    RiskAssessment,
    RouteDeviationEvent,
    StopEvent,
    Vessel,
    Voyage,
    Watchlist,
    WatchlistItem,
    ZoneExposure,
)
from app.reports.exposure_report import render_csv, render_pdf
from app.risk.engine import RiskEngine
from app.risk.loader import build_context, load_track
from app.services.explain import default_why_window, explain_change, vessel_timeline
from app.services.exposure import security_profile
from app.services.serialize import geom_json, incident_json, iso, resolve_vessel, vessel_detail, vessel_summary

router = APIRouter(prefix="/vessels", tags=["vessels"])


def _vessel_or_404(db: Session, ref: str) -> Vessel:
    v = resolve_vessel(db, ref)
    if v is None:
        raise HTTPException(status_code=404, detail="Vessel not found")
    return v


def watchlist_vessel_ids(db: Session, watchlist_id: str) -> list:
    items = db.scalars(select(WatchlistItem).where(WatchlistItem.watchlist_id == watchlist_id)).all()
    ids = set()
    for it in items:
        if it.vessel_id:
            ids.add(it.vessel_id)
        elif it.item_type == "IMO" and it.imo:
            ids.update(db.scalars(select(Vessel.id).where(Vessel.imo == it.imo)).all())
        elif it.item_type == "MMSI" and it.mmsi:
            ids.update(db.scalars(select(Vessel.id).where(Vessel.mmsi == it.mmsi)).all())
        elif it.item_type == "FLEET" and it.fleet_operator:
            ids.update(db.scalars(select(Vessel.id).where(Vessel.operator == it.fleet_operator)).all())
        elif it.item_type == "AREA" and it.area is not None:
            ids.update(db.scalars(select(Vessel.id).where(func.ST_Intersects(Vessel.last_position, it.area))).all())
    return list(ids)


@router.get("", summary="Search and list vessels (latest state and current risk)")
def list_vessels(
    q: str | None = Query(None, max_length=100, description="Name, IMO or MMSI"),
    vessel_type: str | None = Query(None, max_length=60),
    min_risk: int | None = Query(None, ge=0, le=100),
    watchlist_id: str | None = None,
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    synthetic: bool | None = None,
    limit: int = Query(500, ge=1, le=5000),
    p: Principal = Depends(require_feature("vessels")),
    db: Session = Depends(get_db),
):
    stmt = select(Vessel)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Vessel.name.ilike(like), Vessel.imo == q.strip(), Vessel.mmsi == q.strip(),
                              Vessel.callsign.ilike(like)))
    if vessel_type:
        stmt = stmt.where(Vessel.vessel_type == vessel_type)
    if min_risk is not None:
        stmt = stmt.where(Vessel.current_risk_score >= min_risk)
    if synthetic is not None:
        stmt = stmt.where(Vessel.is_synthetic == synthetic)
    if watchlist_id:
        stmt = stmt.where(Vessel.id.in_(watchlist_vessel_ids(db, watchlist_id)))
    if bbox:
        try:
            w, s, e, n = (float(x) for x in bbox.split(","))
        except ValueError:
            raise HTTPException(status_code=422, detail="bbox must be minLon,minLat,maxLon,maxLat")
        stmt = stmt.where(func.ST_Intersects(Vessel.last_position, func.ST_MakeEnvelope(w, s, e, n, 4326)))
    stmt = stmt.order_by(Vessel.current_risk_score.desc().nullslast(), Vessel.name).limit(limit)
    return {"vessels": [vessel_summary(v) for v in db.scalars(stmt).all()]}


@router.get("/tracks/recent", summary="Recent tracks for all vessels (map layer)")
def recent_tracks(
    hours: int = Query(24, ge=1, le=336),
    synthetic: bool | None = None,
    p: Principal = Depends(require_feature("vessels")),
    db: Session = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    cond = "AND o.is_synthetic = :syn" if synthetic is not None else ""
    rows = db.execute(text(
        "SELECT o.vessel_id, ST_AsGeoJSON(ST_Simplify(ST_MakeLine(o.position ORDER BY o.ts), 0.01)) AS g "
        f"FROM ais_observations o WHERE o.ts >= :since {cond} GROUP BY o.vessel_id HAVING count(*) > 1"
    ), {"since": since, "syn": synthetic}).all()
    import json

    risk = dict(db.execute(select(Vessel.id, Vessel.current_risk_band)).all())
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": json.loads(r.g), "properties": {"vessel_id": str(r.vessel_id), "band": risk.get(r.vessel_id)}}
        for r in rows
    ]}


@router.get("/{ref}", summary="Vessel identity, latest state and current risk")
def get_vessel(ref: str, p: Principal = Depends(require_feature("vessels")), db: Session = Depends(get_db)):
    return vessel_detail(_vessel_or_404(db, ref))


@router.get("/{ref}/track", summary="Historical AIS track (raw observations, never overwritten)")
def get_track(
    ref: str,
    since: datetime | None = None,
    until: datetime | None = None,
    max_points: int = Query(3000, ge=10, le=20000),
    p: Principal = Depends(require_feature("vessels")),
    db: Session = Depends(get_db),
):
    v = _vessel_or_404(db, ref)
    since = since or datetime.now(timezone.utc) - timedelta(days=14)
    obs = load_track(db, v.id, since=since, until=until)
    step = max(1, len(obs) // max_points)
    pts = obs[::step]
    if obs and pts[-1] is not obs[-1]:
        pts.append(obs[-1])
    return {
        "vessel_id": str(v.id),
        "count": len(obs),
        "returned": len(pts),
        "points": [{"t": o.ts.isoformat(), "lat": o.lat, "lon": o.lon, "sog": o.sog, "cog": o.cog, "heading": o.heading,
                    "nav": o.nav_status, "rx": o.receiver_class} for o in pts],
        "synthetic": v.is_synthetic,
    }


@router.get("/{ref}/risk", summary="Explainable SASH Maritime Risk Indicator (current or point-in-time)")
def get_risk(
    ref: str,
    as_of: datetime | None = Query(None, description="Recompute the indicator at this time (UTC)"),
    p: Principal = Depends(require_feature("vessel_risk")),
    db: Session = Depends(get_db),
):
    v = _vessel_or_404(db, ref)
    model = risk_model()
    if as_of is not None:
        if as_of.tzinfo is None:
            as_of = as_of.replace(tzinfo=timezone.utc)
        ctx = build_context(db, v, track_since=as_of - timedelta(days=9))
        ctx.track = [o for o in ctx.track if o.ts <= as_of + timedelta(hours=3)]
        ctx.__post_init__()
        res = RiskEngine(model).assess(ctx, as_of).to_dict()
        res["kind"] = "POINT_IN_TIME"
    else:
        a = db.scalars(select(RiskAssessment).where(RiskAssessment.vessel_id == v.id, RiskAssessment.kind == "CURRENT")
                       .order_by(RiskAssessment.assessed_at.desc()).limit(1)).first()
        if a is None:
            raise HTTPException(status_code=404, detail="No risk assessment available yet")
        res = {
            "vessel_id": str(v.id), "as_of": iso(a.assessed_at), "indicator": "SASH Maritime Risk Indicator",
            "score": a.score, "band": a.band, "confidence": a.confidence, "trend": a.trend,
            "previous_score": (a.data_quality or {}).get("previous_score"),
            "position": {"lat": a.lat, "lon": a.lon} if a.lat is not None else None,
            "components": a.components, "contributors": a.contributors,
            "suppressed": (a.data_quality or {}).get("suppressed", []),
            "data_quality": {k: val for k, val in (a.data_quality or {}).items() if k not in ("suppressed", "previous_score")},
            "model_version": a.model_version, "config_hash": a.config_hash, "kind": "CURRENT",
        }
    res["vessel"] = {"name": v.name, "imo": v.imo, "mmsi": v.mmsi, "synthetic": v.is_synthetic}
    res["disclaimer"] = model["model"]["disclaimer"]
    return res


@router.get("/{ref}/risk/history", summary="Risk indicator time series")
def risk_history(
    ref: str,
    since: datetime | None = None,
    p: Principal = Depends(require_feature("vessel_risk")),
    db: Session = Depends(get_db),
):
    v = _vessel_or_404(db, ref)
    stmt = select(RiskAssessment).where(RiskAssessment.vessel_id == v.id).order_by(RiskAssessment.assessed_at)
    if since:
        stmt = stmt.where(RiskAssessment.assessed_at >= since)
    rows = db.scalars(stmt).all()
    return {"vessel_id": str(v.id), "points": [
        {"t": iso(r.assessed_at), "score": r.score, "band": r.band, "kind": r.kind, "lat": r.lat, "lon": r.lon,
         "components": {k: c["points"] for k, c in (r.components or {}).items()},
         "top": [f"+{c['points']} {c['label']}" for c in (r.contributors or [])[:3]]}
        for r in rows
    ]}


@router.get("/{ref}/risk/at", summary="Stored explanation nearest to (and not after) a time")
def risk_at(ref: str, t: datetime, p: Principal = Depends(require_feature("vessel_risk")), db: Session = Depends(get_db)):
    v = _vessel_or_404(db, ref)
    a = db.scalars(select(RiskAssessment).where(RiskAssessment.vessel_id == v.id, RiskAssessment.assessed_at <= t)
                   .order_by(RiskAssessment.assessed_at.desc()).limit(1)).first()
    if a is None:
        raise HTTPException(status_code=404, detail="No assessment before this time")
    return {"as_of": iso(a.assessed_at), "score": a.score, "band": a.band, "confidence": a.confidence, "trend": a.trend,
            "components": a.components, "contributors": a.contributors,
            "suppressed": (a.data_quality or {}).get("suppressed", []), "model_version": a.model_version}


@router.get("/{ref}/risk/why", summary="WHY did the risk indicator change? (evidence timeline + contributor diff)")
def risk_why(
    ref: str,
    t_from: datetime | None = Query(None, alias="from"),
    t_to: datetime | None = Query(None, alias="to"),
    p: Principal = Depends(require_feature("vessel_risk")),
    db: Session = Depends(get_db),
):
    v = _vessel_or_404(db, ref)
    now = datetime.now(timezone.utc)
    if t_from is None or t_to is None:
        d_from, d_to = default_why_window(db, v, t_to or now)
        t_from, t_to = t_from or d_from, t_to or d_to
    return explain_change(db, v, t_from, t_to)


@router.get("/{ref}/voyages", summary="Voyages derived from port stays")
def voyages(ref: str, p: Principal = Depends(require_feature("vessels")), db: Session = Depends(get_db)):
    v = _vessel_or_404(db, ref)
    rows = db.scalars(select(Voyage).where(Voyage.vessel_id == v.id).order_by(Voyage.departure_time.desc())).all()
    return {"voyages": [{
        "id": str(x.id), "origin_port": x.origin_port, "destination_port": x.destination_port,
        "declared_destination": x.declared_destination, "departure_time": iso(x.departure_time),
        "arrival_time": iso(x.arrival_time), "status": x.status, "distance_km": x.distance_km,
        "max_risk_score": x.max_risk_score, "elevated_exposure_hours": x.elevated_exposure_hours,
    } for x in rows]}


def _anomalies(db: Session, v: Vessel, since: datetime | None = None) -> dict:
    def f(model, col):
        s = select(model).where(model.vessel_id == v.id)
        if since is not None:
            s = s.where(col >= since)
        return db.scalars(s.order_by(col)).all()

    def pos(g):
        if g is None:
            return None
        pt = to_shape(g)
        return {"lat": pt.y, "lon": pt.x}

    return {
        "ais_gaps": [{
            "id": str(g.id), "label": g.label, "gap_start": iso(g.gap_start), "gap_end": iso(g.gap_end), "ongoing": g.ongoing,
            "duration_s": g.duration_s, "start_position": pos(g.start_position), "end_position": pos(g.end_position),
            "geographic_area": g.geographic_area, "expected_interval_s": g.expected_interval_s,
            "coverage_quality": g.coverage_quality, "peer_observations": g.peer_observations, "peer_vessels": g.peer_vessels,
            "implied_speed_kn": g.implied_speed_kn, "position_discontinuity": g.position_discontinuity,
            "anomaly_confidence": g.anomaly_confidence, "observation": g.observation_text, "inference": g.inference_text,
        } for g in f(AisGapEvent, AisGapEvent.gap_start)],
        "loitering": [{
            "id": str(e.id), "start": iso(e.start_time), "end": iso(e.end_time), "ongoing": e.ongoing,
            "centre": {"lat": e.centre_lat, "lon": e.centre_lon}, "radius_km": e.radius_km, "duration_s": e.duration_s,
            "avg_speed_kn": e.avg_speed_kn, "confidence": e.confidence, "observation": e.observation_text,
            "inference": e.inference_text, "context": e.context,
        } for e in f(LoiteringEvent, LoiteringEvent.start_time)],
        "route_deviations": [{
            "id": str(e.id), "start": iso(e.start_time), "end": iso(e.end_time), "ongoing": e.ongoing,
            "max_deviation_km": e.max_deviation_km, "mean_deviation_km": e.mean_deviation_km, "duration_s": e.duration_s,
            "basis": e.basis, "confidence": e.confidence, "expected_path": geom_json(e.expected_path),
            "observed_path": geom_json(e.observed_path), "observation": e.observation_text, "inference": e.inference_text,
        } for e in f(RouteDeviationEvent, RouteDeviationEvent.start_time)],
        "unexpected_stops": [{
            "id": str(e.id), "start": iso(e.start_time), "end": iso(e.end_time), "position": {"lat": e.lat, "lon": e.lon},
            "duration_s": e.duration_s, "confidence": e.confidence, "observation": e.observation_text,
            "inference": e.inference_text,
        } for e in f(StopEvent, StopEvent.start_time)],
        "zone_exposures": [{
            "id": str(e.id), "zone_id": str(e.zone_id), "zone": e.zone_name, "entry_time": iso(e.entry_time),
            "exit_time": iso(e.exit_time), "ongoing": e.ongoing, "duration_s": e.duration_s, "distance_km": e.distance_km,
            "max_threat_level": e.max_threat_level, "entry_position": pos(e.entry_position),
            "exit_position": pos(e.exit_position),
        } for e in f(ZoneExposure, ZoneExposure.entry_time)],
        "asset_proximity": [{
            "id": str(e.id), "asset_id": str(e.asset_id), "entry_time": iso(e.entry_time), "exit_time": iso(e.exit_time),
            "min_distance_km": e.min_distance_km, "ring": e.ring, "authorised": e.authorised,
            "observation": e.observation_text, "inference": e.inference_text,
        } for e in f(AssetProximityEvent, AssetProximityEvent.entry_time)],
    }


@router.get("/{ref}/anomalies", summary="Behavioural anomalies and exposures (observation + inference)")
def anomalies(ref: str, p: Principal = Depends(require_feature("vessels")), db: Session = Depends(get_db)):
    v = _vessel_or_404(db, ref)
    return {"vessel_id": str(v.id), **_anomalies(db, v)}


@router.get("/{ref}/replay", summary="Voyage Replay bundle: track, events, incidents and risk over time")
def replay(
    ref: str,
    voyage_id: str | None = None,
    p: Principal = Depends(require_feature("voyage_replay")),
    db: Session = Depends(get_db),
):
    v = _vessel_or_404(db, ref)
    now = datetime.now(timezone.utc)
    voyage = None
    if voyage_id:
        voyage = db.get(Voyage, voyage_id)
    if voyage is None:
        # Default: the most recent voyage that transited elevated-risk areas, else the latest voyage.
        vs = db.scalars(select(Voyage).where(Voyage.vessel_id == v.id).order_by(Voyage.departure_time.desc())).all()
        voyage = next((x for x in vs if (x.max_risk_score or 0) >= 45), vs[0] if vs else None)
    start = voyage.departure_time - timedelta(hours=6) if voyage else now - timedelta(days=7)
    end = (voyage.arrival_time + timedelta(hours=6)) if (voyage and voyage.arrival_time) else now
    obs = load_track(db, v.id, since=start, until=end)
    risk = db.scalars(select(RiskAssessment).where(
        RiskAssessment.vessel_id == v.id, RiskAssessment.assessed_at >= start, RiskAssessment.assessed_at <= end,
        RiskAssessment.kind == "HISTORY").order_by(RiskAssessment.assessed_at)).all()
    an = _anomalies(db, v, since=start - timedelta(days=1))
    lats = [o.lat for o in obs] or [0]
    lons = [o.lon for o in obs] or [0]
    incs = db.scalars(select(Incident).where(
        Incident.is_synthetic == v.is_synthetic, Incident.occurred_at >= start - timedelta(days=30), Incident.occurred_at <= end,
        Incident.lat.between(min(lats) - 4, max(lats) + 4), Incident.lon.between(min(lons) - 4, max(lons) + 4))).all()
    from app.geo.core import haversine_km

    near_incs = []
    for i in incs:
        d = min((haversine_km(i.lat, i.lon, o.lat, o.lon) for o in obs[::5] or obs), default=1e9)
        if d <= 300:
            j = incident_json(i)
            j["min_distance_to_track_km"] = round(d, 1)
            near_incs.append(j)
    prox = db.execute(select(IncidentProximity.incident_id, IncidentProximity.distance_km, IncidentProximity.band_km)
                      .where(IncidentProximity.vessel_id == v.id)).all()
    ports_seen = []
    if voyage:
        ports_seen = [x for x in (voyage.origin_port, voyage.destination_port) if x]
    return {
        "vessel": vessel_summary(v),
        "voyage": None if voyage is None else {
            "id": str(voyage.id), "origin_port": voyage.origin_port, "destination_port": voyage.destination_port,
            "declared_destination": voyage.declared_destination, "departure_time": iso(voyage.departure_time),
            "arrival_time": iso(voyage.arrival_time), "status": voyage.status, "distance_km": voyage.distance_km,
            "max_risk_score": voyage.max_risk_score, "elevated_exposure_hours": voyage.elevated_exposure_hours,
        },
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "track": [{"t": o.ts.isoformat(), "lat": o.lat, "lon": o.lon, "sog": o.sog, "cog": o.cog, "rx": o.receiver_class}
                  for o in obs],
        "risk": [{"t": iso(r.assessed_at), "score": r.score, "band": r.band,
                  "top": [f"+{c['points']} {c['label']}" for c in (r.contributors or [])[:4]]} for r in risk],
        "anomalies": an,
        "incidents": near_incs,
        "incident_proximity_at_incident_time": [{"incident_id": str(a), "distance_km": b, "band_km": c} for a, b, c in prox],
        "events": vessel_timeline(db, v, start, end),
        "ports": ports_seen,
        "synthetic": v.is_synthetic,
    }


@router.get("/{ref}/profile", summary="Vessel Security Profile with historical exposure")
def profile(ref: str, p: Principal = Depends(require_feature("historical_exposure")), db: Session = Depends(get_db)):
    return security_profile(db, _vessel_or_404(db, ref))


@router.get("/{ref}/report.{fmt}", summary="Historical exposure report (pdf or csv)")
def report(ref: str, fmt: str, request: Request, p: Principal = Depends(require_feature("reports")),
           db: Session = Depends(get_db)):
    if fmt not in ("pdf", "csv"):
        raise HTTPException(status_code=404, detail="Format must be pdf or csv")
    v = _vessel_or_404(db, ref)
    prof = security_profile(db, v)
    now = datetime.now(timezone.utc)
    events = vessel_timeline(db, v, now - timedelta(days=365), now)
    audit("report.export", p.kind, p.id, p.label, "vessel", str(v.id), ip=client_ip(request), details={"format": fmt})
    name = f"sash-exposure-{(v.imo or v.mmsi or str(v.id))}.{fmt}"
    if fmt == "pdf":
        return Response(render_pdf(prof, events), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})
    return Response(render_csv(prof, events), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/{ref}/watchlists", summary="Watchlists (of the caller's organisation) containing this vessel")
def vessel_watchlists(ref: str, p: Principal = Depends(require_feature("watchlists")), db: Session = Depends(get_db)):
    v = _vessel_or_404(db, ref)
    out = []
    stmt = select(Watchlist)
    if not p.is_admin and p.role != "ANALYST":
        stmt = stmt.where(Watchlist.organisation_id == p.org_id)
    for w in db.scalars(stmt).all():
        if v.id in watchlist_vessel_ids(db, str(w.id)):
            out.append({"id": str(w.id), "name": w.name})
    return {"watchlists": out}


@router.get("/{ref}/assets-nearby", summary="Offshore assets near the vessel's latest position")
def assets_nearby(ref: str, radius_km: float = Query(50, gt=0, le=500), p: Principal = Depends(require_feature("assets")),
                  db: Session = Depends(get_db)):
    v = _vessel_or_404(db, ref)
    if v.last_position is None:
        return {"assets": []}
    rows = db.execute(select(OffshoreAsset, func.ST_Distance(func.Geography(OffshoreAsset.position),
                                                             func.Geography(v.last_position)).label("d"))
                      .where(OffshoreAsset.is_synthetic == v.is_synthetic)
                      .where(func.ST_DWithin(func.Geography(OffshoreAsset.position), func.Geography(v.last_position), radius_km * 1000))).all()
    return {"assets": [{"id": str(a.id), "name": a.name, "distance_km": round(d / 1000, 2)} for a, d in rows]}
