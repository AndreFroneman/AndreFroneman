'use strict';
// =====================================================================
//  Custom maps — persisted in localStorage, exportable as JSON files.
// =====================================================================

const Custom = {
  KEY: 'hc_custom_maps',
  list() {
    try { const o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); return Object.values(o).sort((a, b) => (b.saved || 0) - (a.saved || 0)); }
    catch (e) { return []; }
  },
  get(id) { return this.list().find((m) => m.id === id) || null; },
  save(map) {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { o = {}; }
    map.saved = Date.now();
    map.custom = true;
    o[map.id] = map;
    try { localStorage.setItem(this.KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  },
  remove(id) {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(this.KEY) || '{}'); } catch (e) { o = {}; }
    delete o[id];
    try { localStorage.setItem(this.KEY, JSON.stringify(o)); } catch (e) { /* ignore */ }
  },
  validate(m) {
    if (!m || typeof m !== 'object' || !Array.isArray(m.objects)) return 'Not a Hollow Cordon map (missing objects array).';
    if (!(m.width > 200) || !(m.height > 200)) return 'Map width/height missing or too small.';
    const types = new Set(['block', 'platform', 'stairs', 'ladder', 'backwall', 'decor', 'door', 'window', 'barricade', 'prop', 'light', 'note', 'spawn', 'player', 'zombie']);
    for (const o of m.objects) if (!o || !types.has(o.type) || typeof o.x !== 'number' || typeof o.y !== 'number') return 'Map contains an invalid object.';
    return null;
  },
  exportFile(map) {
    const blob = new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (map.name || 'map').replace(/[^a-z0-9_-]+/gi, '_') + '.hcmap.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },
};
