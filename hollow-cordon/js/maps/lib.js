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
  barricade: (x, floorY, o = {}) => Object.assign({ type: 'barricade', x, y: floorY - (o.h || 100) }, o),
  prop: (kind, x, floorY, o = {}) => Object.assign({ type: 'prop', kind, x, y: floorY - (o.h || PROP_DEFS[kind].h) }, o),
  light: (x, y, o = {}) => Object.assign({ type: 'light', x, y }, o),
  deco: (kind, x, y, o = {}) => Object.assign({ type: 'decor', kind, x, y }, o),
  note: (x, y, title, text) => ({ type: 'note', x, y, title, text }),
  spawn: (x, y, kind = 'edge') => ({ type: 'spawn', x, y, kind }),
  player: (x, y) => ({ type: 'player', x, y }),
  ladder: (x, y, h) => ({ type: 'ladder', x, y, h, w: 28 }),
  stairs: (x, y, w, h, dir, mat = 'concrete') => ({ type: 'stairs', x, y, w, h, dir, mat }),
  zombie: (kind, x, y) => ({ type: 'zombie', kind, x, y }),
  // a ceiling fluorescent: fixture decor + light
  fluoro: (x, ceilY, o = {}) => [MB.deco('fixture', x - 45, ceilY), MB.light(x, ceilY + 12, Object.assign({ r: 330, color: '#dcefe4', kind: 'fluoro', int: 1 }, o))],
  bulb: (x, ceilY, o = {}) => [MB.deco('bulb', x - 6, ceilY), MB.light(x, ceilY + 56, Object.assign({ r: 260, color: '#ffcf8a', kind: 'bulb', int: 0.95, flicker: 0.2 }, o))],
  lamp: (x, groundY, o = {}) => [MB.deco('lamp', x - 30, groundY), MB.light(x + 24, groundY - 284, Object.assign({ r: 440, color: '#ffbf70', kind: 'street', int: 1, shaft: 290, clip: null }, o))],
};
