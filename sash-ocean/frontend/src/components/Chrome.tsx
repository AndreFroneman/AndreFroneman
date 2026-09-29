import { useEffect, useMemo, useState } from "react";
import { api, setToken } from "../lib/api";
import {
  ALERT_SEVERITY_COLOR,
  BAND_COLOR,
  CAT,
  INCIDENT_GROUP_COLOR,
  INCIDENT_GROUP_LABEL,
  fmtAgo,
  fmtTime,
  titleCase,
} from "../lib/format";
import type { Alert, Layers, Me, Selection, ThreatStatus, TimelineItem, VesselSummary, Watchlist } from "../lib/types";
import { BandChip } from "./VesselPanel";

export function Logo() {
  return (
    <div className="logo" aria-label="SASH Ocean">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M4 20c3 0 3-3 6-3s3 3 6 3 3-3 6-3 3 3 6 3" fill="none" stroke="#3987e5" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M16 5l6 10H10z" fill="#f07a3f" />
      </svg>
      <span className="word">SASH <b>OCEAN</b></span>
    </div>
  );
}

// --- Login ------------------------------------------------------------------------------------
export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ demo_mode: boolean; disclaimer: string } | null>(null);
  useEffect(() => {
    fetch("/v1/system/info").then((r) => r.json()).then(setInfo).catch(() => undefined);
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (mfaToken) {
        const r = await api.post<{ access_token: string }>("/v1/auth/mfa/verify", { mfa_token: mfaToken, code });
        setToken(r.access_token);
        onLoggedIn();
      } else {
        const r = await api.post<{ access_token?: string; mfa_required?: boolean; mfa_token?: string }>("/v1/auth/login", { email, password });
        if (r.mfa_required && r.mfa_token) setMfaToken(r.mfa_token);
        else if (r.access_token) {
          setToken(r.access_token);
          onLoggedIn();
        }
      }
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <Logo />
        <div className="tagline">Maritime Risk Intelligence Platform</div>
        {!mfaToken ? (
          <>
            <label>Email<input autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          </>
        ) : (
          <label>Authenticator code<input inputMode="numeric" pattern="\d{6}" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        )}
        <button className="btn primary" disabled={busy}>{busy ? "Signing in…" : mfaToken ? "Verify" : "Sign in"}</button>
        {err && <div className="panel-error">{err}</div>}
        {info?.demo_mode && (
          <div className="demo-hint">
            <b>Demo mode.</b> All vessels, incidents and zones are <b>synthetic</b>. Demo accounts: admin@sash.demo,
            analyst@sash.demo, customer@sash.demo (passwords are set in <code>.env</code>).
          </div>
        )}
        <div className="disclaimer">{info?.disclaimer}</div>
      </form>
    </div>
  );
}

// --- Top bar --------------------------------------------------------------------------------------
export function TopBar({ me, threat, openAlerts, demo, vessels, onSearchPick, onToggleAlerts, onLogout }: {
  me: Me; threat: ThreatStatus | null; openAlerts: number; demo: boolean; vessels: VesselSummary[];
  onSearchPick: (s: Selection) => void; onToggleAlerts: () => void; onLogout: () => void;
}) {
  const [q, setQ] = useState("");
  const [threatOpen, setThreatOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return vessels.filter((v) => (v.name ?? "").toLowerCase().includes(s) || v.imo === s || v.mmsi === s).slice(0, 8);
  }, [q, vessels]);
  const lvl = threat?.overall ?? "LOW";
  const lvlBand = lvl === "CRITICAL" ? "SEVERE" : lvl;
  return (
    <header className="topbar">
      <Logo />
      <div className="search">
        <input placeholder="Search vessel name, IMO or MMSI…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Global search" />
        {hits.length > 0 && (
          <ul className="search-hits" role="listbox">
            {hits.map((v) => (
              <li key={v.id}>
                <button onClick={() => { onSearchPick({ kind: "vessel", id: v.id }); setQ(""); }}>
                  <b>{v.name}</b> <span className="muted">IMO {v.imo ?? "—"} · MMSI {v.mmsi}</span>
                  <BandChip band={v.risk.band} score={v.risk.score} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="threat">
        <button className="threat-btn" onClick={() => setThreatOpen(!threatOpen)} aria-expanded={threatOpen}>
          <span className="swatch" style={{ background: BAND_COLOR[lvlBand as keyof typeof BAND_COLOR] ?? BAND_COLOR.LOW }} />
          THREAT STATUS: <b>{lvl}</b>
        </button>
        {threatOpen && threat && (
          <div className="threat-pop">
            <div className="eyebrow">Designated areas {threat.dataset === "SYNTHETIC-DEMO" && "(demo)"}</div>
            <table className="mini">
              <thead><tr><th>Area</th><th>Level</th><th>Inc. 7d</th><th>30d</th><th>Vessels</th></tr></thead>
              <tbody>
                {threat.areas.map((a) => (
                  <tr key={a.zone_id}><td>{a.name}</td><td><BandChip band={a.severity === "CRITICAL" ? "SEVERE" : a.severity} /></td>
                    <td>{a.incidents_7d}</td><td>{a.incidents_30d}</td><td>{a.vessels_inside}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {demo && <span className="demo-badge" title="All data shown is synthetic demonstration data">DEMO · SYNTHETIC DATA</span>}
      <div className="spacer" />
      <span className="clock" title="UTC">{new Date(now).toISOString().slice(11, 16)}Z</span>
      <button className="bell" onClick={onToggleAlerts} aria-label={`${openAlerts} open alerts`}>
        ALERTS <span className={`count ${openAlerts ? "hot" : ""}`}>{openAlerts}</span>
      </button>
      <div className="user">
        <div className="who">{me.full_name ?? me.label}<span className="muted"> · {me.role} · {me.tier}</span></div>
        <button className="btn ghost" onClick={onLogout}>Sign out</button>
      </div>
    </header>
  );
}

// --- Left panel ------------------------------------------------------------------------------------
export interface Filters {
  q: string;
  vesselType: string;
  minRisk: number;
  incidentGroups: Record<"hostile" | "crime" | "safety", boolean>;
  incidentDays: number;
}

export function LeftPanel(p: {
  me: Me; vessels: VesselSummary[]; watchlists: Watchlist[]; activeWatchlist: string | null; filters: Filters; layers: Layers;
  areaMode: boolean; dataSources: { key: string; name: string; licensing_category: string; enabled: boolean; health: string }[];
  selection: Selection;
  setFilters: (f: Filters) => void; setLayers: (l: Layers) => void; setActiveWatchlist: (id: string | null) => void;
  onSelect: (s: Selection) => void; setAreaMode: (b: boolean) => void; onWatchlistsChanged: () => void;
}) {
  const [tab, setTab] = useState<"vessels" | "watchlists" | "layers" | "tools">("vessels");
  const [newWl, setNewWl] = useState("");
  const types = useMemo(() => Array.from(new Set(p.vessels.map((v) => v.vessel_type).filter(Boolean))).sort() as string[], [p.vessels]);
  const f = p.filters;
  const createWl = async () => {
    if (!newWl.trim()) return;
    await api.post("/v1/watchlists", { name: newWl.trim(), items: [] });
    setNewWl("");
    p.onWatchlistsChanged();
  };
  const selId = p.selection?.kind === "vessel" ? p.selection.id : null;
  return (
    <nav className="panel left" aria-label="Navigation">
      <div className="tabs" role="tablist">
        {(["vessels", "watchlists", "layers", "tools"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{titleCase(t)}</button>
        ))}
      </div>
      {tab === "vessels" && (
        <div className="tab-body">
          <input className="filter-input" placeholder="Filter vessels…" value={f.q} onChange={(e) => p.setFilters({ ...f, q: e.target.value })} />
          <div className="row">
            <select value={f.vesselType} onChange={(e) => p.setFilters({ ...f, vesselType: e.target.value })} aria-label="Vessel type">
              <option value="">All types</option>
              {types.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </select>
            <select value={f.minRisk} onChange={(e) => p.setFilters({ ...f, minRisk: Number(e.target.value) })} aria-label="Minimum risk">
              <option value={0}>Any risk</option>
              <option value={25}>≥ Moderate</option>
              <option value={45}>≥ Elevated</option>
              <option value={65}>≥ High</option>
            </select>
          </div>
          {p.activeWatchlist && (
            <div className="wl-filter">Watchlist: <b>{p.watchlists.find((w) => w.id === p.activeWatchlist)?.name}</b>
              <button className="link" onClick={() => p.setActiveWatchlist(null)}>clear</button></div>
          )}
          <ul className="vessel-list">
            {p.vessels.map((v) => (
              <li key={v.id} className={selId === v.id ? "sel" : ""}>
                <button onClick={() => p.onSelect({ kind: "vessel", id: v.id })}>
                  <span className="risk-dot" style={{ background: BAND_COLOR[v.risk.band ?? "LOW"] }} />
                  <span className="vn">{v.name ?? v.mmsi}</span>
                  <span className="vt">{titleCase(v.vessel_type)} · {v.flag}</span>
                  <span className="vr">{v.risk.score ?? "—"}<small>{v.risk.trend === "Increasing" ? " ▲" : v.risk.trend === "Decreasing" ? " ▼" : ""}</small></span>
                </button>
              </li>
            ))}
            {p.vessels.length === 0 && <li className="muted">No vessels match.</li>}
          </ul>
        </div>
      )}
      {tab === "watchlists" && (
        <div className="tab-body">
          <ul className="wl-list">
            {p.watchlists.map((w) => (
              <li key={w.id} className={p.activeWatchlist === w.id ? "sel" : ""}>
                <button onClick={() => p.setActiveWatchlist(p.activeWatchlist === w.id ? null : w.id)}>
                  <b>{w.name}</b>
                  <span className="muted small">{w.vessel_ids.length} vessels · {w.open_alerts} open alerts · max risk {w.max_risk ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          {(p.me.all_features || p.me.features.includes("watchlists")) && (
            <div className="row">
              <input className="filter-input" placeholder="New watchlist name" value={newWl} onChange={(e) => setNewWl(e.target.value)} />
              <button className="btn" onClick={createWl}>Create</button>
            </div>
          )}
          <div className="small muted">Watchlists monitor vessels, IMO/MMSI identifiers, fleets (operator) or areas. Selecting one filters the map and alerts.</div>
        </div>
      )}
      {tab === "layers" && (
        <div className="tab-body">
          <div className="section-label">Map layers</div>
          {(Object.keys(p.layers) as (keyof Layers)[]).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={p.layers[k]} onChange={(e) => p.setLayers({ ...p.layers, [k]: e.target.checked })} />
              {titleCase(k === "zones" ? "risk zones" : k === "assets" ? "offshore assets" : k === "tracks" ? "vessel tracks (24 h)" : k === "contacts" ? "contacts (radar/EO/RF)" : k)}
            </label>
          ))}
          <div className="section-label">Incident categories</div>
          {(Object.keys(f.incidentGroups) as (keyof Filters["incidentGroups"])[]).map((g) => (
            <label key={g} className="check">
              <input type="checkbox" checked={f.incidentGroups[g]} onChange={(e) => p.setFilters({ ...f, incidentGroups: { ...f.incidentGroups, [g]: e.target.checked } })} />
              <span className="swatch" style={{ background: INCIDENT_GROUP_COLOR[g] }} />{INCIDENT_GROUP_LABEL[g]}
            </label>
          ))}
          <label className="small">Incidents from last&nbsp;
            <select value={f.incidentDays} onChange={(e) => p.setFilters({ ...f, incidentDays: Number(e.target.value) })}>
              {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <div className="section-label">Legend — SASH Risk Indicator band</div>
          <div className="legend">{(["LOW", "MODERATE", "ELEVATED", "HIGH", "SEVERE"] as const).map((b) => <BandChip key={b} band={b} />)}</div>
          <div className="legend small">
            <span><span className="shape diamond" style={{ borderColor: CAT.violet }} /> Unidentified contact</span>
            <span><span className="shape diamond" style={{ borderColor: CAT.aqua }} /> Correlated contact</span>
            <span><span className="shape square" style={{ background: CAT.blue }} /> Offshore asset</span>
          </div>
        </div>
      )}
      {tab === "tools" && (
        <div className="tab-body">
          <button className="btn wide" onClick={() => p.onSelect({ kind: "voyage-risk" })}>Voyage risk calculator</button>
          <button className={`btn wide ${p.areaMode ? "primary" : ""}`} onClick={() => p.setAreaMode(!p.areaMode)}>
            {p.areaMode ? "Area risk: click the map…" : "Area risk (click on map)"}
          </button>
          <a className="btn wide" href="/docs" target="_blank" rel="noopener noreferrer">API documentation ↗</a>
          <div className="section-label">Data sources &amp; licensing</div>
          <ul className="sources">
            {p.dataSources.map((s) => (
              <li key={s.key}><b>{s.name}</b>
                <div className="small muted">{s.licensing_category} · {s.enabled ? s.health.toLowerCase() : "disabled"}</div></li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

// --- Alerts drawer -----------------------------------------------------------------------------------
export function AlertsDrawer({ alerts, watchlistName, onClose, onSelect, onChanged }: {
  alerts: Alert[]; watchlistName: string | null; onClose: () => void; onSelect: (s: Selection) => void; onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<"NEW" | "ALL">("NEW");
  const shown = alerts.filter((a) => status === "ALL" || a.status === "NEW");
  const act = async (id: string, action: "acknowledge" | "close") => {
    await api.post(`/v1/alerts/${id}/${action}`, {});
    onChanged();
  };
  return (
    <aside className="drawer" aria-label="Alerts">
      <header className="panel-head">
        <div>
          <div className="eyebrow">ALERTS {watchlistName && `· ${watchlistName}`}</div>
          <h2>{shown.length} {status === "NEW" ? "open" : "total"}</h2>
        </div>
        <div className="row">
          <select value={status} onChange={(e) => setStatus(e.target.value as "NEW" | "ALL")} aria-label="Status filter">
            <option value="NEW">Open</option><option value="ALL">All</option>
          </select>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
      </header>
      <ul className="alert-list">
        {shown.map((a) => (
          <li key={a.id} className={`alert ${open === a.id ? "open" : ""}`}>
            <button className="alert-head" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <span className="sev" style={{ borderColor: ALERT_SEVERITY_COLOR[a.severity] }}>{a.severity}</span>
              <span className="title">{a.title}</span>
              <span className="muted small">{fmtTime(a.event_time)} · {fmtAgo(a.event_time)}{a.status !== "NEW" ? ` · ${a.status.toLowerCase()}` : ""}</span>
            </button>
            {open === a.id && (
              <div className="alert-body">
                <dl className="kv">
                  <dt>Vessel</dt><dd>{a.vessel ? <button className="link" onClick={() => onSelect({ kind: "vessel", id: a.vessel!.id })}>{a.vessel.name}</button> : "—"}</dd>
                  <dt>Location</dt><dd>{a.location.description ?? "—"}</dd>
                  <dt>Event</dt><dd>{titleCase(a.type)}</dd>
                  <dt>Risk change</dt><dd>{a.risk_change.before ?? "—"} → {a.risk_change.after ?? "—"}</dd>
                </dl>
                <div className="section-label">Evidence</div>
                {a.evidence.map((e, k) => (
                  <div key={k} className="small ev"><span className={`tag ${e.kind === "OBSERVATION" ? "obs" : e.kind === "INFERENCE" ? "inf" : "asm"}`}>{e.kind}</span>{e.text}</div>
                ))}
                <div className="section-label">Recommended analyst action</div>
                <div className="small action">{a.recommended_analyst_action}</div>
                {a.status === "NEW" && (
                  <div className="row">
                    <button className="btn" onClick={() => act(a.id, "acknowledge")}>Acknowledge</button>
                    <button className="btn ghost" onClick={() => act(a.id, "close")}>Close</button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="muted pad">No alerts.</li>}
      </ul>
    </aside>
  );
}

// --- Bottom timeline ---------------------------------------------------------------------------------------
export function BottomTimeline({ items, onPick }: { items: TimelineItem[]; onPick: (it: TimelineItem) => void }) {
  const [types, setTypes] = useState({ INCIDENT: true, AIS_ANOMALY: true, ALERT: true });
  const [collapsed, setCollapsed] = useState(false);
  const shown = items.filter((i) => types[i.type]);
  const now = Date.now();
  const span = 72 * 3600000;
  const colorFor = (i: TimelineItem) => i.type === "INCIDENT" ? CAT.magenta : i.type === "ALERT" ? (ALERT_SEVERITY_COLOR[i.severity] ?? CAT.blue) : CAT.yellow;
  return (
    <section className={`bottom ${collapsed ? "collapsed" : ""}`} aria-label="Event timeline">
      <div className="tl-head">
        <span className="eyebrow">TIMELINE · LAST 72 H</span>
        {(Object.keys(types) as (keyof typeof types)[]).map((t) => (
          <label key={t} className="check inline">
            <input type="checkbox" checked={types[t]} onChange={(e) => setTypes({ ...types, [t]: e.target.checked })} />
            {t === "AIS_ANOMALY" ? "AIS anomalies" : titleCase(t) + "s"}
          </label>
        ))}
        <div className="spacer" />
        <button className="btn ghost" onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Expand" : "Collapse"}</button>
      </div>
      {!collapsed && (
        <>
          <div className="tl-axis" role="img" aria-label="Events on a 72-hour axis">
            {[72, 48, 24, 0].map((h) => <span key={h} className="tick" style={{ left: `${100 - (h / 72) * 100}%` }}>{h ? `-${h}h` : "now"}</span>)}
            {shown.map((i, k) => {
              const x = 100 - ((now - new Date(i.time).getTime()) / span) * 100;
              if (x < 0) return null;
              return <button key={k} className="tl-mark" style={{ left: `${x}%`, background: colorFor(i) }} title={`${fmtTime(i.time)} · ${i.title}${i.vessel_name ? ` · ${i.vessel_name}` : ""}`} onClick={() => onPick(i)} />;
            })}
          </div>
          <ul className="tl-list">
            {shown.slice(0, 80).map((i, k) => (
              <li key={k}>
                <button onClick={() => onPick(i)}>
                  <span className="t">{fmtTime(i.time)}</span>
                  <span className="kind" style={{ borderColor: colorFor(i) }}>{i.type === "AIS_ANOMALY" ? "AIS" : i.type === "INCIDENT" ? "INC" : i.severity}</span>
                  <span className="txt">{i.title}{i.vessel_name ? <span className="muted"> · {i.vessel_name}</span> : null}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
