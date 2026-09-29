"""Builds in-memory analytic context (track, zones, incidents, events) from PostGIS.

The synthetic (demo) world and the live world are strictly separated: a vessel's risk
is only ever computed from intelligence with the same data mode, so demo intelligence
can never contaminate a live assessment (and vice versa).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from geoalchemy2.shape import to_shape
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.analytics.types import Obs
from app.analytics.zones import ZoneShape
from app.core.yamlconfig import detection_config
from app.models import (
    AisGapEvent,
    EnvironmentObservation,
    Incident,
    LoiteringEvent,
    RiskZone,
    RouteDeviationEvent,
    StopEvent,
    Vessel,
)
from app.risk.engine import EnvRec, EventRec, IncidentRec, RiskContext, VesselProfile


def load_track(db: Session, vessel_id: uuid.UUID, since: datetime | None = None, until: datetime | None = None) -> list[Obs]:
    q = (
        "SELECT id, ts, lat, lon, sog, cog, heading, nav_status, receiver_class "
        "FROM ais_observations WHERE vessel_id = :v"
    )
    params: dict = {"v": vessel_id}
    if since:
        q += " AND ts >= :s"
        params["s"] = since
    if until:
        q += " AND ts <= :u"
        params["u"] = until
    q += " ORDER BY ts"
    rows = db.execute(text(q), params).all()
    return [
        Obs(ts=r.ts, lat=r.lat, lon=r.lon, sog=r.sog, cog=r.cog, heading=r.heading,
            nav_status=r.nav_status, receiver_class=r.receiver_class, id=r.id)
        for r in rows
    ]


def load_zones(db: Session, synthetic: bool) -> list[ZoneShape]:
    zones = db.scalars(select(RiskZone).where(RiskZone.is_synthetic == synthetic)).all()
    return [
        ZoneShape(
            id=z.id,
            name=z.name,
            severity=z.severity,
            geom=to_shape(z.geom),
            effective_start=z.effective_start,
            effective_end=z.effective_end,
            category=z.category,
        )
        for z in zones
    ]


def load_incidents(db: Session, synthetic: bool, since: datetime | None = None) -> list[IncidentRec]:
    q = select(Incident).where(Incident.is_synthetic == synthetic)
    if since:
        q = q.where(Incident.occurred_at >= since)
    return [
        IncidentRec(
            id=i.id,
            occurred_at=i.occurred_at,
            reported_at=i.reported_at,
            lat=i.lat,
            lon=i.lon,
            category=i.category,
            title=i.title,
            verification_status=i.verification_status,
            confidence=i.confidence,
            source_name=i.source_name,
            affected_vessel_id=i.affected_vessel_id,
            is_synthetic=i.is_synthetic,
        )
        for i in db.scalars(q).all()
    ]


def load_environment(db: Session, synthetic: bool, since: datetime | None = None) -> list[EnvRec]:
    q = select(EnvironmentObservation).where(EnvironmentObservation.is_synthetic == synthetic)
    if since:
        q = q.where(EnvironmentObservation.observed_at >= since)
    return [
        EnvRec(
            observed_at=e.observed_at,
            lat=e.lat,
            lon=e.lon,
            wave_height_m=e.wave_height_m,
            visibility_km=e.visibility_km,
            wind_speed_kn=e.wind_speed_kn,
            source_name=e.source_name,
        )
        for e in db.scalars(q).all()
    ]


def load_events(db: Session, vessel_id: uuid.UUID) -> list[EventRec]:
    det = detection_config()
    out: list[EventRec] = []
    for g in db.scalars(select(AisGapEvent).where(AisGapEvent.vessel_id == vessel_id)).all():
        threshold = max(det["ais_gap"]["min_gap_minutes"] * 60, det["ais_gap"]["interval_multiplier"] * g.expected_interval_s)
        pos = to_shape(g.start_position) if g.start_position is not None else None
        out.append(
            EventRec(
                kind="AIS_GAP",
                id=g.id,
                start=g.gap_start,
                end=g.gap_end,
                known_at=g.gap_start + timedelta(seconds=threshold),
                confidence=g.anomaly_confidence,
                observation=g.observation_text,
                inference=g.inference_text,
                lat=pos.y if pos else None,
                lon=pos.x if pos else None,
                details={
                    "position_discontinuity": g.position_discontinuity,
                    "implied_speed_kn": g.implied_speed_kn,
                    "coverage_quality": g.coverage_quality,
                    "duration_s": g.duration_s,
                },
            )
        )
    for e in db.scalars(select(RouteDeviationEvent).where(RouteDeviationEvent.vessel_id == vessel_id)).all():
        out.append(
            EventRec(
                kind="ROUTE_DEVIATION",
                id=e.id,
                start=e.start_time,
                end=None if e.ongoing else e.end_time,
                known_at=e.start_time + timedelta(hours=det["route_deviation"]["min_duration_hours"]),
                confidence=e.confidence,
                observation=e.observation_text,
                inference=e.inference_text,
                details={"max_deviation_km": e.max_deviation_km},
            )
        )
    for e in db.scalars(select(LoiteringEvent).where(LoiteringEvent.vessel_id == vessel_id)).all():
        out.append(
            EventRec(
                kind="LOITERING",
                id=e.id,
                start=e.start_time,
                end=None if e.ongoing else e.end_time,
                known_at=e.start_time + timedelta(hours=det["loitering"]["min_duration_hours"]),
                confidence=e.confidence,
                observation=e.observation_text,
                inference=e.inference_text,
                lat=e.centre_lat,
                lon=e.centre_lon,
            )
        )
    for e in db.scalars(select(StopEvent).where(StopEvent.vessel_id == vessel_id)).all():
        out.append(
            EventRec(
                kind="UNEXPECTED_STOP",
                id=e.id,
                start=e.start_time,
                end=None if e.ongoing else e.end_time,
                known_at=e.start_time + timedelta(minutes=det["unexpected_stop"]["min_duration_minutes"]),
                confidence=e.confidence,
                observation=e.observation_text,
                inference=e.inference_text,
                lat=e.lat,
                lon=e.lon,
            )
        )
    return out


def vessel_profile(v: Vessel) -> VesselProfile:
    return VesselProfile(
        id=v.id,
        name=v.name,
        vessel_type=v.vessel_type,
        imo=v.imo,
        mmsi=v.mmsi,
        flag=v.flag,
        freeboard_m=v.freeboard_m,
        is_synthetic=v.is_synthetic,
    )


def build_context(
    db: Session,
    vessel: Vessel,
    zones: list[ZoneShape] | None = None,
    incidents: list[IncidentRec] | None = None,
    environment: list[EnvRec] | None = None,
    track_since: datetime | None = None,
) -> RiskContext:
    syn = vessel.is_synthetic
    return RiskContext(
        vessel=vessel_profile(vessel),
        track=load_track(db, vessel.id, since=track_since),
        zones=zones if zones is not None else load_zones(db, syn),
        incidents=incidents if incidents is not None else load_incidents(db, syn),
        events=load_events(db, vessel.id),
        environment=environment if environment is not None else load_environment(db, syn),
    )
