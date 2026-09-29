"""Analytics pipeline: detection → persistence → risk history → alerts.

The pipeline is idempotent. Derived events use deterministic UUIDs (uuid5 of their
natural key) so re-running it produces identical identifiers, and alerts are keyed by
stable dedup keys so analyst acknowledgements survive recomputation. Raw observations
are never modified.

Scaling note: the MVP recomputes each vessel's recent window in full. At higher volume
this becomes an incremental stream processor fed by the event bus (see ARCHITECTURE.md).
"""
from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timedelta, timezone

from geoalchemy2.elements import WKTElement
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.alerts.engine import AlertBuilder, RiskSeries, first_approach, notify_webhook, persist_alerts
from app.analytics.ais_gaps import detect_ais_gaps, peer_window
from app.analytics.loitering import detect_loitering
from app.analytics.route_deviation import detect_route_deviations
from app.analytics.stops import detect_unexpected_stops
from app.analytics.types import Obs
from app.analytics.voyages import segment_voyages
from app.analytics.zones import ZoneShape, compute_zone_exposures, zones_at
from app.core.metrics import ANALYTICS_DURATION, ANALYTICS_RUNS
from app.core.yamlconfig import alert_config, config_hash, detection_config, risk_model
from app.geo.core import haversine_km, interpolate_position
from app.geo.routing import ports, resolve_port, route_between_ports, route_from_position
from app.models import (
    AisGapEvent,
    AnalyticsRun,
    AssetProximityEvent,
    IncidentProximity,
    LoiteringEvent,
    OffshoreAsset,
    RiskAssessment,
    RouteDeviationEvent,
    StopEvent,
    Vessel,
    Voyage,
    ZoneExposure,
)
from app.risk.engine import RiskContext, RiskEngine
from app.risk.loader import (
    load_environment,
    load_events,
    load_incidents,
    load_track,
    load_zones,
    vessel_profile,
)

log = logging.getLogger(__name__)
NS = uuid.UUID("5a5b0000-0000-4000-8000-00000000cafe")


def stable_id(*parts) -> uuid.UUID:
    return uuid.uuid5(NS, ":".join(str(p) for p in parts))


def pt(lat: float, lon: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def line(points: list[tuple[float, float]]) -> WKTElement | None:
    if len(points) < 2:
        return None
    return WKTElement("LINESTRING(" + ",".join(f"{lon} {lat}" for lat, lon in points) + ")", srid=4326)


# ----------------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------------
def port_checker(radius_km: float):
    plist = list(ports().values())

    def check(lat: float, lon: float) -> bool:
        return any(haversine_km(lat, lon, p.lat, p.lon) <= radius_km for p in plist)

    return check


def port_at(radius_km: float = 15.0):
    plist = list(ports().values())

    def lookup(lat: float, lon: float) -> str | None:
        best = None
        for p in plist:
            d = haversine_km(lat, lon, p.lat, p.lon)
            if d <= radius_km and (best is None or d < best[1]):
                best = (p.unlocode, d)
        return best[0] if best else None

    return lookup


def make_peer_lookup(db: Session, vessel_id, synthetic: bool):
    def lookup(lat, lon, start, end, radius_km):
        s, e = peer_window(start, end)
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(0.2, abs(__import__("math").cos(__import__("math").radians(lat)))))
        row = db.execute(
            text(
                "SELECT count(*) AS n, count(DISTINCT vessel_id) AS v FROM ais_observations "
                "WHERE ts > :s AND ts < :e AND vessel_id <> :vid AND is_synthetic = :syn "
                "AND position && ST_MakeEnvelope(:w, :so, :ea, :no, 4326) "
                "AND ST_DWithin(position::geography, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :r)"
            ),
            {"s": s, "e": e, "vid": vessel_id, "syn": synthetic, "w": lon - dlon, "so": lat - dlat,
             "ea": lon + dlon, "no": lat + dlat, "lon": lon, "lat": lat, "r": radius_km * 1000},
        ).one()
        return int(row.n), int(row.v)

    return lookup


def expected_route_for(voyage, v: Vessel, track: list[Obs]):
    """Return (expected_polyline, basis, destination_label) or None."""
    dest = voyage.destination_port
    basis = "PORT_CALLS"
    if dest is None:
        ref = resolve_port(v.destination)
        if ref is None:
            return None
        dest, basis = ref.unlocode, "DECLARED_DESTINATION"
    label = ports()[dest].name
    if voyage.origin_port == dest:
        return None  # round trip / stale declared destination: no meaningful expected route
    try:
        if voyage.origin_port and voyage.origin_port != dest:
            return route_between_ports(voyage.origin_port, dest), basis, label
        first = track[voyage.start_index]
        return route_from_position(first.lat, first.lon, dest), basis, label
    except ValueError:
        return None


def asset_passes(track: list[Obs], asset: OffshoreAsset):
    """Entry/exit passes of a track through an asset's monitoring radius."""
    passes = []
    cur = None
    for o in track:
        d = haversine_km(o.lat, o.lon, asset.lat, asset.lon)
        inside = d <= asset.monitoring_radius_km
        if inside and cur is None:
            cur = {"entry": o.ts, "exit": None, "min_km": d, "lat": o.lat, "lon": o.lon}
        elif inside:
            if d < cur["min_km"]:
                cur.update(min_km=d, lat=o.lat, lon=o.lon)
        elif cur is not None:
            cur["exit"] = o.ts
            passes.append(cur)
            cur = None
    if cur is not None:
        passes.append(cur)
    for p in passes:
        p["ring"] = "SECURITY" if p["min_km"] <= asset.security_radius_km else "MONITORING"
    return passes


# ----------------------------------------------------------------------------------
# Per-vessel analytics
# ----------------------------------------------------------------------------------
def analyse_vessel(
    db: Session,
    v: Vessel,
    now: datetime,
    zones: list[ZoneShape],
    incidents,
    environment,
    assets: list[OffshoreAsset],
    engine: RiskEngine,
    history_days: int = 14,
) -> dict:
    det = detection_config()
    track = load_track(db, v.id, since=now - timedelta(days=history_days + 2))
    stats = {"observations": len(track)}
    if len(track) < 2:
        return stats
    syn = v.is_synthetic

    # --- 1. detection --------------------------------------------------------------
    voyages = segment_voyages(track, det["voyage_segmentation"], port_at(15))
    # Locations where this vessel is expected to hold station (assets it is authorised at).
    home_assets = [a for a in assets if v.mmsi and v.mmsi in (a.authorised_mmsis or [])]

    def expected_station(radius_km: float):
        near_port = port_checker(radius_km)

        def check(lat: float, lon: float) -> bool:
            return near_port(lat, lon) or any(
                haversine_km(lat, lon, a.lat, a.lon) <= a.monitoring_radius_km for a in home_assets
            )

        return check

    gaps = detect_ais_gaps(track, det["ais_gap"], now=now, peer_lookup=make_peer_lookup(db, v.id, syn), in_port=port_checker(15))
    loiters = detect_loitering(track, det["loitering"], v.vessel_type, expected_station(det["loitering"]["exclude_port_radius_km"]), now)
    stops = detect_unexpected_stops(track, det["unexpected_stop"], expected_station(det["unexpected_stop"]["exclude_port_radius_km"]), now)
    # A stop is the more specific explanation; drop loitering that mostly overlaps one.
    def _overlap(lo, st) -> float:
        inter = (min(lo.end, st.end) - max(lo.start, st.start)).total_seconds()
        return max(0.0, inter) / max(1.0, lo.duration_s)

    loiters = [lo for lo in loiters if not any(_overlap(lo, st) > 0.5 for st in stops)]
    deviations = []
    excluded_types = {t.lower() for t in det["route_deviation"].get("exclude_vessel_types", [])}
    for voy in ([] if (v.vessel_type or "").lower() in excluded_types else voyages):
        er = expected_route_for(voy, v, track)
        if er is None:
            continue
        expected, basis, label = er
        seg = track[voy.start_index : voy.end_index + 1]
        deviations += detect_route_deviations(seg, expected, det["route_deviation"], basis, label, now)
    exposures = compute_zone_exposures(track, zones, now)

    # --- 2. persistence (replace derived rows for this vessel) ---------------------
    for model in (AisGapEvent, LoiteringEvent, RouteDeviationEvent, StopEvent, ZoneExposure, Voyage):
        db.execute(delete(model).where(model.vessel_id == v.id))
    db.execute(delete(AssetProximityEvent).where(AssetProximityEvent.vessel_id == v.id))

    gap_ids = []
    for g in gaps:
        gid = stable_id("gap", v.id, g.gap_start.isoformat())
        gap_ids.append(gid)
        zn = [z.name for z in zones_at(zones, g.last.lat, g.last.lon, g.gap_start)]
        db.add(AisGapEvent(
            id=gid, vessel_id=v.id, last_observation_id=g.last.id, next_observation_id=g.next.id if g.next else None,
            gap_start=g.gap_start, gap_end=g.gap_end, ongoing=g.ongoing, duration_s=g.duration_s,
            start_position=pt(g.last.lat, g.last.lon), end_position=pt(g.next.lat, g.next.lon) if g.next else None,
            geographic_area=", ".join(zn) if zn else None, expected_interval_s=g.expected_interval_s,
            coverage_quality=g.coverage_quality, peer_observations=g.peer_observations, peer_vessels=g.peer_vessels,
            implied_speed_kn=g.implied_speed_kn, position_discontinuity=g.position_discontinuity,
            anomaly_confidence=g.anomaly_confidence, observation_text=g.observation_text,
            inference_text=g.inference_text, is_synthetic=syn, computed_at=now,
        ))
    loiter_ids = []
    for lo in loiters:
        lid = stable_id("loiter", v.id, lo.start.isoformat())
        loiter_ids.append(lid)
        near = [a for a in assets if haversine_km(lo.centre_lat, lo.centre_lon, a.lat, a.lon) <= a.monitoring_radius_km * 1.5]
        lo.context["near_asset"] = near[0].name if near else None
        db.add(LoiteringEvent(
            id=lid, vessel_id=v.id, start_time=lo.start, end_time=lo.end, ongoing=lo.ongoing,
            centre=pt(lo.centre_lat, lo.centre_lon), centre_lat=lo.centre_lat, centre_lon=lo.centre_lon,
            radius_km=lo.radius_km, duration_s=lo.duration_s, avg_speed_kn=lo.avg_speed_kn,
            observation_count=lo.observation_count, confidence=lo.confidence, context=lo.context,
            observation_text=lo.observation_text, inference_text=lo.inference_text, is_synthetic=syn, computed_at=now,
        ))
    stop_ids = []
    for st in stops:
        sid = stable_id("stop", v.id, st.start.isoformat())
        stop_ids.append(sid)
        db.add(StopEvent(
            id=sid, vessel_id=v.id, start_time=st.start, end_time=st.end, ongoing=st.ongoing,
            position=pt(st.lat, st.lon), lat=st.lat, lon=st.lon, prior_speed_kn=st.prior_speed_kn,
            duration_s=st.duration_s, confidence=st.confidence, observation_text=st.observation_text,
            inference_text=st.inference_text, is_synthetic=syn, computed_at=now,
        ))
    dev_ids = []
    for dv in deviations:
        did = stable_id("deviation", v.id, dv.start.isoformat())
        dev_ids.append(did)
        db.add(RouteDeviationEvent(
            id=did, vessel_id=v.id, start_time=dv.start, end_time=dv.end, ongoing=dv.ongoing,
            expected_path=line(dv.expected_path), observed_path=line(dv.observed_path),
            max_deviation_km=dv.max_deviation_km, mean_deviation_km=dv.mean_deviation_km,
            duration_s=dv.duration_s, basis=dv.basis, declared_destination=v.destination,
            confidence=dv.confidence, observation_text=dv.observation_text, inference_text=dv.inference_text,
            is_synthetic=syn, computed_at=now,
        ))
    for ex in exposures:
        ex.db_id = stable_id("exposure", v.id, ex.zone_id, ex.entry_time.isoformat())
        db.add(ZoneExposure(
            id=ex.db_id, vessel_id=v.id, zone_id=ex.zone_id, zone_name=ex.zone_name,
            entry_time=ex.entry_time, exit_time=ex.exit_time, ongoing=ex.ongoing, duration_s=ex.duration_s,
            distance_km=ex.distance_km, max_threat_level=ex.severity,
            entry_position=pt(*ex.entry_pos), exit_position=pt(*ex.exit_pos) if ex.exit_pos else None,
            observation_text=(
                f"Entered '{ex.zone_name}' at {ex.entry_time:%Y-%m-%d %H:%MZ}"
                + (f", exited {ex.exit_time:%Y-%m-%d %H:%MZ}" if ex.exit_time else ", still inside")
                + f"; {ex.distance_km:.0f} km travelled inside."
            ),
            inference_text=f"Exposure to a {ex.severity.lower()}-severity designated risk area.",
            is_synthetic=syn, computed_at=now,
        ))
    asset_events = []
    for a in assets:
        for p in asset_passes(track, a):
            aid = stable_id("asset", v.id, a.id, p["entry"].isoformat())
            p["authorised"] = bool(v.mmsi and v.mmsi in (a.authorised_mmsis or []))
            asset_events.append((a, p, aid))
            db.add(AssetProximityEvent(
                id=aid, vessel_id=v.id, asset_id=a.id, entry_time=p["entry"], exit_time=p["exit"],
                ongoing=p["exit"] is None, min_distance_km=round(p["min_km"], 2), ring=p["ring"],
                authorised=p["authorised"], confidence=0.9,
                observation_text=f"Closest approach {p['min_km']:.1f} km to {a.name} ({p['ring'].lower()} radius).",
                inference_text=("Authorised vessel activity at the asset." if p["authorised"]
                                else "Vessel not on the asset's authorised list; purpose unknown."),
                is_synthetic=syn, computed_at=now,
            ))
    db.flush()

    # --- 3. risk history --------------------------------------------------------------
    ctx = RiskContext(
        vessel=vessel_profile(v), track=track, zones=zones, incidents=incidents,
        events=load_events(db, v.id), environment=environment,
    )
    step = timedelta(hours=det["risk_history"]["step_hours"])
    start = max(track[0].ts, now - timedelta(days=history_days)).replace(minute=0, second=0, microsecond=0) + step
    times = []
    t = start
    while t < now:
        times.append(t)
        t += step
    max_pts = det["risk_history"]["max_points_per_vessel"]
    if len(times) > max_pts:
        times = times[-max_pts:]
    db.execute(delete(RiskAssessment).where(RiskAssessment.vessel_id == v.id))
    history = []
    for t in times:
        r = engine.assess(ctx, t, with_trend=False)
        if r.lat is None:
            continue
        history.append(r)
    series_pts = [(r.as_of, r.score, [c.to_dict() for c in r.contributors]) for r in history]
    series = RiskSeries(series_pts)
    for r in history:
        prev = series.score_at(r.as_of - timedelta(hours=risk_model()["trend"]["window_hours"]))
        r.previous_score = prev
        diff = r.score - prev if prev is not None else 0
        thr = risk_model()["trend"]["threshold_points"]
        r.trend = "Increasing" if diff >= thr else "Decreasing" if diff <= -thr else "Stable"
    current = engine.assess(ctx, now, with_trend=True)
    rows = []
    for r, kind in [*[(h, "HISTORY") for h in history], (current, "CURRENT")]:
        rows.append(dict(
            id=uuid.uuid4(), vessel_id=v.id, assessed_at=r.as_of, score=r.score, band=r.band,
            confidence=r.confidence, trend=r.trend, lat=r.lat, lon=r.lon, components=r.components,
            contributors=[c.to_dict() for c in r.contributors],
            data_quality={**r.data_quality, "suppressed": r.suppressed, "previous_score": r.previous_score},
            model_version=r.model_version, config_hash=r.config_hash, kind=kind, is_synthetic=syn, created_at=now,
        ))
    if rows:
        db.execute(RiskAssessment.__table__.insert(), rows)
    v.current_risk_score = current.score
    v.current_risk_band = current.band
    v.current_risk_trend = current.trend

    # --- 4. voyages -----------------------------------------------------------------------
    for voy in voyages:
        span = [h for h in history if voy.departure_time <= h.as_of <= (voy.arrival_time or now)]
        elev = ctx.elevated_hours(voy.departure_time, voy.arrival_time or now, "ELEVATED")
        db.add(Voyage(
            id=stable_id("voyage", v.id, voy.departure_time.isoformat()), vessel_id=v.id,
            origin_port=voy.origin_port, destination_port=voy.destination_port or (resolve_port(v.destination).unlocode if resolve_port(v.destination) and voy.arrival_time is None else None),
            declared_destination=v.destination if voy.arrival_time is None else None,
            departure_time=voy.departure_time, arrival_time=voy.arrival_time,
            status="COMPLETED" if voy.arrival_time else "UNDERWAY", distance_km=voy.distance_km,
            observation_count=voy.observation_count, max_risk_score=max((h.score for h in span), default=None),
            elevated_exposure_hours=round(elev, 1), is_synthetic=syn, computed_at=now,
        ))

    # --- 5. alerts ----------------------------------------------------------------------
    acfg = alert_config()
    ab = AlertBuilder(acfg, v, series, now)
    thr_gap = det["ais_gap"]
    for ex in exposures:
        ab.zone_entry(ex)
    for g, gid in zip(gaps, gap_ids, strict=False):
        known = g.gap_start + timedelta(seconds=max(thr_gap["min_gap_minutes"] * 60, thr_gap["interval_multiplier"] * g.expected_interval_s))
        ab.ais_gap(g, gid, min(known, now), [z.name for z in zones_at(zones, g.last.lat, g.last.lon, g.gap_start)])
    for dv, did in zip(deviations, dev_ids, strict=False):
        known = dv.start + timedelta(hours=det["route_deviation"]["min_duration_hours"])
        mid = dv.observed_path[len(dv.observed_path) // 2]
        ab.deviation(dv, did, known, [z.name for z in zones_at(zones, mid[0], mid[1], known)])
    for lo, lid in zip(loiters, loiter_ids, strict=False):
        known = lo.start + timedelta(hours=det["loitering"]["min_duration_hours"])
        ab.loitering(lo, lid, known, [z.name for z in zones_at(zones, lo.centre_lat, lo.centre_lon, known)], lo.context.get("near_asset"))
    for st, sid in zip(stops, stop_ids, strict=False):
        known = st.start + timedelta(minutes=det["unexpected_stop"]["min_duration_minutes"])
        ab.stop(st, sid, known, [z.name for z in zones_at(zones, st.lat, st.lon, known)])
    ip = acfg["rules"]["INCIDENT_PROXIMITY"]
    for inc in incidents:
        hit = first_approach(track, inc, ip["max_km"], ip["within_hours_after_incident"])
        if hit:
            ab.incident_approach(inc, *hit)
    for a, p, aid in asset_events:
        ab.asset_approach(a, p, aid)
    ab.risk_increases()
    new_alerts = persist_alerts(db, ab.drafts)

    stats.update(
        voyages=len(voyages), gaps=len(gaps), loitering=len(loiters), stops=len(stops),
        deviations=len(deviations), exposures=len(exposures), risk_points=len(history),
        current_risk=current.score, new_alerts=len(new_alerts),
    )
    stats["_new_alert_drafts"] = new_alerts
    return stats


# ----------------------------------------------------------------------------------
# Incident proximity correlation (vessels near each incident at incident time)
# ----------------------------------------------------------------------------------
def compute_incident_proximities(db: Session, synthetic: bool) -> int:
    det = detection_config()["incident_proximity"]
    bands = sorted(det["bands_km"])
    window = timedelta(hours=det["time_window_hours"])
    max_bracket = det["max_bracket_gap_hours"] * 3600
    incidents = load_incidents(db, synthetic)
    ids = [i.id for i in incidents]
    if ids:
        db.execute(delete(IncidentProximity).where(IncidentProximity.incident_id.in_(ids)))
    count = 0
    for inc in incidents:
        buf_km = bands[-1] + det["time_window_hours"] * 30 * 1.852
        dlat = buf_km / 111.0
        import math

        dlon = buf_km / (111.0 * max(0.2, math.cos(math.radians(inc.lat))))
        rows = db.execute(
            text(
                "SELECT vessel_id, ts, lat, lon FROM ais_observations WHERE is_synthetic = :syn "
                "AND ts BETWEEN :t0 AND :t1 AND position && ST_MakeEnvelope(:w, :s, :e, :n, 4326) "
                "ORDER BY vessel_id, ts"
            ),
            {"syn": synthetic, "t0": inc.occurred_at - window, "t1": inc.occurred_at + window,
             "w": inc.lon - dlon, "s": inc.lat - dlat, "e": inc.lon + dlon, "n": inc.lat + dlat},
        ).all()
        by_vessel: dict = {}
        for r in rows:
            by_vessel.setdefault(r.vessel_id, []).append(r)
        for vid, obs in by_vessel.items():
            before = [o for o in obs if o.ts <= inc.occurred_at]
            after = [o for o in obs if o.ts > inc.occurred_at]
            if before and after and (after[0].ts - before[-1].ts).total_seconds() <= max_bracket:
                a, b = before[-1], after[0]
                lat, lon = interpolate_position(inc.occurred_at, a.ts, a.lat, a.lon, b.ts, b.lat, b.lon)
                method = "INTERPOLATED"
                delta = min((inc.occurred_at - a.ts).total_seconds(), (b.ts - inc.occurred_at).total_seconds())
            else:
                o = min(obs, key=lambda o: abs((o.ts - inc.occurred_at).total_seconds()))
                lat, lon, method = o.lat, o.lon, "NEAREST"
                delta = abs((o.ts - inc.occurred_at).total_seconds())
            d = haversine_km(lat, lon, inc.lat, inc.lon)
            band = next((b for b in bands if d <= b), None)
            if band is None:
                continue
            db.add(IncidentProximity(
                incident_id=inc.id, vessel_id=vid, distance_km=round(d, 1), band_km=band,
                vessel_lat=lat, vessel_lon=lon, position_method=method, nearest_obs_delta_s=delta,
                is_synthetic=synthetic,
            ))
            count += 1
    return count


# ----------------------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------------------
def run_analytics(db: Session, now: datetime | None = None, vessel_ids=None, kind: str = "SCHEDULED") -> dict:
    now = now or datetime.now(timezone.utc)
    # One analytics run at a time across all processes (API manual trigger + worker schedule).
    if not db.execute(text("SELECT pg_try_advisory_xact_lock(5417002)")).scalar():
        return {"skipped": True, "reason": "another analytics run is in progress"}
    t0 = time.monotonic()
    model = risk_model()
    engine = RiskEngine(model)
    run = AnalyticsRun(kind=kind, config_hash=config_hash([model, detection_config(), alert_config()]))
    db.add(run)
    db.flush()
    totals: dict = {"vessels": 0, "new_alerts": 0, "proximities": 0}
    new_drafts = []
    try:
        for syn in (True, False):
            q = select(Vessel).where(Vessel.is_synthetic == syn)
            if vessel_ids:
                q = q.where(Vessel.id.in_(vessel_ids))
            vessels = db.scalars(q).all()
            if not vessels:
                continue
            zones = load_zones(db, syn)
            incidents = load_incidents(db, syn, since=now - timedelta(days=800))
            env = load_environment(db, syn, since=now - timedelta(days=20))
            assets = db.scalars(select(OffshoreAsset).where(OffshoreAsset.is_synthetic == syn)).all()
            for v in vessels:
                s = analyse_vessel(db, v, now, zones, incidents, env, assets, engine)
                new_drafts += s.pop("_new_alert_drafts", [])
                totals["vessels"] += 1
                totals["new_alerts"] += s.get("new_alerts", 0)
            totals["proximities"] += compute_incident_proximities(db, syn)
        from app.fusion.correlator import run_fusion

        totals["fusion"] = run_fusion(db, now)
        run.status = "SUCCESS"
        ANALYTICS_RUNS.labels(status="success").inc()
    except Exception as exc:
        db.rollback()
        log.exception("analytics run failed")
        ANALYTICS_RUNS.labels(status="error").inc()
        db.add(AnalyticsRun(kind=kind, status="FAILED", finished_at=datetime.now(timezone.utc), error=str(exc)[:4000]))
        db.commit()
        raise
    finally:
        elapsed = time.monotonic() - t0
        ANALYTICS_DURATION.observe(elapsed)
    run.finished_at = datetime.now(timezone.utc)
    run.stats = {**totals, "seconds": round(elapsed, 2)}
    db.commit()
    notify_webhook(new_drafts)
    log.info("analytics run complete: %s", run.stats)
    return run.stats
