"""SASH Maritime Risk Indicator — explainable rules engine.

Design rules
------------
* Weights live in config/risk_model.yaml; this module contains no magic numbers for scoring.
* Every point awarded is a *contributor* carrying three separate statements:
  OBSERVATION (what the data shows), INFERENCE (cautious interpretation) and
  ASSESSMENT (the effect on the indicator), plus references to the evidence records.
* Evaluation is point-in-time: at `as_of` the engine only uses information that was
  knowable at that moment (incidents already reported, anomalies already detectable).
  This makes historical replay honest and prevents hindsight leakage.
* The indicator is decision support. It is not an actuarial or underwriting model.
"""
from __future__ import annotations

import bisect
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from app.analytics.identity import identity_issues
from app.analytics.types import Obs
from app.analytics.zones import ZoneShape
from app.core.yamlconfig import config_hash
from app.geo.core import (
    format_duration,
    format_latlon,
    haversine_km,
    interpolate_position,
    solar_elevation_deg,
)
from app.models.common import SEVERITY_RANK

HOSTILE_CATEGORIES = {
    "piracy",
    "armed_robbery",
    "hijacking",
    "kidnapping",
    "boarding",
    "maritime_conflict",
    "drone_attack",
    "missile_attack",
    "mine",
    "sabotage",
}


# ----------------------------------------------------------------------------------
# Context records (decoupled from the ORM so the engine is pure and testable)
# ----------------------------------------------------------------------------------
@dataclass
class IncidentRec:
    id: Any
    occurred_at: datetime
    lat: float
    lon: float
    category: str
    title: str
    verification_status: str = "UNVERIFIED"
    confidence: float = 0.5
    source_name: str | None = None
    reported_at: datetime | None = None
    affected_vessel_id: Any = None
    is_synthetic: bool = False

    @property
    def known_at(self) -> datetime:
        return max(self.occurred_at, self.reported_at or self.occurred_at)


@dataclass
class EventRec:
    kind: str  # AIS_GAP | ROUTE_DEVIATION | LOITERING | UNEXPECTED_STOP
    id: Any
    start: datetime
    end: datetime | None
    known_at: datetime
    confidence: float
    observation: str
    inference: str
    lat: float | None = None
    lon: float | None = None
    details: dict = field(default_factory=dict)

    def active_or_recent(self, as_of: datetime, lookback: timedelta) -> bool:
        if self.known_at > as_of:
            return False
        end = self.end or as_of
        return end >= as_of - lookback


@dataclass
class EnvRec:
    observed_at: datetime
    lat: float
    lon: float
    wave_height_m: float | None = None
    visibility_km: float | None = None
    wind_speed_kn: float | None = None
    source_name: str | None = None


@dataclass
class VesselProfile:
    id: Any
    name: str | None = None
    vessel_type: str | None = None
    imo: str | None = None
    mmsi: str | None = None
    flag: str | None = None
    freeboard_m: float | None = None
    is_synthetic: bool = False


@dataclass
class RiskContext:
    vessel: VesselProfile
    track: list[Obs]
    zones: list[ZoneShape]
    incidents: list[IncidentRec] = field(default_factory=list)
    events: list[EventRec] = field(default_factory=list)
    environment: list[EnvRec] = field(default_factory=list)

    def __post_init__(self):
        self.track = sorted(self.track, key=lambda o: o.ts)
        self._times = [o.ts for o in self.track]
        self._elevated_prefix: list[float] | None = None
        self.environment = sorted(self.environment, key=lambda e: e.observed_at)
        self._env_times = [e.observed_at for e in self.environment]

    def environment_between(self, start: datetime, end: datetime) -> list[EnvRec]:
        a = bisect.bisect_left(self._env_times, start)
        b = bisect.bisect_right(self._env_times, end)
        return self.environment[a:b]

    # -- position -------------------------------------------------------------
    def position_at(self, t: datetime) -> tuple[float, float, Obs | None, float]:
        """(lat, lon, last_obs, age_seconds). Interpolates between close reports."""
        if not self.track:
            return (float("nan"), float("nan"), None, float("inf"))
        i = bisect.bisect_right(self._times, t) - 1
        if i < 0:
            return (float("nan"), float("nan"), None, float("inf"))
        last = self.track[i]
        age = (t - last.ts).total_seconds()
        if i + 1 < len(self.track):
            nxt = self.track[i + 1]
            if (nxt.ts - last.ts).total_seconds() <= 3 * 3600:
                lat, lon = interpolate_position(t, last.ts, last.lat, last.lon, nxt.ts, nxt.lat, nxt.lon)
                return lat, lon, last, age
        return last.lat, last.lon, last, age

    # -- cumulative exposure to elevated zones (prefix sums over the track) -----
    def elevated_hours(self, start: datetime, end: datetime, min_severity: str) -> float:
        if self._elevated_prefix is None:
            rank = SEVERITY_RANK[min_severity]
            flags = [
                any(SEVERITY_RANK.get(z.severity, 0) >= rank and z.active(o.ts) and z.contains(o.lat, o.lon) for z in self.zones)
                for o in self.track
            ]
            prefix = [0.0]
            for k in range(1, len(self.track)):
                seg = (self.track[k].ts - self.track[k - 1].ts).total_seconds() / 3600.0
                inc = seg if (flags[k] and flags[k - 1]) else (seg / 2 if (flags[k] or flags[k - 1]) else 0.0)
                prefix.append(prefix[-1] + inc)
            self._elevated_prefix = prefix
        if not self.track:
            return 0.0
        a = max(0, bisect.bisect_left(self._times, start))
        b = bisect.bisect_right(self._times, end) - 1
        if b <= a:
            return 0.0
        return self._elevated_prefix[b] - self._elevated_prefix[a]


# ----------------------------------------------------------------------------------
# Result
# ----------------------------------------------------------------------------------
@dataclass
class Contributor:
    rule: str
    component: str
    label: str
    points: int
    observation: str
    inference: str
    assessment: str = ""
    evidence: list[dict] = field(default_factory=list)
    confidence: float | None = None

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "component": self.component,
            "label": self.label,
            "points": self.points,
            "observation": self.observation,
            "inference": self.inference,
            "assessment": self.assessment,
            "evidence": self.evidence,
            "confidence": self.confidence,
        }


@dataclass
class RiskResult:
    vessel_id: Any
    as_of: datetime
    score: int
    band: str
    confidence: float
    lat: float | None
    lon: float | None
    components: dict[str, dict]
    contributors: list[Contributor]
    suppressed: list[dict]
    data_quality: dict
    model_version: str
    config_hash: str
    trend: str | None = None
    previous_score: int | None = None

    def to_dict(self) -> dict:
        return {
            "vessel_id": str(self.vessel_id),
            "as_of": self.as_of.isoformat(),
            "indicator": "SASH Maritime Risk Indicator",
            "score": self.score,
            "band": self.band,
            "confidence": self.confidence,
            "trend": self.trend,
            "previous_score": self.previous_score,
            "position": None if self.lat is None else {"lat": self.lat, "lon": self.lon},
            "components": self.components,
            "contributors": [c.to_dict() for c in self.contributors],
            "suppressed": self.suppressed,
            "data_quality": self.data_quality,
            "model_version": self.model_version,
            "config_hash": self.config_hash,
        }


def band_for(score: int, model: dict) -> str:
    band = model["bands"][0]["name"]
    for b in model["bands"]:
        if score >= b["min"]:
            band = b["name"]
    return band


def _scaled(max_points: float, confidence: float, full_at: float = 0.8) -> int:
    return int(round(max_points * min(1.0, confidence / full_at)))


# ----------------------------------------------------------------------------------
# Engine
# ----------------------------------------------------------------------------------
class RiskEngine:
    def __init__(self, model: dict):
        self.model = model
        self.rules = model["rules"]
        self.components = model["components"]
        self.version = model["model"]["version"]
        self.hash = config_hash(model)

    # Public API ---------------------------------------------------------------
    def assess(self, ctx: RiskContext, as_of: datetime, with_trend: bool = True) -> RiskResult:
        result = self._assess(ctx, as_of)
        if with_trend:
            cfg = self.model["trend"]
            prev = self._assess(ctx, as_of - timedelta(hours=cfg["window_hours"]))
            result.previous_score = prev.score if prev.lat is not None else None
            if result.previous_score is None:
                result.trend = "Stable"
            else:
                diff = result.score - prev.score
                if diff >= cfg["threshold_points"]:
                    result.trend = "Increasing"
                elif diff <= -cfg["threshold_points"]:
                    result.trend = "Decreasing"
                else:
                    result.trend = "Stable"
        return result

    # Internals ------------------------------------------------------------------
    def _assess(self, ctx: RiskContext, as_of: datetime) -> RiskResult:
        lat, lon, last_obs, age_s = ctx.position_at(as_of)
        notes: list[str] = []
        if last_obs is None:
            return RiskResult(
                vessel_id=ctx.vessel.id,
                as_of=as_of,
                score=0,
                band=band_for(0, self.model),
                confidence=0.0,
                lat=None,
                lon=None,
                components={k: {"label": v["label"], "points": 0, "cap": v["cap"]} for k, v in self.components.items()},
                contributors=[],
                suppressed=[],
                data_quality={"notes": ["No position available at this time — indicator not assessed."]},
                model_version=self.version,
                config_hash=self.hash,
            )

        contributors: list[Contributor] = []
        zones_here = [z for z in ctx.zones if z.active(as_of) and z.contains(lat, lon)]
        for fn in (
            self._zone_presence,
            self._incident_proximity,
            self._incident_density,
            self._ais_gap,
            self._route_deviation,
            self._loitering,
            self._unexpected_stop,
            self._identity,
            self._zone_exposure_time,
            self._night_transit,
            self._vessel_type,
            self._low_speed,
            self._incident_history,
            self._sea_state,
            self._visibility,
        ):
            c = fn(ctx, as_of, lat, lon, last_obs, zones_here, notes)
            if c is not None and c.points > 0:
                contributors.append(c)

        # Component caps and context gating -------------------------------------
        totals = {k: 0 for k in self.components}
        for c in contributors:
            totals[c.component] += c.points
        suppressed: list[dict] = []
        gate_rules = set(self.model.get("context_gate_rules", ["zone_presence", "incident_proximity"]))
        if not any(c.rule in gate_rules for c in contributors):
            for comp in self.model.get("context_gated_components", []):
                for c in [c for c in contributors if c.component == comp]:
                    suppressed.append(
                        {
                            "rule": c.rule,
                            "label": c.label,
                            "points": c.points,
                            "reason": "Not applied: vessel is not inside a risk zone or near a recent incident.",
                        }
                    )
                contributors = [c for c in contributors if c.component != comp]
                totals[comp] = 0
        components: dict[str, dict] = {}
        for comp, meta in self.components.items():
            raw = totals.get(comp, 0)
            capped = min(raw, meta["cap"])
            components[comp] = {"label": meta["label"], "points": capped, "raw_points": raw, "cap": meta["cap"]}
        score = int(min(100, sum(v["points"] for v in components.values())))

        for c in contributors:
            comp = components[c.component]
            capped_note = " (component capped)" if comp["raw_points"] > comp["cap"] else ""
            c.assessment = f"+{c.points} {comp['label'].lower()}{capped_note}"
        contributors.sort(key=lambda c: -c.points)

        # Confidence --------------------------------------------------------------
        cc = self.model["confidence"]
        conf = cc["base"]
        if age_s > cc["stale_position_hours"] * 3600:
            conf -= cc["stale_penalty"]
            notes.append(f"Last position report is {format_duration(age_s)} old; position may be outdated.")
        if not ctx.environment:
            conf -= cc["missing_environment_penalty"]
        if not ctx.vessel.vessel_type:
            conf -= cc["missing_profile_penalty"]
            notes.append("Vessel type unknown — profile factors not assessed.")
        if ctx.vessel.is_synthetic:
            notes.append(cc["synthetic_note"])
        return RiskResult(
            vessel_id=ctx.vessel.id,
            as_of=as_of,
            score=score,
            band=band_for(score, self.model),
            confidence=round(max(0.1, min(0.95, conf)), 2),
            lat=round(lat, 5),
            lon=round(lon, 5),
            components=components,
            contributors=contributors,
            suppressed=suppressed,
            data_quality={
                "position_age_s": round(age_s),
                "track_points": len(ctx.track),
                "environment_available": bool(ctx.environment),
                "notes": notes,
            },
            model_version=self.version,
            config_hash=self.hash,
        )

    def _c(self, rule: str, points: int, observation: str, inference: str, evidence=None, confidence=None) -> Contributor:
        r = self.rules[rule]
        return Contributor(
            rule=rule,
            component=r["component"],
            label=r["label"],
            points=int(points),
            observation=observation,
            inference=inference,
            evidence=evidence or [],
            confidence=confidence,
        )

    # --- Regional threat -----------------------------------------------------------
    def _zone_presence(self, ctx, as_of, lat, lon, last, zones_here, notes):
        if not zones_here:
            return None
        r = self.rules["zone_presence"]
        top = max(zones_here, key=lambda z: SEVERITY_RANK.get(z.severity, 0))
        others = [z.name for z in zones_here if z is not top]
        obs = f"Vessel position {format_latlon(lat, lon)} is inside '{top.name}' (severity {top.severity})."
        if others:
            obs += f" Also inside: {', '.join(others)}."
        cat = (top.category or "security").replace("_", " ")
        return self._c(
            "zone_presence",
            r["points_by_severity"].get(top.severity, 0),
            obs,
            f"Vessel is operating in an area designated for {cat} threat.",
            [{"type": "risk_zone", "id": str(top.id), "label": top.name}],
        )

    def _incident_proximity(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["incident_proximity"]
        since = as_of - timedelta(days=r["lookback_days"])
        best: tuple[float, IncidentRec, float, float] | None = None
        for inc in ctx.incidents:
            if inc.known_at > as_of or inc.occurred_at < since:
                continue
            if inc.verification_status in r.get("exclude_verification", []):
                continue
            weight = r["category_weight"].get(inc.category, 0.5)
            if weight <= 0:
                continue
            d = haversine_km(lat, lon, inc.lat, inc.lon)
            tier_pts = next((t["points"] for t in r["tiers"] if d <= t["max_km"]), 0)
            if not tier_pts:
                continue
            age_frac = (as_of - inc.occurred_at).total_seconds() / (r["lookback_days"] * 86400)
            recency = 1.0 - (1.0 - r["recency_min_factor"]) * max(0.0, min(1.0, age_frac))
            ver = r["unverified_factor"] if inc.verification_status == "UNVERIFIED" else 1.0
            pts = tier_pts * recency * weight * ver
            if best is None or pts > best[0]:
                best = (pts, inc, d, recency)
        if best is None:
            return None
        pts, inc, d, recency = best
        age = format_duration((as_of - inc.occurred_at).total_seconds())
        obs = (
            f"'{inc.title}' ({inc.category.replace('_', ' ')}) reported {inc.occurred_at.strftime('%Y-%m-%d %H:%MZ')} "
            f"({age} ago), {d:.0f} km from vessel position. Verification: {inc.verification_status.lower()}"
            f"{'; source: ' + inc.source_name if inc.source_name else ''}."
        )
        inference = (
            "Vessel is operating near recent hostile activity."
            if inc.category in HOSTILE_CATEGORIES
            else "Vessel is operating near recently reported suspicious or security-relevant activity."
        )
        return self._c(
            "incident_proximity",
            max(1, round(pts)),
            obs,
            inference,
            [{"type": "incident", "id": str(inc.id), "label": inc.title, "distance_km": round(d, 1), "time": inc.occurred_at.isoformat()}],
            confidence=inc.confidence,
        )

    def _incident_density(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["incident_density"]
        since = as_of - timedelta(days=r["lookback_days"])
        weights = self.rules["incident_proximity"]["category_weight"]
        near = [
            i
            for i in ctx.incidents
            if since <= i.occurred_at and i.known_at <= as_of and weights.get(i.category, 0.5) > 0
            and i.verification_status != "RETRACTED"
            and haversine_km(lat, lon, i.lat, i.lon) <= r["radius_km"]
        ]
        if not near:
            return None
        pts = min(r["max_points"], round(len(near) * r["points_per_incident"]))
        cats: dict[str, int] = {}
        for i in near:
            cats[i.category] = cats.get(i.category, 0) + 1
        breakdown = ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in sorted(cats.items(), key=lambda kv: -kv[1]))
        return self._c(
            "incident_density",
            pts,
            f"{len(near)} security incidents reported within {r['radius_km']} km in the preceding "
            f"{r['lookback_days']} days ({breakdown}).",
            "The surrounding area has an elevated recent incident history.",
            [{"type": "incident", "id": str(i.id), "label": i.title} for i in near[:10]],
        )

    # --- Vessel behaviour --------------------------------------------------------------
    def _events(self, ctx, kind, as_of, lookback_h):
        lb = timedelta(hours=lookback_h)
        return [e for e in ctx.events if e.kind == kind and e.active_or_recent(as_of, lb)]

    def _ais_gap(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["ais_gap"]
        evs = [e for e in self._events(ctx, "AIS_GAP", as_of, r["lookback_hours"]) if e.confidence >= r["min_anomaly_confidence"]]
        if not evs:
            return None
        top = max(evs, key=lambda e: e.confidence)
        ongoing = top.end is None or top.end > as_of
        pts = _scaled(r["max_points"], top.confidence)
        if ongoing:
            pts += r.get("ongoing_gap_bonus", 0)
        if len(evs) > 1:
            pts += 2 * (len(evs) - 1)
        pts = min(pts, r["max_points"] + r.get("ongoing_gap_bonus", 0))
        if ongoing:
            silent = format_duration((as_of - top.start).total_seconds())
            obs = f"No AIS position reports received for {silent} (since {top.start.strftime('%Y-%m-%d %H:%MZ')})."
        else:
            obs = top.observation
        if len(evs) > 1:
            obs += f" {len(evs)} reporting gaps in the last {r['lookback_hours']} h."
        return self._c(
            "ais_gap",
            pts,
            obs,
            top.inference or "Unexpected AIS reporting gap; cause undetermined.",
            [{"type": "ais_gap", "id": str(e.id), "label": "AIS reporting anomaly", "time": e.start.isoformat()} for e in evs],
            confidence=top.confidence,
        )

    def _simple_event_rule(self, rule, kind, ctx, as_of, label):
        r = self.rules[rule]
        evs = self._events(ctx, kind, as_of, r["lookback_hours"])
        if not evs:
            return None
        top = max(evs, key=lambda e: e.confidence)
        return self._c(
            rule,
            _scaled(r["max_points"], top.confidence),
            top.observation,
            top.inference,
            [{"type": kind.lower(), "id": str(e.id), "label": label, "time": e.start.isoformat()} for e in evs],
            confidence=top.confidence,
        )

    def _route_deviation(self, ctx, as_of, *a):
        return self._simple_event_rule("route_deviation", "ROUTE_DEVIATION", ctx, as_of, "Route deviation")

    def _loitering(self, ctx, as_of, *a):
        return self._simple_event_rule("loitering", "LOITERING", ctx, as_of, "Loitering")

    def _unexpected_stop(self, ctx, as_of, *a):
        return self._simple_event_rule("unexpected_stop", "UNEXPECTED_STOP", ctx, as_of, "Unexpected stop")

    def _identity(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["identity_inconsistency"]
        v = ctx.vessel
        issues = identity_issues(v.imo, v.mmsi, v.flag)
        disc = [
            e for e in ctx.events
            if e.kind == "AIS_GAP" and e.details.get("position_discontinuity") and e.known_at <= as_of
            and (e.end or as_of) >= as_of - timedelta(days=7)
        ]
        for e in disc:
            issues.append(
                f"Position discontinuity across AIS gap at {e.start.strftime('%Y-%m-%d %H:%MZ')} "
                f"(implied {e.details.get('implied_speed_kn')} kn)."
            )
        if not issues:
            return None
        return self._c(
            "identity_inconsistency",
            min(r["max_points"], r["points_per_issue"] * len(issues)),
            " ".join(issues),
            "Identity data is inconsistent and should be verified against registry sources; this may "
            "reflect data-entry errors, re-flagging or misconfigured AIS equipment.",
            [{"type": "vessel", "id": str(v.id), "label": "identity check"}],
        )

    # --- Voyage exposure -----------------------------------------------------------------
    def _zone_exposure_time(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["zone_exposure_time"]
        hours = ctx.elevated_hours(as_of - timedelta(days=r["lookback_days"]), as_of, r["min_severity"])
        pts = min(r["max_points"], int(round(hours * r["points_per_hour"])))
        if pts <= 0:
            return None
        return self._c(
            "zone_exposure_time",
            pts,
            f"Vessel spent {hours:.1f} h inside {r['min_severity'].lower()}-or-higher risk areas in the past "
            f"{r['lookback_days']} days.",
            "Cumulative time in threat areas increases overall exposure on this voyage.",
        )

    def _night_transit(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["night_transit"]
        rank = SEVERITY_RANK[r["min_zone_severity"]]
        if not any(SEVERITY_RANK.get(z.severity, 0) >= rank for z in zones_here):
            return None
        elev = solar_elevation_deg(lat, lon, as_of)
        if elev >= r["sun_elevation_deg"]:
            return None
        return self._c(
            "night_transit",
            r["points"],
            f"Sun elevation {elev:.0f}° at vessel position (darkness) while inside an elevated-risk area.",
            "Night-time transit in a threat area; small craft are harder to detect visually at night.",
        )

    # --- Vessel profile ---------------------------------------------------------------------
    def _vessel_type(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["vessel_type"]
        vt = (ctx.vessel.vessel_type or "").lower()
        if not vt:
            return None
        pts = r["points_by_type"].get(vt, r["default_points"])
        fb = f", freeboard {ctx.vessel.freeboard_m:.1f} m" if ctx.vessel.freeboard_m else ""
        return self._c(
            "vessel_type",
            pts,
            f"Vessel type: {vt}{fb}.",
            "Vessel category carries a higher vulnerability weighting in the SASH rules model "
            "(e.g. freeboard, typical transit speed, historical targeting).",
        )

    def _low_speed(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["low_transit_speed"]
        sog = last.sog if last else None
        if sog is None or not (r["min_speed_kn"] <= sog <= r["max_speed_kn"]):
            return None
        return self._c(
            "low_transit_speed",
            r["points"],
            f"Reported speed over ground {sog:.1f} kn.",
            f"Transit below {r['max_speed_kn']:.0f} kn in a threat area is associated with greater exposure "
            "to boarding attempts.",
        )

    def _incident_history(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["vessel_incident_history"]
        since = as_of - timedelta(days=r["lookback_days"])
        hist = [
            i for i in ctx.incidents
            if i.affected_vessel_id is not None and str(i.affected_vessel_id) == str(ctx.vessel.id)
            and since <= i.occurred_at and i.known_at <= as_of
        ]
        if not hist:
            return None
        return self._c(
            "vessel_incident_history",
            min(r["max_points"], r["points_per_incident"] * len(hist)),
            f"Vessel recorded as affected in {len(hist)} incident(s) in the past {r['lookback_days'] // 365} years: "
            + "; ".join(f"{i.title} ({i.occurred_at.date()})" for i in hist[:3])
            + ".",
            "Prior involvement in incidents may indicate recurring exposure on this vessel's trading pattern.",
            [{"type": "incident", "id": str(i.id), "label": i.title} for i in hist],
        )

    # --- Environment ----------------------------------------------------------------------
    def _nearest_env(self, ctx, as_of, lat, lon, max_km, max_age_h, attr):
        best = None
        for e in ctx.environment_between(as_of - timedelta(hours=max_age_h), as_of):
            if getattr(e, attr) is None:
                continue
            age = (as_of - e.observed_at).total_seconds()
            d = haversine_km(lat, lon, e.lat, e.lon)
            if d > max_km:
                continue
            if best is None or d < best[1]:
                best = (e, d, age)
        return best

    def _sea_state(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["sea_state"]
        found = self._nearest_env(ctx, as_of, lat, lon, r["max_distance_km"], r["max_age_hours"], "wave_height_m")
        if not found:
            if not any("Environmental data" in n for n in notes):
                notes.append("Environmental data unavailable near position — environment component not fully assessed.")
            return None
        e, d, age = found
        if e.wave_height_m > r["max_wave_height_m"]:
            return None
        return self._c(
            "sea_state",
            r["points"],
            f"Significant wave height {e.wave_height_m:.1f} m reported {d:.0f} km away, "
            f"{format_duration(age)} earlier{' (' + e.source_name + ')' if e.source_name else ''}.",
            "Calm sea state is conducive to small-craft operations.",
        )

    def _visibility(self, ctx, as_of, lat, lon, last, zones_here, notes):
        r = self.rules["low_visibility"]
        found = self._nearest_env(ctx, as_of, lat, lon, r["max_distance_km"], r["max_age_hours"], "visibility_km")
        if not found:
            return None
        e, d, age = found
        if e.visibility_km > r["max_visibility_km"]:
            return None
        return self._c(
            "low_visibility",
            r["points"],
            f"Visibility {e.visibility_km:.1f} km reported {d:.0f} km away.",
            "Reduced visibility limits early visual detection of approaching craft.",
        )
