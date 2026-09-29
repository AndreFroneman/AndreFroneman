"""Runtime configuration.

All configuration comes from environment variables (or a .env file in development).
Secrets are never hard-coded: anything sensitive has no usable default and must be
supplied by the deployment (see scripts/init-env.sh and docs/DEPLOYMENT.md).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="", extra="ignore")

    # --- Core -------------------------------------------------------------
    environment: str = Field("development", alias="SASH_ENV")
    app_name: str = "SASH Ocean"
    api_prefix: str = "/v1"
    log_level: str = Field("INFO", alias="SASH_LOG_LEVEL")

    database_url: str = Field(
        "postgresql+psycopg://sash:sash@localhost:5432/sash", alias="DATABASE_URL"
    )
    redis_url: str = Field("redis://localhost:6379/0", alias="REDIS_URL")

    # --- Security ---------------------------------------------------------
    # No default secret: the application refuses to start in production without one.
    jwt_secret: str = Field("", alias="SASH_JWT_SECRET")
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(60, alias="SASH_ACCESS_TOKEN_MINUTES")
    login_max_failures: int = Field(5, alias="SASH_LOGIN_MAX_FAILURES")
    login_lockout_minutes: int = Field(15, alias="SASH_LOGIN_LOCKOUT_MINUTES")
    cors_origins: list[str] = Field(default_factory=list, alias="SASH_CORS_ORIGINS")

    # --- Rate limiting (requests per minute) -------------------------------
    rate_limit_default_per_min: int = Field(600, alias="SASH_RATE_LIMIT_DEFAULT")
    rate_limit_login_per_min: int = Field(10, alias="SASH_RATE_LIMIT_LOGIN")

    # --- Demo mode --------------------------------------------------------
    demo_mode: bool = Field(True, alias="SASH_DEMO_MODE")
    demo_seed_on_start: bool = Field(True, alias="SASH_DEMO_SEED_ON_START")
    demo_reseed_if_older_than_hours: int = Field(24, alias="SASH_DEMO_RESEED_HOURS")
    demo_admin_email: str = Field("admin@sash.demo", alias="SASH_DEMO_ADMIN_EMAIL")
    demo_admin_password: str = Field("", alias="SASH_DEMO_ADMIN_PASSWORD")
    demo_analyst_password: str = Field("", alias="SASH_DEMO_ANALYST_PASSWORD")
    demo_customer_password: str = Field("", alias="SASH_DEMO_CUSTOMER_PASSWORD")
    demo_live_feed: bool = Field(True, alias="SASH_DEMO_LIVE_FEED")

    # --- Worker -------------------------------------------------------------
    analytics_interval_seconds: int = Field(600, alias="SASH_ANALYTICS_INTERVAL")
    feed_interval_seconds: int = Field(60, alias="SASH_FEED_INTERVAL")

    # --- External data connectors (all optional; disabled without keys) -----
    ais_api_key: str = Field("", alias="AIS_API_KEY")
    aisstream_bbox: str = Field("-40,5,32,75", alias="AISSTREAM_BBOX")  # S,W,N,E
    nga_asam_enabled: bool = Field(False, alias="SASH_CONNECTOR_NGA_ASAM")
    ofac_sdn_enabled: bool = Field(False, alias="SASH_CONNECTOR_OFAC_SDN")
    open_meteo_enabled: bool = Field(False, alias="SASH_CONNECTOR_OPEN_METEO")
    open_meteo_api_key: str = Field("", alias="OPEN_METEO_API_KEY")
    alert_webhook_url: str = Field("", alias="SASH_ALERT_WEBHOOK_URL")

    # --- Model / detection configuration files ----------------------------
    config_dir: Path = Field(BACKEND_ROOT / "config", alias="SASH_CONFIG_DIR")
    data_dir: Path = Field(BACKEND_ROOT / "data", alias="SASH_DATA_DIR")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    def validate_for_startup(self) -> None:
        if not self.jwt_secret or len(self.jwt_secret) < 32:
            if self.is_production:
                raise RuntimeError(
                    "SASH_JWT_SECRET must be set to a random value of at least 32 characters"
                )


@lru_cache
def get_settings() -> Settings:
    return Settings()
