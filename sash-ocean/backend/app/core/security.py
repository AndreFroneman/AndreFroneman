"""Authentication primitives: password hashing, JWTs, API keys and TOTP (MFA-ready)."""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

log = logging.getLogger(__name__)
_ph = PasswordHasher()
_ephemeral_secret: str | None = None


def _jwt_secret() -> str:
    global _ephemeral_secret
    s = get_settings().jwt_secret
    if s and len(s) >= 32:
        return s
    if _ephemeral_secret is None:
        # Development fallback only (validate_for_startup blocks this in production).
        _ephemeral_secret = secrets.token_urlsafe(48)
        log.warning("SASH_JWT_SECRET not set: using an ephemeral secret (tokens reset on restart)")
    return _ephemeral_secret


# --- Passwords ---------------------------------------------------------------------
def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _ph.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_policy_errors(password: str) -> list[str]:
    errors = []
    if len(password) < 12:
        errors.append("must be at least 12 characters")
    if password.lower() == password or password.upper() == password:
        errors.append("must mix upper and lower case")
    if not any(c.isdigit() for c in password):
        errors.append("must contain a digit")
    return errors


# --- JWT ---------------------------------------------------------------------------------
def create_access_token(user_id: uuid.UUID, role: str, org_id: uuid.UUID | None, tier: str, mfa: bool) -> tuple[str, int]:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    ttl = settings.access_token_minutes * 60
    payload = {
        "sub": str(user_id),
        "role": role,
        "org": str(org_id) if org_id else None,
        "tier": tier,
        "amr": ["pwd", "otp"] if mfa else ["pwd"],
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl)).timestamp()),
        "jti": secrets.token_hex(8),
        "typ": "access",
        "iss": "sash-ocean",
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=settings.jwt_algorithm), ttl


def create_mfa_challenge_token(user_id: uuid.UUID) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "typ": "mfa", "iat": int(now.timestamp()),
               "exp": int((now + timedelta(minutes=5)).timestamp()), "iss": "sash-ocean"}
    return jwt.encode(payload, _jwt_secret(), algorithm=get_settings().jwt_algorithm)


def decode_token(token: str, expected_type: str = "access") -> dict:
    payload = jwt.decode(
        token, _jwt_secret(), algorithms=[get_settings().jwt_algorithm], issuer="sash-ocean",
        options={"require": ["exp", "iat", "sub"]},
    )
    if payload.get("typ") != expected_type:
        raise jwt.InvalidTokenError("wrong token type")
    return payload


# --- API keys ------------------------------------------------------------------------------
def generate_api_key() -> tuple[str, str, str]:
    """Returns (full_key, prefix, sha256_hash). Only the hash and prefix are stored."""
    prefix = secrets.token_hex(4)
    secret = secrets.token_urlsafe(32)
    full = f"sash_{prefix}_{secret}"
    return full, prefix, hash_api_key(full)


def hash_api_key(full_key: str) -> str:
    return hashlib.sha256(full_key.encode()).hexdigest()


def api_key_prefix(full_key: str) -> str | None:
    parts = full_key.split("_", 2)
    if len(parts) != 3 or parts[0] != "sash":
        return None
    return parts[1]


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


# --- TOTP ------------------------------------------------------------------------------------
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name="SASH Ocean")


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# --- Principal -------------------------------------------------------------------------------
@dataclass
class Principal:
    kind: str  # "user" | "api_key"
    id: str
    label: str
    role: str
    org_id: str | None
    tier: str
    scopes: list[str] = field(default_factory=list)
    rate_limit_per_min: int | None = None
    mfa: bool = False

    @property
    def is_admin(self) -> bool:
        return self.role == "ADMIN"
