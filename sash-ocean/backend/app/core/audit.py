"""Audit logging. Written in a separate session so a failed request is still audited."""
from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.models import AuditLog

log = logging.getLogger(__name__)


def audit(
    action: str,
    actor_type: str = "system",
    actor_id: str | None = None,
    actor_label: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    method: str | None = None,
    path: str | None = None,
    status_code: int | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
) -> None:
    db = SessionLocal()
    try:
        db.add(
            AuditLog(
                action=action, actor_type=actor_type, actor_id=actor_id, actor_label=actor_label,
                resource_type=resource_type, resource_id=resource_id, method=method, path=path,
                status_code=status_code, ip=ip, user_agent=(user_agent or "")[:300], details=details or {},
            )
        )
        db.commit()
    except Exception as exc:  # auditing must never take the API down, but must be visible
        log.error("AUDIT WRITE FAILED for %s: %s", action, exc)
        db.rollback()
    finally:
        db.close()
