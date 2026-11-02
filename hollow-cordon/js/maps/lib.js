'use strict';
// =====================================================================
//  Map library & builder shorthands. Every map — built-in or made in
//  the editor — is plain JSON: { id, name, theme, width, height,
//  horizon, ambient, ambientLevel, fog, weather, objects: [...] }.
// =====================================================================

const MapLib = {
  maps: {},
  order: [],
  register(m) { this.maps[m.id] = m; if (!this.order.includes(m.id)) this.order.push(m.id); },
  get(id) { return this.maps[id] || Custom.get(id); },
  all() { return this.order.map((id) => this.maps[id]); },
};

const MB = {
  block: (x, y, w, h, mat = 'concrete') => ({ type: 'block', x, y, w, h, mat }),
  plat: (x, y, w, mat = 'metal', h = 10) => ({ type: 'platform', x, y, w, h, mat }),
  bw: (x, y, w, h, mat = 'concrete', o = {}) => Object.assign({ type: 'backwall', x, y, w, h, mat }, o),
  door: (x, floorY, o = {}) => Object.assign({ type: 'door', x, y: floorY - (o.h || 132) }, o),
  win: (x, y, o = {}) => Object.assign({ type: 'window', x, y }, o),
  barricade: (x, floorY, o = {}) => Object.assign({ type: 'barricade', x, y: floorY - (o.h || 70), h: o.h || 70 }, o),
  prop: (kind, x, floorY, o = {}) => Object.assign({ type: 'prop', kind, x, y: floorY - (o.h || PROP_DEFS[kind].h) }, o),
  light: (x, y, o = {}) => Object.assign({ type: 'light', x, y }, o),
  deco: (kind, x, y, o = {}) => Object.assign({ type: 'decor', kind, x, y }, o),
  note: (x, y, title, text) => ({ type: 'note', x, y, title, text }),
  spawn: (x, y, kind = 'edge') => ({ type: 'spawn', x, y, kind }),
  player: (x, y) => ({ type: 'player', x, y }),
  ladder: (x, y, h) => ({ type: 'ladder', x, y, h, w: 28 }),
  stairs: (x, y, w, h, dir, mat = 'concrete', solid = false) => ({ type: 'stairs', x, y, w, h, dir, mat, solid }),
  zombie: (kind, x, y) => ({ type: 'zombie', kind, x, y }),
  fire: (x, y, o = {}) => Object.assign({ type: 'fire', x, y }, o),
  pickup: (kind, x, y, o = {}) => Object.assign({ type: 'pickup', kind, x, y }, o),
  // horizontal slab from x0 to x1 with gaps [[a,b],...]
  slab: (x0, x1, y, gaps = [], mat = 'concrete', h = 30) => {
    const out = []; let x = x0;
    for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (a > x) out.push(MB.block(x, y, a - x, h, mat)); x = Math.max(x, b); }
    if (x1 > x) out.push(MB.block(x, y, x1 - x, h, mat));
    return out;
  },
  // one storey of wall at x with floor at floorY: 'door' | 'window' | 'solid' | 'arch'
  wall: (x, floorY, kind, o = {}) => {
    const w = o.w || 24, mat = o.mat || 'concrete', top = floorY - 210, out = [];
    if (kind === 'door') { out.push(MB.block(x, top, w, 78, mat)); out.push(MB.door(x + (w - 14) / 2, floorY, o.door || {})); }
    else if (kind === 'window') { out.push(MB.block(x, top, w, 90, mat), MB.block(x, floorY - 50, w, 50, mat), MB.win(x + (w - 16) / 2, floorY - 120, o.win || {})); }
    else if (kind === 'solid') out.push(MB.block(x, top, w, 210, mat));
    else if (kind === 'arch') out.push(MB.block(x, top, w, 78, mat));
    return out;
  },
  // a ceiling fluorescent: fixture decor + light
  fluoro: (x, ceilY, o = {}) => [MB.deco('fixture', x - 45, ceilY), MB.light(x, ceilY + 12, Object.assign({ r: 330, color: '#dcefe4', kind: 'fluoro', int: 1 }, o))],
  bulb: (x, ceilY, o = {}) => [MB.deco('bulb', x - 6, ceilY), MB.light(x, ceilY + 56, Object.assign({ r: 260, color: '#ffcf8a', kind: 'bulb', int: 0.95, flicker: 0.2 }, o))],
  lamp: (x, groundY, o = {}) => [MB.deco('lamp', x - 30, groundY), MB.light(x + 24, groundY - 284, Object.assign({ r: 440, color: '#ffbf70', kind: 'street', int: 1, shaft: 290, clip: null }, o))],
};
