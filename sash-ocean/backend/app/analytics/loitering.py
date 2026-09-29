"""Loitering detection (stay-point style).

A vessel is loitering when it stays within a configurable radius at low average speed
for an unusually long time away from ports/anchorages. Fishing vessels loiter by
design, which lowers the anomaly confidence rather than suppressing the event.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime

from app.analytics.types import DetectedLoiter, Obs
from app.geo.core import format_duration, format_latlon, haversine_km

PortCheck = Callable[[float, float], bool]


def detect_loitering(
    track: Sequence[Obs],
    cfg: dict,
    vessel_type: str | None = None,
    near_port: PortCheck | None = None,
    now: datetime | None = None,
) -> list[DetectedLoiter]:
    radius = cfg["radius_km"]
    max_speed = cfg["max_avg_speed_kn"]
    min_dur = cfg["min_duration_hours"] * 3600
    min_obs = cfg["min_observations"]
    out: list[DetectedLoiter] = []
    n = len(track)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and haversine_km(track[i].lat, track[i].lon, track[j + 1].lat, track[j + 1].lon) <= radius:
            j += 1
        span = (track[j].ts - track[i].ts).total_seconds()
        count = j - i + 1
        if span >= min_dur and count >= min_obs:
            pts = track[i : j + 1]
            clat = sum(p.lat for p in pts) / count
            clon = sum(p.lon for p in pts) / count
            speeds = [p.sog for p in pts if p.sog is not None]
            avg_speed = sum(speeds) / len(speeds) if speeds else 0.0
            if avg_speed <= max_speed and not (near_port and near_port(clat, clon)):
                actual_r = max(haversine_km(clat, clon, p.lat, p.lon) for p in pts)
                conf = 0.45 + min(0.3, 0.1 * (span / min_dur - 1)) + (0.1 if count >= 3 * min_obs else 0)
                fishing = (vessel_type or "").lower() in {"fishing", "fishing vessel"}
                if fishing:
                    conf *= cfg.get("fishing_confidence_factor", 0.6)
                ongoing = bool(now and j == n - 1 and (now - track[j].ts).total_seconds() < 3 * 3600)
                ev = DetectedLoiter(
                    start=track[i].ts,
                    end=track[j].ts,
                    centre_lat=clat,
                    centre_lon=clon,
                    radius_km=round(actual_r, 2),
                    duration_s=span,
                    avg_speed_kn=round(avg_speed, 1),
                    observation_count=count,
                    confidence=round(min(conf, 0.9), 2),
                    ongoing=ongoing,
                    context={"vessel_type": vessel_type, "fishing_vessel": fishing},
                )
                ev.observation_text = (
                    f"Vessel remained within {ev.radius_km:.1f} km of {format_latlon(clat, clon)} for "
                    f"{format_duration(span)} at an average speed of {ev.avg_speed_kn} kn "
                    f"({count} position reports)."
                )
                inference = "Unusual low-speed loitering away from port or anchorage."
                if fishing:
                    inference += " Behaviour is consistent with fishing activity for this vessel type."
                inference += (
                    " Possible explanations include waiting for orders, drifting, machinery issues, "
                    "fishing, rendezvous or surveillance; intent cannot be determined from AIS alone."
                )
                ev.inference_text = inference
                out.append(ev)
                i = j + 1
                continue
        i += 1
    return out
