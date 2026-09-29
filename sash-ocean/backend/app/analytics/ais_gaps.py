"""AIS reporting-gap detection.

A gap is only flagged when it is long relative to (a) an absolute minimum and (b) the
vessel's own recent reporting cadence, which adapts to terrestrial vs satellite
reception. Coverage quality is estimated from whether *other* vessels kept reporting
nearby during the same window. A gap is reported as an "AIS reporting anomaly": the
system never concludes that AIS was intentionally disabled.
"""
from __future__ import annotations

import math
import statistics
from collections.abc import Callable, Sequence
from datetime import datetime, timedelta

from app.analytics.types import DetectedGap, Obs
from app.geo.core import format_duration, format_latlon, haversine_km, intermediate_point, knots_between

# peer_lookup(lat, lon, start, end, radius_km) -> (observation_count, distinct_vessels)
PeerLookup = Callable[[float, float, datetime, datetime, float], tuple[int, int]]
# in_port(lat, lon) -> bool
PortCheck = Callable[[float, float], bool]


def _coverage(peer_obs: int, peer_vessels: int, good_min: int) -> str:
    if peer_obs >= good_min and peer_vessels >= 2:
        return "GOOD"
    if peer_obs >= good_min or peer_vessels >= 1:
        return "MODERATE"
    return "UNKNOWN"


def _confidence(duration_s: float, threshold_s: float, coverage: str, in_port: bool, cfg: dict) -> float:
    # Duration beyond the adaptive threshold contributes at most 0.25; the decisive factor is
    # whether other vessels demonstrably kept reporting nearby (coverage evidence).
    ratio = duration_s / max(threshold_s, 1.0)
    conf = 0.2 + min(0.25, 0.15 * math.log2(max(ratio, 1.0)) + 0.05)
    conf += {"GOOD": 0.4, "MODERATE": 0.2, "UNKNOWN": 0.0}[coverage]
    if in_port:
        conf -= cfg.get("in_port_confidence_penalty", 0.3)
    return round(max(0.05, min(0.95, conf)), 2)


def detect_ais_gaps(
    track: Sequence[Obs],
    cfg: dict,
    now: datetime | None = None,
    peer_lookup: PeerLookup | None = None,
    in_port: PortCheck | None = None,
) -> list[DetectedGap]:
    if len(track) < 2:
        return []
    min_gap_s = cfg["min_gap_minutes"] * 60
    mult = cfg["interval_multiplier"]
    window = int(cfg["baseline_window"])
    default_s = cfg["default_expected_interval_minutes"] * 60
    peer_radius = cfg["peer_radius_km"]
    good_min = cfg["peer_good_min_observations"]
    max_speed = cfg["max_plausible_speed_kn"]

    gaps: list[DetectedGap] = []
    intervals: list[float] = []

    def expected_interval() -> float:
        normal = [i for i in intervals[-window:] if i < min_gap_s]
        return statistics.median(normal) if len(normal) >= 3 else default_s

    for prev, cur in zip(track, track[1:], strict=False):
        dt = (cur.ts - prev.ts).total_seconds()
        expected = expected_interval()
        threshold = max(min_gap_s, mult * expected)
        if dt > threshold:
            mid_lat, mid_lon = intermediate_point(prev.lat, prev.lon, cur.lat, cur.lon, 0.5)
            peer_obs, peer_vessels = (
                peer_lookup(mid_lat, mid_lon, prev.ts, cur.ts, peer_radius) if peer_lookup else (0, 0)
            )
            coverage = _coverage(peer_obs, peer_vessels, good_min)
            speed = knots_between(prev.lat, prev.lon, prev.ts, cur.lat, cur.lon, cur.ts)
            discontinuity = speed > max_speed
            port = bool(in_port and (in_port(prev.lat, prev.lon) or in_port(cur.lat, cur.lon)))
            conf = _confidence(dt, threshold, coverage, port, cfg)
            gap = DetectedGap(
                last=prev,
                next=cur,
                gap_start=prev.ts,
                gap_end=cur.ts,
                duration_s=dt,
                expected_interval_s=expected,
                coverage_quality=coverage,
                peer_observations=peer_obs,
                peer_vessels=peer_vessels,
                implied_speed_kn=round(speed, 1),
                position_discontinuity=discontinuity,
                in_port=port,
                anomaly_confidence=conf,
                ongoing=False,
            )
            _describe(gap, prev, cur)
            gaps.append(gap)
        else:
            intervals.append(dt)

    # Ongoing gap: the vessel has not reported for an unusually long time *now*.
    if now is not None:
        last = track[-1]
        silent = (now - last.ts).total_seconds()
        expected = expected_interval()
        threshold = max(min_gap_s, mult * expected, cfg.get("ongoing_after_minutes", 120) * 60)
        if silent > threshold:
            peer_obs, peer_vessels = (
                peer_lookup(last.lat, last.lon, last.ts, now, peer_radius) if peer_lookup else (0, 0)
            )
            coverage = _coverage(peer_obs, peer_vessels, good_min)
            port = bool(in_port and in_port(last.lat, last.lon))
            gap = DetectedGap(
                last=last,
                next=None,
                gap_start=last.ts,
                gap_end=None,
                duration_s=silent,
                expected_interval_s=expected,
                coverage_quality=coverage,
                peer_observations=peer_obs,
                peer_vessels=peer_vessels,
                implied_speed_kn=None,
                position_discontinuity=False,
                in_port=port,
                anomaly_confidence=_confidence(silent, threshold, coverage, port, cfg),
                ongoing=True,
            )
            _describe(gap, last, None)
            gaps.append(gap)
    return gaps


def _describe(gap: DetectedGap, prev: Obs, cur: Obs | None) -> None:
    when = prev.ts.strftime("%Y-%m-%d %H:%MZ")
    if cur is not None:
        gap.observation_text = (
            f"No AIS position reports received for {format_duration(gap.duration_s)} "
            f"(last {when} at {format_latlon(prev.lat, prev.lon)}; next "
            f"{cur.ts.strftime('%Y-%m-%d %H:%MZ')} at {format_latlon(cur.lat, cur.lon)}). "
            f"Vessel's recent reporting interval ≈ {format_duration(gap.expected_interval_s)}."
        )
    else:
        gap.observation_text = (
            f"No AIS position reports received since {when} "
            f"({format_duration(gap.duration_s)} ago) at {format_latlon(prev.lat, prev.lon)}."
        )
    cov = {
        "GOOD": f"{gap.peer_observations} reports from {gap.peer_vessels} other vessels nearby during "
        "the same window suggest receiver coverage was available",
        "MODERATE": f"limited reporting from other vessels nearby ({gap.peer_observations} reports, "
        f"{gap.peer_vessels} vessels) means coverage may have been partial",
        "UNKNOWN": "no other vessels reported nearby during the window, so a coverage limitation "
        "cannot be ruled out",
    }[gap.coverage_quality]
    parts = [f"Unexpected AIS reporting gap; {cov}."]
    if gap.position_discontinuity:
        parts.append(
            f"Implied speed across the gap ({gap.implied_speed_kn} kn) is implausible, indicating a "
            "possible position or identity inconsistency that warrants verification."
        )
    if gap.in_port:
        parts.append("Vessel was in or near a port, where reporting gaps are common.")
    parts.append(
        "Cause undetermined: possible explanations include coverage limitations, equipment fault, "
        "transmission issues, deliberate security procedures or intentional disabling."
    )
    gap.inference_text = " ".join(parts)


def peer_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    """Shrink the peer-check window slightly so boundary reports do not count."""
    pad = min(timedelta(minutes=10), (end - start) / 10)
    return start + pad, end - pad


__all__ = ["detect_ais_gaps", "peer_window", "haversine_km"]
