"""Fixed-window rate limiter backed by Redis, with an in-process fallback."""
from __future__ import annotations

import logging
import threading
import time

import redis

from app.core.config import get_settings

log = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, redis_url: str | None = None):
        self._redis = None
        self._local: dict[str, tuple[int, int]] = {}
        self._lock = threading.Lock()
        url = redis_url or get_settings().redis_url
        try:
            client = redis.Redis.from_url(url, socket_connect_timeout=0.5, socket_timeout=0.5)
            client.ping()
            self._redis = client
        except Exception as exc:
            log.warning("Redis unavailable for rate limiting (%s); using in-process limiter", exc)

    def hit(self, key: str, limit: int, window_s: int = 60) -> tuple[bool, int, int]:
        """Register a hit. Returns (allowed, remaining, reset_seconds)."""
        now = int(time.time())
        bucket = now // window_s
        reset = window_s - (now % window_s)
        full_key = f"sash:rl:{key}:{bucket}"
        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incr(full_key)
                pipe.expire(full_key, window_s + 5)
                count = int(pipe.execute()[0])
                return count <= limit, max(0, limit - count), reset
            except Exception as exc:
                log.warning("Redis rate limit error (%s); falling back to local", exc)
        with self._lock:
            b, c = self._local.get(key, (bucket, 0))
            if b != bucket:
                b, c = bucket, 0
            c += 1
            self._local[key] = (b, c)
            if len(self._local) > 50_000:
                self._local = {k: v for k, v in self._local.items() if v[0] == bucket}
        return c <= limit, max(0, limit - c), reset


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter
