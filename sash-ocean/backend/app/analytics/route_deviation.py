"""Route deviation against an expected route.

The expected route is modelled from the voyage origin (or first observation) to the
declared destination over the reference lane network. Sustained cross-track distance
above a threshold produces a deviation event. A deviation is not a hostile indicator:
vessels re-route for weather, security guidance and commercial reasons.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime

from app.analytics.types import DetectedDeviation, Obs
from app.geo.core import format_duration, point_to_polyline_km, sub_polyline


def detect_route_deviations(
    track: Sequence[Obs],
    expected: Sequence[tuple[float, float]],
    cfg: dict,
    basis: str,
    destination_label: str | None = None,
    now: datetime | None = None,
) -> list[DetectedDeviation]:
    if len(track) < 2 or len(expected) < 2:
        return []
    threshold = cfg["threshold_km"]
    min_dur = cfg["min_duration_hours"] * 3600
    min_obs = cfg["min_observations"]

    projections = [point_to_polyline_km(o.lat, o.lon, expected) for o in track]
    events: list[DetectedDeviation] = []
    run: list[int] = []

    def close_run(indices: list[int]) -> None:
        if len(indices) < min_obs:
            return
        a, b = indices[0], indices[-1]
        dur = (track[b].ts - track[a].ts).total_seconds()
        if dur < min_dur:
            return
        dists = [projections[k][0] for k in indices]
        max_d, mean_d = max(dists), sum(dists) / len(dists)
        exp_part = sub_polyline(
            expected,
            (projections[a][1], projections[a][2]),
            (projections[b][1], projections[b][2]),
        )
        conf = 0.45 + min(0.25, (max_d / threshold - 1) * 0.2) + min(0.15, dur / (12 * 3600) * 0.15)
        if basis == "DECLARED_DESTINATION":
            conf += 0.05
        ongoing = bool(now and b == len(track) - 1)
        ev = DetectedDeviation(
            start=track[a].ts,
            end=track[b].ts,
            expected_path=exp_part,
            observed_path=[(track[k].lat, track[k].lon) for k in indices],
            max_deviation_km=round(max_d, 1),
            mean_deviation_km=round(mean_d, 1),
            duration_s=dur,
            basis=basis,
            confidence=round(min(conf, 0.9), 2),
            ongoing=ongoing,
        )
        dest = f" towards declared destination {destination_label}" if destination_label else ""
        ev.observation_text = (
            f"Vessel track was up to {ev.max_deviation_km:.0f} km (mean {ev.mean_deviation_km:.0f} km) "
            f"from the modelled expected route{dest} for {format_duration(dur)}."
        )
        ev.inference_text = (
            "Significant deviation from the expected route model. Deviations are frequently "
            "legitimate (weather routing, security routing guidance, commercial instructions); "
            "the expected route is an approximation from SASH's reference lane network."
        )
        events.append(ev)

    for k, (d, _, _) in enumerate(projections):
        if d > threshold:
            run.append(k)
        elif run:
            close_run(run)
            run = []
    if run:
        close_run(run)
    return events
