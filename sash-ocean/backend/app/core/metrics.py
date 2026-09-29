"""Prometheus metrics exposed at /metrics."""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

REQUEST_LATENCY = Histogram(
    "sash_http_request_duration_seconds",
    "API request latency",
    ["method", "route", "status"],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
INGESTED_OBSERVATIONS = Counter(
    "sash_ingested_observations_total", "Observations ingested", ["kind", "source"]
)
INGEST_REJECTED = Counter(
    "sash_ingest_rejected_total", "Observations rejected by validation", ["kind", "reason"]
)
ALERTS_GENERATED = Counter("sash_alerts_generated_total", "Alerts generated", ["alert_type", "severity"])
ANALYTICS_RUNS = Counter("sash_analytics_runs_total", "Analytics runs", ["status"])
ANALYTICS_DURATION = Histogram(
    "sash_analytics_run_seconds", "Analytics run duration", buckets=(1, 5, 10, 30, 60, 120, 300, 600)
)
ACTIVE_VESSELS = Gauge("sash_active_vessels", "Vessels reporting in the last 24h", ["data_mode"])
OPEN_ALERTS = Gauge("sash_open_alerts", "Alerts not yet closed", ["severity"])
DATABASE_UP = Gauge("sash_database_up", "1 if the database is reachable")
DATA_SOURCE_HEALTHY = Gauge("sash_data_source_healthy", "1 if the data source is healthy", ["source"])
DATA_SOURCE_LAST_SUCCESS = Gauge(
    "sash_data_source_last_success_timestamp", "Unix time of last successful poll", ["source"]
)
SENSOR_ONLINE = Gauge("sash_sensor_online", "1 if the sensor is online", ["sensor", "sensor_type"])
RATE_LIMITED = Counter("sash_rate_limited_total", "Requests rejected by rate limiting", ["principal_type"])
AUTH_FAILURES = Counter("sash_auth_failures_total", "Failed authentication attempts", ["method"])
