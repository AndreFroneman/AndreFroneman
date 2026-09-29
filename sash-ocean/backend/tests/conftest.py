"""Test configuration.

Unit tests need nothing but Python. Integration tests (marked `db`) need a PostGIS server:
set TEST_DATABASE_URL (e.g. postgresql+psycopg://sash:sash@localhost:5433/postgres); a fresh
`sash_test` database is created, migrated and seeded with the synthetic demo world once
per test session. Without TEST_DATABASE_URL the integration tests are skipped.
"""
from __future__ import annotations

import os
import secrets
from datetime import datetime, timedelta, timezone

import pytest

_TEST_DB = os.environ.get("TEST_DATABASE_URL")
if _TEST_DB:
    _base, _ = _TEST_DB.rsplit("/", 1)
    os.environ["DATABASE_URL"] = f"{_base}/sash_test"
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://invalid:invalid@127.0.0.1:1/none")
os.environ["SASH_ENV"] = "test"
os.environ["SASH_DEMO_SEED_ON_START"] = "false"
os.environ["SASH_DEMO_MODE"] = "true"
os.environ.setdefault("SASH_JWT_SECRET", secrets.token_urlsafe(48))
os.environ["SASH_DEMO_ADMIN_PASSWORD"] = "Test-Admin-Pass-1"
os.environ["SASH_DEMO_ANALYST_PASSWORD"] = "Test-Analyst-Pass-1"
os.environ["SASH_DEMO_CUSTOMER_PASSWORD"] = "Test-Customer-Pass-1"
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6399/0")  # unreachable → in-memory fallbacks

NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


def t(minutes: float) -> datetime:
    return NOW + timedelta(minutes=minutes)


@pytest.fixture(scope="session")
def db_engine():
    if not _TEST_DB:
        pytest.skip("TEST_DATABASE_URL not set — skipping database integration tests")
    from sqlalchemy import create_engine, text

    admin = create_engine(_TEST_DB, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text("DROP DATABASE IF EXISTS sash_test WITH (FORCE)"))
        c.execute(text("CREATE DATABASE sash_test"))
    admin.dispose()
    from app.cli import _migrate

    _migrate()
    from app.db.session import engine

    yield engine


@pytest.fixture(scope="session")
def seeded(db_engine):
    from app.db.session import SessionLocal
    from app.demo.seed import seed_demo

    db = SessionLocal()
    try:
        stats = seed_demo(db, force=True)
    finally:
        db.close()
    assert stats.get("ais_observations", 0) > 10_000
    return stats


@pytest.fixture()
def db(db_engine):
    from app.db.session import SessionLocal

    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture(scope="session")
def client(seeded):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def login(client, email: str, password: str) -> dict:
    r = client.post("/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin_h(client):
    return login(client, "admin@sash.demo", "Test-Admin-Pass-1")


@pytest.fixture(scope="session")
def analyst_h(client):
    return login(client, "analyst@sash.demo", "Test-Analyst-Pass-1")


@pytest.fixture(scope="session")
def customer_h(client):
    return login(client, "customer@sash.demo", "Test-Customer-Pass-1")
