import pytest

from sash_edge.adapters import QuantumSensorAdapter, SimulatedRadarAdapter, decode_nmea_lines
from sash_edge.local_rules import promote_near_asset
from sash_edge.store import StoreAndForward
from sash_edge.sync import LINK_PROFILES, Uplink


class FakeTransport:
    def __init__(self):
        self.online = True
        self.calls = []

    def post(self, path, body, headers):
        if not self.online:
            raise ConnectionError("satellite link down")
        self.calls.append(path)
        return 200


def obs(i, prio="TRACK", kind="sensor"):
    return (kind, prio, f"k{i}", {"observed_at": "2026-01-01T00:00:00Z", "lat": -11.0, "lon": 41.0, "_sensor": "R1"})


def test_queue_survives_restart(tmp_path):
    path = str(tmp_path / "q.db")
    s = StoreAndForward(path)
    for i in range(5):
        s.put(*obs(i))
    s.close()
    s2 = StoreAndForward(path)
    assert s2.backlog()["TRACK"] == 5


def test_dedup_and_priority_order(tmp_path):
    s = StoreAndForward(str(tmp_path / "q.db"))
    assert s.put(*obs(1)) and not s.put(*obs(1))  # duplicate ignored
    s.put(*obs(2, prio="RAW"))
    s.put(*obs(3, prio="EVENT"))
    assert [i.priority for i in s.batch("sensor", 10)] == ["EVENT", "TRACK", "RAW"]
    assert [i.priority for i in s.batch("sensor", 10, max_priority="TRACK")] == ["EVENT", "TRACK"]


def test_bound_prunes_raw_before_events(tmp_path):
    s = StoreAndForward(str(tmp_path / "q.db"), max_items=3)
    s.put(*obs(1, prio="EVENT"))
    for i in range(2, 7):
        s.put(*obs(i, prio="RAW"))
    b = s.backlog()
    assert b["EVENT"] == 1 and sum(b.values()) == 3


def test_outage_then_recovery_delivers_everything(tmp_path):
    s = StoreAndForward(str(tmp_path / "q.db"))
    t = FakeTransport()
    up = Uplink(s, t, "EDGE-1", {"R1": "SENSOR-R1"}, LINK_PROFILES["LEO_SATELLITE"])
    for i in range(10):
        s.put(*obs(i))
    t.online = False
    r = up.sync_once(now=0)
    assert not r["ok"] and s.backlog()["TRACK"] == 10 and up.failures == 1
    assert up.sync_once(now=1)["skipped"] == "backoff"  # exponential backoff respected
    t.online = True
    r = up.sync_once(now=up.next_attempt)
    assert r["ok"] and r["sent"] == 10 and sum(s.backlog().values()) == 0


def test_geo_satellite_link_sends_only_events(tmp_path):
    s = StoreAndForward(str(tmp_path / "q.db"))
    t = FakeTransport()
    up = Uplink(s, t, "EDGE-1", {}, LINK_PROFILES["GEO_SATELLITE"])
    s.put(*obs(1, prio="EVENT"))
    s.put(*obs(2, prio="TRACK"))
    r = up.sync_once(now=0)
    assert r["sent"] == 1 and s.backlog()["TRACK"] == 1


def test_local_rule_promotes_detection_near_asset():
    near = {"kind": "sensor", "priority": "TRACK", "dedup_key": "a", "payload": {"lat": -11.3, "lon": 41.36}}
    far = {"kind": "sensor", "priority": "TRACK", "dedup_key": "b", "payload": {"lat": -12.3, "lon": 41.36}}
    assert promote_near_asset(near, -11.30, 41.35, 5)["priority"] == "EVENT"
    assert promote_near_asset(far, -11.30, 41.35, 5)["priority"] == "TRACK"


def test_nmea_decoding():
    lines = ["!AIVDM,1,1,,B,15M67FC000G?ufbE`FepT@3n00Sa,0*5C"]
    out = decode_nmea_lines(lines)
    assert len(out) == 1
    p = out[0]["payload"]
    assert p["mmsi"] == "366053209" and -90 <= p["lat"] <= 90


def test_simulated_radar_marks_itself_simulated():
    r = SimulatedRadarAdapter("SIM", -11.3, 41.35)
    plots = list(r.poll())
    assert len(plots) == 3 and all(p["payload"]["attributes"]["simulated"] for p in plots)


def test_quantum_interface_is_reserved_not_implemented():
    with pytest.raises(NotImplementedError):
        list(QuantumSensorAdapter("QS-1").poll())
