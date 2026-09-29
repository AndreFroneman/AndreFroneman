"""SASH Ocean synthetic demonstration world.

EVERYTHING in this module is synthetic and is stored with is_synthetic=true,
data_mode=SYNTHETIC and licensing category SYNTHETIC-DEMO. Vessel names, identifiers,
operators, incidents, zones and assets are fictional. Synthetic IMO numbers use the
1xxxxxx range (outside the ship-number range in use) and synthetic MMSIs use the
pattern <MID>99xxxx; they may nevertheless coincide with real identifiers and must
never be correlated with live data (the platform enforces this separation).

Flagship scenario (investor / customer demonstration)
------------------------------------------------------
Crude tanker AURORA MERIDIAN sails Yanbu (Red Sea) → Bab-el-Mandeb → Gulf of Aden →
Somali Basin → Mozambique Channel → Durban:
  1. enters elevated-risk areas (Red Sea, Gulf of Aden, Somali Basin)
  2. a piracy-related incident was reported near the route the previous day
  3. AIS reporting gap (3h14m) in the Somali Basin while other vessels kept reporting
  4. route deviation offshore of the modelled lane (~110 km)
  5. a piracy attempt is reported ~84 km from the vessel shortly after AIS resumes
  6. SASH Risk Indicator rises and alerts are generated for the "Insured Vessels" watchlist
  7. vessel exits the threat areas; 8. risk decreases on approach to Durban.
"""
from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.analytics.identity import imo_with_check_digit
from app.demo.trackgen import Sail, Stay, TrackPoint, km_along, leg_length_km, position_along, simulate
from app.geo.core import destination_point, haversine_km
from app.geo.routing import ports, route_between_points, route_between_ports

DEMO_NS = uuid.UUID("5a5b0000-0000-4000-8000-00000000de30")


def did(*parts) -> uuid.UUID:
    return uuid.uuid5(DEMO_NS, ":".join(str(p) for p in parts))


MID = {"LR": "636", "MH": "538", "PA": "351", "SG": "563", "MT": "215", "GR": "240", "ZA": "601", "MZ": "650",
       "KE": "634", "TZ": "674", "SO": "666", "YE": "473", "AE": "470", "IN": "419", "AO": "603", "NA": "659",
       "BS": "311", "CY": "209", "MU": "645", "SA": "403"}


@dataclass
class DemoVessel:
    key: str
    name: str
    flag: str
    vessel_type: str
    operator: str
    owner: str
    length_m: float
    beam_m: float
    draught_m: float
    freeboard_m: float | None
    year_built: int
    gross_tonnage: int
    destination: str | None
    mmsi_flag: str | None = None  # MID source (defaults to flag) — lets us inject mismatches
    has_imo: bool = True
    track: list[TrackPoint] = field(default_factory=list)
    eta: datetime | None = None
    imo: str | None = None
    mmsi: str | None = None
    callsign: str | None = None

    @property
    def id(self) -> uuid.UUID:
        return did("vessel", self.key)


@dataclass
class DemoWorld:
    now: datetime
    vessels: list[DemoVessel]
    incidents: list[dict]
    zones: list[dict]
    assets: list[dict]
    sensors: list[dict]
    edge_nodes: list[dict]
    sensor_obs: list[dict]
    environment: list[dict]
    watchlists: list[dict]
    scenario_notes: dict


def _p(code: str) -> tuple[float, float]:
    p = ports()[code]
    return p.lat, p.lon


def _route(a: str, b: str):
    return route_between_ports(a, b)


def _dn(code: str) -> str:
    return ports()[code].name.upper()


def build_world(now: datetime, seed: int = 42) -> DemoWorld:
    rng = random.Random(seed)
    now = now.replace(second=0, microsecond=0)
    end = now + timedelta(hours=24)  # future part feeds the simulated live AIS stream
    start_window = now - timedelta(days=14)
    notes: dict = {}

    def V(key, name, flag, vtype, operator, length, beam, draught, freeboard, year, gt, dest, **kw) -> DemoVessel:
        return DemoVessel(key, name, flag, vtype, operator + " (DEMO)", operator.split()[0] + " Holdings (DEMO)",
                          length, beam, draught, freeboard, year, gt, dest, **kw)

    vessels: dict[str, DemoVessel] = {}

    # ---------------------------------------------------------------------------------
    # 1. Flagship tanker
    # ---------------------------------------------------------------------------------
    tanker = V("aurora", "AURORA MERIDIAN", "LR", "crude oil tanker", "Meridian Tankers", 274, 48, 15.8, 8.4,
               2012, 81_500, "ZA DUR")
    route = _route("SAYNB", "ZADUR")
    speed = 13.5
    length = leg_length_km(route)
    arrival = now + timedelta(hours=14)
    depart = arrival - timedelta(hours=length / (speed * 1.852))
    gap_km = km_along(route, 7.6, 51.8)
    tanker_legs = [
        Stay(*_p("SAYNB"), hours=10),
        Sail(route, speed, destination="ZA DUR", gap_at_km=gap_km, gap_minutes=194, deviation_at_km=gap_km - 25,
             deviation_peak_km=110, deviation_ramp_h=3, deviation_plateau_h=6, deviation_side=-1),
        Stay(*_p("ZADUR"), hours=48),
    ]
    tanker.track = simulate(tanker_legs, depart - timedelta(hours=10), end, rng)
    tanker.eta = arrival
    vessels["aurora"] = tanker
    gap_idx = next(
        i for i in range(1, len(tanker.track))
        if (tanker.track[i].ts - tanker.track[i - 1].ts).total_seconds() > 150 * 60
    )
    t_gap_start, t_gap_end = tanker.track[gap_idx - 1].ts, tanker.track[gap_idx].ts
    gap_lat, gap_lon = position_along(route, gap_km)
    notes.update(tanker_depart=depart.isoformat(), gap_start=t_gap_start.isoformat(), gap_location=[gap_lat, gap_lon])

    def tanker_pos(t: datetime) -> TrackPoint:
        return min(tanker.track, key=lambda p: abs((p.ts - t).total_seconds()))

    def when_tanker_near(lat: float, lon: float) -> TrackPoint:
        return min(tanker.track, key=lambda p: haversine_km(p.lat, p.lon, lat, lon))

    # ---------------------------------------------------------------------------------
    # 2. Peers that keep reporting near the tanker's AIS gap (coverage evidence)
    # ---------------------------------------------------------------------------------
    gap_mid = t_gap_start + timedelta(minutes=97)

    def schedule_through(route_pts, speed_kn, lat, lon, at: datetime) -> datetime:
        km = km_along(route_pts, lat, lon)
        return at - timedelta(hours=km / (speed_kn * 1.852))

    r = _route("ZADUR", "DJJIB")
    djib = V("djibouti_star", "DJIBOUTI STAR", "SG", "container ship", "Horn Feeder Lines", 222, 32, 11.5, 12.0,
             2015, 41_000, "DJIBOUTI")
    dep = schedule_through(r, 15, gap_lat, gap_lon, gap_mid)
    djib.track = simulate([Stay(*_p("ZADUR"), hours=20), Sail(r, 15, destination=_dn("DJJIB")), Stay(*_p("DJJIB"), hours=30), Sail(_route("DJJIB", "SAJED"), 15, destination=_dn("SAJED")),
                           Stay(*_p("SAJED"), hours=40)], dep - timedelta(hours=20), end, rng)
    vessels["djibouti_star"] = djib

    r = _route("AEJEA", "ZADUR")
    indigo = V("indigo", "INDIGO HORIZON", "MH", "container ship", "Indigo Ocean Carriers", 300, 48, 14.0, 15.0, 2018,
               95_000, "DURBAN")
    dep = schedule_through(r, 16, 6.0, 51.5, gap_mid)
    indigo.track = simulate([Stay(*_p("AEJEA"), hours=18), Sail(r, 16, destination=_dn("ZADUR")), Stay(*_p("ZADUR"), hours=40)], dep - timedelta(hours=18), end, rng)
    vessels["indigo"] = indigo

    # ---------------------------------------------------------------------------------
    # 3. Other behaviours
    # ---------------------------------------------------------------------------------
    # Fishing vessel loitering in the Gulf of Aden near the lane (lower confidence: fishing).
    sea_hawk = V("sea_hawk", "SEA HAWK 7", "YE", "fishing", "Aden Fisheries", 38, 8, 3.5, 1.8, 1998, 290, "ADEN",
                 has_imo=False)
    goa_route = route_between_points((12.75, 44.95), (12.55, 47.6))
    lo_start = now - timedelta(days=3, hours=6)
    sea_hawk.track = simulate([Stay(*_p("YEADE"), hours=8), Sail(goa_route, 8, loiter_at_km=leg_length_km(goa_route) - 5,
                               loiter_hours=9, loiter_speed_kn=1.3, loiter_nav="Engaged in fishing", noise_km=0.4),
                               Sail(list(reversed(goa_route)), 8), Stay(*_p("YEADE"), hours=400)], lo_start - timedelta(hours=8), end, rng)
    vessels["sea_hawk"] = sea_hawk

    # Dhow with a gap near the Somali coast where no other vessels report (coverage unknown).
    al_noor = V("al_noor", "AL NOOR", "SO", "dhow", "Bari Coastal Traders", 32, 8, 3.0, 1.5, 2004, 250, "MOGADISHU",
                has_imo=False)
    coast = [(11.2, 51.35), (9.8, 51.0), (8.0, 50.2), (6.3, 49.2), (4.5, 48.3), (2.8, 46.6), (2.0, 45.45)]
    al_noor.track = simulate([Stay(11.28, 49.2, hours=6), Sail(route_between_points((11.28, 49.2), (11.2, 51.35))[:-1] + coast, 7,
                              gap_at_km=520, gap_minutes=330, noise_km=0.5), Stay(*_p("SOMGQ"), hours=400)],
                             now - timedelta(days=5, hours=2), end, rng)
    vessels["al_noor"] = al_noor

    # Bulk carrier with an unexpected stop mid-channel.
    r = _route("MZBEW", "TZDAR")
    zambezi = V("zambezi", "ZAMBEZI CHIEF", "MT", "bulk carrier", "Zambezi Bulk", 190, 32, 12.2, 6.5, 2009, 32_000, "DAR ES SALAAM")
    zambezi.track = simulate([Stay(*_p("MZBEW"), hours=16), Sail(r, 11.5, destination=_dn("TZDAR"), stop_at_km=leg_length_km(r) * 0.42, stop_hours=3.5,
                              extra={"nuc": True}), Stay(*_p("TZDAR"), hours=60), Sail(_route("TZDAR", "KEMBA"), 11.5, destination=_dn("KEMBA")),
                              Stay(*_p("KEMBA"), hours=300)], now - timedelta(days=6), end, rng)
    vessels["zambezi"] = zambezi

    # Identity inconsistency: declared flag PA but MMSI MID of Liberia.
    r = _route("TZDAR", "AEJEA")
    northern = V("northern", "NORTHERN LIGHT", "PA", "product tanker", "Northern Light Shipping", 183, 32, 11.0, 7.2,
                 2007, 29_000, "JEBEL ALI", mmsi_flag="LR")
    northern.track = simulate([Stay(*_p("TZDAR"), hours=12), Sail(r, 12.5, destination=_dn("AEJEA")), Stay(*_p("AEJEA"), hours=48)],
                              now - timedelta(days=5, hours=20), end, rng)
    vessels["northern"] = northern

    # Offshore assets: authorised supply vessel and an unauthorised fishing vessel near Kestrel FPSO.
    kestrel = (-11.30, 41.35)
    supporter = V("kestrel_supporter", "KESTREL SUPPORTER", "MZ", "offshore supply", "Kestrel Marine Services", 78, 17,
                  6.0, 2.2, 2016, 3_400, "KESTREL FPSO")
    stand = destination_point(*kestrel, 45, 0.6)
    pemba_to_fpso = [_p("MZPOL"), stand]
    supporter.track = simulate([Stay(*_p("MZPOL"), hours=20), Sail(pemba_to_fpso, 11, noise_km=0.2),
                                Stay(*stand, hours=500, nav_status="Restricted manoeuvrability", drift_km=0.25)],
                               now - timedelta(days=4), end, rng)
    vessels["kestrel_supporter"] = supporter

    pelagic = V("pelagic", "PELAGIC DAWN", "MZ", "fishing", "Pelagic Harvest", 42, 9, 4.0, 1.9, 2001, 380, None,
                has_imo=False)
    loiter_pt = destination_point(*kestrel, 40, 7.0)
    approach = [(-10.2, 42.2), loiter_pt]
    pelagic.track = simulate([Stay(-10.2, 42.2, hours=2, nav_status="Engaged in fishing", drift_km=2.0),
                              Sail(approach, 8, loiter_at_km=leg_length_km(approach) - 0.5, loiter_hours=30,
                                   loiter_speed_kn=1.5, loiter_nav="Engaged in fishing", noise_km=0.3)],
                             now - timedelta(hours=14), end, rng)
    vessels["pelagic"] = pelagic

    # ---------------------------------------------------------------------------------
    # 4. Normal traffic (baseline, mostly low risk)
    # ---------------------------------------------------------------------------------
    def normal(key, name, flag, vtype, op, dims, dest, legs, start, loop=False, **kw):
        v = V(key, name, flag, vtype, op, *dims, dest, **kw)
        v.track = simulate(legs, start, end, rng, loop=loop)
        vessels[key] = v

    normal("cape_sentinel", "CAPE SENTINEL", "SG", "container ship", "Cape Container Line",
           (260, 40, 12.8, 13.0, 2014, 66_000), "PORT LOUIS",
           [Stay(*_p("ZADUR"), hours=26), Sail(_route("ZADUR", "MUPLU"), 17, destination=_dn("MUPLU")), Stay(*_p("MUPLU"), hours=22),
            Sail(_route("MUPLU", "ZADUR"), 17, destination=_dn("ZADUR"))], now - timedelta(days=15), loop=True)
    normal("karoo", "KAROO STAR", "GR", "bulk carrier", "Karoo Dry Bulk", (229, 32, 14.2, 6.8, 2011, 43_000),
           "SINGAPORE", [Stay(*_p("ZARCB"), hours=30), Sail(_route("ZARCB", "SGSIN"), 12.8, destination=_dn("SGSIN")), Stay(*_p("SGSIN"), hours=48)],
           now - timedelta(days=13))
    normal("table_bay", "TABLE BAY TRADER", "ZA", "general cargo", "Table Bay Shipping", (142, 22, 8.5, 4.5, 2006, 9_800),
           "LUANDA", [Stay(*_p("ZACPT"), hours=20), Sail(_route("ZACPT", "NAWVB"), 12, destination=_dn("NAWVB")), Stay(*_p("NAWVB"), hours=30),
                      Sail(_route("NAWVB", "AOLAD"), 12, destination=_dn("AOLAD")), Stay(*_p("AOLAD"), hours=80)], now - timedelta(days=9))
    normal("namib", "NAMIB SPIRIT", "BS", "product tanker", "Meridian Tankers", (183, 32, 11.2, 7.0, 2013, 30_000),
           "CAPE TOWN", [Stay(*_p("AOLAD"), hours=36), Sail(_route("AOLAD", "ZACPT"), 12.5, destination=_dn("ZACPT")), Stay(*_p("ZACPT"), hours=60)],
           now - timedelta(days=6))
    normal("atlantic_orca", "ATLANTIC ORCA", "GR", "crude oil tanker", "Orca Tankers", (250, 44, 15.0, 8.0, 2010, 62_000),
           "ROTTERDAM", [Stay(*_p("ZASDB"), hours=24), Sail(_route("ZASDB", "NLRTM"), 13, destination=_dn("NLRTM")), Stay(*_p("NLRTM"), hours=40)],
           now - timedelta(days=12))
    normal("red_sea_pioneer", "RED SEA PIONEER", "SA", "container ship", "Red Sea Express", (170, 27, 9.5, 9.0, 2012, 17_000),
           "JEDDAH", [Stay(*_p("SAJED"), hours=20), Sail(_route("SAJED", "DJJIB"), 14, destination=_dn("DJJIB")), Stay(*_p("DJJIB"), hours=18),
                      Sail(_route("DJJIB", "SAJED"), 14, destination=_dn("SAJED"))], now - timedelta(days=15), loop=True)
    normal("aden_express", "ADEN EXPRESS", "YE", "general cargo", "Gulf of Aden Lines", (110, 18, 6.5, 3.5, 1999, 5_200),
           "BERBERA", [Stay(*_p("YEADE"), hours=30), Sail(_route("YEADE", "SOBBO"), 10, destination=_dn("SOBBO")), Stay(*_p("SOBBO"), hours=24),
                       Sail(_route("SOBBO", "YEADE"), 10, destination=_dn("YEADE"))], now - timedelta(days=15), loop=True)
    normal("gulf_voyager", "GULF VOYAGER", "CY", "lng carrier", "Gulf Gas Transport", (290, 46, 12.0, 12.0, 2017, 110_000),
           "MUMBAI", [Stay(*_p("AEJEA"), hours=30), Sail(_route("AEJEA", "INNSA"), 16, destination=_dn("INNSA")), Stay(*_p("INNSA"), hours=36),
                      Sail(_route("INNSA", "AEJEA"), 16, destination=_dn("AEJEA"))], now - timedelta(days=12), loop=True)
    normal("moz_queen", "MOZAMBIQUE QUEEN", "MZ", "ro-ro", "Mozambique Coastal", (150, 24, 7.5, 9.5, 2008, 14_000),
           "DURBAN", [Stay(*_p("MZNAC"), hours=24), Sail(_route("MZNAC", "ZADUR"), 14, destination=_dn("ZADUR")), Stay(*_p("ZADUR"), hours=36),
                      Sail(_route("ZADUR", "MZNAC"), 14, destination=_dn("MZNAC"))], now - timedelta(days=9), loop=True)
    normal("agulhas_current", "AGULHAS CURRENT", "ZA", "tug", "Agulhas Offshore Services", (32, 11, 4.8, 1.5, 2015, 480),
           "AGULHAS PLATFORM", [Stay(*_p("ZAMZY"), hours=40), Sail([_p("ZAMZY"), (-35.22, 22.87)], 10, noise_km=0.2),
                                Stay(-35.22, 22.87, hours=30, drift_km=0.3, nav_status="Restricted manoeuvrability"),
                                Sail([(-35.22, 22.87), _p("ZAMZY")], 10, noise_km=0.2)], now - timedelta(days=15), loop=True, has_imo=False)
    normal("maputo_bay", "MAPUTO BAY", "MZ", "tug", "Maputo Port Services", (28, 10, 4.2, 1.4, 2011, 350),
           "MAPUTO", [Stay(*_p("MZMPM"), hours=500)], now - timedelta(days=14), has_imo=False)
    normal("ea_link", "EAST AFRICA LINK", "KE", "container ship", "East Africa Feeder", (140, 23, 8.2, 8.5, 2005, 10_500),
           "DAR ES SALAAM", [Stay(*_p("KEMBA"), hours=22), Sail(_route("KEMBA", "TZDAR"), 13, destination=_dn("TZDAR")), Stay(*_p("TZDAR"), hours=22),
                             Sail(_route("TZDAR", "KEMBA"), 13, destination=_dn("KEMBA"))], now - timedelta(days=15), loop=True)
    normal("coral_trader", "CORAL TRADER", "MU", "container ship", "Coral Island Lines", (175, 27, 9.8, 10.0, 2010, 18_000),
           "DURBAN", [Stay(*_p("MUPLU"), hours=24), Sail(_route("MUPLU", "MGTMM"), 14, destination=_dn("MGTMM")), Stay(*_p("MGTMM"), hours=30),
                      Sail(_route("MGTMM", "ZADUR"), 14, destination=_dn("ZADUR")), Stay(*_p("ZADUR"), hours=60)], now - timedelta(days=8))
    normal("socotra_wind", "SOCOTRA WIND", "MH", "bulk carrier", "Socotra Bulk", (199, 32, 12.5, 6.4, 2014, 36_000),
           "KARACHI", [Stay(*_p("EGSUZ"), hours=20), Sail(_route("EGSUZ", "PKKHI"), 12.5, destination=_dn("PKKHI")), Stay(*_p("PKKHI"), hours=60)],
           now - timedelta(days=11))

    # ---------------------------------------------------------------------------------
    # Identities
    # ---------------------------------------------------------------------------------
    for n, v in enumerate(vessels.values(), start=1):
        mid = MID[v.mmsi_flag or v.flag]
        v.mmsi = f"{mid}99{1000 + n * 37:04d}"
        v.imo = imo_with_check_digit(f"1{10000 + n * 211:05d}") if v.has_imo else None
        v.callsign = f"S{v.flag}{n:03d}"

    # ---------------------------------------------------------------------------------
    # Incidents (scenario-driven + background)
    # ---------------------------------------------------------------------------------
    incidents: list[dict] = []

    def inc(key, when, lat, lon, category, title, narrative, verification="UNVERIFIED", conf=0.6, **kw):
        incidents.append(dict(
            id=did("incident", key), occurred_at=when, reported_at=kw.pop("reported_at", when + timedelta(minutes=45)),
            lat=round(lat, 4), lon=round(lon, 4), category=category, title=title, narrative=narrative,
            verification_status=verification, confidence=conf, **kw,
        ))

    # (a) Piracy-related suspicious approach in the Gulf of Aden the day before the tanker passes.
    tp = when_tanker_near(12.75, 47.9)
    lat, lon = destination_point(tp.lat, tp.lon, 195, 48)
    inc("goa_approach", tp.ts - timedelta(hours=20), lat, lon, "suspicious_approach",
        "Skiff with ladder approached bulk carrier (synthetic)",
        "Synthetic report: a skiff with a visible ladder approached a transiting bulk carrier to 0.5 nm. "
        "Vessel increased speed and the skiff withdrew. No boarding.", "PARTIALLY_VERIFIED", 0.7,
        affected_vessel_name="MV SYNTHETIC BULKER", affected_vessel_type="bulk carrier", boarding=False, hijacking=False,
        weapons_reported="ladder sighted")
    # (b) Drone attack in the southern Red Sea six days before the tanker passes.
    tp = when_tanker_near(14.8, 41.95)
    lat, lon = destination_point(tp.lat, tp.lon, 270, 55)
    inc("rs_drone", tp.ts - timedelta(days=6), lat, lon, "drone_attack",
        "Uncrewed aerial vehicle struck merchant vessel (synthetic)",
        "Synthetic report: a one-way attack drone struck the superstructure of a merchant vessel. Minor damage, no injuries.",
        "PARTIALLY_VERIFIED", 0.75, affected_vessel_name="MV SYNTHETIC CARRIER", affected_vessel_type="container ship",
        injuries=0, fatalities=0, weapons_reported="UAV")
    # (c) Hijacking of a dhow in the Somali Basin four days before the tanker's AIS gap.
    lat, lon = destination_point(gap_lat, gap_lon, 265, 115)
    inc("som_hijack", t_gap_start - timedelta(days=4), lat, lon, "hijacking",
        "Fishing dhow hijacked by armed group (synthetic)",
        "Synthetic report: an armed group boarded and took control of a fishing dhow. Crew of 12 held. Dhow may be "
        "used as a mother ship.", "VERIFIED", 0.85, affected_vessel_name="FV SYNTHETIC DHOW", affected_vessel_type="dhow",
        boarding=True, hijacking=True, hostages=12, weapons_reported="automatic weapons")
    # (d) The flagship event: piracy attempt reported ~84 km from the tanker after AIS resumes.
    t_inc = t_gap_end + timedelta(minutes=140)
    tp = tanker_pos(t_inc)
    lat, lon = destination_point(tp.lat, tp.lon, 245, 84)
    inc("som_piracy_attempt", t_inc, lat, lon, "piracy",
        "Attempted boarding of product tanker by two skiffs (synthetic)",
        "Synthetic report: two skiffs with armed persons approached a product tanker and attempted to board using "
        "ladders. Shots fired. Vessel conducted evasive manoeuvres and crew mustered in the citadel. Attack aborted.",
        "PARTIALLY_VERIFIED", 0.8, reported_at=t_inc + timedelta(minutes=25), affected_vessel_name="MT SYNTHETIC PRODUCT",
        affected_vessel_type="product tanker", boarding=False, hijacking=False, weapons_reported="small arms, ladders",
        injuries=0, fatalities=0)
    notes["flagship_incident_time"] = t_inc.isoformat()

    background = [
        # key, centre, radius_km, bearing range (seaward), categories
        ("rs", (14.3, 42.0), 90, (0, 360), ["missile_attack", "drone_attack", "maritime_conflict", "drone_attack"]),
        ("bab", (12.4, 44.2), 60, (90, 200), ["suspicious_approach", "suspicious_approach"]),
        ("goa", (12.9, 48.2), 110, (0, 360), ["piracy", "suspicious_approach", "piracy"]),
        ("som", (4.5, 51.0), 220, (0, 360), ["piracy", "hijacking", "kidnapping"]),
        ("cabo", (-11.8, 40.95), 50, (45, 135), ["armed_robbery", "suspicious_approach", "infrastructure_incident"]),
        ("durban", (-29.93, 31.12), 10, (60, 150), ["armed_robbery"]),
        ("luanda", (-8.72, 13.12), 10, (250, 360), ["armed_robbery", "armed_robbery"]),
        ("dar", (-6.84, 39.42), 8, (40, 120), ["cargo_theft"]),
        ("maputo", (-25.85, 33.0), 12, (45, 135), ["armed_robbery"]),
        ("goo", (25.2, 57.2), 70, (90, 200), ["sabotage", "maritime_conflict"]),
    ]
    titles = {
        "missile_attack": "Anti-ship missile impact reported near merchant vessel",
        "drone_attack": "Drone attack reported against merchant vessel",
        "maritime_conflict": "Vessel harassed by armed small craft",
        "suspicious_approach": "Suspicious approach by high-speed craft",
        "piracy": "Piracy attack: skiffs fired upon merchant vessel",
        "hijacking": "Fishing vessel hijacked",
        "kidnapping": "Crew members kidnapped from fishing vessel",
        "armed_robbery": "Armed robbers boarded anchored vessel",
        "infrastructure_incident": "Unauthorised craft near offshore infrastructure",
        "cargo_theft": "Theft of cargo from vessel at anchorage",
        "sabotage": "Limpet-type device reported on vessel hull",
    }
    ver = ["UNVERIFIED", "PARTIALLY_VERIFIED", "VERIFIED"]
    for key, (clat, clon), rad, (b0, b1), cats in background:
        for k, cat in enumerate(cats):
            lat, lon = destination_point(clat, clon, rng.uniform(b0, b1), rng.uniform(0.2, 1.0) * rad)
            when = now - timedelta(days=rng.uniform(8, 85), hours=rng.uniform(0, 23))
            inc(f"bg-{key}-{k}", when, lat, lon, cat, titles[cat] + " (synthetic)",
                f"Synthetic background incident for demonstration ({cat.replace('_', ' ')}).", rng.choice(ver),
                round(rng.uniform(0.45, 0.85), 2), boarding=cat in {"armed_robbery", "hijacking", "kidnapping", "cargo_theft"},
                hijacking=cat == "hijacking")
    # Historical incident involving one of our vessels (feeds the vessel-profile rule).
    inc("cape_sentinel_theft", now - timedelta(days=46), -29.97, 31.16, "cargo_theft",
        "Ship stores stolen at Durban anchorage (synthetic)", "Synthetic report: stores stolen during anchorage.",
        "VERIFIED", 0.8, affected_vessel_id=vessels["cape_sentinel"].id, affected_vessel_name="CAPE SENTINEL",
        imo=vessels["cape_sentinel"].imo, mmsi=vessels["cape_sentinel"].mmsi, boarding=True)
    inc("collision_cpt", now - timedelta(days=30), -33.98, 17.95, "collision", "Collision between fishing vessels (synthetic)",
        "Synthetic safety incident (non-security).", "VERIFIED", 0.9)
    inc("grounding_rcb", now - timedelta(days=52), -28.86, 32.2, "grounding", "Bulk carrier grounded in approach (synthetic)",
        "Synthetic safety incident (non-security).", "VERIFIED", 0.9)

    # ---------------------------------------------------------------------------------
    # Risk zones (demonstration assessments — not official designations)
    # ---------------------------------------------------------------------------------
    def zone(key, name, category, severity, ring, desc):
        return dict(id=did("zone", key), name=name, category=category, severity=severity, ring=ring,
                    effective_start=now - timedelta(days=180), effective_end=None, description=desc)

    zones = [
        zone("rs_central", "Central Red Sea — elevated conflict risk (DEMO)", "maritime_conflict", "MODERATE",
             [(36.5, 22.0), (40.2, 22.0), (42.2, 16.5), (39.4, 16.5), (36.5, 19.5), (36.5, 22.0)],
             "Synthetic demonstration zone. Spillover risk from regional maritime conflict."),
        zone("rs_south", "Southern Red Sea & Bab-el-Mandeb — conflict threat area (DEMO)", "maritime_conflict", "HIGH",
             [(39.4, 16.5), (42.2, 16.5), (43.6, 12.9), (43.6, 12.4), (43.2, 12.3), (40.5, 14.8), (39.4, 16.5)],
             "Synthetic demonstration zone. Drone and missile attacks against merchant shipping reported."),
        zone("goa", "Gulf of Aden — piracy & conflict threat area (DEMO)", "piracy", "HIGH",
             [(43.6, 12.9), (45.5, 13.4), (49.0, 14.3), (53.5, 15.6), (53.5, 12.6), (51.4, 11.9), (49.0, 11.3),
              (45.0, 10.6), (43.6, 11.5), (43.6, 12.9)],
             "Synthetic demonstration zone. Recent piracy attempts and suspicious approaches."),
        zone("somali_basin", "Somali Basin — piracy threat area (DEMO)", "piracy", "ELEVATED",
             [(51.4, 11.9), (53.5, 12.6), (58.0, 10.0), (58.0, 2.0), (52.0, -3.0), (42.5, -3.0), (41.5, -1.5),
              (45.0, 2.0), (48.0, 5.0), (50.2, 8.0), (51.0, 10.5), (51.4, 11.9)],
             "Synthetic demonstration zone. Resurgent piracy: hijacked dhows used as mother ships."),
        zone("moz_north", "Northern Mozambique Channel — elevated security risk (DEMO)", "maritime_conflict", "MODERATE",
             [(40.3, -10.0), (43.0, -10.0), (43.0, -14.8), (40.3, -14.8), (40.3, -10.0)],
             "Synthetic demonstration zone. Insurgency-related maritime incidents near the coast."),
        zone("goo", "Gulf of Oman & Hormuz approaches — conflict threat area (DEMO)", "maritime_conflict", "ELEVATED",
             [(55.8, 26.9), (57.2, 27.0), (59.9, 25.2), (59.9, 22.8), (58.8, 22.8), (56.3, 24.6), (55.8, 26.0), (55.8, 26.9)],
             "Synthetic demonstration zone. State-linked seizures and limpet-device incidents reported."),
        zone("durban_anch", "Durban outer anchorage — opportunistic theft (DEMO)", "armed_robbery", "LOW",
             [(31.02, -29.82), (31.28, -29.82), (31.28, -30.05), (31.02, -30.05), (31.02, -29.82)],
             "Synthetic demonstration zone. Occasional theft of stores at anchor."),
        zone("luanda_anch", "Luanda anchorage — armed robbery (DEMO)", "armed_robbery", "LOW",
             [(12.95, -8.6), (13.25, -8.6), (13.25, -8.9), (12.95, -8.9), (12.95, -8.6)],
             "Synthetic demonstration zone. Armed robbery against anchored vessels."),
    ]

    # ---------------------------------------------------------------------------------
    # Offshore assets, edge node, sensors
    # ---------------------------------------------------------------------------------
    def asset(key, name, op, atype, lat, lon, sec, mon, authorised):
        return dict(id=did("asset", key), name=name, operator=op, asset_type=atype, lat=lat, lon=lon,
                    security_radius_km=sec, monitoring_radius_km=mon, authorised_mmsis=authorised)

    assets = [
        asset("kestrel", "Kestrel FPSO (DEMO)", "Kestrel Energy (DEMO)", "FPSO", kestrel[0], kestrel[1], 1.0, 12.0,
              [supporter.mmsi]),
        asset("agulhas", "Agulhas Gas Platform (DEMO)", "Agulhas Offshore (DEMO)", "oil_rig", -35.25, 22.9, 0.5, 10.0,
              [vessels["agulhas_current"].mmsi]),
        asset("namib_wind", "Namib Offshore Wind Pilot (DEMO)", "Namib Renewables (DEMO)", "offshore_wind", -23.35, 14.30,
              0.5, 8.0, []),
        asset("durban_sbm", "Durban SBM Terminal (DEMO)", "Durban Energy Terminals (DEMO)", "terminal", -29.99, 31.10,
              0.5, 5.0, []),
        asset("horn_cable", "Horn Subsea Cable Landing (DEMO)", "Horn Connect (DEMO)", "subsea_infrastructure", 11.75,
              43.35, 0.5, 3.0, []),
        asset("lobito_deep", "Lobito Deepwater Platform (DEMO)", "Benguela Petroleum (DEMO)", "oil_rig", -11.6, 12.3,
              0.5, 10.0, []),
    ]
    edge_nodes = [dict(
        id=did("edge", "kestrel"), node_code="EDGE-KESTREL-01", name="SASH Ocean Edge — Kestrel FPSO (DEMO)",
        platform="Kestrel FPSO (DEMO)", lat=kestrel[0], lon=kestrel[1], software_version="0.1.0",
        comms_links=[{"type": "LEO_SATELLITE", "role": "primary", "bandwidth_kbps": 2000},
                     {"type": "VSAT", "role": "backup", "bandwidth_kbps": 256}],
        status="ONLINE", last_sync_at=now - timedelta(minutes=2), backlog_reported=0,
    )]

    def sensor(code, name, stype, lat, lon, radius, trust, acc_ms, time_source, edge=True, caps=None):
        return dict(id=did("sensor", code), sensor_code=code, name=name, sensor_type=stype, owner="Kestrel Energy (DEMO)"
                    if edge else "SASH (DEMO)", platform="Kestrel FPSO (DEMO)" if edge else name, lat=lat, lon=lon,
                    coverage_radius_km=radius, status="ONLINE", trust_level=trust, timestamp_accuracy_ms=acc_ms,
                    time_source=time_source, edge_node_id=edge_nodes[0]["id"] if edge else None,
                    last_heartbeat_at=now - timedelta(minutes=1), capabilities=caps or {})

    sensors = [
        sensor("KESTREL-RADAR-01", "Kestrel X-band marine radar (DEMO)", "RADAR", *kestrel, 40, 0.85, 50, "GPS",
               caps={"band": "X", "arpa_tracking": True}),
        sensor("KESTREL-EO-01", "Kestrel EO/IR camera (DEMO)", "EO", *kestrel, 15, 0.8, 100, "GPS", caps={"thermal": True}),
        sensor("KESTREL-RF-01", "Kestrel passive RF/SDR (DEMO)", "RF", *kestrel, 60, 0.6, 1000, "NTP",
               caps={"bands": ["VHF marine", "S-band radar"]}),
        sensor("KESTREL-WX-01", "Kestrel weather station (DEMO)", "WEATHER", *kestrel, 5, 0.9, 1000, "NTP"),
        sensor("DURBAN-AIS-01", "Durban shore AIS receiver (DEMO)", "AIS", -29.85, 31.03, 80, 0.9, 10, "GPS", edge=False),
    ]

    # Sensor observations around Kestrel FPSO: radar/EO tracks of AIS vessels plus one
    # uncorrelated small craft (becomes an UNIDENTIFIED MARITIME CONTACT, not a "hostile").
    sensor_obs: list[dict] = []

    def interp(track: list[TrackPoint], t: datetime):
        before = [p for p in track if p.ts <= t]
        after = [p for p in track if p.ts > t]
        if not before or not after:
            return None
        a, b = before[-1], after[0]
        f = (t - a.ts).total_seconds() / max(1, (b.ts - a.ts).total_seconds())
        return a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f, b.sog, b.cog

    def jitter(lat, lon, m):
        return destination_point(lat, lon, rng.uniform(0, 360), abs(rng.gauss(0, m / 1000)))

    t = now - timedelta(hours=6)
    while t < end:
        for track_id, v in (("728", supporter), ("745", pelagic)):
            s = interp(v.track, t)
            if s:
                lat, lon = jitter(s[0], s[1], 120)
                sensor_obs.append(dict(sensor_code="KESTREL-RADAR-01", observed_at=t, lat=lat, lon=lon,
                                       position_uncertainty_m=150, speed_kn=round(max(0, s[2] + rng.gauss(0, 0.4)), 1),
                                       course_deg=s[3], sensor_track_id=track_id, detection_type="RADAR_PLOT",
                                       classification="VESSEL", confidence=0.85))
        if int((t - now).total_seconds() // 60) % 30 == 0:
            s = interp(supporter.track, t)
            if s:
                lat, lon = jitter(s[0], s[1], 60)
                sensor_obs.append(dict(sensor_code="KESTREL-EO-01", observed_at=t, lat=lat, lon=lon,
                                       position_uncertainty_m=80, detection_type="EO_DETECTION",
                                       classification="OFFSHORE SUPPLY VESSEL", confidence=0.8))
        t += timedelta(minutes=3)

    # Unknown small craft: approaches from the SE, loiters ~6 km from the FPSO, departs.
    craft_start = now - timedelta(hours=2, minutes=30)
    p0 = destination_point(*kestrel, 135, 24)
    p1 = destination_point(*kestrel, 140, 6.2)
    t = craft_start
    while t < now + timedelta(hours=3):
        h = (t - craft_start).total_seconds() / 3600
        if h < 1.0:
            f = h / 1.0
            lat, lon = p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
            spd, crs = 17.0, 315.0
        elif h < 4.5:
            lat, lon = destination_point(*p1, rng.uniform(0, 360), rng.uniform(0, 1.2))
            spd, crs = round(rng.uniform(1.5, 3.5), 1), rng.uniform(0, 360)
        else:
            break
        lat, lon = jitter(lat, lon, 150)
        sensor_obs.append(dict(sensor_code="KESTREL-RADAR-01", observed_at=t, lat=lat, lon=lon, position_uncertainty_m=200,
                               speed_kn=spd, course_deg=round(crs, 0), sensor_track_id="731", detection_type="RADAR_PLOT",
                               classification="SMALL CRAFT", confidence=0.7))
        if int((t - craft_start).total_seconds() // 60) % 15 == 0:
            rlat, rlon = jitter(lat, lon, 1500)
            sensor_obs.append(dict(sensor_code="KESTREL-RF-01", observed_at=t, lat=rlat, lon=rlon,
                                   position_uncertainty_m=2500, detection_type="RF_EMISSION",
                                   classification="VHF MARINE EMITTER", confidence=0.55,
                                   attributes={"band": "VHF", "frequency_mhz": 156.8}))
        t += timedelta(minutes=3)
    for i, o in enumerate(sensor_obs):
        o["dedup_key"] = f"demo:{o['sensor_code']}:{o['observed_at'].isoformat()}:{o.get('sensor_track_id', '')}:{i}"

    # ---------------------------------------------------------------------------------
    # Environment (synthetic sea state / visibility)
    # ---------------------------------------------------------------------------------
    regions = [
        ((12.0, 16.0, 38.0, 54.0), (0.5, 1.3), (8, 20)),     # Red Sea south / Gulf of Aden — calm
        ((-3.0, 12.0, 45.0, 58.0), (0.8, 2.2), (8, 20)),     # Somali Basin
        ((-27.0, -3.0, 32.0, 46.0), (1.0, 2.6), (8, 20)),    # East Africa / Mozambique Channel
        ((-36.0, -27.0, 16.0, 34.0), (2.2, 4.5), (6, 20)),   # South Africa
        ((-30.0, -8.0, 10.0, 16.0), (1.6, 3.2), (1.2, 12)),  # Namibia / Angola (coastal fog)
        ((16.0, 28.0, 32.0, 42.0), (0.6, 1.6), (10, 20)),    # Red Sea north
    ]
    from app.geo.routing import lane_graph

    env_points = [pos for n, pos in lane_graph().nodes.items() if not n.startswith(("PORT:", "APPR:"))]
    environment = []
    t = now - timedelta(days=16)
    while t <= now:
        for lat, lon in env_points:
            reg = next((r for r in regions if r[0][0] <= lat <= r[0][1] and r[0][2] <= lon <= r[0][3]), None)
            if reg is None:
                continue
            wave = round(rng.uniform(*reg[1]), 1)
            vis = round(rng.uniform(*reg[2]), 1)
            environment.append(dict(observed_at=t, lat=lat, lon=lon, wave_height_m=wave, visibility_km=vis,
                                    wind_speed_kn=round(wave * 7 + rng.uniform(-3, 3), 0)))
        t += timedelta(hours=6)

    # ---------------------------------------------------------------------------------
    # Watchlists for the demo customer
    # ---------------------------------------------------------------------------------
    watchlists = [
        dict(key="insured", name="Insured Vessels", description="Hull & war-risk portfolio (demo)",
             items=[("VESSEL", vessels[k].id) for k in ("aurora", "cape_sentinel", "karoo", "northern", "indigo")]),
        dict(key="tankers", name="My Tankers", description="Tanker fleet (demo)",
             items=[("FLEET", "Meridian Tankers (DEMO)"), ("VESSEL", vessels["northern"].id), ("VESSEL", vessels["atlantic_orca"].id)]),
        dict(key="moz_ops", name="Mozambique Operations", description="Northern Mozambique offshore operations (demo)",
             items=[("VESSEL", supporter.id), ("VESSEL", vessels["zambezi"].id), ("VESSEL", vessels["moz_queen"].id),
                    ("AREA", [(40.0, -10.0), (43.5, -10.0), (43.5, -15.0), (40.0, -15.0), (40.0, -10.0)])]),
        dict(key="west_africa", name="West Africa Fleet", description="Namibia & Angola trades (demo)",
             items=[("VESSEL", vessels[k].id) for k in ("table_bay", "namib", "atlantic_orca")]),
    ]

    # Window trimming: history starts 14 days back.
    for v in vessels.values():
        v.track = [p for p in v.track if p.ts >= start_window]

    return DemoWorld(now=now, vessels=list(vessels.values()), incidents=incidents, zones=zones, assets=assets,
                     sensors=sensors, edge_nodes=edge_nodes, sensor_obs=sensor_obs, environment=environment,
                     watchlists=watchlists, scenario_notes=notes)
