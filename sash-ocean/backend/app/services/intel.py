"""Area risk and planned-voyage risk (customer API products)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.analytics.types import Obs
from app.analytics.zones import zones_at
from app.core.yamlconfig import risk_model
from app.geo.core import densify, haversine_km, is_dark, polyline_length_km
from app.geo.routing import resolve_port, route_between_points, route_between_ports
from app.models.common import SEVERITY_RANK
from app.risk.engine import RiskContext, RiskEngine, VesselProfile, band_for
from app.risk.loader import load_environment, load_incidents, load_zones

KN = 1.852


def _point_context(lat, lon, t, zones, incidents, env, vessel_type=None) -> RiskContext:
    return RiskContext(
        vessel=VesselProfile(id=None, vessel_type=vessel_type),
        track=[Obs(ts=t, lat=lat, lon=lon, sog=None)],
        zones=zones, incidents=incidents, environment=env,
    )


def area_risk(db: Session, lat: float, lon: float, radius_km: float, days: int, synthetic: bool,
              now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    model = risk_model()
    engine = RiskEngine(model)
    zones = load_zones(db, synthetic)
    incidents = load_incidents(db, synthetic, since=now - timedelta(days=max(days, 180)))
    env = load_environment(db, synthetic, since=now - timedelta(days=2))
    res = engine.assess(_point_context(lat, lon, now, zones, incidents, env), now, with_trend=False)
    # Area risk is location-only: behavioural and vessel-profile factors do not apply.
    regional = [c for c in res.contributors if c.component in ("regional_threat", "environment")]
    score = min(100, sum(c.points for c in regional))

    near = [i for i in incidents if i.occurred_at >= now - timedelta(days=days) and i.known_at <= now
            and haversine_km(lat, lon, i.lat, i.lon) <= radius_km]
    cats: dict[str, int] = {}
    for i in near:
        cats[i.category] = cats.get(i.category, 0) + 1
    recent = sum(1 for i in near if i.occurred_at >= now - timedelta(days=days / 3))
    older = len(near) - recent
    expected_recent = older / 2 if older else 0
    trend = "Stable"
    if recent > expected_recent * 1.5 and recent >= 2:
        trend = "Increasing"
    elif recent < expected_recent * 0.5 and older >= 2:
        trend = "Decreasing"
    area_km2 = 3.14159 * radius_km ** 2
    verified = sum(1 for i in near if i.verification_status in ("VERIFIED", "PARTIALLY_VERIFIED"))
    confidence = round(min(0.9, 0.35 + 0.05 * len(near) + 0.2 * (verified / len(near) if near else 0)), 2)
    sources = sorted({(i.source_name or "unknown") for i in near})
    zone_hits = zones_at(zones, lat, lon, now)
    return {
        "product": "SASH AREA RISK",
        "position": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "lookback_days": days,
        "risk_indicator": score,
        "band": band_for(score, model),
        "contributors": [c.to_dict() for c in regional],
        "risk_zones": [{"id": str(z.id), "name": z.name, "severity": z.severity, "category": z.category} for z in zone_hits],
        "recent_incidents": [
            {"id": str(i.id), "occurred_at": i.occurred_at.isoformat(), "category": i.category, "title": i.title,
             "distance_km": round(haversine_km(lat, lon, i.lat, i.lon), 1), "verification_status": i.verification_status}
            for i in sorted(near, key=lambda i: i.occurred_at, reverse=True)[:25]
        ],
        "threat_categories": dict(sorted(cats.items(), key=lambda kv: -kv[1])),
        "incident_density_per_10k_km2": round(len(near) / area_km2 * 10_000, 3),
        "trend": trend,
        "confidence": confidence,
        "sources": sources,
        "dataset": "SYNTHETIC-DEMO" if synthetic else "LIVE",
        "model_version": res.model_version,
        "disclaimer": model["model"]["disclaimer"],
    }


def _resolve_endpoint(value: str) -> tuple[tuple[float, float], str | None, str]:
    if "," in value:
        a, b = value.split(",", 1)
        return (float(a), float(b)), None, value
    p = resolve_port(value)
    if p is None:
        raise ValueError(f"unknown port or position: {value}")
    return (p.lat, p.lon), p.unlocode, p.name


def voyage_risk(db: Session, origin: str, destination: str, departure: datetime, speed_kn: float,
                vessel_type: str | None, synthetic: bool, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    model = risk_model()
    engine = RiskEngine(model)
    (o_pos, o_code, o_name) = _resolve_endpoint(origin)
    (d_pos, d_code, d_name) = _resolve_endpoint(destination)
    route = route_between_ports(o_code, d_code) if (o_code and d_code) else route_between_points(o_pos, d_pos)
    dense = densify(route, 10.0)
    total_km = polyline_length_km(dense)
    zones = load_zones(db, synthetic)
    incidents = load_incidents(db, synthetic, since=now - timedelta(days=120))
    env = load_environment(db, synthetic, since=now - timedelta(days=2))

    step_h = 1.0
    samples = []
    km, idx = 0.0, 0
    cum = [0.0]
    for i in range(1, len(dense)):
        cum.append(cum[-1] + haversine_km(*dense[i - 1], *dense[i]))
    t_hours = 0.0
    while km <= total_km:
        while idx < len(cum) - 2 and cum[idx + 1] < km:
            idx += 1
        seg = cum[idx + 1] - cum[idx] or 1
        f = (km - cum[idx]) / seg
        lat = dense[idx][0] + (dense[idx + 1][0] - dense[idx][0]) * f
        lon = dense[idx][1] + (dense[idx + 1][1] - dense[idx][1]) * f
        eta = departure + timedelta(hours=t_hours)
        # Current intelligence (as of now) applied to each planned position.
        res = engine.assess(_point_context(lat, lon, now, zones, incidents, env, vessel_type), now, with_trend=False)
        pts = [c for c in res.contributors if c.component != "vessel_behaviour" and c.rule not in ("night_transit", "zone_exposure_time")]
        zs = zones_at(zones, lat, lon, now)
        dark = is_dark(lat, lon, eta)
        top_sev = max((z.severity for z in zs), key=lambda s: SEVERITY_RANK.get(s, 0), default=None)
        night_pts = 0
        if dark and top_sev and SEVERITY_RANK[top_sev] >= SEVERITY_RANK[model["rules"]["night_transit"]["min_zone_severity"]]:
            night_pts = model["rules"]["night_transit"]["points"]
        score = min(100, sum(c.points for c in pts) + night_pts)
        samples.append({
            "eta": eta.isoformat(), "lat": round(lat, 4), "lon": round(lon, 4), "km": round(km, 1), "score": score,
            "band": band_for(score, model), "night": dark, "zones": [z.name for z in zs],
            "top_contributors": [f"+{c.points} {c.label.lower()}" for c in sorted(pts, key=lambda c: -c.points)[:3]]
            + ([f"+{night_pts} night transit in threat area"] if night_pts else []),
        })
        t_hours += step_h
        km += speed_kn * KN * step_h
    # Zones crossed (from consecutive samples).
    crossed: dict[str, dict] = {}
    for s in samples:
        for zname in s["zones"]:
            z = crossed.setdefault(zname, {"zone": zname, "entry_eta": s["eta"], "exit_eta": s["eta"], "hours": 0.0})
            z["exit_eta"] = s["eta"]
            z["hours"] += step_h
    zone_meta = {z.name: z for z in zones}
    for z in crossed.values():
        zm = zone_meta.get(z["zone"])
        z["severity"] = zm.severity if zm else None
        z["category"] = zm.category if zm else None
    exposure_h = sum(step_h for s in samples if any(
        SEVERITY_RANK.get(zone_meta[n].severity, 0) >= SEVERITY_RANK["ELEVATED"] for n in s["zones"] if n in zone_meta))
    # Highest-risk segments: contiguous runs at or above the ELEVATED band floor.
    floor = next(b["min"] for b in model["bands"] if b["name"] == "ELEVATED")
    segments, run = [], []
    for s in samples + [None]:
        if s is not None and s["score"] >= floor:
            run.append(s)
        elif run:
            peak = max(run, key=lambda x: x["score"])
            segments.append({"from_eta": run[0]["eta"], "to_eta": run[-1]["eta"], "hours": len(run) * step_h,
                             "max_score": peak["score"], "band": peak["band"], "zones": sorted({z for r in run for z in r["zones"]}),
                             "peak_position": {"lat": peak["lat"], "lon": peak["lon"]}, "why": peak["top_contributors"]})
            run = []
    segments.sort(key=lambda s: -s["max_score"])
    exp_rule = model["rules"]["zone_exposure_time"]
    exposure_pts = min(exp_rule["max_points"], int(round(exposure_h * exp_rule["points_per_hour"])))
    peak = max((s["score"] for s in samples), default=0)
    overall = min(100, peak + exposure_pts) if peak else 0
    near_route = []
    for i in incidents:
        if i.occurred_at < now - timedelta(days=90) or i.known_at > now:
            continue
        d = min(haversine_km(i.lat, i.lon, s["lat"], s["lon"]) for s in samples) if samples else 1e9
        if d <= 150:
            near_route.append({"id": str(i.id), "title": i.title, "category": i.category, "occurred_at": i.occurred_at.isoformat(),
                               "distance_to_route_km": round(d, 1), "verification_status": i.verification_status})
    return {
        "product": "SASH VOYAGE RISK",
        "origin": {"name": o_name, "unlocode": o_code, "lat": o_pos[0], "lon": o_pos[1]},
        "destination": {"name": d_name, "unlocode": d_code, "lat": d_pos[0], "lon": d_pos[1]},
        "departure_time": departure.isoformat(),
        "speed_kn": speed_kn,
        "distance_km": round(total_km, 0),
        "estimated_duration_hours": round(total_km / (speed_kn * KN), 1),
        "overall_risk_indicator": overall,
        "band": band_for(overall, model),
        "explanation": (f"Peak segment indicator {peak} plus +{exposure_pts} for {exposure_h:.0f} h of planned exposure "
                        "in elevated-or-higher risk areas." if peak else "No threat areas or recent incidents on the modelled route."),
        "highest_risk_segments": segments[:5],
        "risk_zones_crossed": list(crossed.values()),
        "recent_incidents_near_route": sorted(near_route, key=lambda x: x["distance_to_route_km"])[:25],
        "estimated_exposure_hours": exposure_h,
        "route": {"type": "LineString", "coordinates": [[round(p[1], 4), round(p[0], 4)] for p in route]},
        "samples": samples,
        "assumptions": [
            "Route is modelled on SASH's approximate reference lane network (not a navigational route).",
            "Current intelligence (zones, incidents as of now) is applied to each planned position.",
            "Behavioural components are not assessed for planned voyages.",
        ],
        "dataset": "SYNTHETIC-DEMO" if synthetic else "LIVE",
        "disclaimer": model["model"]["disclaimer"],
    }
