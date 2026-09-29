import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { BAND_COLOR, CAT, ZONE_SEVERITY_COLOR, fmtDuration, fmtLatLon, fmtTime, titleCase } from "../lib/format";
import type { Contributor, Incident, RiskPoint, Selection, VesselSummary } from "../lib/types";
import { type ChartEvent, RiskChart } from "./RiskChart";
import { BandChip } from "./VesselPanel";

export interface ReplayBundle {
  vessel: VesselSummary;
  voyage: { id: string; origin_port: string | null; destination_port: string | null; declared_destination: string | null;
    departure_time: string; arrival_time: string | null; status: string; distance_km: number; max_risk_score: number | null;
    elevated_exposure_hours: number } | null;
  window: { start: string; end: string };
  track: { t: string; lat: number; lon: number; sog: number | null; cog: number | null; rx: string | null }[];
  risk: RiskPoint[];
  anomalies: {
    ais_gaps: { id: string; gap_start: string; gap_end: string | null; duration_s: number; start_position: { lat: number; lon: number } | null;
      end_position: { lat: number; lon: number } | null; coverage_quality: string; anomaly_confidence: number; observation: string; inference: string }[];
    route_deviations: { id: string; start: string; end: string; max_deviation_km: number; expected_path: GeoJSON.Geometry | null; observation: string }[];
    loitering: { id: string; start: string; centre: { lat: number; lon: number }; observation: string }[];
    zone_exposures: { id: string; zone: string; entry_time: string; exit_time: string | null; max_threat_level: string;
      entry_position: { lat: number; lon: number } | null; exit_position: { lat: number; lon: number } | null }[];
  };
  incidents: Incident[];
  events: { time: string; kind: string; text: string; ref_type: string | null; ref_id: string | null }[];
  synthetic: boolean;
}

const SPEEDS = [1, 3, 6, 12, 24]; // simulated hours per second

export function eventColor(kind: string): string {
  if (kind.startsWith("AIS_GAP")) return "#f07a3f";
  if (kind.startsWith("DEVIATION")) return CAT.aqua;
  if (kind === "INCIDENT") return CAT.magenta;
  if (kind === "ZONE_ENTRY") return ZONE_SEVERITY_COLOR.HIGH;
  if (kind === "ZONE_EXIT") return "#5f7f94";
  if (kind === "LOITERING" || kind === "STOP") return CAT.yellow;
  return CAT.blue;
}

export function useReplay(vesselId: string | null) {
  const [bundle, setBundle] = useState<ReplayBundle | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    setBundle(null);
    setPlaying(false);
    setError(null);
    if (!vesselId) return;
    api.get<ReplayBundle>(`/v1/vessels/${encodeURIComponent(vesselId)}/replay`)
      .then((b) => {
        setBundle(b);
        setCursor(new Date(b.track[0]?.t ?? b.window.start).getTime());
        setPlaying(true);
      })
      .catch((e) => setError(e.message));
  }, [vesselId]);

  useEffect(() => {
    if (!playing || !bundle) return;
    const end = new Date(bundle.track[bundle.track.length - 1]?.t ?? bundle.window.end).getTime();
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setCursor((c) => {
        const next = c + dt * speed * 3600;
        if (next >= end) {
          setPlaying(false);
          return end;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, bundle]);

  return { bundle, cursor, setCursor, playing, setPlaying, speed, setSpeed, error };
}

type ReplayState = ReturnType<typeof useReplay>;

export function ReplayBar({ r, onExit }: { r: ReplayState; onExit: () => void }) {
  const b = r.bundle;
  const events: ChartEvent[] = useMemo(
    () => (b ? b.events.map((e) => ({ t: new Date(e.time).getTime(), label: e.text, color: eventColor(e.kind) })) : []),
    [b],
  );
  if (r.error) return <div className="bottom replay"><div className="panel-error">Replay unavailable: {r.error}</div><button className="btn" onClick={onExit}>Exit</button></div>;
  if (!b) return <div className="bottom replay"><div className="loading">Reconstructing voyage…</div></div>;
  const t0 = new Date(b.track[0]?.t ?? b.window.start).getTime();
  const t1 = new Date(b.track[b.track.length - 1]?.t ?? b.window.end).getTime();
  const v = b.voyage;
  return (
    <div className="bottom replay" aria-label="Voyage Replay">
      <div className="replay-head">
        <span className="eyebrow">VOYAGE REPLAY</span>
        <b>{b.vessel.name}</b>
        {v && <span className="muted">{v.origin_port ?? "at sea"} → {v.destination_port ?? v.declared_destination ?? "—"} · {Math.round(v.distance_km)} km · {v.status.toLowerCase()}</span>}
        {b.synthetic && <span className="syn">SYNTHETIC</span>}
        <div className="spacer" />
        <button className="btn" onClick={() => r.setCursor(t0)} aria-label="Restart">⏮</button>
        <button className="btn primary" onClick={() => r.setPlaying(!r.playing)}>{r.playing ? "❚❚ Pause" : "▶ Play"}</button>
        <label className="speed">Speed
          <select value={r.speed} onChange={(e) => r.setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={s}>{s} h/s</option>)}
          </select>
        </label>
        <span className="clock">{fmtTime(new Date(r.cursor).toISOString())}</span>
        <button className="btn" onClick={onExit}>Exit replay</button>
      </div>
      <RiskChart points={b.risk} events={events} cursor={r.cursor} domain={[t0, t1]} height={128}
        onScrub={(t) => { r.setPlaying(false); r.setCursor(t); }} />
    </div>
  );
}

export function ReplayPanel({ r, onSelect }: { r: ReplayState; onSelect: (s: Selection) => void }) {
  const b = r.bundle;
  const [atT, setAtT] = useState<{ as_of: string; score: number; band: string; contributors: Contributor[] } | null>(null);
  const cursorHour = Math.floor(r.cursor / 3600000);
  useEffect(() => {
    if (!b) return;
    const handle = setTimeout(() => {
      api.get<{ as_of: string; score: number; band: string; contributors: Contributor[] }>(
        `/v1/vessels/${b.vessel.id}/risk/at?t=${encodeURIComponent(new Date(r.cursor).toISOString())}`,
      ).then(setAtT).catch(() => setAtT(null));
    }, 250);
    return () => clearTimeout(handle);
  }, [b, cursorHour]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!b) return <aside className="panel right"><div className="loading">Loading…</div></aside>;
  const pos = [...b.track].reverse().find((t) => new Date(t.t).getTime() <= r.cursor) ?? b.track[0];
  const past = b.events.filter((e) => new Date(e.time).getTime() <= r.cursor);
  const v = b.voyage;
  return (
    <aside className="panel right" aria-label="Replay intelligence">
      <header className="panel-head">
        <div>
          <div className="eyebrow">VOYAGE REPLAY {b.synthetic && <span className="syn">SYNTHETIC</span>}</div>
          <h2>{b.vessel.name}</h2>
          <div className="sub">{titleCase(b.vessel.vessel_type)} · IMO {b.vessel.imo ?? "—"} · MMSI {b.vessel.mmsi}</div>
        </div>
      </header>
      {v && (
        <section className="card">
          <h3>Voyage</h3>
          <dl className="kv">
            <dt>Departed</dt><dd>{v.origin_port ?? "—"} · {fmtTime(v.departure_time)}</dd>
            <dt>Destination</dt><dd>{v.destination_port ?? v.declared_destination ?? "—"}{v.arrival_time ? ` · ${fmtTime(v.arrival_time)}` : ""}</dd>
            <dt>Peak risk</dt><dd>{v.max_risk_score ?? "—"}</dd>
            <dt>Elevated exposure</dt><dd>{v.elevated_exposure_hours.toFixed(0)} h</dd>
          </dl>
        </section>
      )}
      <section className="card">
        <h3>At {fmtTime(new Date(r.cursor).toISOString())}</h3>
        <dl className="kv">
          <dt>Position</dt><dd>{fmtLatLon(pos)}</dd>
          <dt>Speed / course</dt><dd>{pos?.sog?.toFixed(1) ?? "—"} kn · {pos?.cog?.toFixed(0) ?? "—"}°</dd>
          <dt>Reception</dt><dd>{pos?.rx === "SATELLITE" ? "Satellite AIS" : "Terrestrial AIS"}</dd>
        </dl>
        {atT && (
          <>
            <div className="risk-hero small-hero">
              <div className="score" style={{ borderColor: BAND_COLOR[atT.band as keyof typeof BAND_COLOR] }}>
                <span className="num">{atT.score}</span><span className="den">/100</span>
              </div>
              <div className="risk-meta"><BandChip band={atT.band} /><div className="muted small">Indicator as assessed at {fmtTime(atT.as_of)} (no hindsight)</div></div>
            </div>
            <ul className="contribs compact">
              {atT.contributors.map((c) => (
                <li key={c.rule} className="contrib" title={`${c.observation}\n\n${c.inference}`}>
                  <div className="contrib-head static"><span className="pts">+{c.points}</span><span className="lbl">{c.label}</span></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="card">
        <h3>Evidence timeline</h3>
        <ol className="why-timeline">
          {past.length === 0 && <li className="muted">No events yet.</li>}
          {past.slice(-14).map((e, i) => (
            <li key={i}>
              <span className="t" style={{ borderColor: eventColor(e.kind) }}>{fmtTime(e.time)}</span>
              {e.ref_type === "incident" && e.ref_id ? <button className="link" onClick={() => onSelect({ kind: "incident", id: e.ref_id! })}>{e.text}</button> : <span>{e.text}</span>}
            </li>
          ))}
        </ol>
        {b.anomalies.ais_gaps.map((g) => (
          <div key={g.id} className="small gapnote">
            <span className="tag obs">OBSERVATION</span>AIS silent {fmtDuration(g.duration_s)} ·
            <span className="tag inf">INFERENCE</span>unexpected reporting gap (coverage {g.coverage_quality.toLowerCase()}); cause undetermined.
          </div>
        ))}
      </section>
    </aside>
  );
}
