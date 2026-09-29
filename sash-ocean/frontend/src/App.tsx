import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertsDrawer, BottomTimeline, type Filters, LeftPanel, Login, TopBar } from "./components/Chrome";
import { type MapOverlay, MapView } from "./components/MapView";
import { AreaRiskPanel, AssetPanel, ContactPanel, IncidentPanel, VoyageRiskPanel, ZonePanel } from "./components/Panels";
import { ReplayBar, ReplayPanel, useReplay } from "./components/Replay";
import { VesselPanel } from "./components/VesselPanel";
import { api, getToken, setToken, setUnauthorizedHandler } from "./lib/api";
import { incidentGroup } from "./lib/format";
import type { Alert, Asset, Contact, Incident, Layers, Me, Selection, Sensor, ThreatStatus, TimelineItem, VesselSummary, Watchlist } from "./lib/types";

const POLL_MS = 30_000;
type FC = GeoJSON.FeatureCollection;

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [me, setMe] = useState<Me | null>(null);
  const [vessels, setVessels] = useState<VesselSummary[]>([]);
  const [tracks, setTracks] = useState<FC | null>(null);
  const [zones, setZones] = useState<FC | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [threat, setThreat] = useState<ThreatStatus | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [sources, setSources] = useState<{ key: string; name: string; licensing_category: string; enabled: boolean; health: string }[]>([]);
  const [demo, setDemo] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedTrack, setSelectedTrack] = useState<{ lat: number; lon: number }[] | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [activeWatchlist, setActiveWatchlist] = useState<string | null>(null);
  const [areaMode, setAreaMode] = useState(false);
  const [overlay, setOverlay] = useState<MapOverlay>({});
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; zoom?: number; key: number } | null>(null);
  const [replayVessel, setReplayVessel] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [layers, setLayers] = useState<Layers>({ vessels: true, tracks: true, contacts: true, incidents: true, zones: true, assets: true, sensors: false });
  const [filters, setFilters] = useState<Filters>({ q: "", vesselType: "", minRisk: 0, incidentGroups: { hostile: true, crime: true, safety: false }, incidentDays: 90 });
  const replay = useReplay(replayVessel);

  const logout = useCallback(() => {
    setToken(null);
    setAuthed(false);
    setMe(null);
  }, []);
  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  useEffect(() => {
    if (!authed) return;
    api.get<Me>("/v1/auth/me").then(setMe).catch(logout);
    fetch("/v1/system/info").then((r) => r.json()).then((i) => setDemo(!!i.demo_mode)).catch(() => undefined);
  }, [authed, logout]);

  const can = useCallback((f: string) => !!me && (me.all_features || me.features.includes(f)), [me]);

  const refreshWatchlists = useCallback(() => {
    if (can("watchlists")) api.get<{ watchlists: Watchlist[] }>("/v1/watchlists").then((r) => setWatchlists(r.watchlists)).catch(() => undefined);
  }, [can]);

  const refreshAlerts = useCallback(() => {
    if (!can("alerts")) return;
    const wl = activeWatchlist ? `&watchlist_id=${activeWatchlist}` : "";
    api.get<{ alerts: Alert[] }>(`/v1/alerts?limit=300${wl}`).then((r) => setAlerts(r.alerts)).catch(() => undefined);
  }, [can, activeWatchlist]);

  // Polling: the demo feed advances vessels every minute, analytics every 10 minutes.
  useEffect(() => {
    if (!me) return;
    const load = () => {
      const days = filters.incidentDays;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      if (can("vessels")) {
        api.get<{ vessels: VesselSummary[] }>("/v1/vessels?limit=2000").then((r) => setVessels(r.vessels)).catch(() => undefined);
        api.get<FC>("/v1/vessels/tracks/recent?hours=24").then(setTracks).catch(() => undefined);
      }
      api.get<{ incidents: Incident[] }>(`/v1/incidents?limit=2000&since=${encodeURIComponent(since)}`).then((r) => setIncidents(r.incidents)).catch(() => undefined);
      api.get<FC>("/v1/risk-zones").then(setZones).catch(() => undefined);
      api.get<ThreatStatus>("/v1/threat-status").then(setThreat).catch(() => undefined);
      api.get<{ items: TimelineItem[] }>("/v1/timeline?hours=72").then((r) => setTimeline(r.items)).catch(() => undefined);
      if (can("contacts")) {
        api.get<{ contacts: Contact[] }>("/v1/contacts?hours=24").then((r) => setContacts(r.contacts)).catch(() => undefined);
        api.get<{ sensors: Sensor[] }>("/v1/sensors").then((r) => setSensors(r.sensors)).catch(() => undefined);
      }
      if (can("assets")) api.get<{ assets: Asset[] }>("/v1/assets").then((r) => setAssets(r.assets)).catch(() => undefined);
      api.get<{ sources: typeof sources }>("/v1/data-sources").then((r) => setSources(r.sources)).catch(() => undefined);
      refreshAlerts();
      refreshWatchlists();
      setTick((t) => t + 1);
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [me, filters.incidentDays, can, refreshAlerts, refreshWatchlists]);

  // Selected vessel track (last 7 days) for context on the map.
  const selVessel = selection?.kind === "vessel" ? selection.id : null;
  useEffect(() => {
    if (!selVessel) {
      setSelectedTrack(null);
      return;
    }
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    api.get<{ points: { lat: number; lon: number }[] }>(`/v1/vessels/${selVessel}/track?max_points=1500&since=${encodeURIComponent(since)}`)
      .then((r) => setSelectedTrack(r.points)).catch(() => setSelectedTrack(null));
  }, [selVessel, tick]);

  const select = useCallback((s: Selection) => {
    setSelection(s);
    setAreaMode(false);
    if (s?.kind !== "area" && s?.kind !== "voyage-risk") setOverlay({});
    let pos: { lat: number; lon: number } | null = null;
    if (s?.kind === "vessel") pos = vessels.find((v) => v.id === s.id)?.position ?? null;
    if (s?.kind === "incident") pos = incidents.find((i) => i.id === s.id)?.position ?? null;
    if (s?.kind === "contact") pos = contacts.find((c) => c.id === s.id)?.position ?? null;
    if (s?.kind === "asset") pos = assets.find((a) => a.id === s.id)?.position ?? null;
    if (pos && !replayVessel) setFlyTo({ ...pos, key: Date.now(), zoom: s?.kind === "contact" || s?.kind === "asset" ? 8 : undefined });
  }, [vessels, incidents, contacts, assets, replayVessel]);

  const highlightIds = useMemo(() => {
    if (!activeWatchlist) return null;
    return watchlists.find((w) => w.id === activeWatchlist)?.vessel_ids ?? null;
  }, [activeWatchlist, watchlists]);

  const shownVessels = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return vessels.filter((v) =>
      (!q || (v.name ?? "").toLowerCase().includes(q) || v.imo === q || v.mmsi === q) &&
      (!filters.vesselType || v.vessel_type === filters.vesselType) &&
      (v.risk.score ?? 0) >= filters.minRisk &&
      (!highlightIds || highlightIds.includes(v.id)));
  }, [vessels, filters, highlightIds]);

  const shownIncidents = useMemo(() => incidents.filter((i) => filters.incidentGroups[incidentGroup(i.category)]), [incidents, filters.incidentGroups]);
  const openAlerts = alerts.filter((a) => a.status === "NEW").length;

  if (!authed) return <Login onLoggedIn={() => setAuthed(true)} />;
  if (!me) return <div className="boot">SASH OCEAN · loading…</div>;

  const zoneFeature = selection?.kind === "zone" ? zones?.features.find((f) => String(f.properties?.id) === selection.id) : undefined;
  const assetSel = selection?.kind === "asset" ? assets.find((a) => a.id === selection.id) : undefined;
  const close = () => { setSelection(null); setOverlay({}); };

  let right: React.ReactNode = null;
  if (replayVessel) right = <ReplayPanel r={replay} onSelect={select} />;
  else if (selection?.kind === "vessel")
    right = <VesselPanel vesselId={selection.id} me={me} watchlists={watchlists} refreshKey={Math.floor(tick / 2)} onClose={close}
      onReplay={(id) => { setReplayVessel(id); setAlertsOpen(false); }} onSelect={select} onWatchlistsChanged={refreshWatchlists} />;
  else if (selection?.kind === "incident") right = <IncidentPanel id={selection.id} onClose={close} onSelect={select} />;
  else if (selection?.kind === "contact") right = <ContactPanel id={selection.id} onClose={close} onSelect={select} />;
  else if (assetSel) right = <AssetPanel asset={assetSel} onClose={close} />;
  else if (zoneFeature) right = <ZonePanel feature={zoneFeature} onClose={close} />;
  else if (selection?.kind === "area") right = <AreaRiskPanel lat={selection.lat} lon={selection.lon} onClose={close} onSelect={select} setOverlay={setOverlay} />;
  else if (selection?.kind === "voyage-risk") right = <VoyageRiskPanel onClose={close} onSelect={select} setOverlay={setOverlay} />;

  return (
    <div className={`app ${right ? "with-right" : ""}`}>
      <TopBar me={me} threat={threat} openAlerts={openAlerts} demo={demo} vessels={vessels} onSearchPick={select}
        onToggleAlerts={() => setAlertsOpen(!alertsOpen)} onLogout={logout} />
      <LeftPanel me={me} vessels={shownVessels} watchlists={watchlists} activeWatchlist={activeWatchlist} filters={filters}
        layers={layers} areaMode={areaMode} dataSources={sources} selection={selection} setFilters={setFilters} setLayers={setLayers}
        setActiveWatchlist={setActiveWatchlist} onSelect={select} setAreaMode={setAreaMode} onWatchlistsChanged={refreshWatchlists} />
      <main className="centre">
        <MapView vessels={replayVessel ? [] : shownVessels} tracks={tracks} zones={zones} incidents={replayVessel ? [] : shownIncidents}
          contacts={contacts} assets={assets} sensors={sensors} layers={layers} selection={selection} selectedTrack={selectedTrack}
          highlightIds={highlightIds} replay={replay.bundle} replayCursor={replay.cursor} overlay={overlay} areaMode={areaMode}
          flyTo={flyTo} onSelect={select} />
        {areaMode && <div className="map-hint">Click anywhere on the map to assess SASH AREA RISK · <button className="link" onClick={() => setAreaMode(false)}>cancel</button></div>}
        {alertsOpen && (
          <AlertsDrawer alerts={alerts} watchlistName={watchlists.find((w) => w.id === activeWatchlist)?.name ?? null}
            onClose={() => setAlertsOpen(false)} onSelect={(s) => { select(s); }} onChanged={refreshAlerts} />
        )}
      </main>
      {right}
      {replayVessel ? (
        <ReplayBar r={replay} onExit={() => setReplayVessel(null)} />
      ) : (
        <BottomTimeline items={timeline} onPick={(it) => {
          if (it.type === "INCIDENT") select({ kind: "incident", id: it.ref_id });
          else if (it.vessel_id) select({ kind: "vessel", id: it.vessel_id });
          else if (it.lat !== undefined && it.lon !== undefined) setFlyTo({ lat: it.lat, lon: it.lon, key: Date.now() });
        }} />
      )}
    </div>
  );
}
