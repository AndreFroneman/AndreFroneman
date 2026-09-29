import type { Band } from "./types";

// Risk-band colours. LOW is a recessive neutral; MODERATE→SEVERE is a single warm hue
// whose brightness rises with severity (validated ordinal ramp on the dark surface).
// Bands are ALWAYS shown with their text label as well — colour is never the only cue.
export const BAND_COLOR: Record<Band, string> = {
  LOW: "#5f7f94",
  MODERATE: "#9a4f1f",
  ELEVATED: "#cf6128",
  HIGH: "#f07a3f",
  SEVERE: "#ffab82",
};
export const BAND_ORDER: Band[] = ["LOW", "MODERATE", "ELEVATED", "HIGH", "SEVERE"];
export const BAND_FLOOR: Record<Band, number> = { LOW: 0, MODERATE: 25, ELEVATED: 45, HIGH: 65, SEVERE: 85 };

export const ZONE_SEVERITY_COLOR: Record<string, string> = {
  LOW: "#5f7f94",
  MODERATE: "#9a4f1f",
  ELEVATED: "#cf6128",
  HIGH: "#f07a3f",
  CRITICAL: "#ffab82",
};

export const ALERT_SEVERITY_COLOR: Record<string, string> = {
  INFO: "#5f7f94",
  LOW: "#7d93a6",
  MEDIUM: "#cf6128",
  HIGH: "#f07a3f",
  CRITICAL: "#ffab82",
};

// Categorical slots from the validated default palette (dark steps).
export const CAT = {
  blue: "#3987e5",
  aqua: "#199e70",
  yellow: "#c98500",
  magenta: "#d55181",
  violet: "#9085e9",
  grey: "#7d8a96",
};

const HOSTILE = new Set([
  "piracy", "hijacking", "kidnapping", "boarding", "maritime_conflict", "drone_attack", "missile_attack", "mine", "sabotage",
]);
const CRIME = new Set(["armed_robbery", "cargo_theft", "suspicious_approach", "infrastructure_incident"]);

export function incidentGroup(category: string): "hostile" | "crime" | "safety" {
  if (HOSTILE.has(category)) return "hostile";
  if (CRIME.has(category)) return "crime";
  return "safety";
}
export const INCIDENT_GROUP_COLOR = { hostile: CAT.magenta, crime: CAT.yellow, safety: CAT.grey };
export const INCIDENT_GROUP_LABEL = { hostile: "Attack / hostile", crime: "Crime / suspicious", safety: "Safety (non-security)" };

export const bandOf = (score: number | null | undefined): Band => {
  const s = score ?? 0;
  let b: Band = "LOW";
  for (const x of BAND_ORDER) if (s >= BAND_FLOOR[x]) b = x;
  return b;
};

export function fmtTime(iso: string | null | undefined, withDate = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  if (!withDate) return `${hh}:${mm}Z`;
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${String(d.getUTCDate()).padStart(2, "0")} ${mon} ${hh}:${mm}Z`;
}

export function fmtAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const s = Math.round(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function fmtLatLon(p: { lat: number; lon: number } | null | undefined): string {
  if (!p) return "—";
  const ns = p.lat >= 0 ? "N" : "S";
  const ew = p.lon >= 0 ? "E" : "W";
  return `${Math.abs(p.lat).toFixed(3)}°${ns} ${Math.abs(p.lon).toFixed(3)}°${ew}`;
}

export const titleCase = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

/** Short label safe for the bundled Latin-1 glyph range (drops text after an em dash). */
export const shortName = (s: string) => s.split(" — ")[0].replace(/[^\x20-\xff]/g, "");

export function circlePolygon(lat: number, lon: number, radiusKm: number, steps = 64): number[][] {
  const out: number[][] = [];
  const R = 6371.0088;
  const d = radiusKm / R;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lon * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const b = (2 * Math.PI * i) / steps;
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    out.push([(l2 * 180) / Math.PI, (p2 * 180) / Math.PI]);
  }
  return out;
}
