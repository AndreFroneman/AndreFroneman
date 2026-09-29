"""Pure-Python geodesy helpers (spherical earth, adequate for maritime analytics).

Heavy spatial queries run in PostGIS; these helpers cover per-track computations
that are easier to test and reason about in Python.
"""
from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import datetime, timezone

EARTH_RADIUS_KM = 6371.0088
KM_PER_NM = 1.852


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def destination_point(lat: float, lon: float, bearing: float, distance_km: float) -> tuple[float, float]:
    d = distance_km / EARTH_RADIUS_KM
    b = math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540.0) % 360.0 - 180.0


def intermediate_point(lat1: float, lon1: float, lat2: float, lon2: float, f: float) -> tuple[float, float]:
    """Point at fraction f (0..1) along the great circle between two points."""
    if f <= 0:
        return lat1, lon1
    if f >= 1:
        return lat2, lon2
    d = haversine_km(lat1, lon1, lat2, lon2) / EARTH_RADIUS_KM
    if d < 1e-12:
        return lat1, lon1
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((1 - f) * d) / math.sin(d)
    b = math.sin(f * d) / math.sin(d)
    x = a * math.cos(p1) * math.cos(l1) + b * math.cos(p2) * math.cos(l2)
    y = a * math.cos(p1) * math.sin(l1) + b * math.cos(p2) * math.sin(l2)
    z = a * math.sin(p1) + b * math.sin(p2)
    return math.degrees(math.atan2(z, math.hypot(x, y))), math.degrees(math.atan2(y, x))


def point_to_segment_km(
    lat: float, lon: float, alat: float, alon: float, blat: float, blon: float
) -> tuple[float, float]:
    """Distance from a point to a great-circle segment A-B.

    Returns (distance_km, fraction_along_segment in [0, 1]).
    """
    d_ab = haversine_km(alat, alon, blat, blon)
    d_ap = haversine_km(alat, alon, lat, lon)
    if d_ab < 1e-9:
        return d_ap, 0.0
    ang_ap = d_ap / EARTH_RADIUS_KM
    theta_ap = math.radians(bearing_deg(alat, alon, lat, lon))
    theta_ab = math.radians(bearing_deg(alat, alon, blat, blon))
    xt = math.asin(max(-1.0, min(1.0, math.sin(ang_ap) * math.sin(theta_ap - theta_ab))))
    if math.cos(theta_ap - theta_ab) < 0:  # point is "behind" A
        return d_ap, 0.0
    cos_xt = math.cos(xt)
    at = math.acos(max(-1.0, min(1.0, math.cos(ang_ap) / cos_xt))) if cos_xt > 1e-12 else 0.0
    at_km = at * EARTH_RADIUS_KM
    if at_km > d_ab:
        return haversine_km(blat, blon, lat, lon), 1.0
    return abs(xt) * EARTH_RADIUS_KM, at_km / d_ab


def point_to_polyline_km(
    lat: float, lon: float, line: Sequence[tuple[float, float]]
) -> tuple[float, int, float]:
    """Closest distance from point to polyline [(lat, lon), ...].

    Returns (distance_km, segment_index, fraction_along_segment).
    """
    if len(line) == 1:
        return haversine_km(lat, lon, *line[0]), 0, 0.0
    best = (float("inf"), 0, 0.0)
    for i in range(len(line) - 1):
        d, f = point_to_segment_km(lat, lon, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1])
        if d < best[0]:
            best = (d, i, f)
    return best


def polyline_length_km(line: Sequence[tuple[float, float]]) -> float:
    return sum(haversine_km(*line[i], *line[i + 1]) for i in range(len(line) - 1))


def densify(line: Sequence[tuple[float, float]], step_km: float) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i in range(len(line) - 1):
        a, b = line[i], line[i + 1]
        n = max(1, int(math.ceil(haversine_km(*a, *b) / step_km)))
        for k in range(n):
            out.append(intermediate_point(a[0], a[1], b[0], b[1], k / n))
    out.append(tuple(line[-1]))
    return out


def sub_polyline(
    line: Sequence[tuple[float, float]], start: tuple[int, float], end: tuple[int, float]
) -> list[tuple[float, float]]:
    """Portion of a polyline between two (segment_index, fraction) positions."""
    (si, sf), (ei, ef) = sorted([start, end])

    def at(i: int, f: float) -> tuple[float, float]:
        if i >= len(line) - 1:
            return tuple(line[-1])
        return intermediate_point(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], f)

    pts = [at(si, sf)]
    for k in range(si + 1, ei + 1):
        pts.append(tuple(line[k]))
    pts.append(at(ei, ef))
    return pts


def interpolate_position(
    t: datetime, t1: datetime, lat1: float, lon1: float, t2: datetime, lat2: float, lon2: float
) -> tuple[float, float]:
    span = (t2 - t1).total_seconds()
    if span <= 0:
        return lat1, lon1
    f = (t - t1).total_seconds() / span
    return intermediate_point(lat1, lon1, lat2, lon2, max(0.0, min(1.0, f)))


def knots_between(lat1, lon1, t1: datetime, lat2, lon2, t2: datetime) -> float:
    hours = (t2 - t1).total_seconds() / 3600.0
    if hours <= 0:
        return 0.0
    return haversine_km(lat1, lon1, lat2, lon2) / KM_PER_NM / hours


# --- Solar position (NOAA simplified algorithm) ----------------------------------

def solar_elevation_deg(lat: float, lon: float, when: datetime) -> float:
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when = when.astimezone(timezone.utc)
    day_of_year = when.timetuple().tm_yday
    hour = when.hour + when.minute / 60 + when.second / 3600
    gamma = 2 * math.pi / 365 * (day_of_year - 1 + (hour - 12) / 24)
    eqtime = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2 * gamma)
        - 0.040849 * math.sin(2 * gamma)
    )
    decl = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2 * gamma)
        + 0.000907 * math.sin(2 * gamma)
        - 0.002697 * math.cos(3 * gamma)
        + 0.00148 * math.sin(3 * gamma)
    )
    time_offset = eqtime + 4 * lon
    tst = hour * 60 + time_offset
    ha = math.radians(tst / 4 - 180)
    phi = math.radians(lat)
    cos_zenith = math.sin(phi) * math.sin(decl) + math.cos(phi) * math.cos(decl) * math.cos(ha)
    zenith = math.acos(max(-1.0, min(1.0, cos_zenith)))
    return 90.0 - math.degrees(zenith)


def is_dark(lat: float, lon: float, when: datetime, threshold_deg: float = -6.0) -> bool:
    """True when the sun is below the threshold (default: darker than civil twilight)."""
    return solar_elevation_deg(lat, lon, when) < threshold_deg


def format_duration(seconds: float) -> str:
    seconds = int(round(seconds))
    d, rem = divmod(seconds, 86400)
    h, rem = divmod(rem, 3600)
    m = rem // 60
    if d:
        return f"{d}d {h}h {m:02d}m"
    if h:
        return f"{h}h {m:02d}m"
    return f"{m}m"


def format_latlon(lat: float, lon: float) -> str:
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{abs(lat):.2f}°{ns} {abs(lon):.2f}°{ew}"
