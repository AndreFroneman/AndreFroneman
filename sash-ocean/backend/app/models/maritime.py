from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_uuid, utcnow
from app.models.common import ProvenanceMixin, point_column


class Vessel(TimestampMixin, Base):
    """A known vessel identity. Any field may be missing; nothing is assumed."""

    __tablename__ = "vessels"
    __table_args__ = (
        # The same MMSI may exist once as live data and once as a synthetic demo record;
        # the two are never merged (provenance is never silently mixed).
        Index(
            "uq_vessels_mmsi_mode",
            "mmsi",
            "data_mode",
            unique=True,
            postgresql_where=text("mmsi IS NOT NULL"),
        ),
        Index("ix_vessels_name_trgm_like", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    imo: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    mmsi: Mapped[str | None] = mapped_column(String(9), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    callsign: Mapped[str | None] = mapped_column(String(20), nullable=True)
    flag: Mapped[str | None] = mapped_column(String(2), nullable=True)  # ISO 3166-1 alpha-2
    vessel_type: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    length_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    beam_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    draught_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    freeboard_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    year_built: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gross_tonnage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    operator: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    beneficial_owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    eta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Latest known state (denormalised cache of the newest AIS observation).
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_position = point_column()
    last_sog: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_cog: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_nav_status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Latest computed risk (cache of the newest risk_assessments row).
    current_risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_risk_band: Mapped[str | None] = mapped_column(String(20), nullable=True)
    current_risk_trend: Mapped[str | None] = mapped_column(String(20), nullable=True)

    data_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="LIVE")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    # Field-level provenance: {"name": {"source": "...", "retrieved_at": "..."}, ...}
    field_provenance: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )


class AisObservation(ProvenanceMixin, Base):
    """Append-only AIS position history. A DB trigger rejects UPDATEs (see migration)."""

    __tablename__ = "ais_observations"
    __table_args__ = (Index("ix_ais_obs_vessel_ts", "vessel_id", "ts"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    vessel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=True
    )
    mmsi: Mapped[str] = mapped_column(String(9), nullable=False, index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    sog: Mapped[float | None] = mapped_column(Float, nullable=True)
    cog: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading: Mapped[float | None] = mapped_column(Float, nullable=True)
    nav_status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    receiver_class: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # TERRESTRIAL | SATELLITE | SASH-SENSOR
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    unlocode: Mapped[str] = mapped_column(String(5), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    country: Mapped[str] = mapped_column(String(2), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    port_radius_km: Mapped[float] = mapped_column(Float, nullable=False, default=15.0)
    aliases: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class Voyage(Base):
    """A voyage segment between port stays, derived from AIS history."""

    __tablename__ = "voyages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    origin_port: Mapped[str | None] = mapped_column(String(5), nullable=True)
    destination_port: Mapped[str | None] = mapped_column(String(5), nullable=True)
    declared_destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    departure_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    arrival_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="UNDERWAY")
    distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    observation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    elevated_exposure_hours: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
