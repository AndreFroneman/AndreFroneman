from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_feature
from app.api.v1.vessels import watchlist_vessel_ids
from app.core.audit import audit
from app.core.config import get_settings
from app.core.security import Principal
from app.db.session import get_db
from app.models import Alert, Vessel, Watchlist, WatchlistItem
from app.services.serialize import alert_json, iso

router = APIRouter(tags=["alerts & watchlists"])
SEV_ORDER = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


# --- Alerts ---------------------------------------------------------------------------------
@router.get("/alerts", summary="Alerts with evidence and recommended analyst action")
def list_alerts(
    status: list[str] | None = Query(None),
    min_severity: str | None = Query(None),
    vessel_id: str | None = None,
    watchlist_id: str | None = None,
    alert_type: list[str] | None = Query(None),
    since: datetime | None = None,
    synthetic: bool | None = None,
    limit: int = Query(200, ge=1, le=2000),
    p: Principal = Depends(require_feature("alerts")),
    db: Session = Depends(get_db),
):
    stmt = select(Alert, Vessel.name).outerjoin(Vessel, Vessel.id == Alert.vessel_id)
    syn = synthetic if synthetic is not None else (get_settings().demo_mode or None)
    if syn is not None:
        stmt = stmt.where(Alert.is_synthetic == syn)
    if status:
        stmt = stmt.where(Alert.status.in_(status))
    if min_severity in SEV_ORDER:
        stmt = stmt.where(Alert.severity.in_(SEV_ORDER[SEV_ORDER.index(min_severity):]))
    if vessel_id:
        stmt = stmt.where(Alert.vessel_id == vessel_id)
    if alert_type:
        stmt = stmt.where(Alert.alert_type.in_(alert_type))
    if since:
        stmt = stmt.where(Alert.event_time >= since)
    if watchlist_id:
        stmt = stmt.where(Alert.vessel_id.in_(watchlist_vessel_ids(db, watchlist_id)))
    rows = db.execute(stmt.order_by(Alert.event_time.desc()).limit(limit)).all()
    counts = dict(db.execute(select(Alert.severity, func.count()).where(Alert.status == "NEW")
                             .where(Alert.is_synthetic == syn if syn is not None else True).group_by(Alert.severity)).all())
    return {"alerts": [alert_json(a, name) for a, name in rows], "open_counts": counts}


@router.get("/alerts/{alert_id}", summary="Alert detail")
def get_alert(alert_id: uuid.UUID, p: Principal = Depends(require_feature("alerts")), db: Session = Depends(get_db)):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    v = db.get(Vessel, a.vessel_id) if a.vessel_id else None
    return alert_json(a, v.name if v else None)


class AlertAction(BaseModel):
    note: str | None = Field(None, max_length=2000)


def _transition(alert_id: uuid.UUID, status: str, body: AlertAction, request: Request, p: Principal, db: Session):
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    if p.role not in ("ADMIN", "ANALYST", "CUSTOMER"):
        raise HTTPException(status_code=403, detail="Insufficient role")
    a.status = status
    a.acknowledged_by = uuid.UUID(p.id) if p.kind == "user" else None
    a.acknowledged_at = datetime.now(timezone.utc)
    if body.note:
        a.analyst_note = body.note
    db.commit()
    audit(f"alert.{status.lower()}", p.kind, p.id, p.label, "alert", str(a.id), ip=client_ip(request))
    return alert_json(a)


@router.post("/alerts/{alert_id}/acknowledge", summary="Acknowledge an alert")
def acknowledge(alert_id: uuid.UUID, body: AlertAction, request: Request,
                p: Principal = Depends(require_feature("alerts")), db: Session = Depends(get_db)):
    return _transition(alert_id, "ACKNOWLEDGED", body, request, p, db)


@router.post("/alerts/{alert_id}/close", summary="Close an alert")
def close(alert_id: uuid.UUID, body: AlertAction, request: Request,
          p: Principal = Depends(require_feature("alerts")), db: Session = Depends(get_db)):
    return _transition(alert_id, "CLOSED", body, request, p, db)


# --- Watchlists -----------------------------------------------------------------------------------
class WatchlistItemIn(BaseModel):
    item_type: str = Field(pattern=r"^(VESSEL|IMO|MMSI|FLEET|AREA)$")
    vessel_id: uuid.UUID | None = None
    imo: str | None = Field(None, pattern=r"^\d{7}$")
    mmsi: str | None = Field(None, pattern=r"^\d{9}$")
    fleet_operator: str | None = Field(None, max_length=200)
    area: dict | None = Field(None, description="GeoJSON Polygon")
    label: str = Field("", max_length=200)

    @model_validator(mode="after")
    def _check(self):
        need = {"VESSEL": self.vessel_id, "IMO": self.imo, "MMSI": self.mmsi, "FLEET": self.fleet_operator, "AREA": self.area}
        if need[self.item_type] is None:
            raise ValueError(f"{self.item_type} item requires the matching field")
        return self


class WatchlistIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field("", max_length=1000)
    alert_min_severity: str = Field("LOW", pattern=r"^(INFO|LOW|MEDIUM|HIGH|CRITICAL)$")
    items: list[WatchlistItemIn] = Field(default_factory=list, max_length=5000)


def _visible(stmt, p: Principal):
    if p.role in ("ADMIN", "ANALYST"):
        return stmt
    return stmt.where(Watchlist.organisation_id == (uuid.UUID(p.org_id) if p.org_id else None))


def _item_json(it: WatchlistItem, names: dict) -> dict:
    return {"id": str(it.id), "item_type": it.item_type, "vessel_id": str(it.vessel_id) if it.vessel_id else None,
            "vessel_name": names.get(it.vessel_id), "imo": it.imo, "mmsi": it.mmsi, "fleet_operator": it.fleet_operator,
            "label": it.label, "has_area": it.area is not None}


def _watchlist_json(db: Session, w: Watchlist) -> dict:
    items = db.scalars(select(WatchlistItem).where(WatchlistItem.watchlist_id == w.id)).all()
    names = dict(db.execute(select(Vessel.id, Vessel.name)).all())
    vids = watchlist_vessel_ids(db, str(w.id))
    open_alerts = db.scalar(select(func.count()).select_from(Alert).where(Alert.vessel_id.in_(vids), Alert.status == "NEW")) if vids else 0
    max_risk = db.scalar(select(func.max(Vessel.current_risk_score)).where(Vessel.id.in_(vids))) if vids else None
    return {"id": str(w.id), "name": w.name, "description": w.description, "alert_min_severity": w.alert_min_severity,
            "created_at": iso(w.created_at), "items": [_item_json(i, names) for i in items],
            "vessel_ids": [str(x) for x in vids], "open_alerts": open_alerts, "max_risk": max_risk}


def _add_item(db: Session, w: Watchlist, it: WatchlistItemIn) -> None:
    area = None
    if it.area is not None:
        from shapely.geometry import shape

        try:
            g = shape(it.area)
        except Exception:
            raise HTTPException(status_code=422, detail="Invalid area GeoJSON")
        if g.geom_type != "Polygon" or not g.is_valid:
            raise HTTPException(status_code=422, detail="Area must be a valid Polygon")
        area = f"SRID=4326;{g.wkt}"
    db.add(WatchlistItem(watchlist_id=w.id, item_type=it.item_type, vessel_id=it.vessel_id, imo=it.imo, mmsi=it.mmsi,
                         fleet_operator=it.fleet_operator, area=area, label=it.label))


@router.get("/watchlists", summary="Watchlists visible to the caller")
def list_watchlists(p: Principal = Depends(require_feature("watchlists")), db: Session = Depends(get_db)):
    rows = db.scalars(_visible(select(Watchlist), p).order_by(Watchlist.name)).all()
    return {"watchlists": [_watchlist_json(db, w) for w in rows]}


@router.post("/watchlists", status_code=201, summary="Create a watchlist (vessels, IMO, MMSI, fleets or areas)")
def create_watchlist(body: WatchlistIn, request: Request, p: Principal = Depends(require_feature("watchlists")),
                     db: Session = Depends(get_db)):
    w = Watchlist(name=body.name, description=body.description, alert_min_severity=body.alert_min_severity,
                  organisation_id=uuid.UUID(p.org_id) if p.org_id else None,
                  owner_user_id=uuid.UUID(p.id) if p.kind == "user" else None)
    db.add(w)
    db.flush()
    for it in body.items:
        _add_item(db, w, it)
    db.commit()
    audit("watchlist.create", p.kind, p.id, p.label, "watchlist", str(w.id), ip=client_ip(request))
    return _watchlist_json(db, w)


def _get_visible(db: Session, watchlist_id: uuid.UUID, p: Principal) -> Watchlist:
    w = db.scalar(_visible(select(Watchlist).where(Watchlist.id == watchlist_id), p))
    if w is None:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    return w


@router.get("/watchlists/{watchlist_id}", summary="Watchlist detail")
def get_watchlist(watchlist_id: uuid.UUID, p: Principal = Depends(require_feature("watchlists")), db: Session = Depends(get_db)):
    return _watchlist_json(db, _get_visible(db, watchlist_id, p))


@router.post("/watchlists/{watchlist_id}/items", status_code=201, summary="Add an item to a watchlist")
def add_item(watchlist_id: uuid.UUID, body: WatchlistItemIn, request: Request,
             p: Principal = Depends(require_feature("watchlists")), db: Session = Depends(get_db)):
    w = _get_visible(db, watchlist_id, p)
    _add_item(db, w, body)
    db.commit()
    audit("watchlist.add_item", p.kind, p.id, p.label, "watchlist", str(w.id), ip=client_ip(request))
    return _watchlist_json(db, w)


@router.delete("/watchlists/{watchlist_id}/items/{item_id}", summary="Remove an item")
def remove_item(watchlist_id: uuid.UUID, item_id: uuid.UUID, request: Request,
                p: Principal = Depends(require_feature("watchlists")), db: Session = Depends(get_db)):
    w = _get_visible(db, watchlist_id, p)
    it = db.get(WatchlistItem, item_id)
    if it is None or it.watchlist_id != w.id:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(it)
    db.commit()
    audit("watchlist.remove_item", p.kind, p.id, p.label, "watchlist", str(w.id), ip=client_ip(request))
    return _watchlist_json(db, w)


@router.delete("/watchlists/{watchlist_id}", status_code=204, summary="Delete a watchlist")
def delete_watchlist(watchlist_id: uuid.UUID, request: Request, p: Principal = Depends(require_feature("watchlists")),
                     db: Session = Depends(get_db)):
    w = _get_visible(db, watchlist_id, p)
    db.delete(w)
    db.commit()
    audit("watchlist.delete", p.kind, p.id, p.label, "watchlist", str(watchlist_id), ip=client_ip(request))
