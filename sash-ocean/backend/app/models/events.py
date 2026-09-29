"""Analytic events derived from observations.

Each event keeps the evidence it was derived from and stores the OBSERVATION and the
INFERENCE as separate statements. None of these events label a vessel hostile.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, new_uuid
from app.models.common import AnalyticStatementMixin, point_column


def _vessel_fk():
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True
    )


class ZoneExposure(AnalyticStatementMixin, Base):
    __tablename__ = "zone_exposures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = _vessel_fk()
    zone_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("risk_zones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    zone_name: Mapped[str] = mapped_column(String(200), nullable=False)
    entry_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    max_threat_level: Mapped[str] = mapped_column(String(20), nullable=False)
    entry_position = point_column()
    exit_position = point_column()


class AisGapEvent(AnalyticStatementMixin, Base):
    """AIS reporting anomaly. Never labelled as intentional disabling by itself."""

    __tablename__ = "ais_gap_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = _vessel_fk()
    last_observation_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    next_observation_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    gap_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    gap_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    start_position = point_column()
    end_position = point_column()
    geographic_area: Mapped[str | None] = mapped_column(String(300), nullable=True)
    expected_interval_s: Mapped[float] = mapped_column(Float, nullable=False)
    coverage_quality: Mapped[str] = mapped_column(String(20), nullable=False)
    peer_observations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    peer_vessels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    implied_speed_kn: Mapped[float | None] = mapped_column(Float, nullable=True)
    position_discontinuity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    anomaly_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False, default="AIS reporting anomaly")


class LoiteringEvent(AnalyticStatementMixin, Base):
    __tablename__ = "loitering_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = _vessel_fk()
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    centre = point_column(nullable=False)
    centre_lat: Mapped[float] = mapped_column(Float, nullable=False)
    centre_lon: Mapped[float] = mapped_column(Float, nullable=False)
    radius_km: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    avg_speed_kn: Mapped[float] = mapped_column(Float, nullable=False)
    observation_count: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class RouteDeviationEvent(AnalyticStatementMixin, Base):
    __tablename__ = "route_deviation_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = _vessel_fk()
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    expected_path = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)
    observed_path = mapped_column(Geometry("LINESTRING", srid=4326), nullable=True)
    max_deviation_km: Mapped[float] = mapped_column(Float, nullable=False)
    mean_deviation_km: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    basis: Mapped[str] = mapped_column(String(40), nullable=False)
    declared_destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)


class StopEvent(AnalyticStatementMixin, Base):
    """Unexpected stop: a transiting vessel slows to near-zero away from ports."""

    __tablename__ = "stop_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID] = _vessel_fk()
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position = point_column(nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    prior_speed_kn: Mapped[float] = mapped_column(Float, nullable=False)
    duration_s: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)


class AssetProximityEvent(AnalyticStatementMixin, Base):
    __tablename__ = "asset_proximity_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    vessel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=True, index=True
    )
    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=True
    )
    asset_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offshore_assets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    exit_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ongoing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    min_distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    ring: Mapped[str] = mapped_column(String(20), nullable=False)  # MONITORING | SECURITY
    authorised: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
