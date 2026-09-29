"""Event bus abstraction.

MVP implementation uses Redis Streams (bounded length). The interface is deliberately
minimal (publish/subscribe by topic) so it can be swapped for Kafka/Redpanda when
high-volume sensor streams arrive, without touching producers or consumers.
"""
from __future__ import annotations

import json
import logging
from collections import deque
from typing import Protocol

import redis

from app.core.config import get_settings

log = logging.getLogger(__name__)


class EventBus(Protocol):
    def publish(self, topic: str, event: dict) -> None: ...
    def recent(self, topic: str, count: int = 50) -> list[dict]: ...


class RedisStreamBus:
    def __init__(self, url: str, maxlen: int = 10_000):
        self.client = redis.Redis.from_url(url, socket_connect_timeout=0.5, socket_timeout=1)
        self.client.ping()
        self.maxlen = maxlen

    def publish(self, topic: str, event: dict) -> None:
        try:
            self.client.xadd(topic, {"data": json.dumps(event, default=str)}, maxlen=self.maxlen, approximate=True)
        except Exception as exc:
            log.debug("event bus publish failed: %s", exc)

    def recent(self, topic: str, count: int = 50) -> list[dict]:
        rows = self.client.xrevrange(topic, count=count)
        return [json.loads(r[1][b"data"]) for r in rows]


class InMemoryBus:
    def __init__(self):
        self.topics: dict[str, deque] = {}

    def publish(self, topic: str, event: dict) -> None:
        self.topics.setdefault(topic, deque(maxlen=1000)).append(event)

    def recent(self, topic: str, count: int = 50) -> list[dict]:
        return list(self.topics.get(topic, []))[-count:][::-1]


_bus: EventBus | None = None


def get_bus() -> EventBus:
    global _bus
    if _bus is None:
        try:
            _bus = RedisStreamBus(get_settings().redis_url)
        except Exception as exc:
            log.warning("Redis unavailable for event bus (%s); using in-memory bus", exc)
            _bus = InMemoryBus()
    return _bus
