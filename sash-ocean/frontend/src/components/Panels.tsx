import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  INCIDENT_GROUP_COLOR,
  INCIDENT_GROUP_LABEL,
  fmtDuration,
  fmtLatLon,
  fmtTime,
  incidentGroup,
  pct,
  titleCase,
} from "../lib/format";
import type { Asset, Contact, Incident, Provenance, Selection } from "../lib/types";
import type { MapOverlay } from "./MapView";
import { BandChip } from "./VesselPanel";

function Shell({ eyebrow, title, sub, synthetic, onClose, children }: {
  eyebrow: string; title: string; sub?: string; synthetic?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <aside className="panel right">
      <header className="panel-head">
        <div>
          <div className="eyebrow">{eyebrow} {synthetic && <span className="syn">SYNTHETIC</span>}</div>
          <h2>{title}</h2>
          {sub && <div className="sub">{sub}</div>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </header>
      {children}
    </aside>
  );
}

export function ProvenanceBlock({ p }: { p: Provenance }) {
  return (
    <section className="card">
      <h3>Provenance</h3>
      <dl className="kv">
        <dt>Source</dt><dd>{p.source ?? "—"}</dd>
        <dt>Licensing</dt><dd><span className="chip">{p.licensing_category ?? "—"}</span></dd>
        <dt>Reference</dt><dd>{p.source_reference ?? "—"}</dd>
        <dt>Original time</dt><dd>{fmtTime(p.original_timestamp)}</dd>
        <dt>Retrieved</dt><dd>{fmtTime(p.retrieved_at)}</dd>
        <dt>Confidence</dt><dd>{pct(p.confidence)}</dd>
      </dl>
      {p.source_url && <a className="small" href={p.source_url} target="_blank" rel="noopener noreferrer">Source link ↗</a>}
    </section>
  );
}

// --- Incident -------------------------------------------------------------------------
interface IncidentDetail extends Incident {
  vessels_nearby_at_incident_time: { vessel_id: string; name: string; distance_km: number; band_km: number; position_method: string }[];
  vessel_counts_by_band_km: Record<string, number>;
}

export function IncidentPanel({ id, onClose, onSelect }: { id: string; onClose: () => void; onSelect: (s: Selection) => void }) {
  const [i, setI] = useState<IncidentDetail | null>(null);
  useEffect(() => {
    setI(null);
    api.get<IncidentDetail>(`/v1/incidents/${id}`).then(setI).catch(() => setI(null));
  }, [id]);
  if (!i) return <aside className="panel right"><div className="loading">Loading incident…</div></aside>;
  const g = incidentGroup(i.category);
  return (
    <Shell eyebrow="SECURITY INCIDENT" title={i.title} sub={`${titleCase(i.category)} · ${fmtTime(i.occurred_at)}`} synthetic={i.provenance.synthetic} onClose={onClose}>
      <section className="card">
        <div className="band-chip"><span className="swatch" style={{ background: INCIDENT_GROUP_COLOR[g] }} />{INCIDENT_GROUP_LABEL[g]}</div>
        <p className="narrative">{i.narrative}</p>
        <dl className="kv">
          <dt>Position</dt><dd>{fmtLatLon(i.position)}</dd>
          <dt>Reported</dt><dd>{fmtTime(i.reported_at)}</dd>
          <dt>Verification</dt><dd>{titleCase(i.verification_status)}</dd>
          <dt>Affected vessel</dt><dd>{i.affected_vessel.name ?? "—"} {i.affected_vessel.type ? `(${i.affected_vessel.type})` : ""}</dd>
          <dt>Boarding / hijack</dt><dd>{i.boarding === null ? "—" : i.boarding ? "Yes" : "No"} / {i.hijacking === null ? "—" : i.hijacking ? "Yes" : "No"}</dd>
          <dt>Weapons</dt><dd>{i.weapons_reported ?? "—"}</dd>
          <dt>Casualties</dt><dd>{i.fatalities ?? 0} killed · {i.injuries ?? 0} injured · {i.hostages ?? 0} hostages</dd>
        </dl>
      </section>
      <section className="card">
        <h3>Vessels near the incident at incident time</h3>
        <div className="kpis four">
          {Object.entries(i.vessel_counts_by_band_km).map(([b, n]) => (
            <div key={b} className="kpi"><div className="v">{n}</div><div className="l">≤ {b} km</div></div>
          ))}
        </div>
        <ul className="events">
          {i.vessels_nearby_at_incident_time.map((v) => (
            <li key={v.vessel_id}>
              <button className="link" onClick={() => onSelect({ kind: "vessel", id: v.vessel_id })}>{v.name}</button>
              <span className="muted"> · {v.distance_km.toFixed(0)} km ({v.position_method.toLowerCase()})</span>
            </li>
          ))}
          {i.vessels_nearby_at_incident_time.length === 0 && <li className="muted">No tracked vessels within 250 km at the incident time.</li>}
        </ul>
      </section>
      <ProvenanceBlock p={i.provenance} />
    </Shell>
  );
}

// --- Contact (generic / dark contact) --------------------------------------------------------
interface ContactDetail extends Contact {
  observations: { t: string; sensor: string; sensor_type: string; detection_type: string; classification: string | null; uncertainty_m: number | null; speed_kn: number | null }[];
  hypotheses: { vessel_id: string; vessel_name: string | null; score: number; method: string; selected: boolean; evidence: { per_sensor: { sensor_type: string; distance_km: number; weighted_score: number }[] } }[];
  statement: { observation: string; inference: string };
}

export function ContactPanel({ id, onClose, onSelect }: { id: string; onClose: () => void; onSelect: (s: Selection) => void }) {
  const [c, setC] = useState<ContactDetail | null>(null);
  useEffect(() => {
    setC(null);
    api.get<ContactDetail>(`/v1/contacts/${id}`).then(setC).catch(() => setC(null));
  }, [id]);
  if (!c) return <aside className="panel right"><div className="loading">Loading contact…</div></aside>;
  const dark = c.identity_status === "UNIDENTIFIED";
  return (
    <Shell eyebrow={dark ? "UNIDENTIFIED MARITIME CONTACT" : "SENSOR CONTACT"} title={`Contact ${c.contact_code}`}
      sub={`${c.detection_sources.join(" + ")} · ${titleCase(c.classification)}`} synthetic={c.synthetic} onClose={onClose}>
      <section className="card">
        <dl className="kv">
          <dt>Identity</dt><dd><b>{c.label}</b>{c.correlated_vessel && <> — <button className="link" onClick={() => onSelect({ kind: "vessel", id: c.correlated_vessel!.id })}>{c.correlated_vessel.name}</button> ({pct(c.correlation_confidence)})</>}</dd>
          <dt>Position</dt><dd>{fmtLatLon(c.position)}</dd>
          <dt>Speed / course</dt><dd>{c.speed_kn?.toFixed(1) ?? "—"} kn · {c.course_deg?.toFixed(0) ?? "—"}°</dd>
          <dt>Tracked for</dt><dd>{fmtDuration(c.duration_s)} (since {fmtTime(c.first_seen, false)})</dd>
          <dt>Nearest AIS vessel</dt><dd>{c.nearest_ais_vessel ? `${c.nearest_ais_vessel.name} · ${c.nearest_ais_vessel.distance_km} km` : "none within 15 km"}</dd>
        </dl>
        <div className="small"><span className="tag obs">OBSERVATION</span>{c.statement.observation}</div>
        <div className="small"><span className="tag inf">INFERENCE</span>{c.statement.inference}</div>
        {dark && <div className="dq-note">An uncorrelated contact is not a hostile vessel. It may be a small craft not required to carry AIS, a vessel with AIS off or faulty, or a false detection.</div>}
      </section>
      <section className="card">
        <h3>Correlation hypotheses</h3>
        <ul className="events">
          {c.hypotheses.map((h) => (
            <li key={h.vessel_id}>
              <b>{h.vessel_name}</b> · score {pct(h.score)} {h.selected && <span className="chip">selected</span>}
              <div className="small muted">{h.evidence.per_sensor.map((s) => `${s.sensor_type} ${s.distance_km} km`).join(" · ")} · {h.method}</div>
            </li>
          ))}
          {c.hypotheses.length === 0 && <li className="muted">No AIS vessel inside the correlation gate.</li>}
        </ul>
      </section>
      <section className="card">
        <h3>Raw sensor observations <span className="muted">({c.observations.length})</span></h3>
        <table className="mini">
          <thead><tr><th>Time</th><th>Sensor</th><th>Type</th><th>±m</th></tr></thead>
          <tbody>
            {c.observations.slice(0, 12).map((o, k) => (
              <tr key={k}><td>{fmtTime(o.t, false)}</td><td>{o.sensor_type}</td><td>{titleCase(o.detection_type)}</td><td>{o.uncertainty_m ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </Shell>
  );
}

// --- Asset --------------------------------------------------------------------------------------
export function AssetPanel({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  return (
    <Shell eyebrow="OFFSHORE ASSET" title={asset.name} sub={`${titleCase(asset.asset_type)} · ${asset.operator ?? ""}`} synthetic={asset.provenance.synthetic} onClose={onClose}>
      <section className="card">
        <dl className="kv">
          <dt>Position</dt><dd>{fmtLatLon(asset.position)}</dd>
          <dt>Security radius</dt><dd>{asset.security_radius_km} km</dd>
          <dt>Monitoring radius</dt><dd>{asset.monitoring_radius_km} km</dd>
          <dt>Authorised vessels</dt><dd>{asset.authorised_vessels}</dd>
        </dl>
        <div className="small muted">Unknown vessels entering the monitoring radius and uncorrelated sensor contacts nearby raise alerts for analyst verification.</div>
      </section>
      <ProvenanceBlock p={asset.provenance} />
    </Shell>
  );
}

// --- Zone -------------------------------------------------------------------------------------------
export function ZonePanel({ feature, onClose }: { feature: GeoJSON.Feature; onClose: () => void }) {
  const p = feature.properties as { name: string; category: string; severity: string; description: string; effective_start: string; effective_end: string | null; provenance: Provenance };
  return (
    <Shell eyebrow="RISK ZONE" title={p.name} sub={titleCase(p.category)} synthetic={p.provenance?.synthetic} onClose={onClose}>
      <section className="card">
        <BandChip band={p.severity === "CRITICAL" ? "SEVERE" : p.severity} />
        <p className="narrative">{p.description}</p>
        <dl className="kv">
          <dt>Effective</dt><dd>{fmtTime(p.effective_start)} → {p.effective_end ? fmtTime(p.effective_end) : "open-ended"}</dd>
        </dl>
      </section>
      {p.provenance && <ProvenanceBlock p={p.provenance} />}
    </Shell>
  );
}

// --- Area risk ---------------------------------------------------------------------------------------
interface AreaRisk {
  risk_indicator: number;
  band: string;
  contributors: { rule: string; label: string; points: number; observation: string; inference: string }[];
  risk_zones: { name: string; severity: string }[];
  recent_incidents: { id: string; occurred_at: string; category: string; title: string; distance_km: number }[];
  threat_categories: Record<string, number>;
  incident_density_per_10k_km2: number;
  trend: string;
  confidence: number;
  sources: string[];
  dataset: string;
  disclaimer: string;
}

export function AreaRiskPanel({ lat, lon, onClose, onSelect, setOverlay }: {
  lat: number; lon: number; onClose: () => void; onSelect: (s: Selection) => void; setOverlay: (o: MapOverlay) => void;
}) {
  const [radius, setRadius] = useState(250);
  const [a, setA] = useState<AreaRisk | null>(null);
  useEffect(() => {
    setA(null);
    setOverlay({ area: { lat, lon, radiusKm: radius } });
    api.get<AreaRisk>(`/v1/area-risk?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&radius_km=${radius}`).then(setA).catch(() => setA(null));
  }, [lat, lon, radius]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Shell eyebrow="SASH AREA RISK" title={fmtLatLon({ lat, lon })} sub={`Radius ${radius} km · last 90 days`} synthetic={a?.dataset === "SYNTHETIC-DEMO"} onClose={onClose}>
      <section className="card">
        <label className="small">Radius&nbsp;
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
            {[50, 100, 250, 500].map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
        {!a ? <div className="loading">Assessing…</div> : (
          <>
            <div className="risk-hero small-hero">
              <div className="score"><span className="num">{a.risk_indicator}</span><span className="den">/100</span></div>
              <div className="risk-meta"><BandChip band={a.band} /><div className="small">Trend: {a.trend} · confidence {pct(a.confidence)}</div>
                <div className="small muted">{a.incident_density_per_10k_km2} incidents / 10,000 km²</div></div>
            </div>
            <ul className="contribs">
              {a.contributors.map((c) => (
                <li key={c.rule} className="contrib open"><div className="contrib-head static"><span className="pts">+{c.points}</span><span className="lbl">{c.label}</span></div>
                  <div className="oia"><div><span className="tag obs">OBSERVATION</span>{c.observation}</div><div><span className="tag inf">INFERENCE</span>{c.inference}</div></div></li>
              ))}
            </ul>
          </>
        )}
      </section>
      {a && (
        <>
          <section className="card">
            <h3>Threat categories</h3>
            <div className="cat-list">{Object.entries(a.threat_categories).map(([k, n]) => <span key={k} className="chip">{titleCase(k)} · {n}</span>)}</div>
            <h3>Recent incidents</h3>
            <ul className="events">
              {a.recent_incidents.slice(0, 10).map((i) => (
                <li key={i.id}><button className="link" onClick={() => onSelect({ kind: "incident", id: i.id })}>{i.title}</button>
                  <div className="small muted">{fmtTime(i.occurred_at)} · {Math.round(i.distance_km)} km</div></li>
              ))}
              {a.recent_incidents.length === 0 && <li className="muted">None in radius.</li>}
            </ul>
            <div className="small muted">Sources: {a.sources.join("; ") || "—"}</div>
          </section>
          <footer className="disclaimer">{a.disclaimer}</footer>
        </>
      )}
    </Shell>
  );
}

// --- Voyage risk --------------------------------------------------------------------------------------
interface VoyageRisk {
  origin: { name: string };
  destination: { name: string };
  distance_km: number;
  estimated_duration_hours: number;
  overall_risk_indicator: number;
  band: string;
  explanation: string;
  highest_risk_segments: { from_eta: string; to_eta: string; hours: number; max_score: number; band: string; zones: string[]; why: string[] }[];
  risk_zones_crossed: { zone: string; entry_eta: string; exit_eta: string; hours: number; severity: string }[];
  recent_incidents_near_route: { id: string; title: string; distance_to_route_km: number; occurred_at: string }[];
  estimated_exposure_hours: number;
  route: GeoJSON.LineString;
  samples: { lat: number; lon: number; score: number; band: string; eta: string }[];
  assumptions: string[];
  disclaimer: string;
  dataset: string;
}

export function VoyageRiskPanel({ onClose, onSelect, setOverlay }: { onClose: () => void; onSelect: (s: Selection) => void; setOverlay: (o: MapOverlay) => void }) {
  const [form, setForm] = useState({ origin: "Yanbu", destination: "Durban", departure: new Date().toISOString().slice(0, 16), speed: 13, vtype: "crude oil tanker" });
  const [res, setRes] = useState<VoyageRisk | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<VoyageRisk>("/v1/voyage-risk", {
        origin: form.origin, destination: form.destination, departure_time: new Date(form.departure + "Z").toISOString(),
        speed_kn: form.speed, vessel_type: form.vtype || null,
      });
      setRes(r);
      setOverlay({
        route: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: r.route }] },
        samples: { type: "FeatureCollection", features: r.samples.filter((_, k) => k % 3 === 0).map((s) => ({
          type: "Feature", properties: { band: s.band }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })) },
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell eyebrow="SASH VOYAGE RISK" title="Planned voyage exposure" sub="Approximate route exposure using current intelligence" onClose={() => { setOverlay({}); onClose(); }}>
      <section className="card form">
        <label>Origin<input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Port, UN/LOCODE or lat,lon" /></label>
        <label>Destination<input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
        <label>Departure (UTC)<input type="datetime-local" value={form.departure} onChange={(e) => setForm({ ...form, departure: e.target.value })} /></label>
        <div className="row">
          <label>Speed (kn)<input type="number" min={3} max={30} value={form.speed} onChange={(e) => setForm({ ...form, speed: Number(e.target.value) })} /></label>
          <label>Vessel type<select value={form.vtype} onChange={(e) => setForm({ ...form, vtype: e.target.value })}>
            {["", "crude oil tanker", "product tanker", "bulk carrier", "container ship", "general cargo", "lng carrier"].map((t) => <option key={t} value={t}>{t || "unspecified"}</option>)}
          </select></label>
        </div>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? "Assessing…" : "Assess voyage"}</button>
        {err && <div className="panel-error">{err}</div>}
      </section>
      {res && (
        <>
          <section className="card">
            <div className="risk-hero small-hero">
              <div className="score"><span className="num">{res.overall_risk_indicator}</span><span className="den">/100</span></div>
              <div className="risk-meta"><BandChip band={res.band} />
                <div className="small">{res.origin.name} → {res.destination.name} · {Math.round(res.distance_km)} km · {res.estimated_duration_hours.toFixed(0)} h</div>
                <div className="small muted">{res.explanation}</div></div>
            </div>
            <h3>Highest-risk segments</h3>
            <ul className="events">
              {res.highest_risk_segments.map((s, k) => (
                <li key={k}><BandChip band={s.band} score={s.max_score} /> {fmtTime(s.from_eta)} → {fmtTime(s.to_eta)} ({s.hours} h)
                  <div className="small muted">{s.zones.join("; ") || "outside designated zones"}</div>
                  <div className="small">{s.why.join(" · ")}</div></li>
              ))}
              {res.highest_risk_segments.length === 0 && <li className="muted">No segments at ELEVATED or above.</li>}
            </ul>
            <h3>Risk zones crossed</h3>
            <ul className="events">
              {res.risk_zones_crossed.map((z) => <li key={z.zone}>{z.zone} · <b>{z.hours} h</b> <span className="muted">({fmtTime(z.entry_eta)} → {fmtTime(z.exit_eta)})</span></li>)}
            </ul>
            <div className="small">Estimated exposure in elevated-or-higher areas: <b>{res.estimated_exposure_hours} h</b></div>
          </section>
          <section className="card">
            <h3>Recent incidents near route <span className="muted">({res.recent_incidents_near_route.length})</span></h3>
            <ul className="events">
              {res.recent_incidents_near_route.slice(0, 8).map((i) => (
                <li key={i.id}><button className="link" onClick={() => onSelect({ kind: "incident", id: i.id })}>{i.title}</button>
                  <span className="muted small"> · {Math.round(i.distance_to_route_km)} km from route</span></li>
              ))}
            </ul>
            <ul className="small muted assumptions">{res.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
          <footer className="disclaimer">{res.disclaimer}</footer>
        </>
      )}
    </Shell>
  );
}
