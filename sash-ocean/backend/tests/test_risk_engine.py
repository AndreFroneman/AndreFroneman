"""Explainable risk engine: scoring, gating, point-in-time semantics, config-driven weights."""
import copy
from datetime import timedelta

import pytest
from shapely.geometry import Polygon

from app.analytics.types import Obs
from app.analytics.zones import ZoneShape
from app.core.yamlconfig import risk_model
from app.risk.engine import EventRec, IncidentRec, RiskContext, RiskEngine, VesselProfile, band_for

from .conftest import NOW, t

ZONE = ZoneShape(id="z-high", name="Test HIGH zone", severity="HIGH", category="piracy",
                 geom=Polygon([(48, 14), (54, 14), (54, 10), (48, 10)]))


def ctx(track=None, incidents=(), events=(), vessel_type="crude oil tanker", zones=(ZONE,), env=()):
    track = track or [Obs(ts=t(-60 * k), lat=12.0, lon=50.0, sog=12.0) for k in range(10, -1, -1)]
    return RiskContext(vessel=VesselProfile(id="v1", name="TEST", vessel_type=vessel_type, imo="9074729",
                                            mmsi="636000001", flag="LR"),
                       track=track, zones=list(zones), incidents=list(incidents), events=list(events),
                       environment=list(env))


def test_every_contributor_is_explained():
    inc = IncidentRec(id="i1", occurred_at=NOW - timedelta(days=2), lat=12.2, lon=50.3, category="piracy",
                      title="Test attack", verification_status="VERIFIED", confidence=0.8)
    r = RiskEngine(risk_model()).assess(ctx(incidents=[inc]), NOW)
    assert r.score > 0 and r.contributors
    for c in r.contributors:
        assert c.observation and c.inference and c.assessment.startswith(f"+{c.points}")
        assert c.label and c.component in r.components
    assert r.score == sum(v["points"] for v in r.components.values())
    assert r.band == band_for(r.score, risk_model())
    rules = {c.rule for c in r.contributors}
    assert {"zone_presence", "incident_proximity"} <= rules


def test_components_are_capped():
    incs = [IncidentRec(id=f"i{k}", occurred_at=NOW - timedelta(hours=k + 1), lat=12.0, lon=50.0,
                        category="hijacking", title="x", verification_status="VERIFIED") for k in range(40)]
    r = RiskEngine(risk_model()).assess(ctx(incidents=incs), NOW)
    for comp in r.components.values():
        assert comp["points"] <= comp["cap"]
    assert r.score <= 100


def test_no_hindsight_incident_reported_later_is_ignored():
    future = IncidentRec(id="i1", occurred_at=NOW - timedelta(hours=1), reported_at=NOW + timedelta(hours=2),
                         lat=12.0, lon=50.0, category="piracy", title="later", verification_status="VERIFIED")
    r = RiskEngine(risk_model()).assess(ctx(incidents=[future]), NOW)
    assert "incident_proximity" not in {c.rule for c in r.contributors}


def test_incident_recency_decay_and_distance_tiers():
    eng = RiskEngine(risk_model())

    def pts(days, km_lat_offset):
        inc = IncidentRec(id="i", occurred_at=NOW - timedelta(days=days), lat=12.0 + km_lat_offset, lon=50.0,
                          category="piracy", title="x", verification_status="VERIFIED")
        r = eng.assess(ctx(incidents=[inc]), NOW, with_trend=False)
        return next((c.points for c in r.contributors if c.rule == "incident_proximity"), 0)

    assert pts(1, 0.2) > pts(25, 0.2)          # recency
    assert pts(1, 0.2) > pts(1, 2.0)           # ~22 km vs ~222 km
    assert pts(1, 4.0) == 0                    # beyond 300 km
    assert pts(40, 0.2) == 0                   # beyond lookback


def test_context_gating_suppresses_vulnerability_outside_threat():
    far_track = [Obs(ts=t(-60 * k), lat=-30.0, lon=10.0, sog=12.0) for k in range(10, -1, -1)]
    r = RiskEngine(risk_model()).assess(ctx(track=far_track), NOW)
    assert r.score == 0
    assert {s["rule"] for s in r.suppressed} >= {"vessel_type"}


def test_ais_gap_counts_only_once_knowable():
    gap = EventRec(kind="AIS_GAP", id="g1", start=NOW - timedelta(minutes=30), end=None,
                   known_at=NOW + timedelta(minutes=30), confidence=0.85, observation="obs", inference="inf")
    eng = RiskEngine(risk_model())
    before = eng.assess(ctx(events=[gap]), NOW, with_trend=False)
    after = eng.assess(ctx(events=[gap]), NOW + timedelta(hours=1), with_trend=False)
    assert "ais_gap" not in {c.rule for c in before.contributors}
    assert "ais_gap" in {c.rule for c in after.contributors}


def test_weights_come_from_configuration():
    model = copy.deepcopy(risk_model())
    base = RiskEngine(model).assess(ctx(), NOW, with_trend=False)
    zp = next(c.points for c in base.contributors if c.rule == "zone_presence")
    model["rules"]["zone_presence"]["points_by_severity"]["HIGH"] = zp + 7
    changed = RiskEngine(model).assess(ctx(), NOW, with_trend=False)
    assert next(c.points for c in changed.contributors if c.rule == "zone_presence") == zp + 7
    assert changed.config_hash != base.config_hash


def test_trend_uses_24h_window():
    # Vessel outside the zone yesterday, inside today → Increasing.
    track = [Obs(ts=t(-60 * k), lat=-5.0 if k > 12 else 12.0, lon=50.0, sog=12.0) for k in range(30, -1, -1)]
    r = RiskEngine(risk_model()).assess(ctx(track=track), NOW)
    assert r.trend == "Increasing" and r.previous_score is not None and r.previous_score < r.score


def test_no_position_no_score():
    track = [Obs(ts=NOW + timedelta(hours=1), lat=12.0, lon=50.0)]
    r = RiskEngine(risk_model()).assess(ctx(track=track), NOW)
    assert r.lat is None and r.score == 0 and r.confidence == 0


@pytest.mark.parametrize("score,band", [(0, "LOW"), (24, "LOW"), (25, "MODERATE"), (45, "ELEVATED"), (65, "HIGH"), (85, "SEVERE")])
def test_bands(score, band):
    assert band_for(score, risk_model()) == band
