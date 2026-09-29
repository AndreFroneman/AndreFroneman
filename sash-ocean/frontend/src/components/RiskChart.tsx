import { useEffect, useMemo, useRef, useState } from "react";
import { BAND_COLOR, BAND_FLOOR, BAND_ORDER, bandOf, fmtTime } from "../lib/format";
import type { RiskPoint } from "../lib/types";

export interface ChartEvent {
  t: number;
  label: string;
  color: string;
}

interface Props {
  points: RiskPoint[];
  events?: ChartEvent[];
  height?: number;
  cursor?: number | null;
  onScrub?: (t: number) => void;
  compact?: boolean;
  domain?: [number, number];
}

const PAD = { l: 30, r: 74, t: 14, b: 20 };

/** SASH Risk Indicator over time. Single series → no legend; the title names it. */
export function RiskChart({ points, events = [], height = 130, cursor = null, onScrub, compact = false, domain }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const ro = new ResizeObserver((e) => setWidth(Math.max(200, e[0].contentRect.width)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const pad = compact ? { l: 24, r: 8, t: 6, b: 14 } : PAD;
  const data = useMemo(() => points.map((p) => ({ t: new Date(p.t).getTime(), s: p.score, p })), [points]);
  const t0 = domain?.[0] ?? data[0]?.t ?? Date.now() - 86400000;
  const t1 = domain?.[1] ?? data[data.length - 1]?.t ?? Date.now();
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (t: number) => pad.l + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (s: number) => pad.t + (1 - s / 100) * ih;
  const tAt = (px: number) => t0 + ((px - pad.l) / iw) * (t1 - t0);

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(d.t).toFixed(1)},${y(d.s).toFixed(1)}`).join("");
  const area = data.length ? `${line}L${x(data[data.length - 1].t).toFixed(1)},${y(0)}L${x(data[0].t).toFixed(1)},${y(0)}Z` : "";

  const nearest = (t: number) => {
    let best = data[0];
    for (const d of data) if (Math.abs(d.t - t) < Math.abs(best.t - t)) best = d;
    return best;
  };
  const hv = hover !== null && data.length ? nearest(hover) : null;

  const ticks = useMemo(() => {
    const span = t1 - t0;
    const step = span > 10 * 86400000 ? 2 * 86400000 : span > 3 * 86400000 ? 86400000 : span > 86400000 ? 6 * 3600000 : 3600000 * 2;
    const out: number[] = [];
    let t = Math.ceil(t0 / step) * step;
    while (t <= t1) {
      out.push(t);
      t += step;
    }
    return out;
  }, [t0, t1]);

  const handle = (e: React.PointerEvent<SVGSVGElement>, commit: boolean) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const t = Math.max(t0, Math.min(t1, tAt(px)));
    setHover(t);
    if (commit && onScrub) onScrub(t);
  };

  return (
    <div ref={wrap} className="risk-chart" style={{ height }}>
      <svg
        width={width}
        height={height}
        onPointerMove={(e) => handle(e, drag)}
        onPointerLeave={() => {
          setHover(null);
          setDrag(false);
        }}
        onPointerDown={(e) => {
          setDrag(true);
          handle(e, true);
        }}
        onPointerUp={() => setDrag(false)}
        role="img"
        aria-label="SASH Maritime Risk Indicator over time"
      >
        {/* Band floors: recessive reference lines, labelled in text ink with a colour key. */}
        {BAND_ORDER.slice(1).map((b) => (
          <g key={b}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(BAND_FLOOR[b])} y2={y(BAND_FLOOR[b])} className="grid" />
            {!compact && (
              <g transform={`translate(${pad.l + iw + 8},${y(BAND_FLOOR[b]) - 1})`}>
                <rect width={8} height={8} y={-7} rx={2} fill={BAND_COLOR[b]} />
                <text x={12} className="axis-label">{b}</text>
              </g>
            )}
          </g>
        ))}
        {[0, 50, 100].map((s) => (
          <text key={s} x={pad.l - 6} y={y(s) + 3} textAnchor="end" className="axis-label">{s}</text>
        ))}
        {!compact && ticks.map((t) => (
          <text key={t} x={x(t)} y={height - 5} textAnchor="middle" className="axis-label">
            {fmtTime(new Date(t).toISOString())}
          </text>
        ))}
        <path d={area} className="risk-area" />
        <path d={line} className="risk-line" />
        {/* Event markers along the top edge */}
        {events.filter((e) => e.t >= t0 && e.t <= t1).map((e, i) => (
          <g key={i} transform={`translate(${x(e.t)},${pad.t - 2})`} className="event-mark">
            <line y1={0} y2={ih + 2} className="event-line" />
            <circle r={4.5} fill={e.color} stroke="var(--surface-1)" strokeWidth={2} />
            <title>{`${fmtTime(new Date(e.t).toISOString())} — ${e.label}`}</title>
          </g>
        ))}
        {cursor !== null && cursor >= t0 && cursor <= t1 && (
          <g>
            <line x1={x(cursor)} x2={x(cursor)} y1={pad.t} y2={pad.t + ih} className="cursor-line" />
            {(() => {
              const d = nearest(cursor);
              return d ? <circle cx={x(d.t)} cy={y(d.s)} r={5} fill={BAND_COLOR[bandOf(d.s)]} stroke="var(--text-primary)" strokeWidth={1.5} /> : null;
            })()}
          </g>
        )}
        {hv && (
          <g pointerEvents="none">
            <line x1={x(hv.t)} x2={x(hv.t)} y1={pad.t} y2={pad.t + ih} className="hover-line" />
            <circle cx={x(hv.t)} cy={y(hv.s)} r={4} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hv && (
        <div className="chart-tip" style={{ left: Math.min(width - 230, Math.max(0, x(hv.t) + 10)), top: 4 }}>
          <div className="tip-time">{fmtTime(hv.p.t)}</div>
          <div className="tip-value">
            <span className="swatch" style={{ background: BAND_COLOR[bandOf(hv.s)] }} /> {hv.s}/100 · {bandOf(hv.s)}
          </div>
          {(hv.p.top ?? []).slice(0, 3).map((t, i) => (
            <div key={i} className="tip-sub">{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}
