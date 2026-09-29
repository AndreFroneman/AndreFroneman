"""Background worker: simulated live feed (demo), connectors, periodic analytics."""
from __future__ import annotations

import logging
import signal
import time

from app.core.config import get_settings
from app.db.session import SessionLocal

log = logging.getLogger("sash.worker")
_stop = False


def _handle(sig, frame):  # pragma: no cover
    global _stop
    _stop = True


def run_worker() -> None:
    from app.connectors.sources import ALL_CONNECTORS
    from app.demo.seed import feed_remaining_hours, release_feed, seed_demo
    from app.services.pipeline import run_analytics

    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)
    s = get_settings()
    last_analytics = 0.0
    last_poll: dict[str, float] = {}
    log.info("worker started (demo_mode=%s)", s.demo_mode)
    try:  # ingestion / analytics / connector metrics for Prometheus (internal network only)
        from prometheus_client import start_http_server

        start_http_server(9101)
    except OSError as exc:
        log.warning("worker metrics endpoint unavailable: %s", exc)
    if s.demo_mode and s.demo_seed_on_start:
        db = SessionLocal()
        try:
            log.info("demo seed: %s", seed_demo(db))
            last_analytics = time.monotonic()
        except Exception:
            log.exception("demo seeding failed")
        finally:
            db.close()
    while not _stop:
        db = SessionLocal()
        try:
            now = time.monotonic()
            if s.demo_mode and s.demo_live_feed:
                released = release_feed(db)
                if released["ais"] or released["sensor"]:
                    log.info("demo feed released %s", released)
                # Keep the simulated world alive: regenerate once the queued future runs out.
                if feed_remaining_hours(db) < 1:
                    log.info("demo feed exhausted; regenerating synthetic world")
                    seed_demo(db, force=True)
                    last_analytics = time.monotonic()
            for c in ALL_CONNECTORS:
                if c.enabled() and now - last_poll.get(c.key, 0) >= c.poll_interval_s:
                    last_poll[c.key] = now
                    log.info("connector %s: %s", c.key, c.execute(db))
            if now - last_analytics >= s.analytics_interval_seconds:
                last_analytics = now
                run_analytics(db, kind="SCHEDULED")
        except Exception:
            log.exception("worker iteration failed")
            db.rollback()
        finally:
            db.close()
        for _ in range(max(1, s.feed_interval_seconds)):
            if _stop:
                break
            time.sleep(1)
    log.info("worker stopped")
