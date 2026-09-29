"""Voyage segmentation: split an AIS history at port stays."""
from __future__ import annotations

from collections.abc import Callable, Sequence

from app.analytics.types import DetectedVoyage, Obs
from app.geo.core import haversine_km

# port_at(lat, lon) -> UN/LOCODE or None
PortLookup = Callable[[float, float], str | None]


def segment_voyages(track: Sequence[Obs], cfg: dict, port_at: PortLookup) -> list[DetectedVoyage]:
    if not track:
        return []
    stay_speed = cfg["port_stay_speed_kn"]
    min_stay = cfg["port_stay_min_hours"] * 3600

    # Identify port stays: consecutive slow observations near the same port.
    stays: list[tuple[int, int, str]] = []
    i, n = 0, len(track)
    while i < n:
        port = port_at(track[i].lat, track[i].lon)
        if port and (track[i].sog or 0) <= stay_speed:
            j = i
            while (
                j + 1 < n
                and (track[j + 1].sog or 0) <= stay_speed
                and port_at(track[j + 1].lat, track[j + 1].lon) == port
            ):
                j += 1
            if (track[j].ts - track[i].ts).total_seconds() >= min_stay:
                stays.append((i, j, port))
            i = j + 1
        else:
            i += 1

    voyages: list[DetectedVoyage] = []
    boundaries: list[tuple[int, str | None]] = []  # (index where voyage starts, origin)
    if not stays or stays[0][0] > 0:
        boundaries.append((0, None))
    for _s, e, port in stays:
        boundaries.append((e, port))
    for _k, (start_idx, origin) in enumerate(boundaries):
        next_stay = next((s for s in stays if s[0] > start_idx), None)
        end_idx = next_stay[0] if next_stay else n - 1
        dest = next_stay[2] if next_stay else None
        if end_idx <= start_idx:
            continue
        seg = track[start_idx : end_idx + 1]
        dist = sum(haversine_km(seg[m].lat, seg[m].lon, seg[m + 1].lat, seg[m + 1].lon) for m in range(len(seg) - 1))
        if dist < 5:  # stationary between two stays, not a voyage
            continue
        voyages.append(
            DetectedVoyage(
                departure_time=track[start_idx].ts,
                arrival_time=track[end_idx].ts if next_stay else None,
                origin_port=origin,
                destination_port=dest,
                distance_km=round(dist, 1),
                observation_count=len(seg),
                start_index=start_idx,
                end_index=end_idx,
            )
        )
    return voyages
