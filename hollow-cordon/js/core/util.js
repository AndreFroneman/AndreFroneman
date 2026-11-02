'use strict';
// =====================================================================
//  HOLLOW CORDON — core utilities (math, geometry, colour, canvas)
// =====================================================================

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sgn = (v) => (v < 0 ? -1 : 1);
const smooth = (t) => t * t * (3 - 2 * t);
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
const lerpAngle = (a, b, t) => a + angDiff(a, b) * t;
function approach(v, t, s) { return v < t ? Math.min(v + s, t) : Math.max(v - s, t); }
function gauss() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.8660254; }

// Deterministic RNG (mulberry32) for procedural assets
function makeRng(seed) {
  let a = seed >>> 0;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Smooth 1D value noise (for flicker, sway, wind)
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return s - Math.floor(s); };
  return lerp(h(i), h(i + 1), smooth(f));
}

// ---------------- colour ----------------
function hexToRgb(h) {
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
function shade(hex, amt) { // amt -1..1 (darken..lighten)
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

// ---------------- canvas ----------------
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function poly(ctx, pts, close = true) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
}

// ---------------- geometry ----------------
// Ray vs AABB (slab). d need not be normalised; returns [tEnter, tExit] in units of d or null.
function rayAABB(ox, oy, dx, dy, x0, y0, x1, y1) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return null; }
  else { let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return null; }
  else { let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); }
  if (tmax < tmin || tmax < 0) return null;
  return [Math.max(0, tmin), tmax];
}
// normal of the face hit when entering an AABB
function aabbHitNormal(hx, hy, x0, y0, x1, y1) {
  const dl = Math.abs(hx - x0), dr = Math.abs(hx - x1), dt = Math.abs(hy - y0), db = Math.abs(hy - y1);
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return [0, -1];
  if (m === db) return [0, 1];
  if (m === dl) return [-1, 0];
  return [1, 0];
}
function rayCircle(ox, oy, dx, dy, cx, cy, r) {
  const fx = ox - cx, fy = oy - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = fx * dx + fy * dy;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}
// Ray (unit d) vs capsule a-b radius r; returns entry distance or -1
function rayCapsule(ox, oy, dx, dy, ax, ay, bx, by, r) {
  let best = Infinity;
  const ex = bx - ax, ey = by - ay, L = Math.hypot(ex, ey);
  if (L > 1e-6) {
    const ux = ex / L, uy = ey / L;
    const rx = ox - ax, ry = oy - ay;
    const lox = rx * ux + ry * uy, loy = -rx * uy + ry * ux;
    if (lox >= 0 && lox <= L && Math.abs(loy) <= r) return 0;
    const ldx = dx * ux + dy * uy, ldy = -dx * uy + dy * ux;
    if (Math.abs(ldy) > 1e-9) {
      const ta = (-r - loy) / ldy, tb = (r - loy) / ldy;
      if (ta >= 0) { const xx = lox + ldx * ta; if (xx >= 0 && xx <= L && ta < best) best = ta; }
      if (tb >= 0) { const xx = lox + ldx * tb; if (xx >= 0 && xx <= L && tb < best) best = tb; }
    }
  }
  const t1 = rayCircle(ox, oy, dx, dy, ax, ay, r); if (t1 >= 0 && t1 < best) best = t1;
  const t2 = rayCircle(ox, oy, dx, dy, bx, by, r); if (t2 >= 0 && t2 < best) best = t2;
  return best === Infinity ? -1 : best;
}
function segPointDist2(ax, ay, bx, by, px, py) {
  const ex = bx - ax, ey = by - ay;
  const l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = ax + ex * t - px, qy = ay + ey * t - py;
  return qx * qx + qy * qy;
}
function segSegDist2(ax, ay, bx, by, cx, cy, dx, dy) {
  // approximate via endpoint/sample distances (adequate for melee sweeps)
  let m = Math.min(segPointDist2(ax, ay, bx, by, cx, cy), segPointDist2(ax, ay, bx, by, dx, dy),
    segPointDist2(cx, cy, dx, dy, ax, ay), segPointDist2(cx, cy, dx, dy, bx, by));
  // proper intersection check
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) > 1e-9) {
    const s = ((cx - ax) * d2y - (cy - ay) * d2x) / den, t = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) m = 0;
  }
  return m;
}
const rectsOverlap = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

function uid() { return Math.random().toString(36).slice(2, 10); }
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
