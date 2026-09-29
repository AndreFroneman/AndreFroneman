export type Band = "LOW" | "MODERATE" | "ELEVATED" | "HIGH" | "SEVERE";
export type Severity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface VesselSummary {
  id: string;
  name: string | null;
  imo: string | null;
  mmsi: string | null;
  callsign: string | null;
  flag: string | null;
  vessel_type: string | null;
  operator: string | null;
  destination: string | null;
  eta: string | null;
  position: LatLon | null;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  nav_status: string | null;
  last_seen_at: string | null;
  risk: { score: number | null; band: Band | null; trend: string | null };
  data_mode: string;
  synthetic: boolean;
}

export interface VesselDetail extends VesselSummary {
  length_m: number | null;
  beam_m: number | null;
  draught_m: number | null;
  freeboard_m: number | null;
  year_built: number | null;
  gross_tonnage: number | null;
  owner: string | null;
  beneficial_owner: string | null;
}

export interface Evidence {
  type: string;
  id: string;
  label: string;
  distance_km?: number;
  time?: string;
}

export interface Contributor {
  rule: string;
  component: string;
  label: string;
  points: number;
  observation: string;
  inference: string;
  assessment: string;
  evidence: Evidence[];
  confidence: number | null;
}

export interface RiskResult {
  vessel_id: string;
  as_of: string;
  score: number;
  band: Band;
  confidence: number;
  trend: string | null;
  previous_score: number | null;
  position: LatLon | null;
  components: Record<string, { label: string; points: number; raw_points?: number; cap: number }>;
  contributors: Contributor[];
  suppressed: { rule: string; label: string; points: number; reason: string }[];
  data_quality: { notes?: string[]; position_age_s?: number };
  model_version: string;
  config_hash: string;
  kind: string;
  disclaimer: string;
}

export interface RiskPoint {
  t: string;
  score: number;
  band: Band;
  kind?: string;
  top?: string[];
}

export interface Incident {
  id: string;
  occurred_at: string;
  reported_at: string | null;
  position: LatLon;
  category: string;
  title: string;
  narrative: string;
  affected_vessel: { id: string | null; name: string | null; type: string | null; imo: string | null; mmsi: string | null };
  fatalities: number | null;
  injuries: number | null;
  hostages: number | null;
  boarding: boolean | null;
  hijacking: boolean | null;
  weapons_reported: string | null;
  verification_status: string;
  provenance: Provenance;
  min_distance_to_track_km?: number;
}

export interface Provenance {
  source: string | null;
  source_type: string | null;
  source_url: string | null;
  source_reference: string | null;
  licensing_category: string | null;
  retrieved_at: string | null;
  original_timestamp: string | null;
  confidence: number | null;
  synthetic: boolean;
}

export interface AlertEvidence {
  kind: "OBSERVATION" | "INFERENCE" | "ASSESSMENT";
  text: string;
  ref_type?: string;
  ref_id?: string;
  time?: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  vessel: { id: string; name: string | null } | null;
  contact_id: string | null;
  asset_id: string | null;
  event_time: string;
  created_at: string;
  location: { lat?: number; lon?: number; description: string | null };
  risk_change: { before: number | null; after: number | null };
  evidence: AlertEvidence[];
  recommended_analyst_action: string;
  status: string;
  synthetic: boolean;
}

export interface Contact {
  id: string;
  contact_code: string;
  label: string;
  identity_status: string;
  first_seen: string;
  last_seen: string;
  duration_s: number;
  position: LatLon;
  speed_kn: number | null;
  course_deg: number | null;
  classification: string;
  correlated_vessel: { id: string; name: string | null } | null;
  correlation_confidence: number | null;
  detection_sources: string[];
  nearest_ais_vessel: { id: string; name: string | null; distance_km: number | null } | null;
  synthetic: boolean;
}

export interface Asset {
  id: string;
  name: string;
  operator: string | null;
  asset_type: string;
  position: LatLon;
  security_radius_km: number;
  monitoring_radius_km: number;
  authorised_vessels: number;
  provenance: Provenance;
}

export interface Sensor {
  id: string;
  sensor_code: string;
  name: string;
  type: string;
  platform: string | null;
  position: LatLon | null;
  coverage_radius_km: number | null;
  status: string;
  trust_level: number;
  last_heartbeat_at: string | null;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  items: { id: string; item_type: string; vessel_id: string | null; vessel_name: string | null; fleet_operator: string | null; label: string }[];
  vessel_ids: string[];
  open_alerts: number;
  max_risk: number | null;
}

export interface Me {
  id: string;
  kind: string;
  label: string;
  role: string;
  tier: string;
  email?: string;
  full_name?: string;
  organisation?: string;
  features: string[];
  all_features: boolean;
  can: Record<string, boolean>;
}

export interface TimelineItem {
  time: string;
  type: "INCIDENT" | "AIS_ANOMALY" | "ALERT";
  subtype: string;
  title: string;
  severity: string;
  lat?: number;
  lon?: number;
  ref_id: string;
  vessel_id: string | null;
  vessel_name: string | null;
}

export interface ThreatStatus {
  overall: string;
  areas: { zone_id: string; name: string; severity: string; category: string; incidents_7d: number; incidents_30d: number; vessels_inside: number }[];
  dataset: string;
}

export type Selection =
  | { kind: "vessel"; id: string }
  | { kind: "incident"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "area"; lat: number; lon: number }
  | { kind: "voyage-risk" }
  | null;

export interface Layers {
  vessels: boolean;
  tracks: boolean;
  contacts: boolean;
  incidents: boolean;
  zones: boolean;
  assets: boolean;
  sensors: boolean;
}
