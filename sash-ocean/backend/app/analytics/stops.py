"""Unexpected stop detection: a transiting vessel slows to near-zero away from ports."""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from app.analytics.types import DetectedStop, Obs
from app.geo.core import format_duration, format_latlon

PortCheck = Callable[[float, float], bool]


def detect_unexpected_stops(
    track: Sequence[Obs],
    cfg: dict,
    near_port: PortCheck | None = None,
    now: datetime | None = None,
) -> list[DetectedStop]:
    stop_speed = cfg["stop_speed_kn"]
    prior_speed = cfg["prior_speed_kn"]
    min_dur = cfg["min_duration_minutes"] * 60
    out: list[DetectedStop] = []
    n = len(track)
    i = 1
    while i < n:
        cur, prev = track[i], track[i - 1]
        if (
            cur.sog is not None
            and cur.sog <= stop_speed
            and prev.sog is not None
            and prev.sog >= prior_speed
            and not (near_port and near_port(cur.lat, cur.lon))
            and (cur.nav_status or "").lower() not in {"moored", "at anchor"}
        ):
            j = i
            while j + 1 < n and track[j + 1].sog is not None and track[j + 1].sog <= stop_speed:
                j += 1
            dur = (track[j].ts - cur.ts).total_seconds()
            if dur >= min_dur:
                ongoing = bool(now and j == n - 1)
                ev = DetectedStop(
                    start=cur.ts,
                    end=track[j].ts,
                    lat=cur.lat,
                    lon=cur.lon,
                    prior_speed_kn=round(prev.sog, 1),
                    duration_s=dur,
                    confidence=round(min(0.85, 0.5 + dur / (6 * 3600) * 0.3), 2),
                    ongoing=ongoing,
                )
                ev.observation_text = (
                    f"Speed dropped from {ev.prior_speed_kn} kn to ≤{stop_speed} kn at "
                    f"{format_latlon(cur.lat, cur.lon)} and remained stopped for {format_duration(dur)}."
                )
                ev.inference_text = (
                    "Unexpected stop at sea away from ports/anchorages. Possible explanations include "
                    "machinery issues, awaiting orders, drifting to save fuel, or an incident; cause "
                    "cannot be determined from AIS alone."
                )
                out.append(ev)
            i = j + 1
            continue
        i += 1
    return out
