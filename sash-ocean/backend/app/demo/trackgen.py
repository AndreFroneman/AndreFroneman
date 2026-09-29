"""Synthetic AIS track generator (demo data only).

Vessels sail itineraries over the reference lane network. Reporting cadence mimics
terrestrial AIS near the coast and sparser satellite AIS offshore. Behaviours (AIS
gaps, lateral route deviations, loitering, unexpected stops) are injected at chosen
distances along a leg so the demo scenario is reproducible.
"""
from __future__ import annotations

import bisect
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.geo.core import bearing_deg, densify, destination_point, haversine_km
from app.geo.routing import ports

KN = 1.852  # km per nautical mile


@dataclass
class TrackPoint:
    ts: datetime
    lat: float
    lon: float
    sog: float
    cog: float
    heading: float
    nav_status: str
    receiver_class: str
    destination: str | None = None


@dataclass
class Stay:
    lat: float
    lon: float
    hours: float
    nav_status: str = "Moored"
    drift_km: float = 0.05


@dataclass
class Sail:
    route: list[tuple[float, float]]
    speed_kn: float
    gap_at_km: float | None = None
    gap_minutes: float = 0
    deviation_at_km: float | None = None
    deviation_peak_km: float = 0
    deviation_ramp_h: float = 3
    deviation_plateau_h: float = 6
    deviation_side: int = -1  # -1 = left of course, +1 = right
    loiter_at_km: float | None = None
    loiter_hours: float = 0
    loiter_speed_kn: float = 1.2
    loiter_nav: str = "Under way using engine"
    stop_at_km: float | None = None
    stop_hours: float = 0
    noise_km: float = 1.0
    nav_status: str = "Under way using engine"
    destination: str | None = None  # AIS declared destination for this leg
    extra: dict = field(default_factory=dict)


class _Polyline:
    def __init__(self, pts: list[tuple[float, float]]):
        self.pts = densify(pts, 10.0)
        self.cum = [0.0]
        for i in range(1, len(self.pts)):
            self.cum.append(self.cum[-1] + haversine_km(*self.pts[i - 1], *self.pts[i]))
        self.length = self.cum[-1]

    def at(self, s: float) -> tuple[float, float, float]:
        s = max(0.0, min(self.length, s))
        i = min(len(self.pts) - 2, max(0, bisect.bisect_right(self.cum, s) - 1))
        seg = self.cum[i + 1] - self.cum[i]
        f = 0.0 if seg <= 0 else (s - self.cum[i]) / seg
        a, b = self.pts[i], self.pts[i + 1]
        lat = a[0] + (b[0] - a[0]) * f
        lon = a[1] + (b[1] - a[1]) * f
        return lat, lon, bearing_deg(*a, *b)

    def km_nearest(self, lat: float, lon: float) -> float:
        k = min(range(len(self.pts)), key=lambda i: haversine_km(lat, lon, *self.pts[i]))
        return self.cum[k]


def _near_coast(lat: float, lon: float) -> bool:
    return any(haversine_km(lat, lon, p.lat, p.lon) < 110 for p in ports().values())


def _interval(rng: random.Random, lat: float, lon: float, moving: bool) -> tuple[float, str]:
    if _near_coast(lat, lon):
        return (rng.uniform(4, 7) if moving else rng.uniform(9, 14)), "TERRESTRIAL"
    return rng.uniform(12, 32), "SATELLITE"


def _smooth(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def simulate(legs: list, start: datetime, end: datetime, rng: random.Random, loop: bool = False) -> list[TrackPoint]:
    """Simulate an itinerary from `start` until `end` (repeating if loop=True)."""
    out: list[TrackPoint] = []
    t = start
    idx = 0
    guard = 0
    first_n = 0
    while t < end and guard < 500:
        guard += 1
        if idx >= len(legs):
            if not loop:
                # Remain at the final position (moored) until the window ends.
                last = out[-1] if out else None
                if last is None:
                    break
                legs = legs + [Stay(last.lat, last.lon, (end - t).total_seconds() / 3600 + 1)]
            else:
                idx = 0
        leg = legs[idx]
        idx += 1
        first_n = len(out)
        if isinstance(leg, Stay):
            t = _stay(leg, t, end, rng, out)
        else:
            t = _sail(leg, t, end, rng, out)
            if leg.destination:
                for p in out[first_n:]:
                    p.destination = leg.destination
    # Destination persists through the following port stay until the next departure.
    current = None
    for p in out:
        if p.destination:
            current = p.destination
        else:
            p.destination = current
    first_dest = next((p.destination for p in out if p.destination), None)
    for p in out:
        if p.destination is None:
            p.destination = first_dest
    return out


def _stay(leg: Stay, t: datetime, end: datetime, rng, out) -> datetime:
    stop = min(end, t + timedelta(hours=leg.hours))
    heading = rng.uniform(0, 359)
    while t < stop:
        lat, lon = destination_point(leg.lat, leg.lon, rng.uniform(0, 360), rng.uniform(0, leg.drift_km))
        dt, rc = _interval(rng, lat, lon, False)
        out.append(TrackPoint(t, round(lat, 5), round(lon, 5), round(rng.uniform(0, 0.2), 1),
                              round(rng.uniform(0, 359), 1), round(heading, 0), leg.nav_status, rc))
        t += timedelta(minutes=dt)
    return t


def _sail(leg: Sail, t: datetime, end: datetime, rng, out) -> datetime:
    line = _Polyline(leg.route)
    speed_kmh = leg.speed_kn * KN
    s = 0.0
    lateral = 0.0
    gap_window = None
    dev_start = None
    loiter_window = None
    loiter_centre = None
    stop_window = None
    prev = None
    while s < line.length and t < end:
        lat0, lon0, course = line.at(s)
        dt_min, rc = _interval(rng, lat0, lon0, True)
        # Behaviour triggers (keyed to distance along the leg)
        if leg.gap_at_km is not None and gap_window is None and s >= leg.gap_at_km:
            gap_window = (t, t + timedelta(minutes=leg.gap_minutes))
        if leg.deviation_at_km is not None and dev_start is None and s >= leg.deviation_at_km:
            dev_start = t
        if leg.loiter_at_km is not None and loiter_window is None and s >= leg.loiter_at_km:
            loiter_window = (t, t + timedelta(hours=leg.loiter_hours))
            loiter_centre = (lat0, lon0)
        if leg.stop_at_km is not None and stop_window is None and s >= leg.stop_at_km:
            stop_window = (t, t + timedelta(hours=leg.stop_hours))

        in_loiter = loiter_window and loiter_window[0] <= t < loiter_window[1]
        in_stop = stop_window and stop_window[0] <= t < stop_window[1]
        nav = leg.nav_status
        if in_loiter:
            # Slow random walk around the loiter centre.
            ang = rng.uniform(0, 360)
            base = loiter_centre
            r = rng.uniform(0.3, 3.2)
            lat, lon = destination_point(base[0], base[1], ang, r)
            nav = leg.loiter_nav
        elif in_stop:
            lat, lon = destination_point(lat0, lon0, rng.uniform(0, 360), rng.uniform(0, 0.3))
            nav = "Not under command" if leg.extra.get("nuc") else leg.nav_status
        else:
            # Lateral offset = OU noise + deviation bump, perpendicular to the course.
            tau = 3.0
            dth = dt_min / 60
            sigma = leg.noise_km * math.sqrt(2 / tau)
            lateral += -lateral * dth / tau + sigma * math.sqrt(dth) * rng.gauss(0, 1)
            taper = min(1.0, s / 25.0, (line.length - s) / 25.0)
            offset = lateral * taper
            if dev_start is not None:
                h = (t - dev_start).total_seconds() / 3600
                ramp, plat = leg.deviation_ramp_h, leg.deviation_plateau_h
                if h < ramp:
                    f = _smooth(h / ramp)
                elif h < ramp + plat:
                    f = 1.0
                else:
                    f = 1.0 - _smooth((h - ramp - plat) / ramp)
                offset += leg.deviation_side * leg.deviation_peak_km * max(0.0, f)
            if abs(offset) > 0.001:
                lat, lon = destination_point(lat0, lon0, (course + (90 if offset > 0 else -90)) % 360, abs(offset))
            else:
                lat, lon = lat0, lon0

        suppressed = gap_window and gap_window[0] <= t < gap_window[1]
        if prev is not None:
            dt_h = (t - prev[0]).total_seconds() / 3600
            dist = haversine_km(prev[1], prev[2], lat, lon)
            sog = dist / KN / dt_h if dt_h > 0 else leg.speed_kn
            cog = bearing_deg(prev[1], prev[2], lat, lon) if dist > 0.05 else course
        else:
            sog, cog = leg.speed_kn, course
        if in_loiter:
            sog = max(0.1, rng.gauss(leg.loiter_speed_kn, 0.4))
        if in_stop:
            sog = round(rng.uniform(0, 0.4), 1)
        if not suppressed:
            out.append(TrackPoint(t, round(lat, 5), round(lon, 5), round(max(0.0, min(sog, 30.0)), 1),
                                  round(cog % 360, 1), round((cog + rng.gauss(0, 2)) % 360, 0), nav, rc))
        prev = (t, lat, lon)
        t_next = t + timedelta(minutes=dt_min)
        if not (in_loiter or in_stop):
            s += speed_kmh * (dt_min / 60) * rng.uniform(0.97, 1.03)
        t = t_next
    return t


def leg_length_km(route: list[tuple[float, float]]) -> float:
    return _Polyline(route).length


def km_along(route: list[tuple[float, float]], lat: float, lon: float) -> float:
    return _Polyline(route).km_nearest(lat, lon)


def position_along(route: list[tuple[float, float]], km: float) -> tuple[float, float]:
    lat, lon, _ = _Polyline(route).at(km)
    return lat, lon
