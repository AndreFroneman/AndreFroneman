"""Shared column sets and vocabularies.

Vocabularies are stored as constrained strings rather than PostgreSQL ENUM types so
they can be extended through ordinary migrations without type rewrites.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, declared_attr, mapped_column

from app.db.base import utcnow

# --- Provenance ---------------------------------------------------------------
LICENSING_CATEGORIES = (
    "OPEN",
    "PUBLIC-GOVERNMENT",
    "PUBLIC-OSINT",
    "COMMERCIAL-LICENSED",
    "CUSTOMER",
    "SASH-SENSOR",
    "SYNTHETIC-DEMO",
)

DATA_MODES = ("LIVE", "SYNTHETIC")

# --- Security incidents -----------------------------------------------------------
INCIDENT_CATEGORIES = (
    "piracy",
    "armed_robbery",
    "hijacking",
    "suspicious_approach",
    "kidnapping",
    "boarding",
    "maritime_conflict",
    "drone_attack",
    "missile_attack",
    "mine",
    "sabotage",
    "collision",
    "grounding",
    "cargo_theft",
    "infrastructure_incident",
)
VERIFICATION_STATUSES = ("UNVERIFIED", "PARTIALLY_VERIFIED", "VERIFIED", "DISPUTED", "RETRACTED")

# --- Zones / risk -------------------------------------------------------------
SEVERITIES = ("LOW", "MODERATE", "ELEVATED", "HIGH", "CRITICAL")
SEVERITY_RANK = {s: i for i, s in enumerate(SEVERITIES)}

# --- Analytical statement kinds (observation vs inference vs assessment) --------
STATEMENT_KINDS = ("OBSERVATION", "INFERENCE", "ASSESSMENT")

# --- Roles ---------------------------------------------------------------------
ROLES = ("ADMIN", "ANALYST", "CUSTOMER", "API_USER", "SENSOR")
TIERS = ("COMMUNITY", "PROFESSIONAL", "ENTERPRISE", "SENSOR")

# --- Sensors ---------------------------------------------------------------------
SENSOR_TYPES = (
    "AIS",
    "RADAR",
    "RF",
    "EO",
    "IR",
    "SATELLITE",
    "ACOUSTIC",
    "WEATHER",
    "QUANTUM_SENSOR",
    "QUANTUM_TIMING_SOURCE",
    "OTHER",
)
CONTACT_SOURCES = (
    "AIS",
    "RADAR",
    "EO",
    "IR",
    "RF",
    "SATELLITE",
    "ACOUSTIC",
    "MANUAL",
    "QUANTUM_SENSOR",
)


def point_column(nullable: bool = True):
    return mapped_column(
        Geometry("POINT", srid=4326, spatial_index=True), nullable=nullable
    )


class ProvenanceMixin:
    """Every piece of intelligence keeps where it came from and how far to trust it."""

    @declared_attr
    def source_id(cls) -> Mapped[uuid.UUID | None]:  # noqa: N805
        return mapped_column(
            UUID(as_uuid=True), ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True
        )

    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_reference: Mapped[str | None] = mapped_column(String(300), nullable=True)
    licensing_category: Mapped[str] = mapped_column(String(40), nullable=False, default="OPEN")
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    original_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)


class AnalyticStatementMixin:
    """Stores the observation / inference split explicitly on each analytic event.

    The ASSESSMENT (the effect on risk) lives in risk_assessments.contributors so the
    three layers are always separable in the database and in the UI.
    """

    observation_text: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    inference_text: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    analyst_status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
