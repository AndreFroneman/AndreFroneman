"""API integration tests against PostGIS with the synthetic demo world loaded."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

from .conftest import login

pytestmark = pytest.mark.db


# --- System / auth ------------------------------------------------------------------------------
def test_health_and_openapi(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["database"] is True
    spec = client.get("/v1/openapi.json").json()
    for path in ["/v1/vessels/{ref}", "/v1/vessels/{ref}/risk", "/v1/vessels/{ref}/voyages", "/v1/vessels/{ref}/anomalies",
                 "/v1/incidents", "/v1/incidents/nearby", "/v1/risk-zones", "/v1/contacts", "/v1/assets", "/v1/alerts",
                 "/v1/watchlists", "/v1/area-risk", "/v1/voyage-risk"]:
        assert path in spec["paths"], path


def test_security_headers(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert "default-src 'none'" in r.headers["content-security-policy"]


def test_unauthenticated_requests_rejected(client):
    assert client.get("/v1/vessels").status_code == 401
    assert client.get("/v1/vessels", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/v1/vessels", headers={"X-API-Key": "sash_deadbeef_xxx"}).status_code == 401


def test_login_failure_and_lockout(client, db):
    from app.core.security import hash_password
    from app.models import User

    db.add(User(email="lockme@sash.test", password_hash=hash_password("Right-Pass-123"), role="ANALYST"))
    db.commit()
    for _ in range(5):
        assert client.post("/v1/auth/login", json={"email": "lockme@sash.test", "password": "wrong"}).status_code == 401
    r = client.post("/v1/auth/login", json={"email": "lockme@sash.test", "password": "Right-Pass-123"})
    assert r.status_code == 423  # locked even with the right password


def test_me_reports_role_and_entitlements(client, customer_h):
    me = client.get("/v1/auth/me", headers=customer_h).json()
    assert me["role"] == "CUSTOMER" and me["tier"] == "PROFESSIONAL"
    assert "voyage_replay" in me["features"] and "api" not in me["features"]


# --- RBAC & entitlements ------------------------------------------------------------------------------
def _api_key(client, admin_h, db, tier: str, role="API_USER", rate=None) -> str:
    from app.models import Organisation

    org = Organisation(name=f"Org {tier} {role} {datetime.now().timestamp()}", tier=tier)
    db.add(org)
    db.commit()
    r = client.post("/v1/admin/api-keys", headers=admin_h,
                    json={"name": "test", "organisation_id": str(org.id), "role": role, "rate_limit_per_min": rate})
    assert r.status_code == 201, r.text
    return r.json()["api_key"]


def test_customer_cannot_create_incidents_or_admin(client, customer_h):
    body = {"occurred_at": "2026-01-01T00:00:00Z", "lat": 1, "lon": 1, "category": "piracy", "title": "x x x", "source_name": "me"}
    assert client.post("/v1/incidents", headers=customer_h, json=body).status_code == 403
    assert client.get("/v1/admin/audit", headers=customer_h).status_code == 403
    assert client.post("/v1/admin/demo/reseed", headers=customer_h).status_code == 403


def test_api_key_requires_enterprise_tier(client, admin_h, db):
    pro = _api_key(client, admin_h, db, "PROFESSIONAL")
    assert client.get("/v1/vessels", headers={"X-API-Key": pro}).status_code == 403
    ent = _api_key(client, admin_h, db, "ENTERPRISE")
    r = client.get("/v1/vessels?limit=5", headers={"X-API-Key": ent})
    assert r.status_code == 200 and len(r.json()["vessels"]) == 5


def test_sensor_role_can_only_ingest(client, admin_h, db):
    key = _api_key(client, admin_h, db, "SENSOR", role="SENSOR")
    h = {"X-API-Key": key}
    assert client.get("/v1/vessels", headers=h).status_code == 403
    now = datetime.now(timezone.utc).isoformat()
    r = client.post("/v1/ingest/ais", headers=h, json={"source_key": "test-edge", "messages": [
        {"mmsi": "123456789", "ts": now, "lat": -29.9, "lon": 31.2, "sog": 10.5, "name": "LIVE TEST"},
        {"mmsi": "12345", "ts": now, "lat": 0, "lon": 0},  # invalid MMSI → rejected by schema
    ]})
    assert r.status_code == 422  # whole batch validated; bad record rejected
    r = client.post("/v1/ingest/ais", headers=h, json={"source_key": "test-edge", "messages": [
        {"mmsi": "123456789", "ts": now, "lat": -29.9, "lon": 31.2, "sog": 10.5, "name": "LIVE TEST"}]})
    assert r.status_code == 200 and r.json()["accepted"] == 1


def test_rate_limiting_per_api_key(client, admin_h, db):
    key = _api_key(client, admin_h, db, "ENTERPRISE", rate=3)
    codes = [client.get("/v1/risk-zones", headers={"X-API-Key": key}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_revoked_key_rejected(client, admin_h, db):
    from app.models import ApiKey

    key = _api_key(client, admin_h, db, "ENTERPRISE")
    rec = db.scalar(select(ApiKey).order_by(ApiKey.created_at.desc()))
    assert client.delete(f"/v1/admin/api-keys/{rec.id}", headers=admin_h).status_code == 200
    assert client.get("/v1/risk-zones", headers={"X-API-Key": key}).status_code == 401


# --- Evidence integrity & provenance -------------------------------------------------------------------
def test_observations_are_append_only(db):
    with pytest.raises(Exception, match="append-only"):
        db.execute(text("UPDATE ais_observations SET lat = 0 WHERE id = (SELECT min(id) FROM ais_observations)"))
    db.rollback()


def test_live_and_synthetic_never_merge(client, db):
    from app.models import Vessel

    synthetic = db.scalar(select(Vessel).where(Vessel.name == "AURORA MERIDIAN"))
    from app.models import DataSource
    from app.services.ingest import ingest_ais

    src = DataSource(key="test-live", name="Live test", source_type="AIS", licensing_category="PUBLIC-OSINT", enabled=True)
    db.add(src)
    db.flush()
    res = ingest_ais(db, [{"mmsi": synthetic.mmsi, "ts": datetime.now(timezone.utc), "lat": 1.0, "lon": 1.0}], src)
    db.commit()
    assert res.new_vessels == 1  # a separate LIVE record, not the synthetic one
    rows = db.scalars(select(Vessel).where(Vessel.mmsi == synthetic.mmsi)).all()
    assert {v.data_mode for v in rows} == {"LIVE", "SYNTHETIC"}


def test_incidents_carry_provenance(client, analyst_h):
    inc = client.get("/v1/incidents?limit=5", headers=analyst_h).json()["incidents"][0]
    p = inc["provenance"]
    assert p["source"] and p["licensing_category"] == "SYNTHETIC-DEMO" and p["retrieved_at"] and p["synthetic"] is True


def test_sensor_ingest_is_idempotent(client, admin_h):
    r = client.post("/v1/sensors", headers=admin_h, json={"sensor_code": "TEST-RADAR-1", "name": "Test radar",
                                                          "sensor_type": "RADAR", "lat": -30, "lon": 31})
    assert r.status_code == 201
    obs = [{"observed_at": datetime.now(timezone.utc).isoformat(), "dedup_key": "edge-1:42", "lat": -30.01, "lon": 31.01}]
    body = {"sensor_code": "TEST-RADAR-1", "edge_node_code": "EDGE-TEST", "observations": obs}
    assert client.post("/v1/ingest/sensor-observations", headers=admin_h, json=body).json()["accepted"] == 1
    again = client.post("/v1/ingest/sensor-observations", headers=admin_h, json=body).json()
    assert again["accepted"] == 0 and again["duplicates"] == 1


def test_gzip_compressed_edge_upload(client, admin_h):
    import gzip
    import json

    body = {"sensor_code": "TEST-RADAR-1", "edge_node_code": "EDGE-TEST",
            "observations": [{"observed_at": datetime.now(timezone.utc).isoformat(), "dedup_key": "edge-1:gz", "lat": -30.0, "lon": 31.0}]}
    r = client.post("/v1/ingest/sensor-observations", content=gzip.compress(json.dumps(body).encode()),
                    headers={**admin_h, "Content-Type": "application/json", "Content-Encoding": "gzip"})
    assert r.status_code == 200 and r.json()["accepted"] == 1
    bomb = gzip.compress(b"0" * (101 * 1024 * 1024))
    r = client.post("/v1/ingest/ais", content=bomb, headers={**admin_h, "Content-Encoding": "gzip"})
    assert r.status_code == 413


def test_quantum_sensor_type_is_reserved_interface(client, admin_h):
    r = client.post("/v1/sensors", headers=admin_h, json={"sensor_code": "QS-LAB-1", "name": "Reserved",
                                                          "sensor_type": "QUANTUM_SENSOR"})
    assert r.status_code == 201
    assert "QUANTUM_TIMING_SOURCE" in client.get("/v1/sensors", headers=admin_h).json()["supported_types"]


# --- Flagship scenario ------------------------------------------------------------------------------------
@pytest.fixture(scope="module")
def aurora(client, analyst_h):
    return client.get("/v1/vessels/AURORA%20MERIDIAN", headers=analyst_h).json()


def test_flagship_ais_gap_is_reporting_anomaly_with_good_coverage(client, analyst_h, aurora):
    an = client.get(f"/v1/vessels/{aurora['id']}/anomalies", headers=analyst_h).json()
    gaps = an["ais_gaps"]
    assert len(gaps) == 1
    g = gaps[0]
    assert g["label"] == "AIS reporting anomaly"
    assert g["coverage_quality"] == "GOOD" and g["peer_vessels"] >= 2
    assert g["anomaly_confidence"] >= 0.5
    assert 3 * 3600 <= g["duration_s"] <= 5 * 3600
    dev = an["route_deviations"]
    assert len(dev) == 1 and dev[0]["max_deviation_km"] > 80
    zones = {z["zone"] for z in an["zone_exposures"]}
    assert any("Gulf of Aden" in z for z in zones) and any("Somali Basin" in z for z in zones)


def test_flagship_risk_rises_then_falls(client, analyst_h, aurora):
    pts = client.get(f"/v1/vessels/{aurora['id']}/risk/history", headers=analyst_h).json()["points"]
    scores = [p["score"] for p in pts]
    peak = max(scores)
    assert peak >= 65  # HIGH or above during the Somali Basin sequence
    assert scores[-1] < peak - 30  # decreases after exiting the threat areas


def test_flagship_alerts_generated(client, customer_h, aurora):
    alerts = client.get(f"/v1/alerts?vessel_id={aurora['id']}&limit=100", headers=customer_h).json()["alerts"]
    types = {a["type"] for a in alerts}
    assert {"ZONE_ENTRY", "AIS_GAP", "ROUTE_DEVIATION", "RISK_INCREASE", "INCIDENT_PROXIMITY"} <= types
    for a in alerts:
        kinds = {e["kind"] for e in a["evidence"]}
        assert "OBSERVATION" in kinds
        assert a["recommended_analyst_action"]
        assert not any(w in a["recommended_analyst_action"].lower() for w in ("engage", "fire", "strike", "intercept"))


def test_current_risk_is_explained(client, customer_h, aurora):
    r = client.get(f"/v1/vessels/{aurora['id']}/risk", headers=customer_h).json()
    assert r["indicator"] == "SASH Maritime Risk Indicator" and "underwriting" in r["disclaimer"]
    for c in r["contributors"]:
        assert c["observation"] and c["inference"] and c["assessment"]


def test_point_in_time_risk_during_gap(client, analyst_h, aurora):
    an = client.get(f"/v1/vessels/{aurora['id']}/anomalies", headers=analyst_h).json()
    g = an["ais_gaps"][0]
    t_mid = datetime.fromisoformat(g["gap_end"]) - timedelta(minutes=30)
    r = client.get(f"/v1/vessels/{aurora['id']}/risk", params={"as_of": t_mid.isoformat()}, headers=analyst_h).json()
    assert r["kind"] == "POINT_IN_TIME"
    assert "ais_gap" in {c["rule"] for c in r["contributors"]}


def test_why_endpoint_explains_change(client, analyst_h, aurora):
    an = client.get(f"/v1/vessels/{aurora['id']}/anomalies", headers=analyst_h).json()
    g = an["ais_gaps"][0]
    start = datetime.fromisoformat(g["gap_start"]) - timedelta(hours=2)
    end = datetime.fromisoformat(g["gap_end"]) + timedelta(hours=6)
    why = client.get(f"/v1/vessels/{aurora['id']}/risk/why", params={"from": start.isoformat(), "to": end.isoformat()},
                     headers=analyst_h).json()
    kinds = [e["kind"] for e in why["timeline"]]
    assert "AIS_GAP_START" in kinds and "AIS_GAP_END" in kinds
    assert why["score_after"] > why["score_before"]
    assert any(c["rule"] == "ais_gap" and c["status"] == "added" for c in why["contributor_changes"])
    assert why["summary"].startswith("Risk changed:")


def test_voyage_replay_bundle(client, customer_h, aurora):
    b = client.get(f"/v1/vessels/{aurora['id']}/replay", headers=customer_h).json()
    assert b["voyage"]["origin_port"] == "SAYNB"
    assert len(b["track"]) > 500 and len(b["risk"]) > 100
    assert b["anomalies"]["ais_gaps"] and b["incidents"]
    kinds = {e["kind"] for e in b["events"]}
    assert {"ZONE_ENTRY", "ZONE_EXIT", "AIS_GAP_START", "INCIDENT"} <= kinds


def test_security_profile_and_reports(client, customer_h, aurora):
    p = client.get(f"/v1/vessels/{aurora['imo']}/profile", headers=customer_h).json()
    h = p["historical_exposure"]
    assert h["high_risk_zone_transits"] >= 2 and h["ais_anomalies"] == 1 and h["route_deviations"] == 1
    assert h["elevated_risk_exposure_hours"] > 24
    # Reports require the ENTERPRISE 'reports' feature: the PROFESSIONAL customer is refused.
    assert client.get(f"/v1/vessels/{aurora['id']}/report.pdf", headers=customer_h).status_code == 403


def test_reports_for_analyst(client, analyst_h, aurora):
    pdf = client.get(f"/v1/vessels/{aurora['id']}/report.pdf", headers=analyst_h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    csv_r = client.get(f"/v1/vessels/{aurora['id']}/report.csv", headers=analyst_h)
    assert "do not constitute insurance underwriting advice" in csv_r.text


def test_incident_proximity_bands(client, analyst_h):
    incs = client.get("/v1/incidents?limit=100", headers=analyst_h).json()["incidents"]
    flagship = next(i for i in incs if i["title"].startswith("Attempted boarding of product tanker"))
    d = client.get(f"/v1/incidents/{flagship['id']}", headers=analyst_h).json()
    names = {v["name"] for v in d["vessels_nearby_at_incident_time"]}
    assert "AURORA MERIDIAN" in names
    assert d["vessel_counts_by_band_km"]["100"] >= 1


def test_area_and_voyage_risk(client, customer_h):
    a = client.get("/v1/area-risk?lat=12.6&lon=48.0&radius_km=250", headers=customer_h).json()
    assert a["product"] == "SASH AREA RISK" and a["risk_indicator"] > 20 and a["risk_zones"]
    v = client.post("/v1/voyage-risk", headers=customer_h, json={"origin": "Yanbu", "destination": "Durban", "speed_kn": 13,
                                                                   "vessel_type": "crude oil tanker"}).json()
    assert v["overall_risk_indicator"] >= 45 and v["highest_risk_segments"]
    assert any("Gulf of Aden" in z["zone"] for z in v["risk_zones_crossed"])
    assert v["estimated_exposure_hours"] > 20
    safe = client.post("/v1/voyage-risk", headers=customer_h, json={"origin": "Cape Town", "destination": "Walvis Bay"}).json()
    assert safe["overall_risk_indicator"] < v["overall_risk_indicator"]


def test_contacts_dark_and_correlated(client, analyst_h):
    cs = client.get("/v1/contacts", headers=analyst_h).json()["contacts"]
    labels = {c["contact_code"]: c for c in cs}
    assert labels["C-728"]["identity_status"] == "CORRELATED" and labels["C-728"]["correlation_confidence"] > 0.85
    dark = labels["C-731"]
    assert dark["label"] == "UNIDENTIFIED MARITIME CONTACT" and "RADAR" in dark["detection_sources"]
    detail = client.get(f"/v1/contacts/{dark['id']}", headers=analyst_h).json()
    assert detail["observations"] and "hostile" not in detail["statement"]["inference"].lower()


# --- Watchlists, alerts workflow, audit ---------------------------------------------------------------
def test_watchlist_and_alert_workflow(client, customer_h, admin_h, aurora):
    r = client.post("/v1/watchlists", headers=customer_h, json={"name": "Test list", "items": [
        {"item_type": "IMO", "imo": aurora["imo"]}, {"item_type": "FLEET", "fleet_operator": "Meridian Tankers (DEMO)"}]})
    assert r.status_code == 201
    wl = r.json()
    assert aurora["id"] in wl["vessel_ids"]
    alerts = client.get(f"/v1/alerts?watchlist_id={wl['id']}", headers=customer_h).json()["alerts"]
    assert alerts
    a = alerts[0]
    ack = client.post(f"/v1/alerts/{a['id']}/acknowledge", headers=customer_h, json={"note": "operator contacted"})
    assert ack.json()["status"] == "ACKNOWLEDGED"
    audit = client.get("/v1/admin/audit?action=alert.", headers=admin_h).json()["entries"]
    assert any(e["action"] == "alert.acknowledged" for e in audit)


def test_analytics_rerun_is_idempotent_and_keeps_acknowledgements(client, analyst_h, admin_h, db):
    from app.models import Alert

    before = db.scalar(text("SELECT count(*) FROM alerts"))
    acked = db.scalar(select(Alert).where(Alert.status == "ACKNOWLEDGED"))
    r = client.post("/v1/admin/analytics/run", headers=analyst_h)
    assert r.status_code == 200
    db.expire_all()
    assert db.scalar(text("SELECT count(*) FROM alerts")) >= before
    if acked is not None:
        assert db.get(Alert, acked.id).status == "ACKNOWLEDGED"


def test_ml_dataset_export(client, analyst_h):
    r = client.get("/v1/admin/datasets/vessel-days.csv?days=30", headers=analyst_h)
    assert r.status_code == 200
    header = r.text.splitlines()[0]
    for col in ("vessel_id", "day", "reports", "ais_gaps", "max_risk", "recorded_incident_outcomes"):
        assert col in header


def test_login_is_audited(client, admin_h):
    login(client, "analyst@sash.demo", "Test-Analyst-Pass-1")
    client.post("/v1/auth/login", json={"email": "analyst@sash.demo", "password": "bad"})
    actions = {e["action"] for e in client.get("/v1/admin/audit?action=auth.", headers=admin_h).json()["entries"]}
    assert {"auth.login", "auth.login_failed"} <= actions
