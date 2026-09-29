"""AIS gaps, loitering, route deviation, stops, zone exposure, voyages, identity."""
from datetime import timedelta

import pytest
from shapely.geometry import Polygon

from app.analytics.ais_gaps import detect_ais_gaps
from app.analytics.identity import identity_issues, imo_checksum_valid, imo_with_check_digit, mid_flag
from app.analytics.loitering import detect_loitering
from app.analytics.route_deviation import detect_route_deviations
from app.analytics.stops import detect_unexpected_stops
from app.analytics.types import Obs
from app.analytics.voyages import segment_voyages
from app.analytics.zones import ZoneShape, compute_zone_exposures
from app.core.yamlconfig import detection_config
from app.geo.core import destination_point

from .conftest import NOW, t

CFG = detection_config()


def straight_track(n, every_min=10, lat=-10.0, lon=42.0, bearing=180.0, speed_kn=12.0, start_min=0):
    out = []
    step_km = speed_kn * 1.852 * every_min / 60
    for i in range(n):
        la, lo = destination_point(lat, lon, bearing, step_km * i)
        out.append(Obs(ts=t(start_min + i * every_min), lat=la, lon=lo, sog=speed_kn, cog=bearing, id=i))
    return out


# --- AIS gaps -------------------------------------------------------------------------------
def test_regular_reporting_has_no_gap():
    assert detect_ais_gaps(straight_track(40), CFG["ais_gap"]) == []


def test_gap_detected_and_labelled_as_reporting_anomaly():
    track = straight_track(30)
    track = track[:15] + [Obs(ts=o.ts + timedelta(minutes=194), lat=o.lat, lon=o.lon, sog=o.sog) for o in track[15:]]
    gaps = detect_ais_gaps(track, CFG["ais_gap"], peer_lookup=lambda *a: (20, 3))
    assert len(gaps) == 1
    g = gaps[0]
    assert g.duration_s == pytest.approx((194 + 10) * 60)
    assert g.coverage_quality == "GOOD"
    assert "intentionally" not in g.observation_text.lower()
    assert "cause undetermined" in g.inference_text.lower()
    assert "intentional disabling" in g.inference_text  # listed only as one possible explanation


def test_gap_confidence_depends_on_peer_coverage():
    track = straight_track(30)
    track = track[:15] + [Obs(ts=o.ts + timedelta(hours=3), lat=o.lat, lon=o.lon, sog=o.sog) for o in track[15:]]
    good = detect_ais_gaps(track, CFG["ais_gap"], peer_lookup=lambda *a: (25, 3))[0]
    unknown = detect_ais_gaps(track, CFG["ais_gap"], peer_lookup=lambda *a: (0, 0))[0]
    assert good.anomaly_confidence > unknown.anomaly_confidence
    assert unknown.coverage_quality == "UNKNOWN"
    assert unknown.anomaly_confidence < 0.5  # below the default alert threshold


def test_adaptive_baseline_for_satellite_cadence():
    # 40-minute satellite cadence must not produce gaps; 4x baseline is the threshold.
    assert detect_ais_gaps(straight_track(30, every_min=40), CFG["ais_gap"]) == []


def test_position_discontinuity_flagged():
    track = straight_track(20)
    jump = Obs(ts=track[-1].ts + timedelta(hours=2), lat=track[-1].lat + 5, lon=track[-1].lon, sog=12)
    g = detect_ais_gaps(track + [jump], CFG["ais_gap"])[0]
    assert g.position_discontinuity
    assert "identity inconsistency" in g.inference_text


def test_ongoing_gap_detected_now():
    track = straight_track(20)
    gaps = detect_ais_gaps(track, CFG["ais_gap"], now=track[-1].ts + timedelta(hours=5))
    assert gaps and gaps[-1].ongoing and gaps[-1].gap_end is None


def test_in_port_penalty():
    track = straight_track(30)
    track = track[:15] + [Obs(ts=o.ts + timedelta(hours=3), lat=o.lat, lon=o.lon, sog=o.sog) for o in track[15:]]
    at_sea = detect_ais_gaps(track, CFG["ais_gap"], in_port=lambda la, lo: False)[0]
    in_port = detect_ais_gaps(track, CFG["ais_gap"], in_port=lambda la, lo: True)[0]
    assert in_port.anomaly_confidence < at_sea.anomaly_confidence


# --- Loitering ------------------------------------------------------------------------------
def loiter_track(hours=6, speed=1.0):
    out = []
    for i in range(int(hours * 6)):
        la, lo = destination_point(-11.0, 41.0, (i * 47) % 360, 1.5)
        out.append(Obs(ts=t(i * 10), lat=la, lon=lo, sog=speed))
    return out


def test_loitering_detected():
    ev = detect_loitering(loiter_track(), CFG["loitering"], vessel_type="bulk carrier")
    assert len(ev) == 1
    assert ev[0].radius_km <= CFG["loitering"]["radius_km"]
    assert ev[0].avg_speed_kn == pytest.approx(1.0)
    assert "intent cannot be determined" in ev[0].inference_text


def test_loitering_fishing_lower_confidence_and_port_exclusion():
    base = detect_loitering(loiter_track(), CFG["loitering"], vessel_type="bulk carrier")[0]
    fishing = detect_loitering(loiter_track(), CFG["loitering"], vessel_type="fishing")[0]
    assert fishing.confidence < base.confidence
    assert "fishing" in fishing.inference_text
    assert detect_loitering(loiter_track(), CFG["loitering"], near_port=lambda la, lo: True) == []


def test_transit_is_not_loitering_and_short_stay_ignored():
    assert detect_loitering(straight_track(40), CFG["loitering"]) == []
    assert detect_loitering(loiter_track(hours=1.5), CFG["loitering"]) == []


# --- Route deviation ------------------------------------------------------------------------------
def test_route_deviation_detected_for_sustained_offset():
    expected = [(0.0, 50.0), (-10.0, 50.0)]
    track = []
    for i in range(48):
        lat = -i * 0.2
        off = 1.0 if 10 <= i <= 30 else 0.0  # ~111 km east for ~3.5 h
        track.append(Obs(ts=t(i * 10), lat=lat, lon=50.0 + off, sog=12))
    ev = detect_route_deviations(track, expected, CFG["route_deviation"], "DECLARED_DESTINATION", "Durban")
    assert len(ev) == 1
    assert ev[0].max_deviation_km == pytest.approx(111, rel=0.05)
    assert "not necessarily" in ev[0].inference_text or "legitimate" in ev[0].inference_text


def test_small_offsets_are_not_deviations():
    expected = [(0.0, 50.0), (-10.0, 50.0)]
    track = [Obs(ts=t(i * 10), lat=-i * 0.2, lon=50.2, sog=12) for i in range(48)]  # ~22 km
    assert detect_route_deviations(track, expected, CFG["route_deviation"], "PORT_CALLS") == []


# --- Unexpected stops -----------------------------------------------------------------------------------
def test_unexpected_stop():
    track = straight_track(10) + [Obs(ts=t(100 + i * 10), lat=-11.0, lon=42.0, sog=0.2) for i in range(12)]
    ev = detect_unexpected_stops(track, CFG["unexpected_stop"])
    assert len(ev) == 1 and ev[0].prior_speed_kn >= 6
    assert detect_unexpected_stops(track, CFG["unexpected_stop"], near_port=lambda la, lo: True) == []


# --- Zone exposure -----------------------------------------------------------------------------------
def test_zone_entry_exit_interpolated():
    zone = ZoneShape(id="z1", name="Test zone", severity="HIGH", geom=Polygon([(49, -2), (51, -2), (51, -4), (49, -4)]))
    track = [Obs(ts=t(i * 60), lat=-i * 0.5, lon=50.0) for i in range(12)]  # 0 → -5.5 over 11 h
    ex = compute_zone_exposures(track, [zone])
    assert len(ex) == 1
    e = ex[0]
    assert e.entry_time == t(240)  # crosses -2.0 at exactly 4 h
    assert e.exit_time == t(480)
    assert e.duration_s == 4 * 3600
    assert e.distance_km == pytest.approx(222, rel=0.02)
    assert not e.ongoing and not e.started_inside


def test_zone_ongoing_and_started_inside():
    zone = ZoneShape(id="z1", name="Z", severity="ELEVATED", geom=Polygon([(49, 1), (51, 1), (51, -9), (49, -9)]))
    track = [Obs(ts=t(i * 60), lat=-i * 0.5, lon=50.0) for i in range(6)]
    e = compute_zone_exposures(track, [zone])[0]
    assert e.ongoing and e.started_inside and e.exit_time is None


def test_zone_effective_period_respected():
    zone = ZoneShape(id="z", name="Z", severity="HIGH", geom=Polygon([(49, 1), (51, 1), (51, -9), (49, -9)]),
                     effective_start=NOW + timedelta(days=10))
    track = [Obs(ts=t(i * 60), lat=-i * 0.5, lon=50.0) for i in range(6)]
    assert compute_zone_exposures(track, [zone]) == []


# --- Voyage segmentation ------------------------------------------------------------------------------
def test_voyage_segmentation_between_port_stays():
    stay_a = [Obs(ts=t(i * 10), lat=-29.87, lon=31.03, sog=0.1) for i in range(18)]
    sail = [Obs(ts=t(180 + i * 10), lat=-29.87 + i * 0.1, lon=31.03 + i * 0.1, sog=12) for i in range(1, 30)]
    stay_b = [Obs(ts=t(480 + i * 10), lat=-27.0, lon=33.9, sog=0.1) for i in range(18)]

    def port_at(lat, lon):
        return "AAA" if abs(lat + 29.87) < 0.05 else ("BBB" if abs(lat + 27.0) < 0.05 else None)

    v = segment_voyages(stay_a + sail + stay_b, CFG["voyage_segmentation"], port_at)
    assert len(v) == 1
    assert v[0].origin_port == "AAA" and v[0].destination_port == "BBB"
    assert v[0].distance_km > 300


# --- Identity ------------------------------------------------------------------------------------------
def test_imo_checksum():
    assert imo_checksum_valid("9074729")  # textbook example
    assert not imo_checksum_valid("9074728")
    assert imo_checksum_valid(imo_with_check_digit("110211"))


def test_identity_mismatch_is_observation_only():
    assert mid_flag("636991037") == "LR"
    issues = identity_issues("9074729", "636991037", "PA")
    assert len(issues) == 1 and "do not match" in issues[0]
    assert identity_issues("9074729", "636991037", "LR") == []
