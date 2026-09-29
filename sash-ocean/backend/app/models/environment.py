from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, new_uuid, utcnow
from app.models.common import ProvenanceMixin, point_column


class EnvironmentObservation(ProvenanceMixin, Base):
    __tablename__ = "environment_observations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    position = point_column(nullable=False)
    wave_height_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    wind_speed_kn: Mapped[float | None] = mapped_column(Float, nullable=True)
    visibility_km: Mapped[float | None] = mapped_column(Float, nullable=True)


class SanctionsEntry(ProvenanceMixin, Base):
    """Vessel entries from public sanctions lists (compliance screening, not risk score)."""

    __tablename__ = "sanctions_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    list_name: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(300), nullable=False)
    imo: Mapped[str | None] = mapped_column(String(7), nullable=True, index=True)
    mmsi: Mapped[str | None] = mapped_column(String(9), nullable=True, index=True)
    program: Mapped[str | None] = mapped_column(String(200), nullable=True)
    listed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    raw: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class AnalyticsRun(Base):
    __tablename__ = "analytics_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="RUNNING")
    config_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    error: Mapped[str | None] = mapped_column(String(4000), nullable=True)


class SyntheticFeedQueue(Base):
    """Future synthetic AIS messages released gradually by the demo feed connector.

    This lets the demo behave like a live feed (vessels move in near-real-time) while
    exercising exactly the same ingestion path as a real AIS connector.
    """

    __tablename__ = "synthetic_feed_queue"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    release_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
