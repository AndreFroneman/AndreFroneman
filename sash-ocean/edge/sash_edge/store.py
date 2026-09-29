"""Durable store-and-forward queue for offshore edge nodes.

* SQLite (WAL) on local disk: survives power loss and communications outages.
* Priority classes: EVENT (local alerts, contacts near assets) > TRACK (decoded AIS,
  radar plots) > RAW (bulky raw sensor data). Over expensive or degraded links only the
  higher classes are sent; RAW waits for a good link.
* Every record has a stable dedup key, so resending after a partial upload is safe
  (the central API ingests idempotently).
* Bounded size: when full, the oldest RAW records are pruned first; EVENTs are kept.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from dataclasses import dataclass

PRIORITY = {"EVENT": 0, "TRACK": 1, "RAW": 2}


@dataclass
class QueuedItem:
    id: int
    kind: str  # ais | sensor
    priority: str
    dedup_key: str
    payload: dict
    attempts: int


class StoreAndForward:
    def __init__(self, path: str, max_items: int = 500_000):
        self.path = path
        self.max_items = max_items
        self._lock = threading.Lock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=NORMAL")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS queue (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, "
            "priority INTEGER NOT NULL, dedup_key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, "
            "created REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)"
        )
        self.db.execute("CREATE INDEX IF NOT EXISTS ix_queue_prio ON queue(priority, id)")

    def put(self, kind: str, priority: str, dedup_key: str, payload: dict) -> bool:
        with self._lock:
            cur = self.db.execute(
                "INSERT OR IGNORE INTO queue(kind, priority, dedup_key, payload, created) VALUES (?,?,?,?,?)",
                (kind, PRIORITY[priority], dedup_key, json.dumps(payload, default=str), time.time()),
            )
            inserted = cur.rowcount == 1
            self._enforce_bound()
            return inserted

    def _enforce_bound(self) -> None:
        n = self.db.execute("SELECT count(*) FROM queue").fetchone()[0]
        excess = n - self.max_items
        for prio in (PRIORITY["RAW"], PRIORITY["TRACK"]):
            if excess <= 0:
                return
            self.db.execute(
                "DELETE FROM queue WHERE id IN (SELECT id FROM queue WHERE priority = ? ORDER BY id LIMIT ?)",
                (prio, excess),
            )
            excess = self.db.execute("SELECT count(*) FROM queue").fetchone()[0] - self.max_items

    def batch(self, kind: str, limit: int, max_priority: str = "RAW") -> list[QueuedItem]:
        with self._lock:
            rows = self.db.execute(
                "SELECT id, kind, priority, dedup_key, payload, attempts FROM queue WHERE kind = ? AND priority <= ? "
                "ORDER BY priority, id LIMIT ?",
                (kind, PRIORITY[max_priority], limit),
            ).fetchall()
        inv = {v: k for k, v in PRIORITY.items()}
        return [QueuedItem(r[0], r[1], inv[r[2]], r[3], json.loads(r[4]), r[5]) for r in rows]

    def ack(self, ids: list[int]) -> None:
        if not ids:
            return
        with self._lock:
            self.db.execute(f"DELETE FROM queue WHERE id IN ({','.join('?' * len(ids))})", ids)  # noqa: S608

    def nack(self, ids: list[int]) -> None:
        if not ids:
            return
        with self._lock:
            self.db.execute(f"UPDATE queue SET attempts = attempts + 1 WHERE id IN ({','.join('?' * len(ids))})", ids)  # noqa: S608

    def backlog(self) -> dict[str, int]:
        rows = self.db.execute("SELECT priority, count(*) FROM queue GROUP BY priority").fetchall()
        inv = {v: k for k, v in PRIORITY.items()}
        out = {k: 0 for k in PRIORITY}
        for p, n in rows:
            out[inv[p]] = n
        return out

    def close(self) -> None:
        self.db.close()
