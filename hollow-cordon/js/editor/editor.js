'use strict';
// =====================================================================
//  Editor — visual map creator. Renders through the real engine
//  (WYSIWYG with optional lighting preview), palette of every object,
//  grid snapping / free placement, select-move-resize-rotate-flip-delete,
//  box select, copy/paste, undo/redo, map & lighting settings,
//  save/load (localStorage), JSON import/export and instant playtest.
// =====================================================================

const ED_PALETTE = () => {
  const cat = [];
  const S = (label, items) => cat.push({ label, items });
  S('Structure', [
    { label: 'Solid block', make: () => ({ type: 'block', w: 128, h: 32, mat: 'concrete' }), drag: true },
    { label: 'One-way platform', make: () => ({ type: 'platform', w: 160, h: 10, mat: 'grate' }), drag: true },
    { label: 'Back wall (room)', make: () => ({ type: 'backwall', w: 320, h: 210, mat: 'tile' }), drag: true },
    { label: 'Stairs ↗ (rise right)', make: () => ({ type: 'stairs', w: 250, h: 240, dir: 1, mat: 'concrete' }) },
    { label: 'Stairs ↖ (rise left)', make: () => ({ type: 'stairs', w: 250, h: 240, dir: -1, mat: 'concrete' }) },
    { label: 'Ladder', make: () => ({ type: 'ladder', w: 28, h: 240 }) },
    { label: 'Wooden door', make: () => ({ type: 'door', h: 132 }) },
    { label: 'Metal door', make: () => ({ type: 'door', h: 132, metal: true }) },
    { label: 'Locked metal door', make: () => ({ type: 'door', h: 132, metal: true, locked: true }) },
    { label: 'Breakable window', make: () => ({ type: 'window', h: 70 }) },
    { label: 'Barricade (low, hop over)', make: () => ({ type: 'barricade', w: 24, h: 70 }) },
    { label: 'Wall with door (storey)', composite: 'wall-door' },
    { label: 'Wall with window (storey)', composite: 'wall-window' },
  ]);
  S('Props', Object.entries(PROP_DEFS).map(([k, d]) => ({ label: d.label, make: () => ({ type: 'prop', kind: k }), icon: { prop: k } })));
  S('Decor', Object.entries(DECOR_KINDS).map(([k, d]) => ({ label: d.label, make: () => ({ type: 'decor', kind: k }), icon: { decor: k } })));
  S('Lights', [
    { label: 'Hanging bulb', make: () => ({ type: 'light', r: 260, color: '#ffcf8a', int: 0.95, kind: 'bulb', flicker: 0.2, clip: 'auto' }), icon: { light: '#ffcf8a' } },
    { label: 'Fluorescent', make: () => ({ type: 'light', r: 330, color: '#dcefe4', int: 1, kind: 'fluoro', flicker: 0, clip: 'auto' }), icon: { light: '#dcefe4' } },
    { label: 'Flickering fluorescent', make: () => ({ type: 'light', r: 330, color: '#dcefe4', int: 1, kind: 'fluoro', flicker: 0.9, clip: 'auto' }), icon: { light: '#b8d8c8' } },
    { label: 'Street lamp light (shaft)', make: () => ({ type: 'light', r: 440, color: '#ffbf70', int: 1, kind: 'street', shaft: 290, clip: null }), icon: { light: '#ffbf70' } },
    { label: 'Flood light', make: () => ({ type: 'light', r: 620, color: '#e8f0ff', int: 1.2, kind: 'street', shaft: 430, clip: null }), icon: { light: '#e8f0ff' } },
    { label: 'Emergency (red pulse)', make: () => ({ type: 'light', r: 230, color: '#ff2a1e', int: 1, kind: 'emergency', flicker: 1, clip: 'auto' }), icon: { light: '#ff2a1e' } },
    { label: 'Fire glow', make: () => ({ type: 'light', r: 320, color: '#ff8a30', int: 1.1, kind: 'fire', flicker: 1, clip: null }), icon: { light: '#ff8a30' } },
    { label: 'Cold blue light', make: () => ({ type: 'light', r: 340, color: '#a8c8ff', int: 1, kind: 'fluoro', flicker: 0.3, clip: 'auto' }), icon: { light: '#a8c8ff' } },
    { label: 'Burning fire (hazard)', make: () => ({ type: 'fire', r: 300 }), icon: { light: '#ff6020' } },
    { label: 'Decorative fire (harmless)', make: () => ({ type: 'fire', r: 300, harmless: true }), icon: { light: '#ffa040' } },
  ]);
  S('Gameplay', [
    { label: 'Player spawn', make: () => ({ type: 'player' }), icon: { glyph: 'P', color: '#6ad070' } },
    { label: 'Infected spawn point', make: () => ({ type: 'spawn', kind: 'edge' }), icon: { glyph: 'S', color: '#e05040' } },
    { label: 'Vent spawn (crawlers)', make: () => ({ type: 'spawn', kind: 'vent' }), icon: { glyph: 'V', color: '#b060e0' } },
    { label: 'Note (story)', make: () => ({ type: 'note', title: 'Note', text: 'Write something unsettling here.' }), icon: { glyph: '✎', color: '#d8d0b4' } },
    ...Object.entries(ZTYPES).map(([k, d]) => ({ label: 'Placed ' + d.name, make: () => ({ type: 'zombie', kind: k }), icon: { glyph: 'Z', color: '#c0a060' } })),
    { label: 'Pickup: ammo', make: () => ({ type: 'pickup', kind: 'ammo', ammo: '9mm' }), icon: { glyph: '▤', color: '#c8b060' } },
    { label: 'Pickup: medkit', make: () => ({ type: 'pickup', kind: 'medkit' }), icon: { glyph: '+', color: '#e06060' } },
    { label: 'Pickup: armour', make: () => ({ type: 'pickup', kind: 'armor' }), icon: { glyph: '◆', color: '#7090c0' } },
    { label: 'Pickup: planks', make: () => ({ type: 'pickup', kind: 'planks', amount: 3 }), icon: { glyph: '≡', color: '#c8a070' } },
    { label: 'Pickup: grenade', make: () => ({ type: 'pickup', kind: 'grenade' }), icon: { glyph: '●', color: '#8aa060' } },
    { label: 'Pickup: weapon', make: () => ({ type: 'pickup', kind: 'weapon', weapon: 'kolba' }), icon: { glyph: '⌐', color: '#e0d0a0' } },
  ]);
  return cat;
};

const MAT_OPTIONS = () => Object.entries(Tex.MATERIALS).map(([k, m]) => [k, m.label]);
const BW_OPTIONS = () => Object.keys(Tex.BACKWALLS).map((k) => [k, k]);

class Editor {
  constructor(canvas) {
    this.canvas = canvas;
    this.map = this.blankMap();
    this.sel = [];
    this.tool = 'select';
    this.placing = null;
    this.grid = 16; this.snap = true; this.showGrid = true; this.lightPreview = false;
    this.cam = { x: 1200, y: 900, zoom: 0.55 };
    this.undoStack = []; this.redoStack = [];
    this.dirty = true; this.preview = null; this.lastBuild = 0;
    this.drag = null; this.mouse = { sx: 0, sy: 0, wx: 0, wy: 0 };
    this.clip = null;
    this.saved = true;
    this.handlers = null;
    this.paletteCat = 0;
  }
  blankMap() {
    const G = 1100;
    return {
      id: 'custom_' + uid(), name: 'Untitled Outpost', subtitle: 'Custom map', desc: 'A map made in the Hollow Cordon map creator.',
      theme: 'streets', width: 3200, height: 1400, horizon: G, ambient: '#20222a', ambientLevel: 0.2, fog: 0.5, weather: 'none', reverb: 0.3, amb: 'amb_wind',
      objects: [
        { type: 'block', x: 0, y: G, w: 3200, h: 300, mat: 'asphalt' },
        { type: 'player', x: 1600, y: G }, { type: 'spawn', x: 60, y: G, kind: 'edge' }, { type: 'spawn', x: 3140, y: G, kind: 'edge' },
        { type: 'light', x: 1600, y: 820, r: 440, color: '#ffbf70', int: 1, kind: 'street', shaft: 290, clip: null }, { type: 'decor', kind: 'lamp', x: 1576, y: G },
      ],
    };
  }

  // ------------------------------------------------------------ lifecycle
  open() {
    this.buildUI();
    this.attach();
    this.dirty = true;
    Input.gameFocus = false;
  }
  hide() { this.detach(); if (this.ui) this.ui.remove(); this.ui = null; }
  close() { this.hide(); }
  attach() {
    if (this.handlers) return;
    const c = this.canvas;
    const H = this.handlers = {
      down: (e) => this.onDown(e), move: (e) => this.onMove(e), up: (e) => this.onUp(e),
      wheel: (e) => { e.preventDefault(); this.onWheel(e); }, key: (e) => this.onKey(e), ctx: (e) => e.preventDefault(),
    };
    c.addEventListener('mousedown', H.down); window.addEventListener('mousemove', H.move); window.addEventListener('mouseup', H.up);
    c.addEventListener('wheel', H.wheel, { passive: false }); window.addEventListener('keydown', H.key); c.addEventListener('contextmenu', H.ctx);
  }
  detach() {
    const H = this.handlers, c = this.canvas;
    if (!H) return;
    c.removeEventListener('mousedown', H.down); window.removeEventListener('mousemove', H.move); window.removeEventListener('mouseup', H.up);
    c.removeEventListener('wheel', H.wheel); window.removeEventListener('keydown', H.key); c.removeEventListener('contextmenu', H.ctx);
    this.handlers = null;
  }

  // ------------------------------------------------------------ history
  commit(label) {
    this.undoStack.push(JSON.stringify(this.map));
    if (this.undoStack.length > 120) this.undoStack.shift();
    this.redoStack.length = 0;
    this.saved = false;
    this.dirty = true;
    if (label) this.status(label);
  }
  snapshot() { return JSON.stringify(this.map); }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.stringify(this.map));
    this.map = JSON.parse(this.undoStack.pop());
    this.sel = []; this.dirty = true; this.refreshProps(); this.status('Undo');
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(JSON.stringify(this.map));
    this.map = JSON.parse(this.redoStack.pop());
    this.sel = []; this.dirty = true; this.refreshProps(); this.status('Redo');
  }

  // ------------------------------------------------------------ geometry
  bounds(o) {
    switch (o.type) {
      case 'block': case 'backwall': return [o.x, o.y, o.w, o.h];
      case 'platform': return [o.x, o.y, o.w, o.h || 10];
      case 'stairs': return [o.x, o.y - o.h, o.w, o.h];
      case 'ladder': return [o.x, o.y, o.w || 28, o.h];
      case 'door': return [o.x, o.y, 14, o.h || 132];
      case 'window': return [o.x, o.y, 16, o.h || 70];
      case 'barricade': return [o.x, o.y, o.w || 24, o.h || 70];
      case 'prop': { const d = PROP_DEFS[o.kind] || { w: 40, h: 40 }; return [o.x, o.y, o.w || d.w, o.h || d.h]; }
      case 'decor': { const d = DECOR_KINDS[o.kind] || { w: 40, h: 40 }; const w = o.w || d.w, h = o.h || d.h; return Decor.BOTTOM.has(o.kind) ? [o.x, o.y - h, w, h] : [o.x, o.y, w, h]; }
      case 'light': return [o.x - 12, o.y - 12, 24, 24];
      case 'fire': return [o.x - 16, o.y - 34, 32, 34];
      case 'note': return [o.x - 10, o.y - 14, 20, 24];
      case 'pickup': return [o.x - 10, o.y - 16, 20, 16];
      default: return [o.x - 13, o.y - 44, 26, 44]; // player, spawn, zombie
    }
  }
  resizable(o) { return ['block', 'backwall', 'platform', 'stairs', 'ladder', 'decor', 'barricade'].includes(o.type) || (o.type === 'prop'); }
  hit(wx, wy) {
    const objs = this.map.objects;
    // gameplay markers & small objects first, then props/doors, then structure, then back walls
    const order = (o) => ({ player: 0, spawn: 0, zombie: 0, light: 0, note: 0, pickup: 0, fire: 0, door: 1, window: 1, barricade: 1, prop: 2, ladder: 3, decor: 4, platform: 5, stairs: 5, block: 6, backwall: 7 }[o.type] ?? 5);
    let best = null, bo = 99;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i], [x, y, w, h] = this.bounds(o);
      if (wx >= x - 3 && wx <= x + w + 3 && wy >= y - 3 && wy <= y + h + 3 && order(o) < bo) { best = o; bo = order(o); }
    }
    return best;
  }
  snapV(v) { return this.snap ? Math.round(v / this.grid) * this.grid : Math.round(v); }
  s2w(sx, sy) { const v = this.view; return [v.x + sx / v.scale, v.y + sy / v.scale]; }

  // ------------------------------------------------------------ input
  onDown(e) {
    const [wx, wy] = this.s2w(Input.mx, Input.my);
    this.mouse.wx = wx; this.mouse.wy = wy;
    if (e.button === 1 || e.button === 2 || this.tool === 'pan' || this.spaceHeld) { this.drag = { kind: 'pan', sx: Input.mx, sy: Input.my, cx: this.cam.x, cy: this.cam.y }; if (e.button === 2 && this.placing) { this.placing = null; this.tool = 'select'; this.refreshTools(); } return; }
    if (e.button !== 0) return;
    if (this.tool === 'place' && this.placing) { this.beginPlace(wx, wy); return; }
    if (this.tool === 'delete') { const o = this.hit(wx, wy); if (o) { this.commit('Deleted ' + o.type); this.map.objects.splice(this.map.objects.indexOf(o), 1); this.sel = []; this.refreshProps(); } return; }
    // resize handle?
    if (this.sel.length === 1 && this.resizable(this.sel[0])) {
      const h = this.handleAt(this.sel[0], wx, wy);
      if (h) { this.drag = { kind: 'resize', h, o: this.sel[0], start: this.snapshot(), ox: wx, oy: wy, b: { x: this.sel[0].x, y: this.sel[0].y, w: this.bounds(this.sel[0])[2], hh: this.bounds(this.sel[0])[3] } }; return; }
    }
    const o = this.hit(wx, wy);
    if (o) {
      if (e.shiftKey) { const i = this.sel.indexOf(o); if (i >= 0) this.sel.splice(i, 1); else this.sel.push(o); }
      else if (!this.sel.includes(o)) this.sel = [o];
      this.drag = { kind: 'move', start: this.snapshot(), ox: wx, oy: wy, orig: this.sel.map((s) => [s.x, s.y]), moved: false };
      if (e.altKey) { // alt-drag duplicates
        const copies = this.sel.map((s) => deepClone(s));
        this.map.objects.push(...copies); this.sel = copies;
        this.drag.orig = this.sel.map((s) => [s.x, s.y]);
      }
    } else {
      if (!e.shiftKey) this.sel = [];
      this.drag = { kind: 'box', ox: wx, oy: wy, x1: wx, y1: wy };
    }
    this.refreshProps();
  }
  onMove() {
    const [wx, wy] = this.s2w(Input.mx, Input.my);
    this.mouse.wx = wx; this.mouse.wy = wy;
    const d = this.drag;
    if (this.statusEl) this.statusEl.textContent = `x ${Math.round(wx)}  y ${Math.round(wy)}   zoom ${(this.cam.zoom * 100) | 0}%   objects ${this.map.objects.length}   ${this.hint || ''}`;
    if (!d) return;
    if (d.kind === 'pan') { const v = this.view; this.cam.x = d.cx - (Input.mx - d.sx) / v.scale; this.cam.y = d.cy - (Input.my - d.sy) / v.scale; return; }
    if (d.kind === 'box') { d.x1 = wx; d.y1 = wy; return; }
    if (d.kind === 'move') {
      const dx = wx - d.ox, dy = wy - d.oy;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      this.sel.forEach((s, i) => { s.x = this.snapV(d.orig[i][0] + dx); s.y = this.snapV(d.orig[i][1] + dy); });
      this.dirty = true;
      return;
    }
    if (d.kind === 'resize') {
      const o = d.o, b = d.b, h = d.h;
      let x0 = b.x, x1 = b.x + b.w, y0 = o.type === 'stairs' ? o.y - b.hh : b.y, y1 = y0 + b.hh;
      if (h.includes('l')) x0 = Math.min(this.snapV(wx), x1 - 8);
      if (h.includes('r')) x1 = Math.max(this.snapV(wx), x0 + 8);
      if (h.includes('t')) y0 = Math.min(this.snapV(wy), y1 - 6);
      if (h.includes('b')) y1 = Math.max(this.snapV(wy), y0 + 6);
      o.x = x0; o.w = x1 - x0;
      if (o.type === 'stairs') { o.y = y1; o.h = y1 - y0; }
      else if (o.type === 'decor' && Decor.BOTTOM.has(o.kind)) { o.y = y1; o.h = y1 - y0; }
      else { o.y = y0; o.h = y1 - y0; }
      if (o.type === 'platform') o.h = Math.min(o.h, 30);
      this.dirty = true;
      return;
    }
    if (d.kind === 'place-rect') { d.x1 = wx; d.y1 = wy; }
  }
  onUp() {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.kind === 'move' && d.moved) { this.undoStack.push(d.start); this.redoStack.length = 0; this.saved = false; this.dirty = true; this.refreshProps(); }
    else if (d.kind === 'resize') { this.undoStack.push(d.start); this.redoStack.length = 0; this.saved = false; this.dirty = true; this.refreshProps(); }
    else if (d.kind === 'box') {
      const x0 = Math.min(d.ox, d.x1), x1 = Math.max(d.ox, d.x1), y0 = Math.min(d.oy, d.y1), y1 = Math.max(d.oy, d.y1);
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        for (const o of this.map.objects) { const [x, y, w, h] = this.bounds(o); if (x >= x0 && x + w <= x1 && y >= y0 && y + h <= y1 && !this.sel.includes(o)) this.sel.push(o); }
        this.refreshProps();
      }
    } else if (d.kind === 'place-rect') {
      const t = d.tpl;
      const x0 = this.snapV(Math.min(d.ox, d.x1)), x1 = this.snapV(Math.max(d.ox, d.x1)), y0 = this.snapV(Math.min(d.oy, d.y1)), y1 = this.snapV(Math.max(d.oy, d.y1));
      const o = Object.assign(t, { x: x0, y: y0 });
      if (x1 - x0 >= 8) o.w = x1 - x0;
      if (y1 - y0 >= 6 && o.type !== 'platform') o.h = y1 - y0;
      this.commit('Placed ' + o.type);
      this.map.objects.push(o); this.sel = [o]; this.refreshProps();
    }
  }
  onWheel(e) {
    const [wx, wy] = this.s2w(Input.mx, Input.my);
    const z0 = this.cam.zoom;
    this.cam.zoom = clamp(z0 * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.15, 2.5);
    // zoom toward cursor
    const k = z0 / this.cam.zoom;
    this.cam.x = wx + (this.cam.x - wx) * k; this.cam.y = wy + (this.cam.y - wy) * k;
  }
  onKey(e) {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const k = e.code, ctrl = e.ctrlKey || e.metaKey;
    if (k === 'Space') { this.spaceHeld = true; e.preventDefault(); window.addEventListener('keyup', (ev) => { if (ev.code === 'Space') this.spaceHeld = false; }, { once: true }); }
    if (ctrl && k === 'KeyZ') { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (ctrl && k === 'KeyY') { e.preventDefault(); this.redo(); return; }
    if (ctrl && k === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (ctrl && k === 'KeyC') { this.clip = this.sel.map((s) => deepClone(s)); this.status(`Copied ${this.clip.length}`); return; }
    if (ctrl && k === 'KeyV' && this.clip) { this.commit('Pasted'); const c = this.clip.map((s) => Object.assign(deepClone(s), { x: s.x + 32, y: s.y })); this.map.objects.push(...c); this.sel = c; this.refreshProps(); return; }
    if (ctrl && k === 'KeyD') { e.preventDefault(); if (this.sel.length) { this.commit('Duplicated'); const c = this.sel.map((s) => Object.assign(deepClone(s), { x: s.x + 32 })); this.map.objects.push(...c); this.sel = c; this.refreshProps(); } return; }
    if (k === 'Delete' || k === 'Backspace') { if (this.sel.length) { this.commit('Deleted ' + this.sel.length); this.map.objects = this.map.objects.filter((o) => !this.sel.includes(o)); this.sel = []; this.refreshProps(); } return; }
    if (k === 'KeyR' && this.sel.length) { this.rotateSel(e.shiftKey ? -1 : 1); return; }
    if (k === 'KeyF' && this.sel.length) { this.commit('Flipped'); for (const s of this.sel) { if (s.type === 'stairs') s.dir = -s.dir; else s.flip = !s.flip; } this.dirty = true; return; }
    if (k === 'KeyG') { this.snap = !this.snap; this.refreshTools(); return; }
    if (k === 'KeyL') { this.lightPreview = !this.lightPreview; this.refreshTools(); return; }
    if (k === 'Escape') { if (this.placing) { this.placing = null; this.setTool('select'); } else { this.sel = []; this.refreshProps(); } return; }
    if (k === 'KeyP' && !ctrl) { this.playtest(); return; }
    if (k === 'Digit1') this.setTool('select'); if (k === 'Digit2') this.setTool('place'); if (k === 'Digit3') this.setTool('pan'); if (k === 'Digit4') this.setTool('delete');
    const step = e.shiftKey ? this.grid * 4 : this.grid;
    if (this.sel.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault(); this.commit();
      for (const s of this.sel) { if (k === 'ArrowLeft') s.x -= step; if (k === 'ArrowRight') s.x += step; if (k === 'ArrowUp') s.y -= step; if (k === 'ArrowDown') s.y += step; }
      this.refreshProps();
    }
  }
  rotateSel(dir) {
    this.commit('Rotated');
    for (const s of this.sel) {
      if (s.type === 'block' || s.type === 'backwall' || s.type === 'platform') { const w = s.w; s.w = s.h || 10; s.h = w; }
      else if (s.type === 'stairs') s.dir = -s.dir;
      else s.rot = ((s.rot || 0) + dir * Math.PI / 12) % TAU;
    }
    this.dirty = true; this.refreshProps();
  }
  handleAt(o, wx, wy) {
    const [x, y, w, h] = this.bounds(o), r = 8 / this.view.scale;
    const pts = { tl: [x, y], tr: [x + w, y], bl: [x, y + h], br: [x + w, y + h], l: [x, y + h / 2], r: [x + w, y + h / 2], t: [x + w / 2, y], b: [x + w / 2, y + h] };
    for (const k in pts) if (Math.abs(wx - pts[k][0]) < r && Math.abs(wy - pts[k][1]) < r) return k;
    return null;
  }

  // ------------------------------------------------------------ placing
  setTool(t) { this.tool = t; if (t !== 'place') this.placing = null; this.refreshTools(); }
  pick(item) { this.placing = item; this.tool = 'place'; this.refreshTools(); this.status('Placing: ' + item.label + (item.drag ? '  (click-drag to size)' : '') + '  — right-click or Esc to stop'); }
  beginPlace(wx, wy) {
    const it = this.placing;
    const x = this.snapV(wx), y = this.snapV(wy);
    if (it.composite) {
      const floorY = y, out = MB.wall(x, floorY, it.composite === 'wall-door' ? 'door' : 'window', { mat: 'concrete' });
      this.commit('Placed wall'); this.map.objects.push(...out); this.sel = out; this.refreshProps(); return;
    }
    const o = it.make();
    if (it.drag) { this.drag = { kind: 'place-rect', tpl: o, ox: wx, oy: wy, x1: wx, y1: wy }; return; }
    // floor-anchored objects: y is the floor under the cursor
    const floorTypes = ['player', 'spawn', 'zombie', 'stairs', 'fire', 'pickup'];
    if (o.type === 'prop') { const d = PROP_DEFS[o.kind]; o.x = x - (d.w / 2 | 0); o.y = y - d.h; }
    else if (o.type === 'decor') { const d = DECOR_KINDS[o.kind]; o.x = x; o.y = Decor.BOTTOM.has(o.kind) ? y : y; if (!Decor.BOTTOM.has(o.kind)) o.y = y - (d.h / 2 | 0); }
    else if (o.type === 'door' || o.type === 'window' || o.type === 'barricade') { o.x = x; o.y = y - (o.h || (o.type === 'barricade' ? 70 : 132)); }
    else if (o.type === 'ladder') { o.x = x; o.y = y - o.h; }
    else if (floorTypes.includes(o.type) || o.type === 'note' || o.type === 'light') { o.x = x; o.y = y; }
    if (o.type === 'player') this.map.objects = this.map.objects.filter((q) => q.type !== 'player');
    this.commit('Placed ' + (o.kind || o.type));
    this.map.objects.push(o);
    this.sel = [o];
    this.refreshProps();
  }

  // ------------------------------------------------------------ preview
  rebuild() {
    const m = deepClone(this.map);
    try { this.preview = new Game(m, { noPlayer: true, noPreplaced: true, modeFactory: (g) => new NullMode(g) }); }
    catch (e) { console.error(e); this.status('Error building map: ' + e.message); }
    this.dirty = false; this.lastBuild = performance.now();
  }
  update(dt) {
    if (this.dirty && (!this.drag || performance.now() - this.lastBuild > 60)) this.rebuild();
    if (this.preview) this.preview.time += dt;
    // keyboard panning
    if (!this.focusInField()) {
      const sp = 900 * dt / this.cam.zoom;
      if (Input.keyDown('KeyA')) this.cam.x -= sp; if (Input.keyDown('KeyD')) this.cam.x += sp;
      if (Input.keyDown('KeyW')) this.cam.y -= sp; if (Input.keyDown('KeyS') && !(Input.keyDown('ControlLeft') || Input.keyDown('MetaLeft'))) this.cam.y += sp;
    }
  }
  focusInField() { const a = document.activeElement; return a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); }
  render(ctx) {
    const g = this.preview;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const scale = (ch / 800) * this.cam.zoom;
    const v = this.view = { scale, w: cw / scale, h: ch / scale, x: this.cam.x - cw / scale / 2, y: this.cam.y - ch / scale / 2 };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!g) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cw, ch); return; }
    g.view = v;
    Scene.background(g, ctx, v);
    ctx.save();
    ctx.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale);
    Scene.backwalls(g, ctx, v); Scene.decor(g, ctx, v, 0); Scene.stairs(g, ctx, v); Scene.ladders(g, ctx, v);
    Scene.blocks(g, ctx, v);
    for (const p of g.props) p.draw(ctx, g.time);
    Scene.decor(g, ctx, v, 1);
    g.drawNotes(ctx);
    ctx.restore();
    if (this.lightPreview) {
      Scene.fog(g, ctx, v); Lighting.render(g, ctx, v);
      ctx.save(); ctx.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale); Lighting.glows(g, ctx, v); ctx.restore();
    }
    // ---- gizmos
    ctx.save();
    ctx.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale);
    const px = 1 / v.scale;
    if (this.showGrid && this.grid * v.scale >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = px;
      ctx.beginPath();
      const gs = this.grid * (this.grid * v.scale < 10 ? 4 : 1);
      for (let x = Math.floor(v.x / gs) * gs; x < v.x + v.w; x += gs) { ctx.moveTo(x, v.y); ctx.lineTo(x, v.y + v.h); }
      for (let y = Math.floor(v.y / gs) * gs; y < v.y + v.h; y += gs) { ctx.moveTo(v.x, y); ctx.lineTo(v.x + v.w, y); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,160,64,0.8)'; ctx.lineWidth = 2 * px; ctx.setLineDash([10 * px, 6 * px]);
    ctx.strokeRect(0, 0, this.map.width, this.map.height);
    ctx.strokeStyle = 'rgba(120,180,255,0.35)'; ctx.beginPath(); ctx.moveTo(0, this.map.horizon); ctx.lineTo(this.map.width, this.map.horizon); ctx.stroke();
    ctx.setLineDash([]);
    for (const o of this.map.objects) this.drawGizmo(ctx, o, px);
    // selection
    for (const o of this.sel) {
      const [x, y, w, h] = this.bounds(o);
      ctx.strokeStyle = '#ffcc40'; ctx.lineWidth = 2 * px; ctx.strokeRect(x, y, w, h);
      if (this.sel.length === 1 && this.resizable(o)) {
        ctx.fillStyle = '#ffcc40';
        for (const [hx, hy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h], [x, y + h / 2], [x + w, y + h / 2], [x + w / 2, y], [x + w / 2, y + h]]) ctx.fillRect(hx - 4 * px, hy - 4 * px, 8 * px, 8 * px);
      }
      if (o.type === 'light') { ctx.strokeStyle = rgba(o.color || '#ffffff', 0.5); ctx.beginPath(); ctx.arc(o.x, o.y, o.r || 300, 0, TAU); ctx.stroke(); }
    }
    const d = this.drag;
    if (d && (d.kind === 'box' || d.kind === 'place-rect')) {
      ctx.strokeStyle = d.kind === 'box' ? 'rgba(255,204,64,0.9)' : 'rgba(120,220,120,0.9)'; ctx.lineWidth = px; ctx.setLineDash([6 * px, 4 * px]);
      const x0 = d.kind === 'place-rect' ? this.snapV(Math.min(d.ox, d.x1)) : Math.min(d.ox, d.x1), y0 = d.kind === 'place-rect' ? this.snapV(Math.min(d.oy, d.y1)) : Math.min(d.oy, d.y1);
      const x1 = d.kind === 'place-rect' ? this.snapV(Math.max(d.ox, d.x1)) : Math.max(d.ox, d.x1), y1 = d.kind === 'place-rect' ? this.snapV(Math.max(d.oy, d.y1)) : Math.max(d.oy, d.y1);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.setLineDash([]);
      if (d.kind === 'place-rect') { ctx.fillStyle = 'rgba(120,220,120,0.15)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    }
    // ghost of the item being placed
    if (this.tool === 'place' && this.placing && !this.drag) {
      const sx = this.snapV(this.mouse.wx), sy = this.snapV(this.mouse.wy);
      ctx.strokeStyle = 'rgba(120,220,120,0.9)'; ctx.lineWidth = 1.5 * px;
      ctx.beginPath(); ctx.moveTo(sx - 10 * px, sy); ctx.lineTo(sx + 10 * px, sy); ctx.moveTo(sx, sy - 10 * px); ctx.lineTo(sx, sy + 10 * px); ctx.stroke();
      ctx.font = `${12 * px}px sans-serif`; ctx.fillStyle = 'rgba(160,240,160,0.95)'; ctx.fillText(this.placing.label, sx + 12 * px, sy - 8 * px);
    }
    ctx.restore();
  }
  drawGizmo(ctx, o, px) {
    const icon = (glyph, col, x, y) => {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(x, y, 11 * Math.max(1, px), 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2 * px; ctx.stroke();
      ctx.fillStyle = col; ctx.font = `bold ${13 * Math.max(1, px)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, x, y + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    };
    switch (o.type) {
      case 'player': ctx.fillStyle = 'rgba(100,210,110,0.25)'; ctx.fillRect(o.x - 11, o.y - 112, 22, 112); icon('P', '#6ad070', o.x, o.y - 124); break;
      case 'spawn': icon(o.kind === 'vent' ? 'V' : 'S', o.kind === 'vent' ? '#b060e0' : '#e05040', o.x, o.y - 14); break;
      case 'zombie': ctx.fillStyle = 'rgba(200,150,80,0.2)'; ctx.fillRect(o.x - 11, o.y - 110, 22, 110); icon('Z', '#c0a060', o.x, o.y - 122); ctx.fillStyle = '#e0c890'; ctx.font = `${11 * Math.max(1, px)}px sans-serif`; ctx.fillText(o.kind, o.x + 14, o.y - 118); break;
      case 'light': icon('☀', o.color || '#ffe0a0', o.x, o.y); break;
      case 'fire': icon('^', o.harmless ? '#ffa040' : '#ff5020', o.x, o.y - 16); break;
      case 'pickup': icon('+', '#e8d090', o.x, o.y - 10); ctx.fillStyle = '#e8d090'; ctx.font = `${10 * Math.max(1, px)}px sans-serif`; ctx.fillText(o.kind + (o.ammo ? ' ' + o.ammo : o.weapon && o.kind === 'weapon' ? ' ' + o.weapon : ''), o.x + 14, o.y - 6); break;
      case 'block': case 'platform': case 'backwall': case 'stairs': case 'ladder':
        if (this.sel.includes(o)) break;
        ctx.strokeStyle = o.type === 'backwall' ? 'rgba(120,160,255,0.18)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = px;
        { const [x, y, w, h] = this.bounds(o); ctx.strokeRect(x, y, w, h); }
        break;
    }
  }

  // ------------------------------------------------------------ files
  status(msg) { this.hint = msg; if (this.statusEl) this.onMove(); }
  save() {
    if (!this.map.objects.some((o) => o.type === 'player')) { this.status('Add a player spawn before saving.'); alert('Add a Player spawn (Gameplay tab) before saving.'); return; }
    const ok = Custom.save(this.map);
    this.saved = ok;
    this.status(ok ? `Saved "${this.map.name}" — it now appears in Survival & Sandbox map lists` : 'Save failed (browser storage blocked or full)');
  }
  playtest() {
    if (!this.map.objects.some((o) => o.type === 'player')) { alert('Add a Player spawn (Gameplay tab) before playtesting.'); return; }
    App.playtest(deepClone(this.map));
  }
  load(m, asCopy = false) {
    const err = Custom.validate(m);
    if (err) { alert(err); return; }
    this.map = deepClone(m);
    if (asCopy || !this.map.custom) { this.map.id = 'custom_' + uid(); this.map.name = (m.name || 'Map') + (asCopy || !m.custom ? ' (copy)' : ''); this.map.custom = true; }
    this.undoStack = []; this.redoStack = []; this.sel = []; this.dirty = true;
    const p = this.map.objects.find((o) => o.type === 'player');
    this.cam.x = p ? p.x : this.map.width / 2; this.cam.y = p ? p.y - 200 : this.map.height / 2;
    this.refreshProps(); this.refreshTools(); this.status('Loaded ' + this.map.name);
  }
  openDialog() {
    const list = h('div', { class: 'ed-open' });
    const close = () => dlg.remove();
    list.append(h('h3', {}, 'Built-in maps (opens an editable copy)'));
    for (const m of MapLib.all()) list.append(h('div', { class: 'ed-row' }, h('span', {}, m.name), this.btnS('Open copy', () => { this.load(m, true); close(); })));
    list.append(h('h3', {}, 'Your saved maps'));
    const mine = Custom.list();
    if (!mine.length) list.append(h('div', { class: 'dim' }, 'None yet — Save to store a map in this browser.'));
    for (const m of mine) list.append(h('div', { class: 'ed-row' }, h('span', {}, m.name), h('span', { class: 'dim' }, new Date(m.saved || 0).toLocaleString()), this.btnS('Open', () => { this.load(m); close(); }), this.btnS('Delete', () => { if (confirm('Delete "' + m.name + '"?')) { Custom.remove(m.id); close(); this.openDialog(); } })));
    const dlg = h('div', { class: 'screen ed-dialog' }, h('div', { class: 'panel' }, h('h2', {}, 'OPEN MAP'), list, h('div', { class: 'row end' }, this.btnS('Close', close))));
    this.ui.append(dlg);
  }
  importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const m = JSON.parse(r.result); this.load(m, false); this.map.id = m.id && String(m.id).startsWith('custom_') ? m.id : 'custom_' + uid(); this.map.custom = true; this.status('Imported ' + this.map.name); } catch (e) { alert('Could not read map: ' + e.message); } };
      r.readAsText(f);
    });
    inp.click();
  }

  // ------------------------------------------------------------ UI
  btnS(label, fn, cls = '', title = '') { return h('button', { class: 'btn tiny ' + cls, onclick: fn, title: title || null }, label); }
  buildUI() {
    if (this.ui) this.ui.remove();
    const top = h('div', { class: 'ed-top' },
      h('span', { class: 'ed-title' }, 'MAP CREATOR'),
      this.btnS('New', () => { if (this.saved || confirm('Discard unsaved changes?')) { this.map = this.blankMap(); this.undoStack = []; this.redoStack = []; this.sel = []; this.dirty = true; this.refreshProps(); } }),
      this.btnS('Open', () => this.openDialog()),
      this.btnS('Save', () => this.save()),
      this.btnS('Export', () => Custom.exportFile(this.map), '', 'Download the map as a .json file'),
      this.btnS('Import', () => this.importFile(), '', 'Load a map .json file'),
      h('span', { class: 'sep' }),
      this.btnS('↶', () => this.undo(), '', 'Undo (Ctrl+Z)'), this.btnS('↷', () => this.redo(), '', 'Redo (Ctrl+Y)'),
      h('span', { class: 'sep' }),
      this.toolBtns = h('span', {},
        this.btnS('Select', () => this.setTool('select'), '', 'Select / move / resize (1)'), this.btnS('Place', () => this.setTool('place'), '', 'Place palette item (2)'), this.btnS('Pan', () => this.setTool('pan'), '', 'Pan view (3)'), this.btnS('Delete', () => this.setTool('delete'), '', 'Click to delete (4)')),
      h('span', { class: 'sep' }),
      this.snapBtn = this.btnS('Snap', () => { this.snap = !this.snap; this.refreshTools(); }, '', 'Grid snapping (G) — off = free placement'),
      this.gridSel = select([[8, '8'], [16, '16'], [32, '32'], [64, '64']], this.grid, (v) => { this.grid = +v; }),
      this.gridBtn = this.btnS('Grid', () => { this.showGrid = !this.showGrid; this.refreshTools(); }, '', 'Show grid'),
      this.lightBtn = this.btnS('Lights', () => { this.lightPreview = !this.lightPreview; this.refreshTools(); }, '', 'Preview in-game lighting, fog and ambience (L)'),
      h('span', { class: 'sep' }),
      this.btnS('▶ Playtest', () => this.playtest(), 'primary', 'Play this map now (P); Esc → Back to editor'),
      this.btnS('Exit', () => { if (this.saved || confirm('Leave without saving?')) App.toMenu(); }, 'ghost'));
    const tabs = h('div', { class: 'ed-tabs' });
    const items = h('div', { class: 'ed-items' });
    const cats = ED_PALETTE();
    const showCat = (i) => {
      this.paletteCat = i;
      tabs.querySelectorAll('button').forEach((b, k) => b.classList.toggle('sel', k === i));
      items.innerHTML = '';
      for (const it of cats[i].items) {
        const b = h('button', { class: 'ed-item', title: it.label, onclick: () => { this.pick(it); items.querySelectorAll('.ed-item').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); } }, this.itemIcon(it), h('span', {}, it.label));
        items.append(b);
      }
    };
    cats.forEach((c, i) => tabs.append(this.btnS(c.label, () => showCat(i))));
    const left = h('div', { class: 'ed-left' }, tabs, items);
    this.propsEl = h('div', { class: 'ed-props' });
    const right = h('div', { class: 'ed-right' }, this.propsEl);
    this.statusEl = h('div', { class: 'ed-status' }, '');
    const help = h('div', { class: 'ed-help' }, 'LMB select/move · drag empty space to box-select · Shift+click multi · Alt+drag duplicate · handles resize · R rotate · F flip · Del delete · Ctrl+C/V/D copy/paste/duplicate · Ctrl+Z/Y undo/redo · arrows nudge · wheel zoom · RMB/MMB/Space-drag or WASD pan · Esc cancel');
    this.ui = h('div', { class: 'editor-ui' }, top, left, right, this.statusEl, help);
    UI.root.appendChild(this.ui);
    showCat(this.paletteCat);
    this.refreshTools(); this.refreshProps();
  }
  itemIcon(it) {
    const cv = h('canvas', { width: 64, height: 40 }), c = cv.getContext('2d');
    const ic = it.icon || {};
    c.fillStyle = '#16171a'; c.fillRect(0, 0, 64, 40);
    const fit = (img, w, h2) => { const k = Math.min(60 / w, 36 / h2); c.drawImage(img, 32 - w * k / 2, 20 - h2 * k / 2, w * k, h2 * k); };
    try {
      if (ic.prop) { const d = PROP_DEFS[ic.prop]; const a = PropArt.get(d.art || ic.prop, d.w, d.h); fit(a.cv, a.cv.width, a.cv.height); }
      else if (ic.decor) { const s = Decor.sprite({ kind: ic.decor }); if (s) fit(s.cv, s.cv.width, s.cv.height); }
      else if (ic.light) { c.drawImage(Lighting.radial(ic.light), 12, 0, 40, 40); }
      else if (ic.glyph) { c.fillStyle = ic.color; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ic.glyph, 32, 21); }
      else {
        const o = it.make ? it.make() : { type: 'block' };
        c.fillStyle = o.type === 'backwall' ? '#3a4458' : o.type === 'platform' ? '#6a6458' : o.type === 'door' ? (o.metal ? '#4a5258' : '#6a4a2c') : o.type === 'window' ? '#7a96a8' : o.type === 'ladder' ? '#4a4e52' : '#8a8478';
        if (o.type === 'stairs') { for (let i = 0; i < 6; i++) c.fillRect(o.dir > 0 ? 8 + i * 8 : 48 - i * 8, 32 - i * 5, 8, 4 + i * 5); }
        else if (o.type === 'ladder') { c.fillRect(26, 4, 3, 32); c.fillRect(36, 4, 3, 32); for (let y = 8; y < 36; y += 6) c.fillRect(26, y, 13, 2); }
        else if (o.type === 'door' || o.type === 'window' || o.type === 'barricade') c.fillRect(27, 6, 10, 30);
        else if (it.composite) { c.fillRect(28, 4, 8, 32); c.fillStyle = it.composite === 'wall-door' ? '#6a4a2c' : '#7a96a8'; c.fillRect(29, it.composite === 'wall-door' ? 16 : 12, 6, it.composite === 'wall-door' ? 20 : 12); }
        else c.fillRect(8, o.type === 'platform' ? 18 : 12, 48, o.type === 'platform' ? 5 : 16);
      }
    } catch (e) { /* icon best-effort */ }
    return cv;
  }
  refreshTools() {
    if (!this.toolBtns) return;
    const names = ['select', 'place', 'pan', 'delete'];
    [...this.toolBtns.children].forEach((b, i) => b.classList.toggle('sel', this.tool === names[i]));
    this.snapBtn.classList.toggle('on', this.snap); this.gridBtn.classList.toggle('on', this.showGrid); this.lightBtn.classList.toggle('on', this.lightPreview);
    this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'delete' ? 'not-allowed' : this.tool === 'place' ? 'crosshair' : 'default';
  }
  refreshProps() {
    const P = this.propsEl;
    if (!P) return;
    P.innerHTML = '';
    const change = (fn) => { this.commit(); fn(); this.dirty = true; };
    const num = (label, obj, key, step = 1) => {
      const inp = h('input', { type: 'number', value: obj[key] === undefined ? '' : (+obj[key]).toFixed(step < 1 ? 2 : 0), step });
      inp.addEventListener('change', () => change(() => { obj[key] = +inp.value; }));
      return h('label', { class: 'ef' }, h('span', {}, label), inp);
    };
    const txt = (label, obj, key, area = false) => {
      const inp = h(area ? 'textarea' : 'input', { value: obj[key] || '' }); if (area) { inp.value = obj[key] || ''; inp.rows = 6; }
      inp.addEventListener('change', () => change(() => { obj[key] = inp.value; }));
      return h('label', { class: 'ef' + (area ? ' area' : '') }, h('span', {}, label), inp);
    };
    const sel = (label, obj, key, opts) => h('label', { class: 'ef' }, h('span', {}, label), select(opts, obj[key], (v) => change(() => { obj[key] = isNaN(+v) || v === '' ? v : (typeof obj[key] === 'number' ? +v : v); })));
    const chk = (label, obj, key) => { const cb = h('input', { type: 'checkbox' }); cb.checked = !!obj[key]; cb.addEventListener('change', () => change(() => { obj[key] = cb.checked; })); return h('label', { class: 'ef chk' }, cb, h('span', {}, label)); };
    const col = (label, obj, key, def) => { const inp = h('input', { type: 'color', value: obj[key] || def || '#ffffff' }); inp.addEventListener('change', () => change(() => { obj[key] = inp.value; })); return h('label', { class: 'ef' }, h('span', {}, label), inp); };
    const rng = (label, obj, key, min, max, step) => { const inp = h('input', { type: 'range', min, max, step, value: obj[key] || 0 }); const out = h('em', {}, String(obj[key] || 0)); inp.addEventListener('input', () => { out.textContent = inp.value; }); inp.addEventListener('change', () => change(() => { obj[key] = +inp.value; })); return h('label', { class: 'ef' }, h('span', {}, label), inp, out); };
    if (!this.sel.length) {
      const m = this.map;
      P.append(h('div', { class: 'ed-h' }, 'MAP SETTINGS'),
        txt('Name', m, 'name'), txt('Subtitle', m, 'subtitle'), txt('Description', m, 'desc', true),
        sel('Theme / backdrop', m, 'theme', Object.keys(THEMES).map((k) => [k, k])),
        num('Width', m, 'width', 16), num('Height', m, 'height', 16), num('Horizon (ground y)', m, 'horizon', 16),
        h('div', { class: 'ed-h' }, 'LIGHTING & ATMOSPHERE'),
        col('Ambient colour', m, 'ambient'), rng('Ambient level', m, 'ambientLevel', 0, 1, 0.01),
        h('div', { class: 'row' }, this.btnS('Night', () => change(() => { m.ambient = '#20222a'; m.ambientLevel = 0.2; })), this.btnS('Moonlit', () => change(() => { m.ambient = '#323a4e'; m.ambientLevel = 0.28; })), this.btnS('Pitch black', () => change(() => { m.ambient = '#0a0b0e'; m.ambientLevel = 0.05; })), this.btnS('Dusk', () => change(() => { m.ambient = '#4a3a34'; m.ambientLevel = 0.35; }))),
        rng('Fog density', m, 'fog', 0, 1, 0.05), col('Fog colour', m, 'fogColor', (THEMES[m.theme] || THEMES.streets).fog),
        sel('Weather', m, 'weather', [['none', 'None'], ['rain', 'Rain'], ['ash', 'Ash'], ['dust', 'Dust motes']]),
        rng('Reverb', m, 'reverb', 0, 1, 0.05),
        sel('Ambience loop', m, 'amb', [['amb_wind', 'Wind'], ['amb_rain', 'Rain'], ['amb_room', 'Building hum'], ['amb_drone', 'Dark drone'], ['amb_tunnel', 'Tunnel'], ['amb_factory', 'Factory'], ['amb_night', 'Night field']]),
        h('div', { class: 'hint' }, 'Tip: toggle Lighting [L] to preview lights, fog and ambience exactly as in game. Lights with "clip: auto" are confined to the back wall (room) they sit in.'));
      return;
    }
    if (this.sel.length > 1) {
      P.append(h('div', { class: 'ed-h' }, this.sel.length + ' OBJECTS SELECTED'), h('div', { class: 'row' }, this.btnS('Delete', () => { this.commit(); this.map.objects = this.map.objects.filter((o) => !this.sel.includes(o)); this.sel = []; this.refreshProps(); }), this.btnS('Duplicate', () => { this.commit(); const c = this.sel.map((s) => Object.assign(deepClone(s), { x: s.x + 32 })); this.map.objects.push(...c); this.sel = c; this.refreshProps(); })));
      return;
    }
    const o = this.sel[0];
    P.append(h('div', { class: 'ed-h' }, (o.type + (o.kind ? ' · ' + o.kind : '')).toUpperCase()));
    P.append(num('X', o, 'x'), num('Y', o, 'y'));
    if (['block', 'backwall', 'platform', 'stairs', 'barricade'].includes(o.type) || (o.type === 'decor')) P.append(num('Width', o, 'w'), num('Height', o, 'h'));
    if (o.type === 'ladder' || o.type === 'door' || o.type === 'window') P.append(num('Height', o, 'h'));
    if (o.type === 'block' || o.type === 'platform' || o.type === 'stairs') P.append(sel('Material', o, 'mat', MAT_OPTIONS()));
    if (o.type === 'backwall') P.append(sel('Surface', o, 'mat', BW_OPTIONS()), rng('Darkness', o, 'dark', 0, 0.9, 0.05), col('Wainscot colour', o, 'wainscot'));
    if (o.type === 'stairs') P.append(sel('Direction', o, 'dir', [[1, 'Rises to the right'], [-1, 'Rises to the left']]), chk('Auto-climb ramp (no walking under)', o, 'solid'));
    if (o.type === 'door') P.append(chk('Metal', o, 'metal'), chk('Locked', o, 'locked'), chk('Starts open', o, 'open'));
    if (o.type === 'window') P.append(chk('Already broken', o, 'broken'), num('Boards (0-3)', o, 'boards'));
    if (o.type === 'barricade') P.append(num('Hit points', o, 'hp'));
    if (o.type === 'prop') P.append(sel('Kind', o, 'kind', Object.entries(PROP_DEFS).map(([k, d]) => [k, d.label])), rng('Rotation', o, 'rot', -3.14, 3.14, 0.05), chk('Flip', o, 'flip'));
    if (o.type === 'decor') {
      P.append(sel('Kind', o, 'kind', Object.entries(DECOR_KINDS).map(([k, d]) => [k, d.label])), rng('Rotation', o, 'rot', -3.14, 3.14, 0.05), chk('Flip', o, 'flip'), chk('Foreground layer', o, 'front'), rng('Opacity', o, 'alpha', 0, 1, 0.05));
      if (['sign', 'graffiti', 'poster', 'tape', 'arrow', 'door_bg'].includes(o.kind)) P.append(txt('Text', o, 'text'), col('Colour', o, 'color'), col('Background', o, 'bg'));
    }
    if (o.type === 'light') P.append(num('Radius', o, 'r'), col('Colour', o, 'color'), rng('Intensity', o, 'int', 0, 2, 0.05), sel('Behaviour', o, 'kind', [['bulb', 'Bulb'], ['fluoro', 'Fluorescent'], ['street', 'Street/flood'], ['emergency', 'Emergency pulse'], ['fire', 'Fire']]), rng('Flicker', o, 'flicker', 0, 1, 0.05), num('Light shaft length', o, 'shaft'), sel('Confine to room', o, 'clip', [['auto', 'Yes (auto)'], ['', 'No']]));
    if (o.type === 'fire') P.append(num('Light radius', o, 'r'), chk('Harmless (decorative)', o, 'harmless'));
    if (o.type === 'note') P.append(txt('Title', o, 'title'), txt('Text', o, 'text', true));
    if (o.type === 'spawn') P.append(sel('Kind', o, 'kind', [['edge', 'Infected spawn'], ['vent', 'Vent (crawlers)']]));
    if (o.type === 'zombie') P.append(sel('Type', o, 'kind', Object.entries(ZTYPES).map(([k, d]) => [k, d.name])));
    if (o.type === 'pickup') {
      P.append(sel('Kind', o, 'kind', [['ammo', 'Ammo'], ['medkit', 'Medkit'], ['armor', 'Armour'], ['planks', 'Planks'], ['grenade', 'Grenade'], ['weapon', 'Weapon'], ['cash', 'Cash']]));
      if (o.kind === 'ammo') P.append(sel('Ammo type', o, 'ammo', Object.entries(AMMO).filter(([k]) => k !== 'grenade').map(([k, a]) => [k, a.name])));
      if (o.kind === 'weapon') P.append(sel('Weapon', o, 'weapon', WEAPON_LIST.map((w) => [w.id, w.name])));
      P.append(num('Amount', o, 'amount'));
    }
    P.append(h('div', { class: 'row' }, this.btnS('Duplicate', () => { this.commit(); const c = Object.assign(deepClone(o), { x: o.x + 32 }); this.map.objects.push(c); this.sel = [c]; this.refreshProps(); }), this.btnS('Delete', () => { this.commit(); this.map.objects.splice(this.map.objects.indexOf(o), 1); this.sel = []; this.refreshProps(); }), this.btnS('To back', () => { this.commit(); const a = this.map.objects; a.splice(a.indexOf(o), 1); a.unshift(o); }), this.btnS('To front', () => { this.commit(); const a = this.map.objects; a.splice(a.indexOf(o), 1); a.push(o); })));
  }
}
