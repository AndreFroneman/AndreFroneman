from datetime import datetime, timezone

import pytest

from app.geo.core import (
    bearing_deg,
    destination_point,
    format_duration,
    haversine_km,
    intermediate_point,
    is_dark,
    point_to_polyline_km,
    point_to_segment_km,
    solar_elevation_deg,
    sub_polyline,
)
from app.geo.routing import lane_graph, resolve_port, route_between_ports


def test_haversine_known_distance():
    # Cape Town → Durban ≈ 1,275 km great-circle
    assert haversine_km(-33.91, 18.43, -29.87, 31.03) == pytest.approx(1275, rel=0.02)
    assert haversine_km(0, 0, 0, 0) == 0


def test_destination_and_bearing_roundtrip():
    lat, lon = destination_point(-20.0, 40.0, 75.0, 120.0)
    assert haversine_km(-20.0, 40.0, lat, lon) == pytest.approx(120.0, abs=0.01)
    assert bearing_deg(-20.0, 40.0, lat, lon) == pytest.approx(75.0, abs=0.1)


def test_intermediate_point_midpoint():
    lat, lon = intermediate_point(0, 0, 0, 10, 0.5)
    assert lat == pytest.approx(0, abs=1e-9)
    assert lon == pytest.approx(5, abs=1e-6)


def test_point_to_segment_cross_track_and_ends():
    d, f = point_to_segment_km(1.0, 5.0, 0.0, 0.0, 0.0, 10.0)
    assert d == pytest.approx(111.2, rel=0.01)
    assert 0.45 < f < 0.55
    d_end, f_end = point_to_segment_km(0.0, 12.0, 0.0, 0.0, 0.0, 10.0)
    assert f_end == 1.0
    assert d_end == pytest.approx(haversine_km(0, 12, 0, 10), rel=1e-6)


def test_point_to_polyline_and_sub_polyline():
    line = [(0.0, 0.0), (0.0, 5.0), (5.0, 5.0)]
    d, seg, f = point_to_polyline_km(2.5, 5.2, line)
    assert seg == 1 and d < 30
    part = sub_polyline(line, (0, 0.5), (1, 0.5))
    assert part[0][1] == pytest.approx(2.5, abs=0.01)
    assert part[-1][0] == pytest.approx(2.5, abs=0.05)


def test_solar_elevation_day_night():
    noon = datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc)
    assert solar_elevation_deg(0.0, 0.0, noon) > 80
    midnight = datetime(2026, 3, 20, 0, 0, tzinfo=timezone.utc)
    assert is_dark(0.0, 0.0, midnight)
    assert not is_dark(0.0, 0.0, noon)


def test_format_duration():
    assert format_duration(3 * 3600 + 14 * 60) == "3h 14m"
    assert format_duration(90) == "1m"
    assert format_duration(90000) == "1d 1h 00m"


def test_lane_routing_red_sea_to_durban_goes_via_bab_el_mandeb():
    path = lane_graph().shortest_path("PORT:SAYNB", "PORT:ZADUR")
    assert "BAB" in path and "MOZ_3" in path
    assert len(route_between_ports("SAYNB", "ZADUR")) == len(path)


@pytest.mark.parametrize("text,code", [("ZA DUR", "ZADUR"), ("durban", "ZADUR"), ("ZADUR", "ZADUR"),
                                       ("DAR ES SALAAM", "TZDAR"), ("Mumbai", "INNSA"), ("DURBAN OPL", "ZADUR")])
def test_resolve_port(text, code):
    assert resolve_port(text).unlocode == code


def test_resolve_port_unknown():
    assert resolve_port("ATLANTIS") is None
    assert resolve_port(None) is None
