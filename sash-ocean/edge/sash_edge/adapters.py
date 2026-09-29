"""Sensor adapters. Every adapter yields normalised observations for the common pipeline.

Implemented: NMEA AIS (UDP/file via pyais), a simulated radar for demonstrations.
Reserved (no functionality): QUANTUM_SENSOR and QUANTUM_TIMING_SOURCE. SASH Ocean does
not implement or claim quantum sensing; these interfaces exist so a future sensor can
contribute observations through exactly the same pipeline as radar/RF/EO.
"""
from __future__ import annotations

import math
import random
import socket
from abc import ABC, abstractmethod
from collections.abc import Iterator
from datetime import datetime, timezone


class SensorAdapter(ABC):
    sensor_code: str
    sensor_type: str

    @abstractmethod
    def poll(self) -> Iterator[dict]:
        """Yield observations: {"kind": "ais"|"sensor", "priority": ..., "dedup_key": ..., "payload": {...}}"""


def decode_nmea_lines(lines: list[str], receiver: str = "SASH-SENSOR") -> list[dict]:
    """Decode AIVDM/AIVDO sentences (multi-part aware) into SASH AIS messages."""
    from pyais.stream import IterMessages

    out = []
    now = datetime.now(timezone.utc)
    for msg in IterMessages([ln.encode() for ln in lines if ln.strip()]):
        try:
            d = msg.decode().asdict()
        except Exception:  # noqa: S112 - malformed sentence: skip, never crash the node
            continue
        if d.get("msg_type") not in (1, 2, 3, 18, 19) or d.get("lat") in (None, 91.0) or d.get("lon") in (None, 181.0):
            continue
        mmsi = str(d["mmsi"]).zfill(9)
        heading = d.get("heading")
        out.append({
            "kind": "ais", "priority": "TRACK", "dedup_key": f"ais:{mmsi}:{now.isoformat()}:{d.get('lat')}:{d.get('lon')}",
            "payload": {"mmsi": mmsi, "ts": now.isoformat(), "lat": float(d["lat"]), "lon": float(d["lon"]),
                        "sog": d.get("speed"), "cog": d.get("course"), "heading": None if heading in (None, 511) else heading,
                        "receiver_class": receiver},
        })
    return out


class UdpNmeaAisAdapter(SensorAdapter):
    """Listens for NMEA 0183 AIS sentences from a local AIS receiver (common UDP output)."""

    sensor_type = "AIS"

    def __init__(self, sensor_code: str, host: str = "0.0.0.0", port: int = 10110):  # noqa: S104
        self.sensor_code = sensor_code
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock.bind((host, port))
        self.sock.setblocking(False)

    def poll(self) -> Iterator[dict]:
        lines: list[str] = []
        while True:
            try:
                data, _ = self.sock.recvfrom(65535)
            except BlockingIOError:
                break
            lines.extend(data.decode(errors="ignore").splitlines())
        yield from decode_nmea_lines(lines)


class SimulatedRadarAdapter(SensorAdapter):
    """Demonstration radar producing ARPA-style plots around a platform (clearly simulated)."""

    sensor_type = "RADAR"

    def __init__(self, sensor_code: str, lat: float, lon: float, seed: int = 7):
        self.sensor_code = sensor_code
        self.lat, self.lon = lat, lon
        self.rng = random.Random(seed)
        self.targets = [{"id": str(700 + i), "r": self.rng.uniform(3, 30), "b": self.rng.uniform(0, 360),
                         "v": self.rng.uniform(2, 18), "c": self.rng.uniform(0, 360)} for i in range(3)]

    def poll(self) -> Iterator[dict]:
        now = datetime.now(timezone.utc)
        for t in self.targets:
            t["b"] = (t["b"] + self.rng.uniform(-1, 1)) % 360
            lat = self.lat + t["r"] / 111.0 * math.cos(math.radians(t["b"]))
            lon = self.lon + t["r"] / (111.0 * math.cos(math.radians(self.lat))) * math.sin(math.radians(t["b"]))
            yield {
                "kind": "sensor", "priority": "TRACK", "dedup_key": f"{self.sensor_code}:{t['id']}:{now.isoformat()}",
                "payload": {"observed_at": now.isoformat(), "lat": lat, "lon": lon, "position_uncertainty_m": 150,
                            "speed_kn": round(t["v"], 1), "course_deg": round(t["c"], 0), "sensor_track_id": t["id"],
                            "detection_type": "RADAR_PLOT", "classification": "VESSEL", "confidence": 0.8,
                            "attributes": {"simulated": True}},
            }


class QuantumSensorAdapter(SensorAdapter):
    """RESERVED interface for a future quantum sensor. Not implemented; produces nothing.

    A future implementation must emit the same normalised observation schema as every
    other adapter (position/bearing, uncertainty, timestamp, confidence), so that fusion,
    risk and alerting consume it without modification.
    """

    sensor_type = "QUANTUM_SENSOR"

    def __init__(self, sensor_code: str):
        self.sensor_code = sensor_code

    def poll(self) -> Iterator[dict]:
        raise NotImplementedError("QUANTUM_SENSOR is a reserved interface; no quantum sensing is implemented")


class QuantumTimingSourceAdapter(SensorAdapter):
    """RESERVED interface for a future quantum timing source (time-stamping reference). Not implemented."""

    sensor_type = "QUANTUM_TIMING_SOURCE"

    def __init__(self, sensor_code: str):
        self.sensor_code = sensor_code

    def poll(self) -> Iterator[dict]:
        raise NotImplementedError("QUANTUM_TIMING_SOURCE is a reserved interface; not implemented")
