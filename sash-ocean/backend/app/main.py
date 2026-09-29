"""SASH Ocean API application."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import func, select

from app.api.deps import client_ip
from app.api.v1 import admin, alerts, auth, intel, sensors, vessels
from app.core.audit import audit
from app.core.config import get_settings
from app.core.metrics import ACTIVE_VESSELS, DATA_SOURCE_HEALTHY, DATABASE_UP, OPEN_ALERTS, REQUEST_LATENCY, SENSOR_ONLINE
from app.db.session import SessionLocal, database_ok

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("sash")

DESCRIPTION = """
**SASH Ocean** — OSINT-first maritime situational awareness and voyage-risk intelligence.

* Every record carries provenance (source, licensing category, retrieval time, confidence).
* Every risk result is explainable: contributors separate **OBSERVATION**, **INFERENCE** and **ASSESSMENT**.
* Authentication: `Authorization: Bearer <JWT>` (users) or `X-API-Key: <key>` (customer / sensor API).

> SASH Maritime Risk Indicators provide decision-support intelligence and do not constitute insurance
> underwriting advice. The indicator is rules-based and has not been actuarially validated.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_for_startup()
    if settings.demo_mode and settings.demo_seed_on_start and settings.environment != "test":
        import threading

        def _seed():
            from app.demo.seed import seed_demo

            db = SessionLocal()
            try:
                seed_demo(db)
            except Exception:
                log.exception("demo seeding failed")
            finally:
                db.close()

        # Seed in the background so the API becomes healthy immediately.
        threading.Thread(target=_seed, name="demo-seed", daemon=True).start()
    yield


app = FastAPI(
    title="SASH Ocean API",
    version="0.1.0",
    description=DESCRIPTION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/v1/openapi.json",
)

from app.core.gzip_ingest import GzipIngestMiddleware  # noqa: E402

app.add_middleware(GzipIngestMiddleware)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    )

MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def security_and_metrics(request: Request, call_next):
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    elapsed = time.perf_counter() - start
    route = request.scope.get("route")
    REQUEST_LATENCY.labels(request.method, getattr(route, "path", "unmatched"), str(response.status_code)).observe(elapsed)

    # Secure headers (the gateway adds HSTS once TLS terminates there).
    h = response.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("Referrer-Policy", "no-referrer")
    h.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
    h.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    if request.url.path.startswith(("/docs", "/redoc")):
        h.setdefault("Content-Security-Policy",
                     "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
                     "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com")
    else:
        h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        h.setdefault("Cache-Control", "no-store")

    # Audit every mutating call and every API-key call.
    principal = getattr(request.state, "principal", None)
    if request.method in MUTATING or (principal is not None and principal.kind == "api_key"):
        if not request.url.path.startswith("/v1/auth/login"):
            await run_in_threadpool(
                audit,
                f"http.{request.method.lower()}",
                actor_type=principal.kind if principal else "anonymous",
                actor_id=principal.id if principal else None,
                actor_label=principal.label if principal else None,
                method=request.method, path=request.url.path[:500], status_code=response.status_code,
                ip=client_ip(request), user_agent=request.headers.get("user-agent"),
            )
    return response


for r in (auth.router, vessels.router, intel.router, alerts.router, sensors.router, admin.router):
    app.include_router(r, prefix=settings.api_prefix)


@app.get("/health", tags=["system"], summary="Liveness/readiness")
def health():
    db_ok = database_ok()
    DATABASE_UP.set(1 if db_ok else 0)
    redis_ok = True
    try:
        from app.core.ratelimit import get_limiter

        lim = get_limiter()
        redis_ok = lim._redis is not None and bool(lim._redis.ping())
    except Exception:
        redis_ok = False
    status = "ok" if db_ok else "degraded"
    return JSONResponse({"status": status, "database": db_ok, "redis": redis_ok, "demo_mode": settings.demo_mode,
                         "version": app.version, "time": datetime.now(timezone.utc).isoformat()},
                        status_code=200 if db_ok else 503)


@app.get("/metrics", tags=["system"], include_in_schema=False)
def metrics():
    """Prometheus scrape endpoint (not exposed publicly by the gateway)."""
    db = SessionLocal()
    try:
        from app.models import Alert, DataSource, Sensor, Vessel

        since = datetime.now(timezone.utc) - timedelta(hours=24)
        for mode, n in db.execute(select(Vessel.data_mode, func.count()).where(Vessel.last_seen_at >= since)
                                  .group_by(Vessel.data_mode)).all():
            ACTIVE_VESSELS.labels(mode).set(n)
        for sev in ("INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"):
            OPEN_ALERTS.labels(sev).set(0)
        for sev, n in db.execute(select(Alert.severity, func.count()).where(Alert.status != "CLOSED")
                                 .group_by(Alert.severity)).all():
            OPEN_ALERTS.labels(sev).set(n)
        for s in db.scalars(select(DataSource)).all():
            DATA_SOURCE_HEALTHY.labels(s.key).set(1 if s.health_status == "HEALTHY" else 0)
        stale = datetime.now(timezone.utc) - timedelta(minutes=15)
        for s in db.scalars(select(Sensor)).all():
            SENSOR_ONLINE.labels(s.sensor_code, s.sensor_type).set(
                1 if s.last_heartbeat_at and s.last_heartbeat_at >= stale and s.status == "ONLINE" else 0)
        DATABASE_UP.set(1)
    except Exception:
        DATABASE_UP.set(0)
    finally:
        db.close()
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/v1/system/info", tags=["system"], summary="Public platform information (no auth)")
def info():
    from app.core.yamlconfig import risk_model

    m = risk_model()["model"]
    return {"platform": "SASH Ocean", "modules": ["Watch", "Risk", "Intelligence", "API", "Sensor", "Edge", "Fusion"],
            "demo_mode": settings.demo_mode, "risk_model": {"name": m["name"], "version": m["version"]},
            "disclaimer": m["disclaimer"]}
