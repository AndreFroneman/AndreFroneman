"""Sensor abstraction, edge nodes, generic contacts and fusion hypotheses.

Not every tracked object has an MMSI. A CONTACT is anything detected by any sensor
(AIS, radar, EO/IR, RF, satellite, acoustic, manual, future quantum sensors). A contact
may later be correlated with a known VESSEL; the raw observations and the correlation
hypotheses are always retained as evidence.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, new_uuid, utcnow
from app.models.common import ProvenanceMixin, point_column


class OffshoreAsset(TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "offshore_assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    operator: Mapped[str | None] = mapped_column(String(200), nullable=True)
    asset_type: Mapped[str] = mapped_column(String(40), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    security_radius_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    monitoring_radius_km: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)
    # MMSIs of vessels expected near the asset (supply boats, standby vessels).
    authorised_mmsis: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )


class EdgeNode(TimestampMixin, Base):
    """A SASH Ocean Edge deployment (offshore platform, coastal site, vessel)."""

    __tablename__ = "edge_nodes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    node_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    platform: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    comms_links: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    software_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="UNKNOWN")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backlog_reported: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Sensor(TimestampMixin, Base):
    __tablename__ = "sensors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    sensor_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    owner: Mapped[str | None] = mapped_column(String(200), nullable=True)
    organisation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organisations.id", ondelete="SET NULL"), nullable=True
    )
    edge_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("edge_nodes.id", ondelete="SET NULL"), nullable=True
    )
    platform: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    position = point_column()
    coverage = mapped_column(Geometry("POLYGON", srid=4326), nullable=True)
    coverage_radius_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="UNKNOWN")
    trust_level: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    timestamp_accuracy_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    time_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capabilities: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class SensorObservation(ProvenanceMixin, Base):
    """Common observation pipeline for all non-AIS sensors (and future quantum sensors)."""

    __tablename__ = "sensor_observations"
    __table_args__ = (Index("ix_sensor_obs_sensor_time", "sensor_id", "observed_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sensor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sensors.id", ondelete="CASCADE"), nullable=False
    )
    edge_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("edge_nodes.id", ondelete="SET NULL"), nullable=True
    )
    # Idempotency key from the producer (edge nodes resend after outages).
    dedup_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    position = point_column()
    position_uncertainty_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_kn: Mapped[float | None] = mapped_column(Float, nullable=True)
    course_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    sensor_track_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    detection_type: Mapped[str] = mapped_column(String(40), nullable=False, default="DETECTION")
    classification: Mapped[str | None] = mapped_column(String(60), nullable=True)
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    contact_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    speed_kn: Mapped[float | None] = mapped_column(Float, nullable=True)
    course_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    classification: Mapped[str] = mapped_column(String(60), nullable=False, default="UNKNOWN")
    # UNIDENTIFIED | CORRELATED (probable identity) | CONFIRMED (analyst verified)
    identity_status: Mapped[str] = mapped_column(String(20), nullable=False, default="UNIDENTIFIED")
    correlated_vessel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="SET NULL"), nullable=True
    )
    correlation_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    detection_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    source_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    source_sensor_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    nearest_ais_vessel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    nearest_ais_distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ContactObservation(Base):
    """Link table: which raw sensor observations support which contact."""

    __tablename__ = "contact_observations"

    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True
    )
    sensor_observation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sensor_observations.id", ondelete="CASCADE"), primary_key=True
    )


class CorrelationHypothesis(Base):
    __tablename__ = "correlation_hypotheses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vessel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    method: Mapped[str] = mapped_column(String(60), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
