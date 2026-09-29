"""Fusion, security primitives, rate limiting and connector parsers."""
import uuid
from datetime import timedelta

import jwt
import pytest

from app.connectors.sources import classify_asam, parse_aisstream_message, parse_asam_coordinate, parse_asam_record, parse_sdn_csv
from app.core.ratelimit import RateLimiter
from app.core.security import (
    api_key_prefix,
    create_access_token,
    create_mfa_challenge_token,
    decode_token,
    generate_api_key,
    hash_api_key,
    hash_password,
    password_policy_errors,
    verify_password,
)
from app.fusion.correlator import AisCandidate, Detection, correlate, score_pair

from .conftest import t


# --- Fusion -------------------------------------------------------------------------------
def det(obs_id, sensor, stype, trust, lat, lon, unc=150, speed=10.0, course=90.0):
    return Detection(obs_id, sensor, stype, trust, t(0), lat, lon, unc, speed, course)


def test_coincident_ais_scores_high_and_far_is_gated_out():
    near = AisCandidate(uuid.uuid4(), "SUPPORT", "650991296", -11.0, 41.0005, 10.2, 91.0)
    far = AisCandidate(uuid.uuid4(), "OTHER", "650000000", -11.2, 41.3, 10.0, 90.0)
    d = det(1, "radar", "RADAR", 0.85, -11.0, 41.0)
    s_near, _ = score_pair(d, near)
    s_far, ev = score_pair(d, far)
    assert s_near > 0.9 and s_far == 0 and ev["gated_out"]


def test_multi_sensor_evidence_combines():
    v = AisCandidate(uuid.uuid4(), "SUPPORT", "650991296", -11.0, 41.0, 10.0, 90.0)
    radar = det(1, "radar", "RADAR", 0.85, -11.001, 41.0)
    eo = det(2, "eo", "EO", 0.8, -11.0005, 41.0005, unc=80)
    one = correlate([radar], {1: [v]})[0].score
    two = correlate([radar, eo], {1: [v], 2: [v]})[0].score
    assert two > one
    assert correlate([radar], {1: []}) == []  # nothing correlates → unidentified contact


# --- Security --------------------------------------------------------------------------------
def test_password_hashing_and_policy():
    h = hash_password("Correct-Horse-9")
    assert h != "Correct-Horse-9" and verify_password("Correct-Horse-9", h)
    assert not verify_password("wrong", h)
    assert password_policy_errors("short") and not password_policy_errors("Long-Enough-Pass-1")


def test_jwt_roundtrip_and_type_enforcement():
    uid = uuid.uuid4()
    tok, ttl = create_access_token(uid, "ANALYST", None, "ENTERPRISE", mfa=False)
    payload = decode_token(tok)
    assert payload["sub"] == str(uid) and payload["role"] == "ANALYST" and ttl > 0
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(create_mfa_challenge_token(uid))  # an MFA challenge is not an access token
    with pytest.raises(jwt.InvalidTokenError):
        decode_token(tok + "x")


def test_api_key_generation_only_hash_stored():
    full, prefix, digest = generate_api_key()
    assert full.startswith(f"sash_{prefix}_") and api_key_prefix(full) == prefix
    assert digest == hash_api_key(full) and full not in digest
    assert api_key_prefix("not-a-key") is None


def test_rate_limiter_in_memory_fallback():
    lim = RateLimiter(redis_url="redis://127.0.0.1:6399/0")
    results = [lim.hit("k", 3)[0] for _ in range(4)]
    assert results == [True, True, True, False]


# --- Connectors ---------------------------------------------------------------------------------
def test_parse_aisstream_position_report():
    m = {"MessageType": "PositionReport",
         "MetaData": {"MMSI": 636012345, "ShipName": "SOME SHIP  ", "time_utc": "2026-09-01 10:11:12.123 +0000 UTC"},
         "Message": {"PositionReport": {"Latitude": -29.9, "Longitude": 31.1, "Sog": 12.3, "Cog": 180.0,
                                        "TrueHeading": 511, "NavigationalStatus": 0}}}
    p = parse_aisstream_message(m)
    assert p["mmsi"] == "636012345" and p["heading"] is None and p["nav_status"] == "Under way using engine"
    assert p["ts"].hour == 10 and p["name"] == "SOME SHIP"
    assert parse_aisstream_message({"MessageType": "ShipStaticData"}) is None


def test_asam_parsers():
    assert parse_asam_coordinate("12°30.0'N") == pytest.approx(12.5)
    assert parse_asam_coordinate("45°15'W") == pytest.approx(-45.25)
    assert parse_asam_coordinate(-3.2) == -3.2
    assert classify_asam("Pirates boarded and hijacked the vessel") == "hijacking"
    r = parse_asam_record({"reference": "2026-12", "date": "2026-02-01", "latitude": "11°N", "longitude": "49°E",
                           "description": "Skiff approached the ship", "hostility": "Suspicious approach"})
    assert r["lat"] == 11 and r["lon"] == 49 and r["category"] == "suspicious_approach"


def test_sdn_vessel_parser():
    csv_text = ('36,"VESSEL A",vessel,"IRAN",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"Vessel Registration Identification IMO 9074729; MMSI 422000000."\n'
                '37,"PERSON B",individual,"SDGT",-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,-0- ,"DOB 1970."\n')
    rows = parse_sdn_csv(csv_text)
    assert len(rows) == 1 and rows[0]["imo"] == "9074729" and rows[0]["mmsi"] == "422000000"


def test_time_helper():
    assert t(60) - t(0) == timedelta(hours=1)
