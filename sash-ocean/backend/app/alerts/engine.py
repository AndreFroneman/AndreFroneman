"""Alert engine: turns analytic events and risk changes into analyst alerts.

Every alert carries its evidence split into OBSERVATION / INFERENCE / ASSESSMENT and a
recommended ANALYST action (verification, investigation, contacting the operator).
Alerts are idempotent: a stable dedup key means recomputation never duplicates them
and never resets an analyst's acknowledgement.
"""
from __future__ import annotations

import bisect
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

import httpx
from geoalchemy2.elements import WKTElement
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.metrics import ALERTS_GENERATED
from app.geo.core import format_duration, haversine_km
from app.geo.routing import nearest_port
from app.models import Alert
from app.models.common import SEVERITY_RANK

log = logging.getLogger(__name__)


@dataclass
class AlertDraft:
    dedup_key: str
    alert_type: str
    severity: str
    title: str
    event_time: datetime
    vessel_id: Any = None
    asset_id: Any = None
    contact_id: Any = None
    lat: float | None = None
    lon: float | None = None
    location_description: str | None = None
    risk_before: int | None = None
    risk_after: int | None = None
    evidence: list[dict] = field(default_factory=list)
    recommended_action: str = ""
    source_event_type: str | None = None
    source_event_id: str | None = None
    is_synthetic: bool = False


def describe_location(lat: float, lon: float, zone_names: list[str] | None = None) -> str:
    port, d = nearest_port(lat, lon)
    from app.geo.core import bearing_deg

    compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    b = bearing_deg(port.lat, port.lon, lat, lon)
    rel = f"{d:.0f} km {compass[int((b + 22.5) // 45) % 8]} of {port.name}" if d > 20 else f"near {port.name}"
    if zone_names:
        return f"{zone_names[0]} — {rel}"
    return rel


class RiskSeries:
    """Time-indexed risk history for one vessel (used to annotate alerts)."""

    def __init__(self, points: list[tuple[datetime, int, list[dict]]]):
        self.points = sorted(points, key=lambda p: p[0])
        self.times = [p[0] for p in self.points]

    def at(self, t: datetime) -> tuple[int, list[dict]] | None:
        i = bisect.bisect_right(self.times, t) - 1
        if i < 0:
            return None
        return self.points[i][1], self.points[i][2]

    def score_at(self, t: datetime) -> int | None:
        v = self.at(t)
        return v[0] if v else None


def _assessment(series: RiskSeries, before_t: datetime, after_t: datetime) -> tuple[int | None, int | None, dict | None]:
    before = series.score_at(before_t)
    after_v = series.at(after_t)
    if after_v is None:
        return before, None, None
    after, contribs = after_v
    top = "; ".join(f"+{c['points']} {c['label'].lower()}" for c in contribs[:4])
    text = f"SASH Risk Indicator {before if before is not None else '—'} → {after}" + (f" ({top})" if top else "")
    return before, after, {"kind": "ASSESSMENT", "text": text, "time": after_t.isoformat()}


class AlertBuilder:
    def __init__(self, cfg: dict, vessel, series: RiskSeries, now: datetime):
        self.cfg = cfg
        self.rules = cfg["rules"]
        self.v = vessel
        self.series = series
        self.now = now
        self.since = now - timedelta(days=cfg.get("alert_lookback_days", 14))
        self.name = vessel.name or f"MMSI {vessel.mmsi}"
        self.drafts: list[AlertDraft] = []

    def _add(self, d: AlertDraft) -> None:
        if d.event_time >= self.since:
            d.is_synthetic = bool(self.v.is_synthetic)
            self.drafts.append(d)

    def _risk(self, start: datetime, known: datetime, evidence: list[dict]) -> tuple[int | None, int | None]:
        before, after, a = _assessment(self.series, start - timedelta(hours=1), known + timedelta(minutes=30))
        if a:
            evidence.append(a)
        return before, after

    def zone_entry(self, ex) -> None:
        r = self.rules["ZONE_ENTRY"]
        if not r["enabled"] or SEVERITY_RANK.get(ex.severity, 0) < SEVERITY_RANK[r["min_zone_severity"]]:
            return
        if getattr(ex, "started_inside", False):
            return  # the history window began inside the zone; this is not an observed entry
        ev = [
            {"kind": "OBSERVATION", "text": f"Track crossed into '{ex.zone_name}' at {ex.entry_time:%Y-%m-%d %H:%MZ} (zone severity {ex.severity}).", "ref_type": "zone_exposure", "time": ex.entry_time.isoformat()},
            {"kind": "INFERENCE", "text": "Vessel is now exposed to the threat designated for this area."},
        ]
        before, after = self._risk(ex.entry_time, ex.entry_time, ev)
        lat, lon = ex.entry_pos
        self._add(AlertDraft(
            dedup_key=f"ZONE_ENTRY:{self.v.id}:{ex.zone_id}:{ex.entry_time:%Y%m%d%H%M}",
            alert_type="ZONE_ENTRY",
            severity=r["severity_by_zone"].get(ex.severity, "MEDIUM"),
            title=r["title"].format(vessel=self.name, zone=ex.zone_name),
            event_time=ex.entry_time, vessel_id=self.v.id, lat=lat, lon=lon,
            location_description=describe_location(lat, lon, [ex.zone_name]),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="zone_exposure",
            source_event_id=str(getattr(ex, "db_id", "")) or None,
        ))

    def ais_gap(self, gap, event_id, known_at, zone_names: list[str]) -> None:
        r = self.rules["AIS_GAP"]
        if not r["enabled"] or gap.anomaly_confidence < r["min_anomaly_confidence"]:
            return
        ev = [
            {"kind": "OBSERVATION", "text": gap.observation_text, "ref_type": "ais_gap", "ref_id": str(event_id), "time": gap.gap_start.isoformat()},
            {"kind": "INFERENCE", "text": gap.inference_text},
        ]
        before, after = self._risk(gap.gap_start, known_at, ev)
        self._add(AlertDraft(
            dedup_key=f"AIS_GAP:{self.v.id}:{gap.gap_start:%Y%m%d%H%M}",
            alert_type="AIS_GAP",
            severity=r["severity_in_zone"] if zone_names else r["severity"],
            title=r["title"].format(vessel=self.name, duration=format_duration(gap.duration_s) + (" ongoing" if gap.ongoing else "")),
            event_time=known_at, vessel_id=self.v.id, lat=gap.last.lat, lon=gap.last.lon,
            location_description=describe_location(gap.last.lat, gap.last.lon, zone_names),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="ais_gap", source_event_id=str(event_id),
        ))

    def deviation(self, dev, event_id, known_at, zone_names) -> None:
        r = self.rules["ROUTE_DEVIATION"]
        if not r["enabled"] or dev.confidence < r["min_confidence"]:
            return
        ev = [
            {"kind": "OBSERVATION", "text": dev.observation_text, "ref_type": "route_deviation", "ref_id": str(event_id), "time": dev.start.isoformat()},
            {"kind": "INFERENCE", "text": dev.inference_text},
        ]
        before, after = self._risk(dev.start, known_at, ev)
        lat, lon = dev.observed_path[len(dev.observed_path) // 2]
        self._add(AlertDraft(
            dedup_key=f"ROUTE_DEVIATION:{self.v.id}:{dev.start:%Y%m%d%H%M}",
            alert_type="ROUTE_DEVIATION", severity=r["severity"],
            title=r["title"].format(vessel=self.name, km=f"{dev.max_deviation_km:.0f}"),
            event_time=known_at, vessel_id=self.v.id, lat=lat, lon=lon,
            location_description=describe_location(lat, lon, zone_names),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="route_deviation", source_event_id=str(event_id),
        ))

    def loitering(self, lo, event_id, known_at, zone_names, near_asset: str | None) -> None:
        r = self.rules["LOITERING"]
        if not r["enabled"] or lo.confidence < r["min_confidence"]:
            return
        ev = [
            {"kind": "OBSERVATION", "text": lo.observation_text, "ref_type": "loitering", "ref_id": str(event_id), "time": lo.start.isoformat()},
            {"kind": "INFERENCE", "text": lo.inference_text + (f" Location is near protected asset {near_asset}." if near_asset else "")},
        ]
        before, after = self._risk(lo.start, known_at, ev)
        self._add(AlertDraft(
            dedup_key=f"LOITERING:{self.v.id}:{lo.start:%Y%m%d%H%M}",
            alert_type="LOITERING", severity=r["severity_near_asset"] if near_asset else r["severity"],
            title=r["title"].format(vessel=self.name, duration=format_duration(lo.duration_s), speed=lo.avg_speed_kn),
            event_time=known_at, vessel_id=self.v.id, lat=lo.centre_lat, lon=lo.centre_lon,
            location_description=describe_location(lo.centre_lat, lo.centre_lon, zone_names),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="loitering", source_event_id=str(event_id),
        ))

    def stop(self, st, event_id, known_at, zone_names) -> None:
        r = self.rules["UNEXPECTED_STOP"]
        if not r["enabled"] or st.confidence < r["min_confidence"]:
            return
        ev = [
            {"kind": "OBSERVATION", "text": st.observation_text, "ref_type": "stop", "ref_id": str(event_id), "time": st.start.isoformat()},
            {"kind": "INFERENCE", "text": st.inference_text},
        ]
        before, after = self._risk(st.start, known_at, ev)
        self._add(AlertDraft(
            dedup_key=f"UNEXPECTED_STOP:{self.v.id}:{st.start:%Y%m%d%H%M}",
            alert_type="UNEXPECTED_STOP", severity=r["severity"],
            title=r["title"].format(vessel=self.name),
            event_time=known_at, vessel_id=self.v.id, lat=st.lat, lon=st.lon,
            location_description=describe_location(st.lat, st.lon, zone_names),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="stop", source_event_id=str(event_id),
        ))

    def incident_approach(self, inc, when: datetime, lat: float, lon: float, dist_km: float) -> None:
        r = self.rules["INCIDENT_PROXIMITY"]
        if not r["enabled"]:
            return
        sev = next((b["severity"] for b in r["severity_by_km"] if dist_km <= b["max_km"]), "LOW")
        ev = [
            {"kind": "OBSERVATION", "text": f"Vessel position at {when:%Y-%m-%d %H:%MZ} was {dist_km:.0f} km from '{inc.title}' "
             f"({inc.category.replace('_', ' ')}, reported {inc.occurred_at:%Y-%m-%d %H:%MZ}; verification {inc.verification_status.lower()}).",
             "ref_type": "incident", "ref_id": str(inc.id), "time": when.isoformat()},
            {"kind": "INFERENCE", "text": "Vessel is operating near recently reported security activity."},
        ]
        before, after = self._risk(when, when, ev)
        self._add(AlertDraft(
            dedup_key=f"INCIDENT_PROXIMITY:{self.v.id}:{inc.id}",
            alert_type="INCIDENT_PROXIMITY", severity=sev,
            title=r["title"].format(vessel=self.name, km=f"{dist_km:.0f}", category=inc.category.replace("_", " ")),
            event_time=when, vessel_id=self.v.id, lat=lat, lon=lon,
            location_description=describe_location(lat, lon),
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="incident", source_event_id=str(inc.id),
        ))

    def asset_approach(self, asset, ev_rec, event_id) -> None:
        r = self.rules["ASSET_APPROACH"]
        if not r["enabled"] or ev_rec["authorised"]:
            return
        sev = r["severity_security"] if ev_rec["ring"] == "SECURITY" else r["severity_monitoring"]
        radius = asset.security_radius_km if ev_rec["ring"] == "SECURITY" else asset.monitoring_radius_km
        ev = [
            {"kind": "OBSERVATION", "text": f"Vessel entered the {radius:g} km {ev_rec['ring'].lower()} radius of {asset.name} at "
             f"{ev_rec['entry']:%Y-%m-%d %H:%MZ}; closest approach {ev_rec['min_km']:.1f} km. Vessel is not on the asset's "
             "authorised vessel list.", "ref_type": "asset_proximity", "ref_id": str(event_id), "time": ev_rec["entry"].isoformat()},
            {"kind": "INFERENCE", "text": "Unscheduled vessel activity near protected infrastructure; purpose unknown."},
        ]
        before, after = self._risk(ev_rec["entry"], ev_rec["entry"], ev)
        self._add(AlertDraft(
            dedup_key=f"ASSET_APPROACH:{self.v.id}:{asset.id}:{ev_rec['entry']:%Y%m%d%H%M}",
            alert_type="ASSET_APPROACH", severity=sev,
            title=r["title"].format(vessel=self.name, ring=ev_rec["ring"].lower(), asset=asset.name),
            event_time=ev_rec["entry"], vessel_id=self.v.id, asset_id=asset.id,
            lat=ev_rec["lat"], lon=ev_rec["lon"], location_description=f"{ev_rec['min_km']:.1f} km from {asset.name}",
            risk_before=before, risk_after=after, evidence=ev,
            recommended_action=r["action"].strip(), source_event_type="asset_proximity", source_event_id=str(event_id),
        ))

    def risk_increases(self) -> None:
        r = self.rules["RISK_INCREASE"]
        if not r["enabled"]:
            return
        from app.core.yamlconfig import risk_model
        from app.risk.engine import band_for

        model = risk_model()
        order = [b["name"] for b in model["bands"]]
        window = timedelta(hours=r["window_hours"])
        pts = self.series.points
        active = False
        last_fired: datetime | None = None
        last_band = -1
        for _k, (t, score, contribs) in enumerate(pts):
            lo = min(p[1] for p in pts if t - window <= p[0] <= t)
            band = band_for(score, model)
            # Fire on a significant rise that also escalates the band, at most once per window.
            rising = (
                score - lo >= r["min_increase_points"]
                and order.index(band) > order.index(band_for(lo, model))
                and order.index(band) >= order.index(r.get("min_band", order[0]))
            )
            escalated = order.index(band) > last_band
            if rising and (not active or escalated) and (last_fired is None or t - last_fired >= window or escalated):
                last_fired = t
                last_band = order.index(band)
                sev = r["severity_by_band"].get(band, "LOW")
                top = "; ".join(f"+{c['points']} {c['label'].lower()}" for c in contribs[:5])
                ev = [
                    {"kind": "OBSERVATION", "text": f"Indicator rose from {lo} to {score} within {r['window_hours']} h.", "time": t.isoformat()},
                    {"kind": "ASSESSMENT", "text": f"SASH Risk Indicator {lo} → {score} ({band}). Contributors: {top}.", "time": t.isoformat()},
                ]
                self._add(AlertDraft(
                    dedup_key=f"RISK_INCREASE:{self.v.id}:{t:%Y%m%d%H}",
                    alert_type="RISK_INCREASE", severity=sev,
                    title=r["title"].format(vessel=self.name, before=lo, after=score),
                    event_time=t, vessel_id=self.v.id, risk_before=lo, risk_after=score, evidence=ev,
                    recommended_action=r["action"].strip(), source_event_type="risk_assessment",
                ))
            active = rising
            if last_fired is not None and t - last_fired >= window:
                last_band = -1


def persist_alerts(db: Session, drafts: list[AlertDraft]) -> list[AlertDraft]:
    """Insert new alerts; existing dedup keys are left untouched (keeps analyst status)."""
    inserted: list[AlertDraft] = []
    for d in drafts:
        values = {
            "dedup_key": d.dedup_key, "alert_type": d.alert_type, "severity": d.severity, "title": d.title,
            "vessel_id": d.vessel_id, "asset_id": d.asset_id, "contact_id": d.contact_id,
            "event_time": d.event_time, "lat": d.lat, "lon": d.lon,
            "position": WKTElement(f"POINT({d.lon} {d.lat})", srid=4326) if d.lat is not None else None,
            "location_description": d.location_description, "risk_before": d.risk_before, "risk_after": d.risk_after,
            "evidence": d.evidence, "recommended_action": d.recommended_action,
            "source_event_type": d.source_event_type, "source_event_id": d.source_event_id,
            "is_synthetic": d.is_synthetic, "status": "NEW",
        }
        stmt = insert(Alert).values(**values).on_conflict_do_nothing(index_elements=["dedup_key"]).returning(Alert.id)
        if db.execute(stmt).first() is not None:
            inserted.append(d)
            ALERTS_GENERATED.labels(alert_type=d.alert_type, severity=d.severity).inc()
    return inserted


def notify_webhook(drafts: list[AlertDraft]) -> None:
    url = get_settings().alert_webhook_url
    if not url or not drafts:
        return
    payload = [
        {"type": d.alert_type, "severity": d.severity, "title": d.title, "event_time": d.event_time.isoformat(),
         "location": d.location_description, "risk_before": d.risk_before, "risk_after": d.risk_after,
         "synthetic": d.is_synthetic}
        for d in drafts
    ]
    try:
        httpx.post(url, json={"source": "SASH Ocean", "alerts": payload}, timeout=5)
    except Exception as exc:  # best-effort; never break analytics on notification failure
        log.warning("alert webhook delivery failed: %s", exc)


def first_approach(track, inc, max_km: float, within_h: float):
    """First observation within max_km of an incident after it became known."""
    start = inc.known_at
    end = start + timedelta(hours=within_h)
    for o in track:
        if o.ts < start - timedelta(hours=1) or o.ts > end:
            continue
        d = haversine_km(o.lat, o.lon, inc.lat, inc.lon)
        if d <= max_km:
            return max(o.ts, start), o.lat, o.lon, d
    return None
