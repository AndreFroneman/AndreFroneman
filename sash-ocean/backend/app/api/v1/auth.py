from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_principal, has_feature
from app.core.audit import audit
from app.core.config import get_settings
from app.core.metrics import AUTH_FAILURES
from app.core.ratelimit import get_limiter
from app.core.security import (
    Principal,
    create_access_token,
    create_mfa_challenge_token,
    decode_token,
    new_totp_secret,
    totp_uri,
    verify_password,
    verify_totp,
)
from app.core.yamlconfig import entitlements_config
from app.db.session import get_db
from app.models import Organisation, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class MfaVerifyRequest(BaseModel):
    mfa_token: str
    code: str = Field(pattern=r"^\d{6}$")


class MfaActivateRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


def _token_response(user: User, db: Session, mfa: bool) -> dict:
    org = db.get(Organisation, user.organisation_id) if user.organisation_id else None
    token, ttl = create_access_token(user.id, user.role, user.organisation_id, org.tier if org else "PROFESSIONAL", mfa)
    return {"access_token": token, "token_type": "bearer", "expires_in": ttl}


@router.post("/login", summary="Authenticate with email and password")
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    allowed, _, reset = get_limiter().hit(f"login:{ip}", get_settings().rate_limit_login_per_min)
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(reset)})
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    now = datetime.now(timezone.utc)
    if user and user.locked_until and user.locked_until > now:
        audit("auth.login_locked", "user", str(user.id), email, ip=ip, status_code=423)
        raise HTTPException(status_code=423, detail="Account temporarily locked")
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        AUTH_FAILURES.labels(method="password").inc()
        if user is not None:
            s = get_settings()
            user.failed_login_count += 1
            if user.failed_login_count >= s.login_max_failures:
                user.locked_until = now + timedelta(minutes=s.login_lockout_minutes)
                user.failed_login_count = 0
            db.commit()
        audit("auth.login_failed", "anonymous", None, email, ip=ip, status_code=401)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user.failed_login_count = 0
    user.locked_until = None
    if user.mfa_enabled:
        db.commit()
        return {"mfa_required": True, "mfa_token": create_mfa_challenge_token(user.id)}
    user.last_login_at = now
    db.commit()
    audit("auth.login", "user", str(user.id), user.email, ip=ip, status_code=200)
    return _token_response(user, db, mfa=False)


@router.post("/mfa/verify", summary="Complete login with a TOTP code")
def mfa_verify(body: MfaVerifyRequest, request: Request, db: Session = Depends(get_db)):
    try:
        payload = decode_token(body.mfa_token, expected_type="mfa")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid MFA challenge")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.mfa_secret or not verify_totp(user.mfa_secret, body.code):
        AUTH_FAILURES.labels(method="totp").inc()
        audit("auth.mfa_failed", "user", payload.get("sub"), ip=client_ip(request), status_code=401)
        raise HTTPException(status_code=401, detail="Invalid code")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    audit("auth.login", "user", str(user.id), user.email, ip=client_ip(request), status_code=200, details={"mfa": True})
    return _token_response(user, db, mfa=True)


@router.post("/mfa/enroll", summary="Start TOTP enrolment (returns secret and otpauth URI)")
def mfa_enroll(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    if p.kind != "user":
        raise HTTPException(status_code=400, detail="MFA applies to interactive users")
    user = db.get(User, uuid.UUID(p.id))
    user.mfa_secret = new_totp_secret()
    user.mfa_enabled = False
    db.commit()
    audit("auth.mfa_enroll", "user", p.id, p.label)
    return {"secret": user.mfa_secret, "otpauth_uri": totp_uri(user.mfa_secret, user.email)}


@router.post("/mfa/activate", summary="Activate TOTP after verifying a first code")
def mfa_activate(body: MfaActivateRequest, p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    user = db.get(User, uuid.UUID(p.id))
    if not user or not user.mfa_secret or not verify_totp(user.mfa_secret, body.code):
        raise HTTPException(status_code=400, detail="Invalid code")
    user.mfa_enabled = True
    db.commit()
    audit("auth.mfa_activated", "user", p.id, p.label)
    return {"mfa_enabled": True}


@router.get("/me", summary="Current principal, role and entitlements")
def me(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    tier = entitlements_config()["tiers"].get(p.tier, {})
    out = {"id": p.id, "kind": p.kind, "label": p.label, "role": p.role, "organisation_id": p.org_id, "tier": p.tier,
           "mfa": p.mfa, "features": tier.get("features", []), "all_features": p.role in ("ADMIN", "ANALYST")}
    if p.kind == "user":
        user = db.get(User, uuid.UUID(p.id))
        out.update(email=user.email, full_name=user.full_name, mfa_enabled=user.mfa_enabled)
        if user.organisation_id:
            org = db.get(Organisation, user.organisation_id)
            out["organisation"] = org.name if org else None
    out["can"] = {f: has_feature(p, f) for f in ("alerts", "watchlists", "voyage_replay", "reports", "api", "sensor_ingest")}
    return out
