"""Loads the model/detection/alert/entitlement YAML files and fingerprints them."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.core.config import get_settings


def _load(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def config_hash(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


@lru_cache
def risk_model() -> dict[str, Any]:
    return _load(get_settings().config_dir / "risk_model.yaml")


@lru_cache
def detection_config() -> dict[str, Any]:
    return _load(get_settings().config_dir / "detection.yaml")


@lru_cache
def alert_config() -> dict[str, Any]:
    return _load(get_settings().config_dir / "alerts.yaml")


@lru_cache
def entitlements_config() -> dict[str, Any]:
    return _load(get_settings().config_dir / "entitlements.yaml")


@lru_cache
def ports_data() -> list[dict[str, Any]]:
    return _load(get_settings().data_dir / "ports.yaml")["ports"]


@lru_cache
def lanes_data() -> dict[str, Any]:
    return _load(get_settings().data_dir / "shipping_lanes.yaml")


def reload_all() -> None:
    for fn in (risk_model, detection_config, alert_config, entitlements_config, ports_data, lanes_data):
        fn.cache_clear()
