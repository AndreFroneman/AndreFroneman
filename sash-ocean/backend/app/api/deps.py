"""FastAPI dependencies: authentication, RBAC, entitlements and rate limiting."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.metrics import AUTH_FAILURES, RATE_LIMITED
from app.core.ratelimit import get_limiter
from app.core.security import Principal, api_key_prefix, constant_time_equals, decode_token, hash_api_key
from app.core.yamlconfig import entitlements_config
from app.db.session import get_db
from app.models import ApiKey, Organisation, User

ALL_READ_ROLES = ("ADMIN", "ANALYST", "CUSTOMER", "API_USER")


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


def get_principal(request: Request, db: Session = Depends(get_db)) -> Principal:
    api_key = request.headers.get("x-api-key")
    auth = request.headers.get("authorization", "")
    principal: Principal | None = None

    if api_key:
        prefix = api_key_prefix(api_key)
        rec = db.scalar(select(ApiKey).where(ApiKey.prefix == prefix)) if prefix else None
        now = datetime.now(timezone.utc)
        if (
            rec is None
            or rec.revoked_at is not None
            or (rec.expires_at and rec.expires_at < now)
            or not constant_time_equals(rec.key_hash, hash_api_key(api_key))
        ):
            AUTH_FAILURES.labels(method="api_key").inc()
            raise _unauthorized("Invalid API key")
        org = db.get(Organisation, rec.organisation_id) if rec.organisation_id else None
        if rec.last_used_at is None or now - rec.last_used_at > timedelta(minutes=1):
            rec.last_used_at = now
            db.commit()
        principal = Principal(
            kind="api_key", id=str(rec.id), label=f"api_key:{rec.name}", role=rec.role,
            org_id=str(rec.organisation_id) if rec.organisation_id else None,
            tier=org.tier if org else "COMMUNITY", scopes=list(rec.scopes or []),
            rate_limit_per_min=rec.rate_limit_per_min,
        )
    elif auth.lower().startswith("bearer "):
        try:
            payload = decode_token(auth.split(" ", 1)[1].strip())
        except jwt.PyJWTError:
            AUTH_FAILURES.labels(method="jwt").inc()
            raise _unauthorized("Invalid or expired token")
        user = db.get(User, uuid.UUID(payload["sub"]))
        if user is None or not user.is_active:
            raise _unauthorized("User disabled")
        org = db.get(Organisation, user.organisation_id) if user.organisation_id else None
        principal = Principal(
            kind="user", id=str(user.id), label=user.email, role=user.role,
            org_id=str(user.organisation_id) if user.organisation_id else None,
            tier=org.tier if org else "PROFESSIONAL", mfa="otp" in payload.get("amr", []),
        )
    if principal is None:
        raise _unauthorized()

    request.state.principal = principal
    _enforce_rate_limit(principal)
    return principal


def _enforce_rate_limit(p: Principal) -> None:
    settings = get_settings()
    if p.kind == "api_key":
        tier = entitlements_config()["tiers"].get(p.tier, {})
        limit = p.rate_limit_per_min or tier.get("api_rate_limit_per_min", 60)
    else:
        limit = settings.rate_limit_default_per_min
    allowed, remaining, reset = get_limiter().hit(f"{p.kind}:{p.id}", limit)
    if not allowed:
        RATE_LIMITED.labels(principal_type=p.kind).inc()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(reset), "X-RateLimit-Limit": str(limit), "X-RateLimit-Remaining": "0"},
        )


def require_roles(*roles: str):
    def dep(p: Principal = Depends(get_principal)) -> Principal:
        if p.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return p

    return dep


def has_feature(p: Principal, feature: str) -> bool:
    if p.role in ("ADMIN", "ANALYST"):
        return True
    tier = entitlements_config()["tiers"].get(p.tier, {})
    return feature in tier.get("features", [])


def require_feature(feature: str, roles: tuple[str, ...] = ALL_READ_ROLES):
    def dep(p: Principal = Depends(get_principal)) -> Principal:
        if p.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        if not has_feature(p, feature):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Feature '{feature}' is not included in the {p.tier} tier",
            )
        if p.kind == "api_key" and not has_feature(p, "api"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="API access requires ENTERPRISE tier")
        return p

    return dep


def incident_delay_hours(p: Principal) -> int:
    if p.role in ("ADMIN", "ANALYST"):
        return 0
    return int(entitlements_config()["tiers"].get(p.tier, {}).get("incident_delay_hours", 0))


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
