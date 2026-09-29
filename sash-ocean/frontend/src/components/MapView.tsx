import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import {
  BAND_COLOR,
  CAT,
  INCIDENT_GROUP_COLOR,
  ZONE_SEVERITY_COLOR,
  circlePolygon,
  incidentGroup,
  shortName,
} from "../lib/format";
import type { Asset, Contact, Incident, Layers, Selection, Sensor, VesselSummary } from "../lib/types";
import type { ReplayBundle } from "./Replay";

type FC = GeoJSON.FeatureCollection;

// Same-origin ES-module worker copied from the installed package (scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);
const EMPTY: FC = { type: "FeatureCollection", features: [] };

export interface MapOverlay {
  route?: FC;
  samples?: FC;
  area?: { lat: number; lon: number; radiusKm: number };
}

interface Props {
  vessels: VesselSummary[];
  tracks: FC | null;
  zones: FC | null;
  incidents: Incident[];
  contacts: Contact[];
  assets: Asset[];
  sensors: Sensor[];
  layers: Layers;
  selection: Selection;
  selectedTrack: { lat: number; lon: number }[] | null;
  highlightIds: string[] | null;
  replay: ReplayBundle | null;
  replayCursor: number;
  overlay: MapOverlay;
  areaMode: boolean;
  flyTo: { lat: number; lon: number; zoom?: number; key: number } | null;
  onSelect: (s: Selection) => void;
}

const bandExpr = (prop: string): maplibregl.ExpressionSpecification => [
  "match",
  ["coalesce", ["get", prop], "LOW"],
  "MODERATE", BAND_COLOR.MODERATE,
  "ELEVATED", BAND_COLOR.ELEVATED,
  "HIGH", BAND_COLOR.HIGH,
  "SEVERE", BAND_COLOR.SEVERE,
  BAND_COLOR.LOW,
];

function graticule(): FC {
  const features: GeoJSON.Feature[] = [];
  for (let lon = -180; lon <= 180; lon += 10)
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[lon, -85], [lon, 85]] } });
  for (let lat = -80; lat <= 80; lat += 10)
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: Array.from({ length: 37 }, (_, i) => [-180 + i * 10, lat]) },
    });
  return { type: "FeatureCollection", features };
}

const baseStyle: StyleSpecification = {
  version: 8,
  glyphs: `${window.location.origin}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    land: { type: "geojson", data: "/basemap/land.geojson" },
    borders: { type: "geojson", data: "/basemap/borders.geojson" },
    countries: { type: "geojson", data: "/basemap/country_labels.geojson" },
    graticule: { type: "geojson", data: graticule() },
  },
  layers: [
    { id: "ocean", type: "background", paint: { "background-color": "#0a1621" } },
    { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#11263a", "line-width": 0.6 } },
    { id: "land", type: "fill", source: "land", paint: { "fill-color": "#16222d" } },
    { id: "coast", type: "line", source: "land", paint: { "line-color": "#2c4659", "line-width": 0.8 } },
    { id: "borders", type: "line", source: "borders", paint: { "line-color": "#2a3b4a", "line-width": 0.6, "line-dasharray": [2, 2] } },
    {
      id: "country-labels", type: "symbol", source: "countries", minzoom: 2.5,
      layout: { "text-field": ["upcase", ["get", "name"]], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-letter-spacing": 0.12 },
      paint: { "text-color": "#4a6072", "text-halo-color": "#16222d", "text-halo-width": 1 },
    },
  ],
};

// White-on-transparent SDF icons, recoloured with icon-color.
function sdfIcon(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  draw(ctx, size);
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

function addIcons(map: maplibregl.Map) {
  const arrow = sdfIcon(32, (c, s) => {
    c.beginPath();
    c.moveTo(s / 2, 3);
    c.lineTo(s - 7, s - 4);
    c.lineTo(s / 2, s - 10);
    c.lineTo(7, s - 4);
    c.closePath();
    c.fill();
  });
  const dot = sdfIcon(32, (c, s) => {
    c.beginPath();
    c.arc(s / 2, s / 2, 7, 0, Math.PI * 2);
    c.fill();
  });
  const diamond = sdfIcon(32, (c, s) => {
    c.beginPath();
    c.moveTo(s / 2, 3);
    c.lineTo(s - 3, s / 2);
    c.lineTo(s / 2, s - 3);
    c.lineTo(3, s / 2);
    c.closePath();
    c.lineWidth = 4;
    c.stroke();
  });
  const square = sdfIcon(32, (c, s) => {
    c.fillRect(8, 8, s - 16, s - 16);
  });
  for (const [n, img] of Object.entries({ arrow, dot, diamond, square })) map.addImage(n, img, { sdf: true, pixelRatio: 2 });
}

function addLayers(map: maplibregl.Map) {
  const src = (id: string) => map.addSource(id, { type: "geojson", data: EMPTY });
  ["zones", "tracks", "sel-track", "incidents", "assets", "asset-rings", "sensors", "sensor-rings", "contacts", "vessels",
    "rp-full", "rp-played", "rp-gaps", "rp-expected", "rp-events", "rp-incidents", "rp-pos", "ov-route", "ov-samples", "ov-area"].forEach(src);

  // Risk zones
  map.addLayer({ id: "zones-fill", type: "fill", source: "zones", paint: {
    "fill-color": ["match", ["get", "severity"], ...Object.entries(ZONE_SEVERITY_COLOR).flat(), "#5f7f94"] as unknown as maplibregl.ExpressionSpecification,
    "fill-opacity": ["match", ["get", "severity"], "LOW", 0.07, "MODERATE", 0.1, "ELEVATED", 0.12, "HIGH", 0.15, 0.18],
  } });
  map.addLayer({ id: "zones-line", type: "line", source: "zones", paint: {
    "line-color": ["match", ["get", "severity"], ...Object.entries(ZONE_SEVERITY_COLOR).flat(), "#5f7f94"] as unknown as maplibregl.ExpressionSpecification,
    "line-width": 1.2, "line-dasharray": [3, 2], "line-opacity": 0.8,
  } });
  map.addLayer({ id: "zones-label", type: "symbol", source: "zones", minzoom: 3.2, layout: {
    "text-field": ["get", "label"], "text-font": ["Open Sans Semibold"], "text-size": 10.5, "symbol-placement": "point",
    "text-max-width": 12, "text-letter-spacing": 0.05,
  }, paint: { "text-color": "#8aa0b2", "text-halo-color": "#0a1621", "text-halo-width": 1.4 } });

  // Recent tracks + selected track
  map.addLayer({ id: "tracks", type: "line", source: "tracks", paint: {
    "line-color": bandExpr("band"), "line-width": 1, "line-opacity": 0.35 } });
  map.addLayer({ id: "sel-track", type: "line", source: "sel-track", paint: { "line-color": CAT.blue, "line-width": 2, "line-opacity": 0.9 } });

  // Asset / sensor rings
  map.addLayer({ id: "asset-rings", type: "line", source: "asset-rings", paint: {
    "line-color": CAT.blue, "line-width": ["match", ["get", "ring"], "SECURITY", 1.5, 1], "line-opacity": 0.7,
    "line-dasharray": [2, 2] } });
  map.addLayer({ id: "sensor-rings", type: "line", source: "sensor-rings", paint: {
    "line-color": CAT.aqua, "line-width": 0.8, "line-opacity": 0.35, "line-dasharray": [1, 3] } });

  // Voyage risk overlay
  map.addLayer({ id: "ov-route", type: "line", source: "ov-route", paint: { "line-color": "#c7d3dd", "line-width": 1.5, "line-dasharray": [2, 1.5] } });
  map.addLayer({ id: "ov-samples", type: "circle", source: "ov-samples", paint: {
    "circle-radius": 4, "circle-color": bandExpr("band"), "circle-stroke-color": "#0a1621", "circle-stroke-width": 1 } });
  map.addLayer({ id: "ov-area", type: "line", source: "ov-area", paint: { "line-color": "#c7d3dd", "line-width": 1.5, "line-dasharray": [1, 2] } });

  // Replay
  map.addLayer({ id: "rp-full", type: "line", source: "rp-full", paint: { "line-color": "#4a6275", "line-width": 1.5, "line-dasharray": [1, 1.5] } });
  map.addLayer({ id: "rp-expected", type: "line", source: "rp-expected", paint: { "line-color": CAT.aqua, "line-width": 1.5, "line-dasharray": [0.5, 1.5] } });
  map.addLayer({ id: "rp-played", type: "line", source: "rp-played", paint: { "line-color": CAT.blue, "line-width": 2.5 } });
  map.addLayer({ id: "rp-gaps", type: "line", source: "rp-gaps", paint: { "line-color": "#f07a3f", "line-width": 2.5, "line-dasharray": [1, 1.2] } });
  map.addLayer({ id: "rp-incidents", type: "circle", source: "rp-incidents", paint: {
    "circle-radius": 7, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "rp-events", type: "circle", source: "rp-events", paint: {
    "circle-radius": 4.5, "circle-color": ["get", "color"], "circle-stroke-color": "#0a1621", "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "rp-events-label", type: "symbol", source: "rp-events", minzoom: 4, layout: {
    "text-field": ["get", "label"], "text-font": ["Open Sans Semibold"], "text-size": 10, "text-offset": [0.8, 0], "text-anchor": "left", "text-optional": true,
  }, paint: { "text-color": "#c7d3dd", "text-halo-color": "#0a1621", "text-halo-width": 1.4 } });

  // Incidents
  map.addLayer({ id: "incidents", type: "circle", source: "incidents", paint: {
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3.5, 7, 6.5],
    "circle-color": ["get", "color"], "circle-opacity": ["get", "opacity"],
    "circle-stroke-color": "#0a1621", "circle-stroke-width": 1.2 } });

  // Assets & sensors
  map.addLayer({ id: "assets", type: "symbol", source: "assets", layout: {
    "icon-image": "square", "icon-size": 0.9, "icon-allow-overlap": true,
    "text-field": ["step", ["zoom"], "", 5, ["get", "label"]], "text-font": ["Open Sans Semibold"], "text-size": 10,
    "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true,
  }, paint: { "icon-color": CAT.blue, "icon-halo-color": "#0a1621", "icon-halo-width": 1, "text-color": "#8fb7e6", "text-halo-color": "#0a1621", "text-halo-width": 1.2 } });
  map.addLayer({ id: "sensors", type: "circle", source: "sensors", paint: {
    "circle-radius": 3, "circle-color": CAT.aqua, "circle-stroke-color": "#0a1621", "circle-stroke-width": 1 } });

  // Contacts (non-AIS detections)
  map.addLayer({ id: "contacts", type: "symbol", source: "contacts", layout: {
    "icon-image": "diamond", "icon-size": 0.9, "icon-allow-overlap": true,
    "text-field": ["step", ["zoom"], "", 7, ["get", "code"]], "text-font": ["Open Sans Semibold"], "text-size": 10,
    "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true,
  }, paint: {
    "icon-color": ["match", ["get", "status"], "UNIDENTIFIED", CAT.violet, CAT.aqua],
    "text-color": "#c7d3dd", "text-halo-color": "#0a1621", "text-halo-width": 1.2 } });

  // Vessels
  map.addLayer({ id: "vessel-sel", type: "circle", source: "vessels", filter: ["==", ["get", "id"], ""], paint: {
    "circle-radius": 13, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#e6eef5", "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "vessels", type: "symbol", source: "vessels", layout: {
    "icon-image": ["case", ["<", ["coalesce", ["get", "sog"], 0], 0.6], "dot", "arrow"],
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.85, 6, 1.0, 9, 1.2],
    "icon-rotate": ["coalesce", ["get", "course"], 0], "icon-rotation-alignment": "map",
    "icon-allow-overlap": true, "icon-ignore-placement": true,
    "text-field": ["step", ["zoom"], "", 4.5, ["get", "name"]], "text-font": ["Open Sans Semibold"], "text-size": 10,
    "text-offset": [0, 1.25], "text-anchor": "top", "text-optional": true,
  }, paint: {
    "icon-color": bandExpr("band"), "icon-opacity": ["get", "opacity"], "icon-halo-color": "#0a1621", "icon-halo-width": 1.2,
    "text-color": "#a9bccb", "text-opacity": ["get", "opacity"], "text-halo-color": "#0a1621", "text-halo-width": 1.3 } });

  map.addLayer({ id: "rp-pos", type: "symbol", source: "rp-pos", layout: {
    "icon-image": "arrow", "icon-size": 1.4, "icon-rotate": ["get", "course"], "icon-rotation-alignment": "map",
    "icon-allow-overlap": true, "icon-ignore-placement": true,
  }, paint: { "icon-color": bandExpr("band"), "icon-halo-color": "#fff", "icon-halo-width": 1.5 } });
}

const LAYER_GROUPS: Record<keyof Layers, string[]> = {
  vessels: ["vessels", "vessel-sel"],
  tracks: ["tracks"],
  contacts: ["contacts"],
  incidents: ["incidents"],
  zones: ["zones-fill", "zones-line", "zones-label"],
  assets: ["assets", "asset-rings"],
  sensors: ["sensors", "sensor-rings"],
};

function setData(map: maplibregl.Map, id: string, data: FC) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const onSelect = useRef(p.onSelect);
  onSelect.current = p.onSelect;
  const areaMode = useRef(p.areaMode);
  areaMode.current = p.areaMode;

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: baseStyle,
      center: [44, -6],
      zoom: 3.05,
      minZoom: 1.5,
      maxZoom: 13,
      attributionControl: { compact: true, customAttribution: "Basemap: Natural Earth (public domain)" },
      dragRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "nautical" }), "bottom-right");
    mapRef.current = map;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: "map-tip" });
    map.on("load", () => {
      addIcons(map);
      addLayers(map);
      const clickable: [string, (f: maplibregl.MapGeoJSONFeature) => Selection][] = [
        ["vessels", (f) => ({ kind: "vessel", id: f.properties.id })],
        ["contacts", (f) => ({ kind: "contact", id: f.properties.id })],
        ["incidents", (f) => ({ kind: "incident", id: f.properties.id })],
        ["rp-incidents", (f) => ({ kind: "incident", id: f.properties.id })],
        ["assets", (f) => ({ kind: "asset", id: f.properties.id })],
      ];
      map.on("click", (e: MapLayerMouseEvent) => {
        if (areaMode.current) {
          onSelect.current({ kind: "area", lat: e.lngLat.lat, lon: e.lngLat.lng });
          return;
        }
        for (const [layer, toSel] of clickable) {
          if (!map.getLayer(layer)) continue;
          const f = map.queryRenderedFeatures(e.point, { layers: [layer] })[0];
          if (f) {
            onSelect.current(toSel(f));
            return;
          }
        }
        const z = map.queryRenderedFeatures(e.point, { layers: ["zones-fill"] })[0];
        if (z) onSelect.current({ kind: "zone", id: z.properties.id });
      });
      for (const layer of ["vessels", "contacts", "incidents", "assets", "rp-incidents", "rp-events"]) {
        map.on("mouseenter", layer, (e: MapLayerMouseEvent) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (f) popup.setLngLat(e.lngLat).setText(String(f.properties.tip ?? f.properties.name ?? "")).addTo(map);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = areaMode.current ? "crosshair" : "";
          popup.remove();
        });
      }
      setReady(true);
    });
    return () => {
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const map = mapRef.current;

  useEffect(() => {
    if (map && ready) map.getCanvas().style.cursor = p.areaMode ? "crosshair" : "";
  }, [map, ready, p.areaMode]);

  // Vessels
  useEffect(() => {
    if (!map || !ready) return;
    const hl = p.highlightIds ? new Set(p.highlightIds) : null;
    setData(map, "vessels", {
      type: "FeatureCollection",
      features: p.vessels.filter((v) => v.position).map((v) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [v.position!.lon, v.position!.lat] },
        properties: {
          id: v.id, name: v.name ?? v.mmsi ?? "", band: v.risk.band ?? "LOW", sog: v.sog ?? 0, course: v.cog ?? v.heading ?? 0,
          opacity: hl && !hl.has(v.id) ? 0.25 : 1,
          tip: `${v.name ?? v.mmsi} · ${v.vessel_type ?? "vessel"} · risk ${v.risk.score ?? "—"} ${v.risk.band ?? ""}`,
        },
      })),
    });
  }, [map, ready, p.vessels, p.highlightIds]);

  useEffect(() => {
    if (!map || !ready) return;
    setData(map, "tracks", p.tracks ?? EMPTY);
  }, [map, ready, p.tracks]);

  useEffect(() => {
    if (!map || !ready) return;
    const fc = p.zones ?? EMPTY;
    setData(map, "zones", {
      ...fc,
      features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, label: shortName(String(f.properties?.name ?? "")) } })),
    });
  }, [map, ready, p.zones]);

  useEffect(() => {
    if (!map || !ready) return;
    const now = Date.now();
    setData(map, "incidents", {
      type: "FeatureCollection",
      features: p.incidents.map((i) => {
        const ageDays = (now - new Date(i.occurred_at).getTime()) / 86400000;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [i.position.lon, i.position.lat] },
          properties: {
            id: i.id, color: INCIDENT_GROUP_COLOR[incidentGroup(i.category)],
            opacity: ageDays < 14 ? 1 : ageDays < 45 ? 0.75 : 0.5,
            tip: `${i.category.replace(/_/g, " ")} · ${i.occurred_at.slice(0, 10)} · ${i.title}`,
          },
        };
      }),
    });
  }, [map, ready, p.incidents]);

  useEffect(() => {
    if (!map || !ready) return;
    setData(map, "contacts", {
      type: "FeatureCollection",
      features: p.contacts.map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.position.lon, c.position.lat] },
        properties: { id: c.id, code: c.contact_code, status: c.identity_status,
          tip: `${c.contact_code} · ${c.label}${c.correlated_vessel ? ` (${c.correlated_vessel.name})` : ""}` },
      })),
    });
  }, [map, ready, p.contacts]);

  useEffect(() => {
    if (!map || !ready) return;
    setData(map, "assets", {
      type: "FeatureCollection",
      features: p.assets.map((a) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [a.position.lon, a.position.lat] },
        properties: { id: a.id, label: shortName(a.name.replace(" (DEMO)", "")), tip: `${a.name} · ${a.asset_type}` },
      })),
    });
    setData(map, "asset-rings", {
      type: "FeatureCollection",
      features: p.assets.flatMap((a) => [
        { type: "Feature" as const, properties: { ring: "MONITORING" }, geometry: { type: "LineString" as const, coordinates: circlePolygon(a.position.lat, a.position.lon, a.monitoring_radius_km) } },
        { type: "Feature" as const, properties: { ring: "SECURITY" }, geometry: { type: "LineString" as const, coordinates: circlePolygon(a.position.lat, a.position.lon, a.security_radius_km, 32) } },
      ]),
    });
  }, [map, ready, p.assets]);

  useEffect(() => {
    if (!map || !ready) return;
    const withPos = p.sensors.filter((s) => s.position && s.type !== "WEATHER");
    setData(map, "sensors", {
      type: "FeatureCollection",
      features: withPos.map((s) => ({ type: "Feature", geometry: { type: "Point", coordinates: [s.position!.lon, s.position!.lat] }, properties: { id: s.id, tip: `${s.name} (${s.type})` } })),
    });
    setData(map, "sensor-rings", {
      type: "FeatureCollection",
      features: withPos.filter((s) => s.coverage_radius_km).map((s) => ({
        type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: circlePolygon(s.position!.lat, s.position!.lon, s.coverage_radius_km!) },
      })),
    });
  }, [map, ready, p.sensors]);

  // Layer visibility
  useEffect(() => {
    if (!map || !ready) return;
    for (const [k, ids] of Object.entries(LAYER_GROUPS)) {
      const vis = p.layers[k as keyof Layers] && !(p.replay && k === "tracks") ? "visible" : "none";
      ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", vis));
    }
  }, [map, ready, p.layers, p.replay]);

  // Selection highlight + selected track
  useEffect(() => {
    if (!map || !ready) return;
    const id = p.selection?.kind === "vessel" ? p.selection.id : "";
    map.setFilter("vessel-sel", ["==", ["get", "id"], id]);
    setData(map, "sel-track", p.selectedTrack && !p.replay ? {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: p.selectedTrack.map((x) => [x.lon, x.lat]) } }],
    } : EMPTY);
  }, [map, ready, p.selection, p.selectedTrack, p.replay]);

  // Fly-to requests
  useEffect(() => {
    if (!map || !ready || !p.flyTo) return;
    map.flyTo({ center: [p.flyTo.lon, p.flyTo.lat], zoom: p.flyTo.zoom ?? Math.max(map.getZoom(), 5), speed: 1.4 });
  }, [map, ready, p.flyTo?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Overlays (voyage risk route, area-risk circle)
  useEffect(() => {
    if (!map || !ready) return;
    setData(map, "ov-route", p.overlay.route ?? EMPTY);
    setData(map, "ov-samples", p.overlay.samples ?? EMPTY);
    const a = p.overlay.area;
    setData(map, "ov-area", a ? { type: "FeatureCollection", features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: circlePolygon(a.lat, a.lon, a.radiusKm) } },
    ] } : EMPTY);
  }, [map, ready, p.overlay]);

  // Replay: static layers when the bundle changes
  useEffect(() => {
    if (!map || !ready) return;
    const r = p.replay;
    if (!r) {
      ["rp-full", "rp-played", "rp-gaps", "rp-expected", "rp-events", "rp-incidents", "rp-pos"].forEach((s) => setData(map, s, EMPTY));
      return;
    }
    setData(map, "rp-full", { type: "FeatureCollection", features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.track.map((t) => [t.lon, t.lat]) } }] });
    setData(map, "rp-gaps", { type: "FeatureCollection", features: r.anomalies.ais_gaps.filter((g) => g.start_position && g.end_position).map((g) => ({
      type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[g.start_position!.lon, g.start_position!.lat], [g.end_position!.lon, g.end_position!.lat]] } })) });
    setData(map, "rp-expected", { type: "FeatureCollection", features: r.anomalies.route_deviations.filter((d) => d.expected_path).map((d) => ({
      type: "Feature", properties: {}, geometry: d.expected_path as GeoJSON.Geometry })) });
    const ev: GeoJSON.Feature[] = [];
    for (const z of r.anomalies.zone_exposures) {
      if (z.entry_position) ev.push({ type: "Feature", properties: { color: ZONE_SEVERITY_COLOR[z.max_threat_level], label: `Enter ${shortName(z.zone)}`, tip: `Entered ${z.zone}` }, geometry: { type: "Point", coordinates: [z.entry_position.lon, z.entry_position.lat] } });
      if (z.exit_position) ev.push({ type: "Feature", properties: { color: "#5f7f94", label: `Exit ${shortName(z.zone)}`, tip: `Exited ${z.zone}` }, geometry: { type: "Point", coordinates: [z.exit_position.lon, z.exit_position.lat] } });
    }
    for (const g of r.anomalies.ais_gaps) {
      if (g.start_position) ev.push({ type: "Feature", properties: { color: "#f07a3f", label: "AIS reporting stopped", tip: "AIS reporting anomaly: last report" }, geometry: { type: "Point", coordinates: [g.start_position.lon, g.start_position.lat] } });
      if (g.end_position) ev.push({ type: "Feature", properties: { color: "#f07a3f", label: "AIS resumed", tip: "AIS reporting resumed" }, geometry: { type: "Point", coordinates: [g.end_position.lon, g.end_position.lat] } });
    }
    for (const l of r.anomalies.loitering) ev.push({ type: "Feature", properties: { color: CAT.yellow, label: "Loitering", tip: l.observation }, geometry: { type: "Point", coordinates: [l.centre.lon, l.centre.lat] } });
    setData(map, "rp-events", { type: "FeatureCollection", features: ev });
    const b = new maplibregl.LngLatBounds();
    r.track.forEach((t) => b.extend([t.lon, t.lat]));
    if (!b.isEmpty()) map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 900, maxZoom: 6 });
  }, [map, ready, p.replay]);

  // Replay: cursor-driven layers
  useEffect(() => {
    if (!map || !ready || !p.replay) return;
    const r = p.replay;
    const cur = p.replayCursor;
    const played = r.track.filter((t) => new Date(t.t).getTime() <= cur);
    setData(map, "rp-played", played.length > 1 ? { type: "FeatureCollection", features: [
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: played.map((t) => [t.lon, t.lat]) } }] } : EMPTY);
    const last = played[played.length - 1];
    const riskNow = [...r.risk].reverse().find((x) => new Date(x.t).getTime() <= cur);
    setData(map, "rp-pos", last ? { type: "FeatureCollection", features: [{
      type: "Feature", properties: { course: last.cog ?? 0, band: riskNow?.band ?? "LOW" },
      geometry: { type: "Point", coordinates: [last.lon, last.lat] } }] } : EMPTY);
    setData(map, "rp-incidents", { type: "FeatureCollection", features: r.incidents
      .filter((i) => new Date(i.reported_at ?? i.occurred_at).getTime() <= cur)
      .map((i) => ({ type: "Feature", properties: { id: i.id, color: INCIDENT_GROUP_COLOR[incidentGroup(i.category)],
        tip: `${i.category.replace(/_/g, " ")} · ${i.occurred_at.slice(0, 16).replace("T", " ")}Z · ${i.title}` },
        geometry: { type: "Point", coordinates: [i.position.lon, i.position.lat] } })) });
  }, [map, ready, p.replay, p.replayCursor]);

  return <div ref={el} className="map" />;
}
