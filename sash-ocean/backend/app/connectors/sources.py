"""Concrete connectors (all optional, disabled unless configured)."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import re
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.connectors.base import Connector
from app.core.config import get_settings
from app.models import EnvironmentObservation, Incident, SanctionsEntry
from app.services.ingest import ingest_ais

log = logging.getLogger(__name__)
UA = {"User-Agent": "SASH-Ocean/0.1 (maritime risk research; contact: operator)"}

AIS_NAV_STATUS = {
    0: "Under way using engine", 1: "At anchor", 2: "Not under command", 3: "Restricted manoeuvrability",
    4: "Constrained by draught", 5: "Moored", 6: "Aground", 7: "Engaged in fishing", 8: "Under way sailing",
    15: "Undefined",
}


# ------------------------------------------------------------------------------------------
# AISStream.io (terrestrial AIS via websocket; requires AIS_API_KEY)
# ------------------------------------------------------------------------------------------
def parse_aisstream_message(m: dict) -> dict | None:
    """Normalise an AISStream PositionReport message (pure function, unit-tested)."""
    if m.get("MessageType") not in ("PositionReport", "StandardClassBPositionReport"):
        return None
    meta = m.get("MetaData", {})
    body = m.get("Message", {}).get(m["MessageType"], {})
    mmsi = str(meta.get("MMSI") or body.get("UserID") or "")
    lat, lon = body.get("Latitude", meta.get("latitude")), body.get("Longitude", meta.get("longitude"))
    if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:
        return None
    ts_raw = meta.get("time_utc", "")
    ts_match = re.match(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", ts_raw)
    ts = datetime.strptime(ts_match.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc) if ts_match \
        else datetime.now(timezone.utc)
    heading = body.get("TrueHeading")
    return {
        "mmsi": mmsi.zfill(9), "ts": ts, "lat": float(lat), "lon": float(lon),
        "sog": body.get("Sog"), "cog": body.get("Cog"), "heading": None if heading in (None, 511) else heading,
        "nav_status": AIS_NAV_STATUS.get(body.get("NavigationalStatus")),
        "receiver_class": "TERRESTRIAL", "name": (meta.get("ShipName") or "").strip() or None,
        "raw": {"MessageType": m["MessageType"], "MetaData": meta},
    }


class AisStreamConnector(Connector):
    key = "aisstream"
    poll_interval_s = 300
    url = "wss://stream.aisstream.io/v0/stream"

    def enabled(self) -> bool:
        return bool(get_settings().ais_api_key)

    def run_once(self, db: Session, seconds: int = 60) -> dict:
        import websockets

        s = get_settings()
        south, west, north, east = (float(x) for x in s.aisstream_bbox.split(","))
        sub = {"APIKey": s.ais_api_key, "BoundingBoxes": [[[south, west], [north, east]]],
               "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport"]}
        batch: list[dict] = []

        async def collect():
            async with websockets.connect(self.url, open_timeout=15) as ws:
                await ws.send(json.dumps(sub))
                end = asyncio.get_event_loop().time() + seconds
                while asyncio.get_event_loop().time() < end and len(batch) < 20000:
                    raw = await asyncio.wait_for(ws.recv(), timeout=30)
                    msg = parse_aisstream_message(json.loads(raw))
                    if msg:
                        batch.append(msg)

        asyncio.run(collect())
        res = ingest_ais(db, batch, self.source(db))
        db.commit()
        return res.as_dict()


# ------------------------------------------------------------------------------------------
# NGA MSI Anti-Shipping Activity Messages (US Government, public domain)
# ------------------------------------------------------------------------------------------
_DMS = re.compile(r"(\d+)\s*°?\s*(\d+(?:\.\d+)?)?'?\s*([NSEW])")


def parse_asam_coordinate(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    m = _DMS.search(str(value))
    if not m:
        try:
            return float(value)
        except ValueError:
            return None
    deg = float(m.group(1)) + float(m.group(2) or 0) / 60
    return -deg if m.group(3) in "SW" else deg


ASAM_CATEGORY_KEYWORDS = [
    ("hijack", "hijacking"), ("kidnap", "kidnapping"), ("missile", "missile_attack"), ("drone", "drone_attack"),
    ("uav", "drone_attack"), ("mine", "mine"), ("board", "boarding"), ("robber", "armed_robbery"),
    ("theft", "cargo_theft"), ("stole", "cargo_theft"), ("approach", "suspicious_approach"),
    ("suspicious", "suspicious_approach"), ("pira", "piracy"), ("attack", "piracy"),
]


def classify_asam(text: str) -> str:
    t = text.lower()
    for kw, cat in ASAM_CATEGORY_KEYWORDS:
        if kw in t:
            return cat
    return "suspicious_approach"


def parse_asam_record(r: dict) -> dict | None:
    lat = parse_asam_coordinate(r.get("latitude"))
    lon = parse_asam_coordinate(r.get("longitude"))
    date = r.get("date")
    if lat is None or lon is None or not date:
        return None
    try:
        occurred = datetime.fromisoformat(str(date)[:10]).replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    desc = r.get("description") or ""
    return {"external_id": str(r.get("reference") or r.get("navArea", "")) + ":" + str(date), "occurred_at": occurred,
            "lat": lat, "lon": lon, "category": classify_asam(desc + " " + str(r.get("hostility", ""))),
            "title": (r.get("hostility") or "Anti-shipping activity").strip()[:300],
            "narrative": desc[:5000], "affected_vessel_name": (r.get("victim") or None), "raw": r}


class NgaAsamConnector(Connector):
    key = "nga-asam"
    poll_interval_s = 6 * 3600
    url = "https://msi.nga.mil/api/publications/asam"

    def enabled(self) -> bool:
        return get_settings().nga_asam_enabled

    def run_once(self, db: Session) -> dict:
        since = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y%m%d")
        resp = httpx.get(self.url, params={"sort": "date", "output": "json", "minOccurDate": since}, headers=UA, timeout=60)
        resp.raise_for_status()
        records = resp.json().get("asams", [])
        src = self.source(db)
        now = datetime.now(timezone.utc)
        new = 0
        for r in records:
            p = parse_asam_record(r)
            if p is None or db.scalar(select(Incident).where(Incident.external_id == p["external_id"], Incident.source_id == src.id)):
                continue
            db.add(Incident(**p, position=f"SRID=4326;POINT({p['lon']} {p['lat']})", source_id=src.id, source_name=src.name,
                            source_type="INCIDENT", source_url="https://msi.nga.mil/Piracy", licensing_category="PUBLIC-GOVERNMENT",
                            retrieved_at=now, original_timestamp=p["occurred_at"], confidence=src.default_confidence,
                            verification_status="PARTIALLY_VERIFIED", is_synthetic=False))
            new += 1
        db.commit()
        return {"fetched": len(records), "new": new}


# ------------------------------------------------------------------------------------------
# OFAC SDN list — vessel entries (compliance screening only)
# ------------------------------------------------------------------------------------------
_IMO_RE = re.compile(r"IMO\s*(\d{7})")
_MMSI_RE = re.compile(r"MMSI\s*(\d{9})")


def parse_sdn_csv(text: str) -> list[dict]:
    out = []
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 12 or row[2].strip().strip('"').lower() != "vessel":
            continue
        remarks = row[11]
        imo = _IMO_RE.search(remarks)
        mmsi = _MMSI_RE.search(remarks)
        out.append({"entity_name": row[1].strip().strip('"'), "program": row[3].strip().strip('"') or None,
                    "imo": imo.group(1) if imo else None, "mmsi": mmsi.group(1) if mmsi else None,
                    "raw": {"ent_num": row[0], "remarks": remarks[:1000]}})
    return out


class OfacSdnConnector(Connector):
    key = "ofac-sdn"
    poll_interval_s = 24 * 3600
    url = "https://www.treasury.gov/ofac/downloads/sdn.csv"

    def enabled(self) -> bool:
        return get_settings().ofac_sdn_enabled

    def run_once(self, db: Session) -> dict:
        resp = httpx.get(self.url, headers=UA, timeout=120, follow_redirects=True)
        resp.raise_for_status()
        rows = parse_sdn_csv(resp.text)
        src = self.source(db)
        now = datetime.now(timezone.utc)
        db.execute(delete(SanctionsEntry).where(SanctionsEntry.source_id == src.id))
        for r in rows:
            db.add(SanctionsEntry(list_name="OFAC SDN", **r, source_id=src.id, source_name=src.name, source_type="SANCTIONS",
                                  source_url=self.url, licensing_category="PUBLIC-GOVERNMENT", retrieved_at=now,
                                  confidence=0.9, is_synthetic=False))
        db.commit()
        return {"vessel_entries": len(rows)}


# ------------------------------------------------------------------------------------------
# Open-Meteo Marine (sea state). Free tier is non-commercial; set OPEN_METEO_API_KEY for commercial.
# ------------------------------------------------------------------------------------------
class OpenMeteoMarineConnector(Connector):
    key = "open-meteo-marine"
    poll_interval_s = 3 * 3600

    def enabled(self) -> bool:
        return get_settings().open_meteo_enabled

    def run_once(self, db: Session) -> dict:
        from app.geo.routing import lane_graph

        s = get_settings()
        base = "https://customer-marine-api.open-meteo.com/v1/marine" if s.open_meteo_api_key else \
            "https://marine-api.open-meteo.com/v1/marine"
        nodes = [pos for n, pos in lane_graph().nodes.items() if not n.startswith(("PORT:", "APPR:"))]
        src = self.source(db)
        now = datetime.now(timezone.utc)
        n = 0
        for i in range(0, len(nodes), 50):  # batched multi-location requests, polite rate
            chunk = nodes[i:i + 50]
            params = {"latitude": ",".join(f"{p[0]:.2f}" for p in chunk), "longitude": ",".join(f"{p[1]:.2f}" for p in chunk),
                      "current": "wave_height"}
            if s.open_meteo_api_key:
                params["apikey"] = s.open_meteo_api_key
            resp = httpx.get(base, params=params, headers=UA, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            for (lat, lon), d in zip(chunk, data if isinstance(data, list) else [data], strict=False):
                wh = (d.get("current") or {}).get("wave_height")
                if wh is None:
                    continue
                db.add(EnvironmentObservation(observed_at=now, lat=lat, lon=lon, position=f"SRID=4326;POINT({lon} {lat})",
                                              wave_height_m=wh, source_id=src.id, source_name=src.name, source_type="WEATHER",
                                              licensing_category="COMMERCIAL-LICENSED" if s.open_meteo_api_key else "OPEN",
                                              retrieved_at=now, original_timestamp=now, confidence=0.7, is_synthetic=False))
                n += 1
        db.commit()
        return {"observations": n}


ALL_CONNECTORS: list[Connector] = [AisStreamConnector(), NgaAsamConnector(), OfacSdnConnector(), OpenMeteoMarineConnector()]
