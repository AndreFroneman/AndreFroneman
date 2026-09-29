"""'WHY?' — explain a change in the SASH Risk Indicator between two times.

Produces the chronological evidence (observations) plus the contributor differences
(assessment), e.g.

    14:02 entered elevated-risk zone
    14:17 AIS reporting stopped
    16:43 AIS reporting resumed
    17:05 incident reported 84 km away
    Risk changed: 41 → 68
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.geo.core import format_duration, haversine_km
from app.models import (
    AisGapEvent,
    AssetProximityEvent,
    Incident,
    LoiteringEvent,
    RiskAssessment,
    RouteDeviationEvent,
    StopEvent,
    Vessel,
    ZoneExposure,
)
from app.risk.loader import load_track


def _nearest_assessment(db: Session, vessel_id, t: datetime) -> RiskAssessment | None:
    return db.scalars(
        select(RiskAssessment)
        .where(RiskAssessment.vessel_id == vessel_id, RiskAssessment.assessed_at <= t)
        .order_by(RiskAssessment.assessed_at.desc())
        .limit(1)
    ).first()


def vessel_timeline(db: Session, v: Vessel, since: datetime, until: datetime, incident_radius_km: float = 300) -> list[dict]:
    ev: list[dict] = []

    def add(t, kind, text, ref_type=None, ref_id=None, **extra):
        if t and since <= t <= until:
            ev.append({"time": t.isoformat(), "kind": kind, "text": text, "ref_type": ref_type,
                       "ref_id": str(ref_id) if ref_id else None, **extra})

    for z in db.scalars(select(ZoneExposure).where(ZoneExposure.vessel_id == v.id)).all():
        add(z.entry_time, "ZONE_ENTRY", f"Entered {z.zone_name} ({z.max_threat_level.lower()})", "zone_exposure", z.id,
            severity=z.max_threat_level)
        add(z.exit_time, "ZONE_EXIT", f"Exited {z.zone_name}", "zone_exposure", z.id, severity=z.max_threat_level)
    for g in db.scalars(select(AisGapEvent).where(AisGapEvent.vessel_id == v.id)).all():
        add(g.gap_start, "AIS_GAP_START", "AIS reporting stopped (last report)", "ais_gap", g.id,
            confidence=g.anomaly_confidence)
        add(g.gap_end, "AIS_GAP_END", f"AIS reporting resumed after {format_duration(g.duration_s)}", "ais_gap", g.id)
    for d in db.scalars(select(RouteDeviationEvent).where(RouteDeviationEvent.vessel_id == v.id)).all():
        add(d.start_time, "DEVIATION_START", f"Began deviating from expected route (max {d.max_deviation_km:.0f} km)",
            "route_deviation", d.id)
        if not d.ongoing:
            add(d.end_time, "DEVIATION_END", "Returned to expected route", "route_deviation", d.id)
    for lo in db.scalars(select(LoiteringEvent).where(LoiteringEvent.vessel_id == v.id)).all():
        add(lo.start_time, "LOITERING", f"Loitering began ({format_duration(lo.duration_s)}, avg {lo.avg_speed_kn} kn)",
            "loitering", lo.id)
    for s in db.scalars(select(StopEvent).where(StopEvent.vessel_id == v.id)).all():
        add(s.start_time, "STOP", f"Stopped at sea ({format_duration(s.duration_s)})", "stop", s.id)
    for a in db.scalars(select(AssetProximityEvent).where(AssetProximityEvent.vessel_id == v.id)).all():
        add(a.entry_time, "ASSET_APPROACH", a.observation_text, "asset_proximity", a.id)

    track = load_track(db, v.id, since=since - timedelta(hours=6), until=until + timedelta(hours=6))
    if track:
        incs = db.scalars(
            select(Incident).where(
                Incident.is_synthetic == v.is_synthetic,
                Incident.occurred_at >= since - timedelta(days=2),
                Incident.occurred_at <= until,
            )
        ).all()
        for i in incs:
            known = max(i.occurred_at, i.reported_at or i.occurred_at)
            if not (since <= known <= until):
                continue
            near = min(track, key=lambda o: abs((o.ts - known).total_seconds()))
            d = haversine_km(near.lat, near.lon, i.lat, i.lon)
            if d <= incident_radius_km:
                add(known, "INCIDENT", f"{i.category.replace('_', ' ').capitalize()} reported {d:.0f} km away: {i.title}",
                    "incident", i.id, distance_km=round(d, 1))
    ev.sort(key=lambda e: e["time"])
    return ev


def explain_change(db: Session, v: Vessel, t_from: datetime, t_to: datetime) -> dict:
    a0 = _nearest_assessment(db, v.id, t_from)
    a1 = _nearest_assessment(db, v.id, t_to)
    before = {c["rule"]: c for c in (a0.contributors if a0 else [])}
    after = {c["rule"]: c for c in (a1.contributors if a1 else [])}
    changes = []
    for rule in sorted(set(before) | set(after)):
        b, a = before.get(rule), after.get(rule)
        pb, pa = (b or {}).get("points", 0), (a or {}).get("points", 0)
        if pb == pa:
            continue
        changes.append({
            "rule": rule,
            "label": (a or b)["label"],
            "component": (a or b)["component"],
            "points_before": pb,
            "points_after": pa,
            "delta": pa - pb,
            "status": "added" if b is None else "removed" if a is None else "changed",
            "observation": (a or b)["observation"],
            "inference": (a or b)["inference"],
        })
    changes.sort(key=lambda c: -abs(c["delta"]))
    s0 = a0.score if a0 else None
    s1 = a1.score if a1 else None
    return {
        "vessel_id": str(v.id),
        "from": t_from.isoformat(),
        "to": t_to.isoformat(),
        "score_before": s0,
        "score_after": s1,
        "band_before": a0.band if a0 else None,
        "band_after": a1.band if a1 else None,
        "summary": f"Risk changed: {s0 if s0 is not None else '—'} → {s1 if s1 is not None else '—'}",
        "timeline": vessel_timeline(db, v, t_from, t_to),
        "contributor_changes": changes,
    }


def default_why_window(db: Session, v: Vessel, now: datetime, lookback_h: int = 72) -> tuple[datetime, datetime]:
    """Default comparison: from the lowest point in the lookback window to now."""
    rows = db.scalars(
        select(RiskAssessment)
        .where(RiskAssessment.vessel_id == v.id, RiskAssessment.kind == "HISTORY",
               RiskAssessment.assessed_at >= now - timedelta(hours=lookback_h))
        .order_by(RiskAssessment.assessed_at)
    ).all()
    if not rows:
        return now - timedelta(hours=24), now
    lowest = min(rows, key=lambda r: (r.score, -r.assessed_at.timestamp()))
    if lowest.assessed_at >= now - timedelta(hours=1):
        return now - timedelta(hours=24), now
    return lowest.assessed_at, now
