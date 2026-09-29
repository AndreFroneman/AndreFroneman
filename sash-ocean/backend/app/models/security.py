from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_uuid, utcnow
from app.models.common import ProvenanceMixin, point_column


class Incident(TimestampMixin, ProvenanceMixin, Base):
    """A reported maritime security or safety incident, with full provenance."""

    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    location_description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    narrative: Mapped[str] = mapped_column(String(5000), nullable=False, default="")
    affected_vessel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="SET NULL"), nullable=True
    )
    affected_vessel_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    affected_vessel_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    imo: Mapped[str | None] = mapped_column(String(7), nullable=True)
    mmsi: Mapped[str | None] = mapped_column(String(9), nullable=True)
    fatalities: Mapped[int | None] = mapped_column(Integer, nullable=True)
    injuries: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hostages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    boarding: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    hijacking: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    weapons_reported: Mapped[str | None] = mapped_column(String(200), nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="UNVERIFIED"
    )
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class RiskZone(TimestampMixin, ProvenanceMixin, Base):
    """Geospatial threat area. Zones may overlap and are time-bounded."""

    __tablename__ = "risk_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    geom = mapped_column(Geometry("MULTIPOLYGON", srid=4326, spatial_index=True), nullable=False)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    effective_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    description: Mapped[str] = mapped_column(String(3000), nullable=False, default="")


class IncidentProximity(Base):
    """Vessels near an incident at the incident time (25/50/100/250 km bands)."""

    __tablename__ = "incident_proximities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vessel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    band_km: Mapped[int] = mapped_column(Integer, nullable=False)
    vessel_lat: Mapped[float] = mapped_column(Float, nullable=False)
    vessel_lon: Mapped[float] = mapped_column(Float, nullable=False)
    position_method: Mapped[str] = mapped_column(String(30), nullable=False)  # INTERPOLATED|NEAREST
    nearest_obs_delta_s: Mapped[float] = mapped_column(Float, nullable=False)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
