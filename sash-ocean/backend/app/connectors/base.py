"""Connector framework: adapters normalise external data into SASH models.

Rules every connector follows:
* configuration and credentials come from environment variables only;
* respect provider terms, rate limits and redistribution restrictions (recorded on the
  DataSource row and shown in the UI);
* never scrape protected systems;
* every record keeps its provenance (source, licensing category, retrieval time).
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.metrics import DATA_SOURCE_HEALTHY, DATA_SOURCE_LAST_SUCCESS
from app.models import DataSource

log = logging.getLogger(__name__)


class Connector(ABC):
    key: str = ""
    poll_interval_s: int = 3600

    @abstractmethod
    def enabled(self) -> bool: ...

    @abstractmethod
    def run_once(self, db: Session) -> dict: ...

    def source(self, db: Session) -> DataSource:
        src = db.scalar(select(DataSource).where(DataSource.key == self.key))
        if src is None:
            raise RuntimeError(f"data source {self.key} not registered")
        return src

    def execute(self, db: Session) -> dict:
        src = self.source(db)
        try:
            stats = self.run_once(db)
            src.health_status = "HEALTHY"
            src.last_success_at = datetime.now(timezone.utc)
            src.last_error = None
            db.commit()
            DATA_SOURCE_HEALTHY.labels(self.key).set(1)
            DATA_SOURCE_LAST_SUCCESS.labels(self.key).set(src.last_success_at.timestamp())
            return stats
        except Exception as exc:
            db.rollback()
            src = self.source(db)
            src.health_status = "ERROR"
            src.last_error_at = datetime.now(timezone.utc)
            src.last_error = str(exc)[:2000]
            db.commit()
            DATA_SOURCE_HEALTHY.labels(self.key).set(0)
            log.warning("connector %s failed: %s", self.key, exc)
            return {"error": str(exc)}
