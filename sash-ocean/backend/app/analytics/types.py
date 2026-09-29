from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class Obs:
    """Minimal AIS observation used by the detectors (decoupled from the ORM)."""

    ts: datetime
    lat: float
    lon: float
    sog: float | None = None
    cog: float | None = None
    heading: float | None = None
    nav_status: str | None = None
    receiver_class: str | None = None
    id: int | None = None


@dataclass
class DetectedGap:
    last: Obs
    next: Obs | None
    gap_start: datetime
    gap_end: datetime | None
    duration_s: float
    expected_interval_s: float
    coverage_quality: str
    peer_observations: int
    peer_vessels: int
    implied_speed_kn: float | None
    position_discontinuity: bool
    in_port: bool
    anomaly_confidence: float
    ongoing: bool
    observation_text: str = ""
    inference_text: str = ""


@dataclass
class DetectedLoiter:
    start: datetime
    end: datetime
    centre_lat: float
    centre_lon: float
    radius_km: float
    duration_s: float
    avg_speed_kn: float
    observation_count: int
    confidence: float
    ongoing: bool
    context: dict[str, Any] = field(default_factory=dict)
    observation_text: str = ""
    inference_text: str = ""


@dataclass
class DetectedDeviation:
    start: datetime
    end: datetime
    expected_path: list[tuple[float, float]]
    observed_path: list[tuple[float, float]]
    max_deviation_km: float
    mean_deviation_km: float
    duration_s: float
    basis: str
    confidence: float
    ongoing: bool
    observation_text: str = ""
    inference_text: str = ""


@dataclass
class DetectedStop:
    start: datetime
    end: datetime
    lat: float
    lon: float
    prior_speed_kn: float
    duration_s: float
    confidence: float
    ongoing: bool
    observation_text: str = ""
    inference_text: str = ""


@dataclass
class DetectedExposure:
    zone_id: Any
    zone_name: str
    severity: str
    entry_time: datetime
    exit_time: datetime | None
    duration_s: float
    distance_km: float
    entry_pos: tuple[float, float]
    exit_pos: tuple[float, float] | None
    ongoing: bool
    started_inside: bool = False


@dataclass
class DetectedVoyage:
    departure_time: datetime
    arrival_time: datetime | None
    origin_port: str | None
    destination_port: str | None
    distance_km: float
    observation_count: int
    start_index: int
    end_index: int
