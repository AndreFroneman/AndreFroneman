"""Vessel Security Profile and historical exposure analytics (insurance reporting)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.yamlconfig import risk_model
from app.models import (
    AisGapEvent,
    Incident,
    IncidentProximity,
    LoiteringEvent,
    RiskAssessment,
    RouteDeviationEvent,
    SanctionsEntry,
    StopEvent,
    Vessel,
    Voyage,
    ZoneExposure,
)
from app.models.common import SEVERITY_RANK
from app.services.serialize import iso, vessel_detail

ELEVATED_SCORE = 45


def historical_exposure(db: Session, v: Vessel, months: int = 12, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    since = now - timedelta(days=30 * months)
    voyages = db.scalars(select(Voyage).where(Voyage.vessel_id == v.id, Voyage.departure_time >= since)).all()
    exposures = db.scalars(select(ZoneExposure).where(ZoneExposure.vessel_id == v.id, ZoneExposure.entry_time >= since)).all()
    gaps = db.scalars(select(AisGapEvent).where(AisGapEvent.vessel_id == v.id, AisGapEvent.gap_start >= since)).all()
    deviations = db.scalar(select(func.count()).select_from(RouteDeviationEvent).where(
        RouteDeviationEvent.vessel_id == v.id, RouteDeviationEvent.start_time >= since))
    loitering = db.scalar(select(func.count()).select_from(LoiteringEvent).where(
        LoiteringEvent.vessel_id == v.id, LoiteringEvent.start_time >= since))
    stops = db.scalar(select(func.count()).select_from(StopEvent).where(
        StopEvent.vessel_id == v.id, StopEvent.start_time >= since))
    nearby = db.execute(
        select(IncidentProximity.band_km, func.count())
        .join(Incident, Incident.id == IncidentProximity.incident_id)
        .where(IncidentProximity.vessel_id == v.id, Incident.occurred_at >= since)
        .group_by(IncidentProximity.band_km)
    ).all()
    confirmed = db.scalar(select(func.count()).select_from(Incident).where(
        Incident.affected_vessel_id == v.id, Incident.occurred_at >= since,
        Incident.verification_status.in_(["VERIFIED", "PARTIALLY_VERIFIED"])))
    elevated_h = sum(
        (e.duration_s or 0) for e in exposures if SEVERITY_RANK.get(e.max_threat_level, 0) >= SEVERITY_RANK["ELEVATED"]
    ) / 3600
    high_transits = [e for e in exposures if SEVERITY_RANK.get(e.max_threat_level, 0) >= SEVERITY_RANK["HIGH"]]
    history_start = db.scalar(select(func.min(RiskAssessment.assessed_at)).where(RiskAssessment.vessel_id == v.id))
    return {
        "period_months": months,
        "period_start": since.isoformat(),
        "observed_from": iso(history_start),
        "voyages_analysed": len(voyages),
        "elevated_risk_voyages": sum(1 for x in voyages if (x.max_risk_score or 0) >= ELEVATED_SCORE),
        "high_risk_zone_transits": len(high_transits),
        "elevated_risk_exposure_hours": round(elevated_h, 1),
        "ais_anomalies": sum(1 for g in gaps if g.anomaly_confidence >= 0.5),
        "ais_gaps_total": len(gaps),
        "route_deviations": deviations or 0,
        "loitering_events": loitering or 0,
        "unexpected_stops": stops or 0,
        "nearby_security_incidents": {f"within_{b}_km": n for b, n in sorted(nearby)},
        "nearby_security_incidents_total": sum(n for _, n in nearby),
        "confirmed_vessel_incidents": confirmed or 0,
        "zones": sorted({e.zone_name for e in exposures}),
        "note": (
            "Exposure metrics cover the period for which SASH holds observations for this vessel"
            + (f" (from {history_start:%Y-%m-%d})." if history_start else ".")
        ),
    }


def sanctions_screening(db: Session, v: Vessel) -> dict:
    loaded = db.scalar(select(func.count()).select_from(SanctionsEntry)) or 0
    if not loaded:
        return {"status": "NOT_SCREENED", "detail": "No sanctions lists loaded (enable the OFAC SDN connector)."}
    matches = db.scalars(select(SanctionsEntry).where(
        (SanctionsEntry.imo == v.imo) if v.imo else (SanctionsEntry.mmsi == v.mmsi))).all() if (v.imo or v.mmsi) else []
    if not matches:
        return {"status": "NO_MATCH", "detail": f"No identifier match across {loaded} loaded list entries."}
    return {
        "status": "POTENTIAL_MATCH",
        "detail": "Identifier match found — verify against the official list before any action.",
        "matches": [{"list": m.list_name, "entity": m.entity_name, "program": m.program, "imo": m.imo,
                     "source": m.source_name, "retrieved_at": iso(m.retrieved_at)} for m in matches],
    }


def security_profile(db: Session, v: Vessel) -> dict:
    current = db.scalars(
        select(RiskAssessment).where(RiskAssessment.vessel_id == v.id, RiskAssessment.kind == "CURRENT")
        .order_by(RiskAssessment.assessed_at.desc()).limit(1)
    ).first()
    return {
        "vessel": vessel_detail(v),
        "current_status": {
            "position": None if v.last_lat is None else {"lat": v.last_lat, "lon": v.last_lon},
            "speed_kn": v.last_sog,
            "course_deg": v.last_cog,
            "heading_deg": v.last_heading,
            "nav_status": v.last_nav_status,
            "destination": v.destination,
            "eta": iso(v.eta),
            "last_report": iso(v.last_seen_at),
        },
        "current_risk": None if current is None else {
            "indicator": "SASH Maritime Risk Indicator",
            "score": current.score,
            "band": current.band,
            "trend": current.trend,
            "confidence": current.confidence,
            "assessed_at": iso(current.assessed_at),
        },
        "historical_exposure": historical_exposure(db, v),
        "sanctions_screening": sanctions_screening(db, v),
        "disclaimer": risk_model()["model"]["disclaimer"],
    }
