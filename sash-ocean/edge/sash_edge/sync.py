"""Uplink synchronisation with link-aware batching and exponential backoff.

Offshore links are slow, expensive and intermittent, so the uplink sends metadata and
events first, compresses payloads, and only drains bulky raw data on good links.
"""
from __future__ import annotations

import gzip
import json
import logging
import time
from dataclasses import dataclass
from typing import Protocol

from sash_edge.store import StoreAndForward

log = logging.getLogger("sash.edge.sync")


@dataclass(frozen=True)
class LinkProfile:
    name: str
    batch_size: int
    max_priority: str  # highest (least important) class allowed on this link
    interval_s: int


LINK_PROFILES = {
    "ETHERNET": LinkProfile("ETHERNET", 5000, "RAW", 10),
    "MICROWAVE": LinkProfile("MICROWAVE", 2000, "RAW", 15),
    "PRIVATE_5G": LinkProfile("PRIVATE_5G", 2000, "RAW", 15),
    "LTE": LinkProfile("LTE", 1000, "TRACK", 30),
    "LEO_SATELLITE": LinkProfile("LEO_SATELLITE", 500, "TRACK", 60),
    "GEO_SATELLITE": LinkProfile("GEO_SATELLITE", 100, "EVENT", 300),
}


class Transport(Protocol):
    def post(self, path: str, body: bytes, headers: dict) -> int: ...


class HttpTransport:
    def __init__(self, base_url: str, api_key: str, timeout: float = 30, verify: bool | str = True):
        import httpx

        self.client = httpx.Client(base_url=base_url, timeout=timeout, verify=verify)
        self.api_key = api_key

    def post(self, path: str, body: bytes, headers: dict) -> int:
        h = {"X-API-Key": self.api_key, "Content-Type": "application/json", **headers}
        return self.client.post(path, content=body, headers=h).status_code


class Uplink:
    def __init__(self, store: StoreAndForward, transport: Transport, node_code: str, sensor_codes: dict[str, str],
                 link: LinkProfile, compress: bool = False):
        self.store = store
        self.transport = transport
        self.node_code = node_code
        self.sensor_codes = sensor_codes  # sensor adapter code -> central sensor_code
        self.link = link
        self.compress = compress
        self.failures = 0
        self.next_attempt = 0.0

    def backoff_s(self) -> float:
        return min(900.0, 5.0 * (2 ** min(self.failures, 8)))

    def _send(self, path: str, body: dict) -> bool:
        raw = json.dumps(body, default=str).encode()
        headers = {}
        if self.compress:
            raw, headers = gzip.compress(raw), {"Content-Encoding": "gzip"}
        try:
            code = self.transport.post(path, raw, headers)
        except Exception as exc:  # link down: keep everything queued
            log.info("uplink unavailable (%s)", exc)
            return False
        if 200 <= code < 300:
            return True
        if code in (400, 422):
            log.error("central rejected batch (HTTP %s) - leaving for inspection", code)
        return False

    def sync_once(self, now: float | None = None) -> dict:
        now = time.monotonic() if now is None else now
        if now < self.next_attempt:
            return {"skipped": "backoff"}
        sent = 0
        ok = True
        ais = self.store.batch("ais", self.link.batch_size, self.link.max_priority)
        if ais:
            if self._send("/v1/ingest/ais", {"source_key": f"edge:{self.node_code}", "messages": [i.payload for i in ais]}):
                self.store.ack([i.id for i in ais])
                sent += len(ais)
            else:
                self.store.nack([i.id for i in ais])
                ok = False
        if ok:
            items = self.store.batch("sensor", self.link.batch_size, self.link.max_priority)
            by_sensor: dict[str, list] = {}
            for i in items:
                by_sensor.setdefault(i.payload.pop("_sensor", ""), []).append(i)
            for code, group in by_sensor.items():
                body = {"sensor_code": self.sensor_codes.get(code, code), "edge_node_code": self.node_code,
                        "edge_backlog": sum(self.store.backlog().values()),
                        "observations": [{**g.payload, "dedup_key": g.dedup_key} for g in group]}
                if self._send("/v1/ingest/sensor-observations", body):
                    self.store.ack([g.id for g in group])
                    sent += len(group)
                else:
                    self.store.nack([g.id for g in group])
                    ok = False
                    break
        if ok:
            self.failures = 0
            self.next_attempt = now
        else:
            self.failures += 1
            self.next_attempt = now + self.backoff_s()
        return {"sent": sent, "ok": ok, "backlog": self.store.backlog()}
