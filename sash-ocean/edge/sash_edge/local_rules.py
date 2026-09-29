"""Local analytics on the edge node (works without connectivity).

Only lightweight, deterministic rules run at the edge. Their purpose is prioritisation:
a detection inside the protected radius of the local asset is promoted to an EVENT so it
crosses a constrained link first. Classification of intent is never attempted.
"""
from __future__ import annotations

import math


def _km(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def promote_near_asset(obs: dict, asset_lat: float, asset_lon: float, radius_km: float) -> dict:
    p = obs["payload"]
    if p.get("lat") is None:
        return obs
    d = _km(p["lat"], p["lon"], asset_lat, asset_lon)
    if d <= radius_km:
        obs = {**obs, "priority": "EVENT"}
        obs["payload"] = {**p, "attributes": {**p.get("attributes", {}), "edge_rule": "within_asset_radius",
                                              "distance_km": round(d, 2)}}
    return obs
