"""ORM → JSON serialisers shared by the API routers."""
from __future__ import annotations

import uuid
from typing import Any

from geoalchemy2.shape import to_shape
from shapely.geometry import mapping
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Vessel


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def provenance(o) -> dict:
    return {
        "source": getattr(o, "source_name", None),
        "source_type": getattr(o, "source_type", None),
        "source_url": getattr(o, "source_url", None),
        "source_reference": getattr(o, "source_reference", None),
        "licensing_category": getattr(o, "licensing_category", None),
        "retrieved_at": iso(getattr(o, "retrieved_at", None)),
        "original_timestamp": iso(getattr(o, "original_timestamp", None)),
        "confidence": getattr(o, "confidence", None),
        "synthetic": getattr(o, "is_synthetic", False),
    }


def geom_json(g) -> dict | None:
    if g is None:
        return None
    return mapping(to_shape(g))


def vessel_summary(v: Vessel) -> dict:
    return {
        "id": str(v.id),
        "name": v.name,
        "imo": v.imo,
        "mmsi": v.mmsi,
        "callsign": v.callsign,
        "flag": v.flag,
        "vessel_type": v.vessel_type,
        "operator": v.operator,
        "destination": v.destination,
        "eta": iso(v.eta),
        "position": None if v.last_lat is None else {"lat": v.last_lat, "lon": v.last_lon},
        "sog": v.last_sog,
        "cog": v.last_cog,
        "heading": v.last_heading,
        "nav_status": v.last_nav_status,
        "last_seen_at": iso(v.last_seen_at),
        "risk": {"score": v.current_risk_score, "band": v.current_risk_band, "trend": v.current_risk_trend},
        "data_mode": v.data_mode,
        "synthetic": v.is_synthetic,
    }


def vessel_detail(v: Vessel) -> dict:
    d = vessel_summary(v)
    d.update(
        length_m=v.length_m, beam_m=v.beam_m, draught_m=v.draught_m, freeboard_m=v.freeboard_m,
        year_built=v.year_built, gross_tonnage=v.gross_tonnage, owner=v.owner,
        beneficial_owner=v.beneficial_owner, field_provenance=v.field_provenance or {},
    )
    return d


def resolve_vessel(db: Session, ref: str) -> Vessel | None:
    """Resolve a vessel by UUID, IMO (7 digits), MMSI (9 digits) or exact name.

    If the same identifier exists in both live and synthetic data, the live record wins;
    callers can disambiguate by using the UUID.
    """
    ref = ref.strip()
    try:
        return db.get(Vessel, uuid.UUID(ref))
    except ValueError:
        pass
    q = select(Vessel)
    if ref.isdigit() and len(ref) == 7:
        q = q.where(Vessel.imo == ref)
    elif ref.isdigit() and len(ref) == 9:
        q = q.where(Vessel.mmsi == ref)
    else:
        q = q.where(Vessel.name.ilike(ref))
    return db.scalars(q.order_by(Vessel.is_synthetic.asc())).first()


def incident_json(i, delayed: bool = False) -> dict[str, Any]:
    return {
        "id": str(i.id),
        "occurred_at": iso(i.occurred_at),
        "reported_at": iso(i.reported_at),
        "position": {"lat": i.lat, "lon": i.lon},
        "location_description": i.location_description,
        "category": i.category,
        "title": i.title,
        "narrative": i.narrative,
        "affected_vessel": {
            "id": str(i.affected_vessel_id) if i.affected_vessel_id else None,
            "name": i.affected_vessel_name, "type": i.affected_vessel_type, "imo": i.imo, "mmsi": i.mmsi,
        },
        "fatalities": i.fatalities,
        "injuries": i.injuries,
        "hostages": i.hostages,
        "boarding": i.boarding,
        "hijacking": i.hijacking,
        "weapons_reported": i.weapons_reported,
        "verification_status": i.verification_status,
        "provenance": provenance(i),
        "delayed_feed": delayed,
    }


def alert_json(a, vessel_name: str | None = None) -> dict:
    return {
        "id": str(a.id),
        "type": a.alert_type,
        "severity": a.severity,
        "title": a.title,
        "vessel": {"id": str(a.vessel_id), "name": vessel_name} if a.vessel_id else None,
        "contact_id": str(a.contact_id) if a.contact_id else None,
        "asset_id": str(a.asset_id) if a.asset_id else None,
        "event_time": iso(a.event_time),
        "created_at": iso(a.created_at),
        "location": {"lat": a.lat, "lon": a.lon, "description": a.location_description} if a.lat is not None else
        {"description": a.location_description},
        "risk_change": {"before": a.risk_before, "after": a.risk_after},
        "evidence": a.evidence,
        "recommended_analyst_action": a.recommended_action,
        "status": a.status,
        "acknowledged_at": iso(a.acknowledged_at),
        "analyst_note": a.analyst_note,
        "synthetic": a.is_synthetic,
    }


def zone_feature(z) -> dict:
    return {
        "type": "Feature",
        "id": str(z.id),
        "geometry": geom_json(z.geom),
        "properties": {
            "id": str(z.id), "name": z.name, "category": z.category, "severity": z.severity,
            "effective_start": iso(z.effective_start), "effective_end": iso(z.effective_end),
            "description": z.description, "provenance": provenance(z),
        },
    }
