"""SQLAlchemy models. Importing this package registers every table on Base.metadata."""
from app.models.alerts import Alert, Watchlist, WatchlistItem
from app.models.environment import (
    AnalyticsRun,
    EnvironmentObservation,
    SanctionsEntry,
    SyntheticFeedQueue,
)
from app.models.events import (
    AisGapEvent,
    AssetProximityEvent,
    LoiteringEvent,
    RouteDeviationEvent,
    StopEvent,
    ZoneExposure,
)
from app.models.identity import ApiKey, AuditLog, Organisation, User
from app.models.maritime import AisObservation, Port, Vessel, Voyage
from app.models.provenance import DataSource
from app.models.risk import RiskAssessment
from app.models.security import Incident, IncidentProximity, RiskZone
from app.models.sensors import (
    Contact,
    ContactObservation,
    CorrelationHypothesis,
    EdgeNode,
    OffshoreAsset,
    Sensor,
    SensorObservation,
)

__all__ = [
    "AisGapEvent",
    "AisObservation",
    "Alert",
    "AnalyticsRun",
    "ApiKey",
    "AssetProximityEvent",
    "AuditLog",
    "Contact",
    "ContactObservation",
    "CorrelationHypothesis",
    "DataSource",
    "EdgeNode",
    "EnvironmentObservation",
    "Incident",
    "IncidentProximity",
    "LoiteringEvent",
    "OffshoreAsset",
    "Organisation",
    "Port",
    "RiskAssessment",
    "RiskZone",
    "RouteDeviationEvent",
    "SanctionsEntry",
    "Sensor",
    "SensorObservation",
    "StopEvent",
    "SyntheticFeedQueue",
    "User",
    "Vessel",
    "Voyage",
    "Watchlist",
    "WatchlistItem",
    "ZoneExposure",
]
