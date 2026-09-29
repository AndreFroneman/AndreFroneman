"""SASH Ocean Edge node entrypoint.

Configuration (environment):
  SASH_CENTRAL_URL       https://sash.example.com
  SASH_EDGE_API_KEY      API key with the SENSOR role (never baked into images)
  SASH_EDGE_NODE         node code, e.g. EDGE-KESTREL-01
  SASH_EDGE_LINK         ETHERNET | LTE | PRIVATE_5G | MICROWAVE | LEO_SATELLITE | GEO_SATELLITE
  SASH_EDGE_STORE        /var/lib/sash-edge/queue.db
  SASH_EDGE_AIS_UDP_PORT 10110 (0 disables)
  SASH_EDGE_SIM_RADAR    "lat,lon" to enable the simulated radar (demonstrations only)
  SASH_EDGE_CA_BUNDLE    optional CA bundle for the central endpoint
  SASH_EDGE_ASSET        "lat,lon,radius_km" – local rule: contacts inside radius become EVENTs
"""
from __future__ import annotations

import logging
import os
import signal
import time

from sash_edge.adapters import SimulatedRadarAdapter, UdpNmeaAisAdapter
from sash_edge.local_rules import promote_near_asset
from sash_edge.store import StoreAndForward
from sash_edge.sync import LINK_PROFILES, HttpTransport, Uplink

log = logging.getLogger("sash.edge")
_stop = False


def _handle(*_):  # pragma: no cover
    global _stop
    _stop = True


def main() -> None:  # pragma: no cover - integration entrypoint
    logging.basicConfig(level=os.environ.get("SASH_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)
    node = os.environ["SASH_EDGE_NODE"]
    link = LINK_PROFILES[os.environ.get("SASH_EDGE_LINK", "LEO_SATELLITE")]
    store = StoreAndForward(os.environ.get("SASH_EDGE_STORE", "/var/lib/sash-edge/queue.db"))
    transport = HttpTransport(os.environ["SASH_CENTRAL_URL"], os.environ["SASH_EDGE_API_KEY"],
                              verify=os.environ.get("SASH_EDGE_CA_BUNDLE") or True)
    adapters = []
    port = int(os.environ.get("SASH_EDGE_AIS_UDP_PORT", "10110"))
    if port:
        adapters.append(UdpNmeaAisAdapter(f"{node}-AIS", port=port))
    if sim := os.environ.get("SASH_EDGE_SIM_RADAR"):
        lat, lon = (float(x) for x in sim.split(","))
        adapters.append(SimulatedRadarAdapter(f"{node}-RADAR", lat, lon))
    asset = os.environ.get("SASH_EDGE_ASSET")
    asset_cfg = tuple(float(x) for x in asset.split(",")) if asset else None
    uplink = Uplink(store, transport, node, {a.sensor_code: a.sensor_code for a in adapters}, link,
                    compress=link.name.endswith("SATELLITE"))
    log.info("edge node %s started (link=%s, adapters=%s)", node, link.name, [a.sensor_code for a in adapters])
    last_sync = 0.0
    while not _stop:
        for a in adapters:
            for obs in a.poll():
                if obs["kind"] == "sensor":
                    obs["payload"]["_sensor"] = a.sensor_code
                    if asset_cfg:
                        obs = promote_near_asset(obs, *asset_cfg)
                store.put(obs["kind"], obs["priority"], obs["dedup_key"], obs["payload"])
        if time.monotonic() - last_sync >= link.interval_s:
            last_sync = time.monotonic()
            log.info("sync: %s", uplink.sync_once())
        time.sleep(1)
    store.close()


if __name__ == "__main__":  # pragma: no cover
    main()
