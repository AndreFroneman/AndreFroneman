import { useEffect, useState } from "react";
import { api, download } from "../lib/api";
import {
  BAND_COLOR,
  fmtAgo,
  fmtDuration,
  fmtLatLon,
  fmtTime,
  pct,
  titleCase,
} from "../lib/format";
import type { Contributor, Me, RiskPoint, RiskResult, Selection, VesselDetail, Watchlist } from "../lib/types";
import { RiskChart } from "./RiskChart";

interface Profile {
  historical_exposure: {
    voyages_analysed: number;
    elevated_risk_voyages: number;
    high_risk_zone_transits: number;
    elevated_risk_exposure_hours: number;
    ais_anomalies: number;
    route_deviations: number;
    loitering_events: number;
    unexpected_stops: number;
    nearby_security_incidents_total: number;
    confirmed_vessel_incidents: number;
    note: string;
  };
  sanctions_screening: { status: string; detail: string };
  disclaimer: string;
}

interface Why {
  from: string;
  to: string;
  score_before: number | null;
  score_after: number | null;
  summary: string;
  timeline: { time: string; kind: string; text: string; ref_type: string | null; ref_id: string | null }[];
  contributor_changes: { rule: string; label: string; points_before: number; points_after: number; delta: number; status: string }[];
}

interface Anomalies {
  ais_gaps: { id: string; gap_start: string; duration_s: number; coverage_quality: string; anomaly_confidence: number; observation: string; inference: string; ongoing: boolean }[];
  route_deviations: { id: string; start: string; max_deviation_km: number; confidence: number; observation: string; inference: string }[];
  loitering: { id: string; start: string; duration_s: number; confidence: number; observation: string; inference: string }[];
  unexpected_stops: { id: string; start: string; duration_s: number; confidence: number; observation: string; inference: string }[];
  zone_exposures: { id: string; zone: string; entry_time: string; exit_time: string | null; duration_s: number; max_threat_level: string; ongoing: boolean }[];
}

interface Props {
  vesselId: string;
  me: Me;
  watchlists: Watchlist[];
  refreshKey: number;
  onClose: () => void;
  onReplay: (vesselId: string) => void;
  onSelect: (s: Selection) => void;
  onWatchlistsChanged: () => void;
}

export function BandChip({ band, score }: { band: string | null; score?: number | null }) {
  if (!band) return <span className="chip muted">not assessed</span>;
  return (
    <span className="band-chip">
      <span className="swatch" style={{ background: BAND_COLOR[band as keyof typeof BAND_COLOR] }} />
      {score !== undefined && score !== null ? `${score} · ` : ""}
      {band}
    </span>
  );
}

function trendGlyph(t: string | null) {
  if (t === "Increasing") return "▲ Increasing";
  if (t === "Decreasing") return "▼ Decreasing";
  return "■ Stable";
}

function ContributorRow({ c, onEvidence }: { c: Contributor; onEvidence: (type: string, id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`contrib ${open ? "open" : ""}`}>
      <button className="contrib-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="pts">+{c.points}</span>
        <span className="lbl">{c.label}</span>
        <span className="comp">{titleCase(c.component)}</span>
      </button>
      {open && (
        <div className="oia">
          <div><span className="tag obs">OBSERVATION</span>{c.observation}</div>
          <div><span className="tag inf">INFERENCE</span>{c.inference}</div>
          <div><span className="tag asm">ASSESSMENT</span>{c.assessment}</div>
          {c.evidence.length > 0 && (
            <div className="evidence">
              Evidence:{" "}
              {c.evidence.slice(0, 6).map((e) => (
                <button key={e.id} className="link" onClick={() => onEvidence(e.type, e.id)}>
                  {e.label}{e.distance_km ? ` (${Math.round(e.distance_km)} km)` : ""}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function VesselPanel({ vesselId, me, watchlists, refreshKey, onClose, onReplay, onSelect, onWatchlistsChanged }: Props) {
  const [v, setV] = useState<VesselDetail | null>(null);
  const [risk, setRisk] = useState<RiskResult | null>(null);
  const [hist, setHist] = useState<RiskPoint[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [anoms, setAnoms] = useState<Anomalies | null>(null);
  const [why, setWhy] = useState<Why | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wlPick, setWlPick] = useState("");
  const can = (f: string) => me.all_features || me.features.includes(f);

  useEffect(() => {
    setErr(null);
    setWhy(null);
    setWhyOpen(false);
    const id = encodeURIComponent(vesselId);
    api.get<VesselDetail>(`/v1/vessels/${id}`).then(setV).catch((e) => setErr(e.message));
    api.get<RiskResult>(`/v1/vessels/${id}/risk`).then(setRisk).catch(() => setRisk(null));
    api.get<{ points: RiskPoint[] }>(`/v1/vessels/${id}/risk/history`).then((r) => setHist(r.points.filter((p) => p.kind !== "CURRENT"))).catch(() => setHist([]));
    if (can("historical_exposure")) api.get<Profile>(`/v1/vessels/${id}/profile`).then(setProfile).catch(() => setProfile(null));
    api.get<Anomalies>(`/v1/vessels/${id}/anomalies`).then(setAnoms).catch(() => setAnoms(null));
  }, [vesselId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWhy = () => {
    setWhyOpen(!whyOpen);
    if (!why) api.get<Why>(`/v1/vessels/${encodeURIComponent(vesselId)}/risk/why`).then(setWhy).catch(() => setWhy(null));
  };

  const onEvidence = (type: string, id: string) => {
    if (type === "incident") onSelect({ kind: "incident", id });
    else if (type === "risk_zone") onSelect({ kind: "zone", id });
  };

  const addToWatchlist = async () => {
    if (!wlPick) return;
    await api.post(`/v1/watchlists/${wlPick}/items`, { item_type: "VESSEL", vessel_id: vesselId });
    setWlPick("");
    onWatchlistsChanged();
  };

  if (err) return <aside className="panel right"><div className="panel-error">{err}</div></aside>;
  if (!v) return <aside className="panel right"><div className="loading">Loading vessel…</div></aside>;
  const h = profile?.historical_exposure;
  const inLists = watchlists.filter((w) => w.vessel_ids.includes(v.id));

  return (
    <aside className="panel right" aria-label="Vessel intelligence">
      <header className="panel-head">
        <div>
          <div className="eyebrow">VESSEL SECURITY PROFILE {v.synthetic && <span className="syn">SYNTHETIC</span>}</div>
          <h2>{v.name ?? `MMSI ${v.mmsi}`}</h2>
          <div className="sub">
            {titleCase(v.vessel_type)} · Flag {v.flag ?? "—"} · IMO {v.imo ?? "—"} · MMSI {v.mmsi ?? "—"}
          </div>
          {v.operator && <div className="sub">Operator: {v.operator}</div>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>

      <section className="card">
        <h3>Current status</h3>
        <dl className="kv">
          <dt>Position</dt><dd>{fmtLatLon(v.position)}</dd>
          <dt>Speed / course</dt><dd>{v.sog?.toFixed(1) ?? "—"} kn · {v.cog?.toFixed(0) ?? "—"}°</dd>
          <dt>Nav status</dt><dd>{v.nav_status ?? "—"}</dd>
          <dt>Destination</dt><dd>{v.destination ?? "—"}</dd>
          <dt>ETA</dt><dd>{fmtTime(v.eta)}</dd>
          <dt>Last report</dt><dd>{fmtAgo(v.last_seen_at)}</dd>
        </dl>
      </section>

      <section className="card risk-card">
        <h3>SASH Maritime Risk Indicator</h3>
        {risk ? (
          <>
            <div className="risk-hero">
              <div className="score" style={{ borderColor: BAND_COLOR[risk.band] }}>
                <span className="num">{risk.score}</span><span className="den">/100</span>
              </div>
              <div className="risk-meta">
                <BandChip band={risk.band} />
                <div className={`trend ${risk.trend?.toLowerCase()}`}>{trendGlyph(risk.trend)}
                  {risk.previous_score !== null && <span className="muted"> (24 h ago: {risk.previous_score})</span>}</div>
                <div className="muted small">Confidence {pct(risk.confidence)} · as of {fmtTime(risk.as_of)}</div>
              </div>
            </div>
            <div className="components">
              {Object.entries(risk.components).map(([k, c]) => (
                <div key={k} className="comp-row">
                  <span>{c.label}</span>
                  <div className="bar"><div style={{ width: `${(c.points / c.cap) * 100}%` }} /></div>
                  <span className="num">{c.points}<span className="muted">/{c.cap}</span></span>
                </div>
              ))}
            </div>
            <div className="section-label">Contributors <span className="muted">(click for observation · inference · assessment)</span></div>
            {risk.contributors.length === 0 && <div className="muted small">No risk factors apply at the current position.</div>}
            <ul className="contribs">
              {risk.contributors.map((c) => <ContributorRow key={c.rule} c={c} onEvidence={onEvidence} />)}
            </ul>
            {risk.suppressed.length > 0 && (
              <details className="suppressed">
                <summary>{risk.suppressed.length} factor(s) not applied</summary>
                {risk.suppressed.map((s) => <div key={s.rule} className="small">{s.label} (+{s.points}): {s.reason}</div>)}
              </details>
            )}
            {(risk.data_quality.notes ?? []).map((n, i) => <div key={i} className="dq-note">{n}</div>)}
            <button className="btn why-btn" onClick={loadWhy} aria-expanded={whyOpen}>WHY? — explain the recent change</button>
            {whyOpen && (
              <div className="why">
                {!why && <div className="muted small">Loading…</div>}
                {why && (
                  <>
                    <ol className="why-timeline">
                      {why.timeline.length === 0 && <li className="muted">No events recorded in this window.</li>}
                      {why.timeline.map((e, i) => (
                        <li key={i}>
                          <span className="t">{fmtTime(e.time)}</span>
                          {e.ref_type === "incident" && e.ref_id ? (
                            <button className="link" onClick={() => onSelect({ kind: "incident", id: e.ref_id! })}>{e.text}</button>
                          ) : <span>{e.text}</span>}
                        </li>
                      ))}
                    </ol>
                    <div className="why-summary">{why.summary}</div>
                    <ul className="why-diff">
                      {why.contributor_changes.map((c) => (
                        <li key={c.rule}>
                          <span className={c.delta > 0 ? "up" : "down"}>{c.delta > 0 ? `+${c.delta}` : c.delta}</span> {c.label}
                          <span className="muted"> ({c.points_before} → {c.points_after})</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <div className="model-line">Model {risk.model_version} · config {risk.config_hash}</div>
          </>
        ) : (
          <div className="muted small">No assessment yet.</div>
        )}
      </section>

      {hist.length > 1 && (
        <section className="card">
          <h3>Risk over time <span className="muted">(14 days)</span></h3>
          <RiskChart points={hist} height={96} compact />
        </section>
      )}

      {h && (
        <section className="card">
          <h3>Historical exposure <span className="muted">(12 months)</span></h3>
          <div className="kpis">
            <div className="kpi"><div className="v">{h.voyages_analysed}</div><div className="l">Voyages analysed</div></div>
            <div className="kpi"><div className="v">{h.elevated_risk_voyages}</div><div className="l">Elevated-risk voyages</div></div>
            <div className="kpi"><div className="v">{h.high_risk_zone_transits}</div><div className="l">High-risk-zone transits</div></div>
            <div className="kpi"><div className="v">{Math.round(h.elevated_risk_exposure_hours)}</div><div className="l">Elevated exposure (h)</div></div>
            <div className="kpi"><div className="v">{h.ais_anomalies}</div><div className="l">AIS anomalies</div></div>
            <div className="kpi"><div className="v">{h.route_deviations}</div><div className="l">Route deviations</div></div>
            <div className="kpi"><div className="v">{h.loitering_events}</div><div className="l">Loitering events</div></div>
            <div className="kpi"><div className="v">{h.nearby_security_incidents_total}</div><div className="l">Nearby incidents</div></div>
            <div className="kpi"><div className="v">{h.confirmed_vessel_incidents}</div><div className="l">Confirmed vessel incidents</div></div>
          </div>
          <div className="muted small">{h.note}</div>
          {profile && <div className="small screening">Sanctions screening: <b>{titleCase(profile.sanctions_screening.status)}</b> — {profile.sanctions_screening.detail}</div>}
        </section>
      )}

      {anoms && (
        <section className="card">
          <h3>Behaviour &amp; exposure events</h3>
          <ul className="events">
            {anoms.ais_gaps.map((g) => (
              <li key={g.id}><b>AIS reporting anomaly</b> · {fmtTime(g.gap_start)} · {fmtDuration(g.duration_s)}{g.ongoing ? " (ongoing)" : ""}
                <div className="small muted">Coverage {g.coverage_quality.toLowerCase()} · anomaly confidence {pct(g.anomaly_confidence)}</div>
                <div className="small"><span className="tag obs">OBS</span>{g.observation}</div>
                <div className="small"><span className="tag inf">INF</span>{g.inference}</div></li>
            ))}
            {anoms.route_deviations.map((d) => (
              <li key={d.id}><b>Route deviation</b> · {fmtTime(d.start)} · max {Math.round(d.max_deviation_km)} km
                <div className="small"><span className="tag obs">OBS</span>{d.observation}</div>
                <div className="small"><span className="tag inf">INF</span>{d.inference}</div></li>
            ))}
            {anoms.loitering.map((l) => (
              <li key={l.id}><b>Loitering</b> · {fmtTime(l.start)} · {fmtDuration(l.duration_s)}
                <div className="small"><span className="tag obs">OBS</span>{l.observation}</div></li>
            ))}
            {anoms.unexpected_stops.map((s) => (
              <li key={s.id}><b>Unexpected stop</b> · {fmtTime(s.start)} · {fmtDuration(s.duration_s)}
                <div className="small"><span className="tag obs">OBS</span>{s.observation}</div></li>
            ))}
            {anoms.zone_exposures.map((z) => (
              <li key={z.id}><b>{z.zone}</b> <BandChip band={z.max_threat_level === "CRITICAL" ? "SEVERE" : z.max_threat_level} />
                <div className="small muted">{fmtTime(z.entry_time)} → {z.ongoing ? "inside now" : fmtTime(z.exit_time)} · {fmtDuration(z.duration_s)}</div></li>
            ))}
            {!anoms.ais_gaps.length && !anoms.route_deviations.length && !anoms.loitering.length &&
              !anoms.unexpected_stops.length && !anoms.zone_exposures.length && <li className="muted">No anomalies or risk-zone exposure recorded.</li>}
          </ul>
        </section>
      )}

      <section className="card actions">
        {can("voyage_replay") && <button className="btn primary" onClick={() => onReplay(v.id)}>▶ Voyage Replay</button>}
        {can("reports") && (
          <>
            <button className="btn" onClick={() => download(`/v1/vessels/${v.id}/report.pdf`, `sash-exposure-${v.imo ?? v.mmsi}.pdf`)}>PDF report</button>
            <button className="btn" onClick={() => download(`/v1/vessels/${v.id}/report.csv`, `sash-exposure-${v.imo ?? v.mmsi}.csv`)}>CSV</button>
          </>
        )}
        {can("watchlists") && watchlists.length > 0 && (
          <div className="wl-add">
            <select value={wlPick} onChange={(e) => setWlPick(e.target.value)} aria-label="Add to watchlist">
              <option value="">Add to watchlist…</option>
              {watchlists.filter((w) => !w.vessel_ids.includes(v.id)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="btn" disabled={!wlPick} onClick={addToWatchlist}>Add</button>
          </div>
        )}
        {inLists.length > 0 && <div className="small muted">On watchlists: {inLists.map((w) => w.name).join(", ")}</div>}
      </section>
      <footer className="disclaimer">{profile?.disclaimer ?? risk?.disclaimer}</footer>
    </aside>
  );
}
