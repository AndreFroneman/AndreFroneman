from __future__ import annotations

import io
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.deps import client_ip, require_roles
from app.core.audit import audit
from app.core.security import Principal, generate_api_key
from app.db.session import get_db
from app.models import AnalyticsRun, ApiKey, AuditLog, Organisation, User
from app.services.serialize import iso

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/analytics/run", summary="Run detection, risk scoring, fusion and alerting now")
def run_now(request: Request, p: Principal = Depends(require_roles("ADMIN", "ANALYST")), db: Session = Depends(get_db)):
    from app.services.pipeline import run_analytics

    stats = run_analytics(db, kind="MANUAL")
    audit("analytics.run", p.kind, p.id, p.label, ip=client_ip(request), details=stats)
    return stats


@router.post("/demo/reseed", summary="Regenerate the synthetic demonstration world (synthetic data only)")
def reseed(request: Request, p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    from app.demo.seed import seed_demo

    stats = seed_demo(db, force=True)
    audit("demo.reseed", p.kind, p.id, p.label, ip=client_ip(request))
    return stats


@router.get("/analytics/runs", summary="Recent analytics runs")
def runs(p: Principal = Depends(require_roles("ADMIN", "ANALYST")), db: Session = Depends(get_db)):
    rows = db.scalars(select(AnalyticsRun).order_by(AnalyticsRun.started_at.desc()).limit(50)).all()
    return {"runs": [{"id": str(r.id), "kind": r.kind, "status": r.status, "started_at": iso(r.started_at),
                      "finished_at": iso(r.finished_at), "stats": r.stats, "config_hash": r.config_hash, "error": r.error}
                     for r in rows]}


@router.get("/audit", summary="Audit log")
def audit_log(limit: int = Query(200, ge=1, le=2000), action: str | None = None,
              p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    stmt = select(AuditLog).order_by(AuditLog.ts.desc()).limit(limit)
    if action:
        stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    return {"entries": [{"ts": iso(a.ts), "actor_type": a.actor_type, "actor": a.actor_label, "action": a.action,
                         "resource_type": a.resource_type, "resource_id": a.resource_id, "method": a.method,
                         "path": a.path, "status": a.status_code, "ip": a.ip, "details": a.details}
                        for a in db.scalars(stmt).all()]}


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    organisation_id: uuid.UUID
    role: str = Field("API_USER", pattern=r"^(API_USER|SENSOR)$")
    rate_limit_per_min: int | None = Field(None, ge=1, le=100_000)
    expires_in_days: int | None = Field(365, ge=1, le=3650)


@router.post("/api-keys", status_code=201, summary="Issue an API key (secret returned once)")
def create_key(body: ApiKeyIn, request: Request, p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    if db.get(Organisation, body.organisation_id) is None:
        raise HTTPException(status_code=404, detail="Organisation not found")
    full, prefix, digest = generate_api_key()
    k = ApiKey(organisation_id=body.organisation_id, created_by=uuid.UUID(p.id) if p.kind == "user" else None,
               name=body.name, prefix=prefix, key_hash=digest, role=body.role, rate_limit_per_min=body.rate_limit_per_min,
               expires_at=datetime.now(timezone.utc) + timedelta(days=body.expires_in_days) if body.expires_in_days else None)
    db.add(k)
    db.commit()
    audit("api_key.create", p.kind, p.id, p.label, "api_key", str(k.id), ip=client_ip(request), details={"prefix": prefix})
    return {"id": str(k.id), "api_key": full, "prefix": prefix, "note": "Store this key securely; it is not shown again."}


@router.get("/api-keys", summary="List API keys (no secrets)")
def list_keys(p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    return {"api_keys": [{"id": str(k.id), "name": k.name, "prefix": k.prefix, "role": k.role,
                          "organisation_id": str(k.organisation_id) if k.organisation_id else None,
                          "created_at": iso(k.created_at), "last_used_at": iso(k.last_used_at),
                          "expires_at": iso(k.expires_at), "revoked_at": iso(k.revoked_at)}
                         for k in db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()]}


@router.delete("/api-keys/{key_id}", summary="Revoke an API key")
def revoke_key(key_id: uuid.UUID, request: Request, p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    k = db.get(ApiKey, key_id)
    if k is None:
        raise HTTPException(status_code=404, detail="Key not found")
    k.revoked_at = datetime.now(timezone.utc)
    db.commit()
    audit("api_key.revoke", p.kind, p.id, p.label, "api_key", str(k.id), ip=client_ip(request))
    return {"revoked": True}


@router.get("/organisations", summary="Organisations and tiers")
def orgs(p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    return {"organisations": [{"id": str(o.id), "name": o.name, "tier": o.tier}
                              for o in db.scalars(select(Organisation).order_by(Organisation.name)).all()]}


@router.get("/users", summary="Users")
def users(p: Principal = Depends(require_roles("ADMIN")), db: Session = Depends(get_db)):
    return {"users": [{"id": str(u.id), "email": u.email, "role": u.role, "active": u.is_active,
                       "mfa_enabled": u.mfa_enabled, "last_login_at": iso(u.last_login_at)}
                      for u in db.scalars(select(User).order_by(User.email)).all()]}


@router.get("/datasets/vessel-days.csv", summary="Vessel-day feature dataset for future ML (explainable features)")
def vessel_days(request: Request, days: int = Query(90, ge=1, le=3650), p: Principal = Depends(require_roles("ADMIN", "ANALYST")),
                db: Session = Depends(get_db)):
    """Prepares an analysis-ready dataset (VESSEL + LOCATION + TIME + BEHAVIOUR + THREAT).

    Outcomes are only included where recorded (confirmed vessel incidents); nothing is inferred.
    """
    import pandas as pd

    since = datetime.now(timezone.utc) - timedelta(days=days)
    obs = pd.read_sql(text(
        "SELECT v.id::text AS vessel_id, v.vessel_type, v.flag, v.is_synthetic, date_trunc('day', o.ts) AS day, "
        "count(*) AS reports, avg(o.sog) AS mean_sog, max(o.sog) AS max_sog, avg(o.lat) AS mean_lat, avg(o.lon) AS mean_lon "
        "FROM ais_observations o JOIN vessels v ON v.id = o.vessel_id WHERE o.ts >= :s GROUP BY 1,2,3,4,5"),
        db.connection(), params={"s": since})

    def daily(sql: str, name: str):
        df = pd.read_sql(text(sql), db.connection(), params={"s": since})
        return df.rename(columns={"n": name})

    frames = [
        daily("SELECT vessel_id::text, date_trunc('day', gap_start) AS day, count(*) AS n FROM ais_gap_events WHERE gap_start >= :s GROUP BY 1,2", "ais_gaps"),
        daily("SELECT vessel_id::text, date_trunc('day', start_time) AS day, count(*) AS n FROM loitering_events WHERE start_time >= :s GROUP BY 1,2", "loitering"),
        daily("SELECT vessel_id::text, date_trunc('day', start_time) AS day, count(*) AS n FROM route_deviation_events WHERE start_time >= :s GROUP BY 1,2", "deviations"),
        daily("SELECT vessel_id::text, date_trunc('day', assessed_at) AS day, max(score) AS n FROM risk_assessments WHERE assessed_at >= :s GROUP BY 1,2", "max_risk"),
        daily("SELECT vessel_id::text, date_trunc('day', entry_time) AS day, sum(duration_s)/3600.0 AS n FROM zone_exposures WHERE entry_time >= :s GROUP BY 1,2", "zone_hours_started"),
        daily("SELECT affected_vessel_id::text AS vessel_id, date_trunc('day', occurred_at) AS day, count(*) AS n FROM incidents WHERE affected_vessel_id IS NOT NULL AND occurred_at >= :s GROUP BY 1,2", "recorded_incident_outcomes"),
    ]
    df = obs
    for f in frames:
        df = df.merge(f, on=["vessel_id", "day"], how="left")
    for c in ("ais_gaps", "loitering", "deviations", "zone_hours_started", "recorded_incident_outcomes"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
    buf = io.StringIO()
    df.sort_values(["vessel_id", "day"]).to_csv(buf, index=False)
    audit("dataset.export", p.kind, p.id, p.label, "dataset", "vessel-days", ip=client_ip(request), details={"rows": len(df)})
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="sash-vessel-days.csv"'})
