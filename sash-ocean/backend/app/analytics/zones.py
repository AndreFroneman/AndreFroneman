"""Risk-zone exposure: entry/exit time, duration, distance and threat level.

Boundary crossings are interpolated between consecutive observations (line/boundary
intersection) so entry and exit times are not quantised to the reporting interval.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from shapely.geometry import LineString, Point
from shapely.geometry.base import BaseGeometry
from shapely.prepared import prep

from app.analytics.types import DetectedExposure, Obs
from app.geo.core import haversine_km


@dataclass
class ZoneShape:
    id: Any
    name: str
    severity: str
    geom: BaseGeometry  # lon/lat
    effective_start: datetime | None = None
    effective_end: datetime | None = None
    category: str | None = None

    def __post_init__(self):
        self._prepared = prep(self.geom)

    def active(self, t: datetime) -> bool:
        if self.effective_start and t < self.effective_start:
            return False
        if self.effective_end and t > self.effective_end:
            return False
        return True

    def contains(self, lat: float, lon: float) -> bool:
        return self._prepared.covers(Point(lon, lat))


def _crossing_fraction(zone: ZoneShape, a: Obs, b: Obs) -> float:
    seg = LineString([(a.lon, a.lat), (b.lon, b.lat)])
    inter = seg.intersection(zone.geom.boundary)
    if inter.is_empty:
        return 0.5
    pts = [inter] if inter.geom_type == "Point" else list(getattr(inter, "geoms", [inter]))
    total = seg.length or 1e-12
    fr = sorted(seg.project(Point(p.coords[0])) / total for p in pts if p.geom_type == "Point")
    return fr[0] if fr else 0.5


def compute_zone_exposures(
    track: Sequence[Obs], zones: Sequence[ZoneShape], now: datetime | None = None
) -> list[DetectedExposure]:
    if not track:
        return []
    out: list[DetectedExposure] = []
    for zone in zones:
        started_inside = False
        inside_prev = False
        entry_t = None
        entry_pos = None
        dist = 0.0
        for k, o in enumerate(track):
            inside = zone.active(o.ts) and zone.contains(o.lat, o.lon)
            if k > 0:
                p = track[k - 1]
                seg_km = haversine_km(p.lat, p.lon, o.lat, o.lon)
                if inside_prev and inside:
                    dist += seg_km
                elif inside != inside_prev:
                    f = _crossing_fraction(zone, p, o)
                    t_cross = p.ts + (o.ts - p.ts) * f
                    pos = (p.lat + (o.lat - p.lat) * f, p.lon + (o.lon - p.lon) * f)
                    if inside:  # entry
                        entry_t, entry_pos = t_cross, pos
                        dist = seg_km * (1 - f)
                    else:  # exit
                        dist += seg_km * f
                        out.append(
                            DetectedExposure(
                                zone_id=zone.id,
                                zone_name=zone.name,
                                severity=zone.severity,
                                entry_time=entry_t,
                                exit_time=t_cross,
                                duration_s=(t_cross - entry_t).total_seconds(),
                                distance_km=round(dist, 1),
                                entry_pos=entry_pos,
                                exit_pos=pos,
                                ongoing=False,
                                started_inside=started_inside,
                            )
                        )
                        dist = 0.0
                        started_inside = False
            elif inside:  # track starts inside the zone
                entry_t, entry_pos = o.ts, (o.lat, o.lon)
                started_inside = True
            inside_prev = inside
        if inside_prev and entry_t is not None:
            last = track[-1]
            out.append(
                DetectedExposure(
                    zone_id=zone.id,
                    zone_name=zone.name,
                    severity=zone.severity,
                    entry_time=entry_t,
                    exit_time=None,
                    duration_s=(last.ts - entry_t).total_seconds(),
                    distance_km=round(dist, 1),
                    entry_pos=entry_pos,
                    exit_pos=None,
                    ongoing=True,
                    started_inside=started_inside,
                )
            )
    out.sort(key=lambda e: e.entry_time)
    return out


def zones_at(zones: Sequence[ZoneShape], lat: float, lon: float, t: datetime) -> list[ZoneShape]:
    return [z for z in zones if z.active(t) and z.contains(lat, lon)]
