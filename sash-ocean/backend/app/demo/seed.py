"""Loads the synthetic demonstration world into the database.

Only synthetic rows are ever deleted/replaced; users, organisations, live data and
analyst work are never touched. Entity IDs are deterministic, so watchlist references
survive a reseed.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.demo.scenario import DemoWorld, build_world, did
from app.geo.routing import ports
from app.models import (
    Alert,
    Contact,
    DataSource,
    EdgeNode,
    EnvironmentObservation,
    Incident,
    OffshoreAsset,
    Organisation,
    Port,
    RiskZone,
    Sensor,
    SensorObservation,
    SyntheticFeedQueue,
    User,
    Vessel,
    Watchlist,
    WatchlistItem,
)
from app.services.ingest import ingest_ais, ingest_sensor_observations

log = logging.getLogger(__name__)

DATA_SOURCES = [
    # key, name, type, licensing, enabled, redistribution, confidence, terms, notes
    ("demo-synthetic-ais", "SASH synthetic AIS generator", "AIS", "SYNTHETIC-DEMO", True, True, 0.95, None,
     "Synthetic demonstration tracks. Not live data."),
    ("demo-synthetic-intel", "SASH synthetic intelligence (incidents, zones, assets)", "INCIDENT", "SYNTHETIC-DEMO",
     True, True, 0.7, None, "Fictional incidents and demonstration risk zones."),
    ("demo-synthetic-environment", "SASH synthetic sea-state generator", "WEATHER", "SYNTHETIC-DEMO", True, True, 0.6,
     None, "Synthetic sea state and visibility."),
    ("aisstream", "AISStream.io (websocket)", "AIS", "PUBLIC-OSINT", False, False, 0.8,
     "https://aisstream.io/", "Requires AIS_API_KEY. Terrestrial AIS; respect provider terms."),
    ("nga-asam", "NGA Anti-Shipping Activity Messages", "INCIDENT", "PUBLIC-GOVERNMENT", False, True, 0.7,
     "https://msi.nga.mil/", "US Government public-domain piracy/ASAM reports."),
    ("ofac-sdn", "OFAC SDN list (vessels)", "SANCTIONS", "PUBLIC-GOVERNMENT", False, True, 0.9,
     "https://ofac.treasury.gov/", "Compliance screening only; not a security-risk input."),
    ("open-meteo-marine", "Open-Meteo Marine API", "WEATHER", "OPEN", False, False, 0.7,
     "https://open-meteo.com/en/terms", "Free for non-commercial use; commercial use requires a subscription key."),
    ("analyst-import", "Analyst / customer import (CSV/GeoJSON)", "INCIDENT", "CUSTOMER", True, False, 0.6, None,
     "Manually curated records; provenance captured per record."),
]


def ensure_reference_data(db: Session) -> None:
    existing = {p.unlocode for p in db.scalars(select(Port)).all()}
    for p in ports().values():
        if p.unlocode not in existing:
            db.add(Port(unlocode=p.unlocode, name=p.name, country=p.country, lat=p.lat, lon=p.lon,
                        position=f"SRID=4326;POINT({p.lon} {p.lat})", aliases=list(p.aliases)))
    have = {s.key for s in db.scalars(select(DataSource)).all()}
    settings = get_settings()
    for key, name, stype, lic, enabled, redist, conf, terms, notes in DATA_SOURCES:
        if key in have:
            continue
        if key == "aisstream":
            enabled = bool(settings.ais_api_key)
        elif key == "nga-asam":
            enabled = settings.nga_asam_enabled
        elif key == "ofac-sdn":
            enabled = settings.ofac_sdn_enabled
        elif key == "open-meteo-marine":
            enabled = settings.open_meteo_enabled
        db.add(DataSource(key=key, name=name, source_type=stype, licensing_category=lic, enabled=enabled,
                          redistribution_allowed=redist, default_confidence=conf, terms_url=terms, notes=notes,
                          health_status="HEALTHY" if lic == "SYNTHETIC-DEMO" else ("UNKNOWN" if enabled else "DISABLED")))
    db.flush()


def _password(env_value: str, label: str) -> str:
    if env_value:
        return env_value
    pw = secrets.token_urlsafe(12) + "A1"
    print(f"[SASH demo] generated {label} password: {pw}  (set the matching SASH_DEMO_*_PASSWORD to control this)")
    return pw


def ensure_demo_users(db: Session) -> dict:
    s = get_settings()
    sash = db.scalar(select(Organisation).where(Organisation.name == "SASH Operations"))
    if sash is None:
        sash = Organisation(name="SASH Operations", tier="ENTERPRISE")
        db.add(sash)
    cust = db.scalar(select(Organisation).where(Organisation.name == "Demo Marine Insurers (DEMO)"))
    if cust is None:
        cust = Organisation(name="Demo Marine Insurers (DEMO)", tier="PROFESSIONAL")
        db.add(cust)
    db.flush()
    users = [
        (s.demo_admin_email, "SASH Administrator", "ADMIN", sash, s.demo_admin_password),
        ("analyst@sash.demo", "Maritime Analyst", "ANALYST", sash, s.demo_analyst_password),
        ("customer@sash.demo", "Demo Insurer (customer)", "CUSTOMER", cust, s.demo_customer_password),
    ]
    for email, name, role, org, pw in users:
        if db.scalar(select(User).where(User.email == email)) is None:
            db.add(User(email=email, full_name=name, role=role, organisation_id=org.id,
                        password_hash=hash_password(_password(pw, role.lower()))))
    db.flush()
    return {"sash": sash, "customer": cust}


def synthetic_age_hours(db: Session) -> float | None:
    newest = db.scalar(select(func.max(Vessel.created_at)).where(Vessel.is_synthetic.is_(True)))
    if newest is None:
        return None
    return (datetime.now(timezone.utc) - newest).total_seconds() / 3600


def clear_synthetic(db: Session) -> None:
    db.execute(delete(SyntheticFeedQueue))
    db.execute(delete(Alert).where(Alert.is_synthetic.is_(True)))
    db.execute(delete(Contact).where(Contact.is_synthetic.is_(True)))
    db.execute(delete(SensorObservation).where(SensorObservation.is_synthetic.is_(True)))
    db.execute(delete(Sensor).where(Sensor.is_synthetic.is_(True)))
    db.execute(delete(EdgeNode).where(EdgeNode.is_synthetic.is_(True)))
    db.execute(delete(Incident).where(Incident.is_synthetic.is_(True)))
    db.execute(delete(RiskZone).where(RiskZone.is_synthetic.is_(True)))
    db.execute(delete(OffshoreAsset).where(OffshoreAsset.is_synthetic.is_(True)))
    db.execute(delete(EnvironmentObservation).where(EnvironmentObservation.is_synthetic.is_(True)))
    # Removing synthetic vessels cascades to their observations, events, voyages and risk history.
    db.execute(delete(Vessel).where(Vessel.is_synthetic.is_(True)))
    db.flush()


def load_world(db: Session, world: DemoWorld) -> dict:
    src = {s.key: s for s in db.scalars(select(DataSource)).all()}
    ais_src, intel_src, env_src = src["demo-synthetic-ais"], src["demo-synthetic-intel"], src["demo-synthetic-environment"]
    now = world.now
    prov = dict(source_id=intel_src.id, source_name="SASH synthetic intelligence (DEMO)", source_type="SYNTHETIC",
                licensing_category="SYNTHETIC-DEMO", retrieved_at=now, is_synthetic=True)

    # Vessels (static identity) — deterministic IDs.
    for v in world.vessels:
        past = [p for p in v.track if p.ts <= world.now]
        if past and past[-1].destination:
            v.destination = past[-1].destination
        db.add(Vessel(
            id=v.id, imo=v.imo, mmsi=v.mmsi, name=v.name, callsign=v.callsign, flag=v.flag, vessel_type=v.vessel_type,
            length_m=v.length_m, beam_m=v.beam_m, draught_m=v.draught_m, freeboard_m=v.freeboard_m,
            year_built=v.year_built, gross_tonnage=v.gross_tonnage, owner=v.owner, operator=v.operator,
            destination=v.destination, eta=v.eta, data_mode="SYNTHETIC", is_synthetic=True,
            field_provenance={"identity": {"source": ais_src.key, "retrieved_at": now.isoformat()}},
        ))
    db.flush()

    # AIS observations: past through the standard ingestion path; future into the feed queue.
    past_msgs, future = [], []
    for v in world.vessels:
        for p in v.track:
            msg = {"mmsi": v.mmsi, "ts": p.ts, "lat": p.lat, "lon": p.lon, "sog": p.sog, "cog": p.cog,
                   "heading": p.heading, "nav_status": p.nav_status, "receiver_class": p.receiver_class,
                   "destination": p.destination}
            if p.ts <= now:
                past_msgs.append(msg)
            else:
                future.append(SyntheticFeedQueue(release_at=p.ts, payload={
                    "kind": "ais", "msg": {**msg, "ts": p.ts.isoformat()}}))
    past_msgs.sort(key=lambda m: m["ts"])
    res = ingest_ais(db, past_msgs, ais_src, now=now)
    db.add_all(future)

    for z in world.zones:
        ring = ",".join(f"{lon} {lat}" for lon, lat in z["ring"])
        db.add(RiskZone(id=z["id"], name=z["name"], category=z["category"], severity=z["severity"],
                        geom=f"SRID=4326;MULTIPOLYGON((({ring})))", effective_start=z["effective_start"],
                        effective_end=z["effective_end"], description=z["description"], confidence=0.7,
                        source_reference="SASH-DEMO-ZONES", **prov))
    for i in world.incidents:
        i = dict(i)
        conf = i.pop("confidence")
        db.add(Incident(position=f"SRID=4326;POINT({i['lon']} {i['lat']})", confidence=conf,
                        original_timestamp=i["occurred_at"], source_reference=f"SASH-DEMO-{str(i['id'])[:8]}",
                        **i, **prov))
    for a in world.assets:
        db.add(OffshoreAsset(position=f"SRID=4326;POINT({a['lon']} {a['lat']})", confidence=0.9, **a, **prov))
    for e in world.edge_nodes:
        db.add(EdgeNode(is_synthetic=True, **e))
    db.flush()
    sensors = {}
    for s in world.sensors:
        sensor = Sensor(position=f"SRID=4326;POINT({s['lon']} {s['lat']})", is_synthetic=True, **s)
        db.add(sensor)
        sensors[s["sensor_code"]] = sensor
    db.flush()
    by_sensor: dict[str, list] = {}
    for o in world.sensor_obs:
        if o["observed_at"] <= now:
            by_sensor.setdefault(o["sensor_code"], []).append({**o})
        else:
            db.add(SyntheticFeedQueue(release_at=o["observed_at"], payload={
                "kind": "sensor", "sensor_code": o["sensor_code"],
                "obs": {**{k: v for k, v in o.items() if k != "sensor_code"}, "observed_at": o["observed_at"].isoformat()}}))
    for code, obs in by_sensor.items():
        ingest_sensor_observations(db, sensors[code], obs, edge_node_id=sensors[code].edge_node_id, now=now)
    env_rows = [dict(observed_at=e["observed_at"], lat=e["lat"], lon=e["lon"],
                     position=f"SRID=4326;POINT({e['lon']} {e['lat']})", wave_height_m=e["wave_height_m"],
                     visibility_km=e["visibility_km"], wind_speed_kn=e["wind_speed_kn"], source_id=env_src.id,
                     source_name=env_src.name, source_type="WEATHER", licensing_category="SYNTHETIC-DEMO",
                     retrieved_at=now, original_timestamp=e["observed_at"], confidence=0.6, is_synthetic=True)
                for e in world.environment]
    db.execute(EnvironmentObservation.__table__.insert(), env_rows)
    db.flush()
    return {"ais_observations": res.accepted, "future_queue": len(future), "incidents": len(world.incidents),
            "zones": len(world.zones), "assets": len(world.assets), "sensor_observations": len(world.sensor_obs)}


def ensure_watchlists(db: Session, world: DemoWorld, org: Organisation) -> None:
    for w in world.watchlists:
        wid = did("watchlist", w["key"])
        wl = db.get(Watchlist, wid)
        if wl is not None:
            continue
        wl = Watchlist(id=wid, organisation_id=org.id, name=w["name"], description=w["description"])
        db.add(wl)
        db.flush()
        for kind, ref in w["items"]:
            if kind == "VESSEL":
                db.add(WatchlistItem(watchlist_id=wid, item_type="VESSEL", vessel_id=ref))
            elif kind == "FLEET":
                db.add(WatchlistItem(watchlist_id=wid, item_type="FLEET", fleet_operator=ref, label=ref))
            elif kind == "AREA":
                ring = ",".join(f"{lon} {lat}" for lat, lon in ref)
                db.add(WatchlistItem(watchlist_id=wid, item_type="AREA", area=f"SRID=4326;POLYGON(({ring}))",
                                     label="Northern Mozambique operating area"))
    db.flush()


SEED_LOCK = 5_417_001


def seed_demo(db: Session, now: datetime | None = None, force: bool = False, run_analytics_after: bool = True) -> dict:
    """Seed under a session-level advisory lock so API and worker never seed concurrently."""
    got = db.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": SEED_LOCK}).scalar()
    if not got:
        return {"skipped": True, "reason": "another process is seeding"}
    try:
        return _seed_demo(db, now, force, run_analytics_after)
    finally:
        db.rollback()
        db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": SEED_LOCK})
        db.commit()


def _seed_demo(db: Session, now: datetime | None, force: bool, run_analytics_after: bool) -> dict:
    settings = get_settings()
    ensure_reference_data(db)
    orgs = ensure_demo_users(db)
    db.commit()
    age = synthetic_age_hours(db)
    if not force and age is not None and age < settings.demo_reseed_if_older_than_hours:
        log.info("synthetic demo data is %.1f h old; not reseeding", age)
        return {"skipped": True, "age_hours": round(age, 1)}
    now = (now or datetime.now(timezone.utc)).replace(second=0, microsecond=0)
    log.info("generating synthetic demonstration world at %s", now.isoformat())
    world = build_world(now)
    clear_synthetic(db)
    stats = load_world(db, world)
    ensure_watchlists(db, world, orgs["customer"])
    db.commit()
    db.execute(text("ANALYZE"))
    if run_analytics_after:
        from app.services.pipeline import run_analytics

        stats["analytics"] = run_analytics(db, now=now, kind="DEMO_SEED")
    stats["scenario"] = world.scenario_notes
    return stats


def release_feed(db: Session, now: datetime | None = None) -> dict:
    """Release queued synthetic messages whose time has come (simulated live feed)."""
    now = now or datetime.now(timezone.utc)
    rows = db.scalars(select(SyntheticFeedQueue).where(SyntheticFeedQueue.release_at <= now)
                      .order_by(SyntheticFeedQueue.release_at).limit(5000)).all()
    if not rows:
        return {"ais": 0, "sensor": 0}
    src = db.scalar(select(DataSource).where(DataSource.key == "demo-synthetic-ais"))
    ais = [r.payload["msg"] for r in rows if r.payload.get("kind") == "ais"]
    res = ingest_ais(db, ais, src, now=now) if ais else None
    sensor_count = 0
    by_sensor: dict[str, list] = {}
    for r in rows:
        if r.payload.get("kind") == "sensor":
            by_sensor.setdefault(r.payload["sensor_code"], []).append(r.payload["obs"])
    for code, obs in by_sensor.items():
        sensor = db.scalar(select(Sensor).where(Sensor.sensor_code == code))
        if sensor:
            sensor_count += ingest_sensor_observations(db, sensor, obs, sensor.edge_node_id, now=now).accepted
    db.execute(delete(SyntheticFeedQueue).where(SyntheticFeedQueue.id.in_([r.id for r in rows])))
    # Keep the demo edge node looking alive.
    for e in db.scalars(select(EdgeNode).where(EdgeNode.is_synthetic.is_(True))).all():
        e.last_sync_at = now
    db.commit()
    return {"ais": res.accepted if res else 0, "sensor": sensor_count}


def feed_remaining_hours(db: Session) -> float:
    last = db.scalar(select(func.max(SyntheticFeedQueue.release_at)))
    if last is None:
        return 0.0
    return max(0.0, (last - datetime.now(timezone.utc)) / timedelta(hours=1))
