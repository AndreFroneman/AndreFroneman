'use strict';
// =====================================================================
//  Tex — procedural, seamlessly tiling surface textures
// =====================================================================

const Tex = (() => {
  const cache = {};
  const patCache = new Map();
  const S = 256;

  // draw a shape at wrapped offsets so the texture tiles seamlessly
  function wrap(fn, x, y, r) {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const X = x + ox, Y = y + oy;
      if (X + r < 0 || X - r > S || Y + r < 0 || Y - r > S) continue;
      fn(X, Y);
    }
  }
  function speckle(c, rng, n, colA, colB, size = 1) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = rng() < 0.5 ? colA : colB;
      c.globalAlpha = rng.range(0.1, 0.5);
      const s = size * rng.range(0.6, 1.6);
      c.fillRect(rng() * S, rng() * S, s, s);
    }
    c.globalAlpha = 1;
  }
  function blotches(c, rng, n, col, rmin, rmax, amin = 0.05, amax = 0.18) {
    for (let i = 0; i < n; i++) {
      const x = rng() * S, y = rng() * S, r = rng.range(rmin, rmax), a = rng.range(amin, amax);
      wrap((X, Y) => {
        const g = c.createRadialGradient(X, Y, 0, X, Y, r);
        g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.fillRect(X - r, Y - r, r * 2, r * 2);
      }, x, y, r);
    }
  }
  function cracks(c, rng, n, col, alpha = 0.5) {
    c.strokeStyle = rgba(col, alpha); c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = rng() * S, y = rng() * S, a = rng() * TAU;
      const len = rng.int(6, 18);
      const pts = [[x, y]];
      for (let k = 0; k < len; k++) { a += rng.range(-0.7, 0.7); x += Math.cos(a) * 4; y += Math.sin(a) * 4; pts.push([x, y]); }
      wrap((X, Y) => {
        const dx = X - pts[0][0], dy = Y - pts[0][1];
        c.lineWidth = rng.range(0.6, 1.4);
        c.beginPath(); c.moveTo(pts[0][0] + dx, pts[0][1] + dy);
        for (const p of pts) c.lineTo(p[0] + dx, p[1] + dy);
        c.stroke();
      }, pts[0][0], pts[0][1], 80);
    }
  }
  function base(col) { const cv = makeCanvas(S, S), c = cv.getContext('2d'); c.fillStyle = col; c.fillRect(0, 0, S, S); return [cv, c]; }

  const gens = {
    concrete(rng, col = '#57585b') {
      const [cv, c] = base(col);
      blotches(c, rng, 26, '#000000', 20, 70, 0.04, 0.16);
      blotches(c, rng, 14, '#ffffff', 15, 50, 0.02, 0.06);
      speckle(c, rng, 3500, '#000000', '#a0a0a0', 1);
      cracks(c, rng, 5, '#1a1a1a', 0.45);
      // form-work seams
      c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, 127, S, 2); c.fillRect(127, 0, 2, S);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, 129, S, 1);
      return cv;
    },
    concrete_dark(rng) { return gens.concrete(rng, '#2d2e31'); },
    brick(rng, col = '#6a3a2b') {
      const [cv, c] = base('#2f2a27');
      const bw = 32, bh = 16;
      for (let r = 0; r < S / bh; r++) {
        const off = (r % 2) * (bw / 2);
        for (let k = -1; k < S / bw + 1; k++) {
          const x = k * bw + off, y = r * bh;
          const v = rng.range(-0.22, 0.12);
          c.fillStyle = shade(col, v);
          c.fillRect(x + 1, y + 1, bw - 2, bh - 2);
          // per-brick texture
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 1, y + bh - 4, bw - 2, 3);
          c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + 1, y + 1, bw - 2, 2);
          if (rng() < 0.15) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + rng.range(2, bw - 10), y + rng.range(2, 8), rng.range(3, 8), rng.range(2, 5)); }
        }
      }
      speckle(c, rng, 3000, '#000000', '#c09080', 1);
      blotches(c, rng, 18, '#000000', 20, 60, 0.06, 0.2);
      return cv;
    },
    tile(rng, col = '#8ea596', grout = '#4f5b54') {
      const [cv, c] = base(grout);
      const t = 32;
      for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) {
        const v = rng.range(-0.1, 0.06);
        c.fillStyle = shade(col, v); c.fillRect(x + 1, y + 1, t - 2, t - 2);
        const g = c.createLinearGradient(x, y, x + t, y + t);
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.10)');
        c.fillStyle = g; c.fillRect(x + 1, y + 1, t - 2, t - 2);
        if (rng() < 0.06) { c.fillStyle = shade(grout, -0.3); c.fillRect(x + 1, y + 1, t - 2, t - 2); } // missing tile
        else if (rng() < 0.12) { c.strokeStyle = 'rgba(20,20,20,0.5)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x + rng() * t, y); c.lineTo(x + rng() * t, y + t); c.stroke(); }
      }
      blotches(c, rng, 22, '#2a2210', 15, 60, 0.05, 0.2);
      speckle(c, rng, 1600, '#000000', '#ffffff', 1);
      return cv;
    },
    tile_green(rng) { return gens.tile(rng, '#8ea596', '#4f5b54'); },
    tile_white(rng) { return gens.tile(rng, '#b6b4a8', '#626058'); },
    tile_blue(rng) { return gens.tile(rng, '#7f97a6', '#46525a'); },
    wood(rng, col = '#5a3f2c', vertical = true) {
      const [cv, c] = base(shade(col, -0.4));
      const pw = 32;
      for (let k = 0; k < S / pw; k++) {
        const x = k * pw, v = rng.range(-0.2, 0.15);
        c.fillStyle = shade(col, v); c.fillRect(x + 1, 0, pw - 2, S);
        c.strokeStyle = rgba(shade(col, -0.45), 0.5); c.lineWidth = 1;
        for (let g = 0; g < 7; g++) {
          const gx = x + 3 + rng() * (pw - 6), ph = rng() * TAU, amp = rng.range(0.5, 2.2);
          c.beginPath();
          for (let y = 0; y <= S; y += 8) { const xx = gx + Math.sin(y / S * TAU * 2 + ph) * amp; y === 0 ? c.moveTo(xx, y) : c.lineTo(xx, y); }
          c.stroke();
        }
        if (rng() < 0.5) { const ky = rng() * S; c.fillStyle = rgba(shade(col, -0.55), 0.7); c.beginPath(); c.ellipse(x + pw / 2, ky, 3, 6, 0, 0, TAU); c.fill(); }
        // nails
        for (const ny of [20, 148]) { c.fillStyle = '#1b1b1b'; c.fillRect(x + 5, ny, 2, 2); c.fillRect(x + pw - 7, ny, 2, 2); }
      }
      blotches(c, rng, 14, '#000000', 20, 60, 0.05, 0.2);
      if (!vertical) { const r = makeCanvas(S, S), rc = r.getContext('2d'); rc.translate(S, 0); rc.rotate(Math.PI / 2); rc.drawImage(cv, 0, 0); return r; }
      return cv;
    },
    wood_dark(rng) { return gens.wood(rng, '#3c2b1f'); },
    wood_floor(rng) { return gens.wood(rng, '#4e3a2a', false); },
    metal(rng, col = '#4a5157') {
      const [cv, c] = base(col);
      const p = 64;
      for (let y = 0; y < S; y += p) for (let x = 0; x < S; x += p) {
        c.fillStyle = shade(col, rng.range(-0.12, 0.08)); c.fillRect(x + 1, y + 1, p - 2, p - 2);
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x + 1, y + 1, p - 2, 1);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x, y + p - 1, p, 1); c.fillRect(x + p - 1, y, 1, p);
        for (const [rx, ry] of [[5, 5], [p - 6, 5], [5, p - 6], [p - 6, p - 6]]) {
          c.fillStyle = 'rgba(0,0,0,0.5)'; c.beginPath(); c.arc(x + rx + 0.6, y + ry + 0.6, 1.8, 0, TAU); c.fill();
          c.fillStyle = 'rgba(200,200,200,0.35)'; c.beginPath(); c.arc(x + rx, y + ry, 1.4, 0, TAU); c.fill();
        }
      }
      // rust streaks
      for (let i = 0; i < 16; i++) {
        const x = rng() * S, y = rng() * S, h = rng.range(20, 90);
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(110,50,20,0.45)'); g.addColorStop(1, 'rgba(110,50,20,0)');
        c.fillStyle = g; c.fillRect(x, y, rng.range(1, 4), h);
      }
      speckle(c, rng, 2000, '#000000', '#9aa4aa', 1);
      return cv;
    },
    corrugated(rng, col = '#596061') {
      const [cv, c] = base(col);
      for (let x = 0; x < S; x++) {
        const v = Math.sin(x / 16 * TAU);
        c.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.12})` : `rgba(0,0,0,${-v * 0.3})`;
        c.fillRect(x, 0, 1, S);
      }
      for (let i = 0; i < 22; i++) {
        const x = rng() * S, y = rng() * S, h = rng.range(30, 120);
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(120,55,22,0.55)'); g.addColorStop(1, 'rgba(120,55,22,0)');
        c.fillStyle = g; c.fillRect(x, y, rng.range(2, 8), h);
      }
      blotches(c, rng, 10, '#6a3410', 15, 40, 0.1, 0.3);
      speckle(c, rng, 2000, '#000000', '#bbbbbb', 1);
      return cv;
    },
    dirt(rng, col = '#3b3025') {
      const [cv, c] = base(col);
      blotches(c, rng, 40, '#000000', 10, 40, 0.05, 0.2);
      blotches(c, rng, 20, '#6a5a40', 10, 30, 0.05, 0.15);
      for (let i = 0; i < 160; i++) {
        const x = rng() * S, y = rng() * S, r = rng.range(1, 4);
        c.fillStyle = shade(col, rng.range(-0.3, 0.35)); c.beginPath(); c.ellipse(x, y, r, r * 0.7, rng() * 3, 0, TAU); c.fill();
      }
      speckle(c, rng, 4000, '#000000', '#8a7a60', 1);
      return cv;
    },
    asphalt(rng) {
      const [cv, c] = base('#2a2a2c');
      speckle(c, rng, 9000, '#000000', '#777777', 1);
      blotches(c, rng, 18, '#000000', 20, 70, 0.08, 0.25);
      cracks(c, rng, 6, '#0b0b0b', 0.7);
      return cv;
    },
    plaster(rng, col = '#8a8576') {
      const [cv, c] = base(col);
      blotches(c, rng, 30, '#3a3020', 20, 80, 0.04, 0.14);
      blotches(c, rng, 8, '#5a4a20', 30, 70, 0.08, 0.2); // water stains
      speckle(c, rng, 2500, '#000000', '#ffffff', 1);
      cracks(c, rng, 4, '#2a2a2a', 0.4);
      return cv;
    },
    plaster_blue(rng) { return gens.plaster(rng, '#6c7a80'); },
    wallpaper(rng) {
      const [cv, c] = base('#6a5c46');
      for (let x = 0; x < S; x += 32) { c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, 0, 12, S); c.fillStyle = 'rgba(255,240,200,0.05)'; c.fillRect(x + 14, 0, 2, S); }
      for (let y = 8; y < S; y += 32) for (let x = 6; x < S; x += 32) {
        c.fillStyle = 'rgba(90,40,30,0.35)';
        for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; c.beginPath(); c.ellipse(x + 10 + Math.cos(a) * 3, y + 8 + Math.sin(a) * 3, 2.5, 1.5, a, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(60,70,40,0.35)'; c.fillRect(x + 9, y + 11, 1.5, 7);
      }
      blotches(c, rng, 26, '#2a1a08', 20, 70, 0.06, 0.2);
      speckle(c, rng, 1500, '#000000', '#ffffff', 1);
      return cv;
    },
    rock(rng) {
      const [cv, c] = base('#3a3632');
      for (let i = 0; i < 70; i++) {
        const x = rng() * S, y = rng() * S, r = rng.range(8, 28);
        wrap((X, Y) => {
          c.fillStyle = shade('#3a3632', rng.range(-0.3, 0.2));
          c.beginPath();
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = r * rng.range(0.7, 1.1); k ? c.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr * 0.8) : c.moveTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr * 0.8); }
          c.closePath(); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.stroke();
        }, x, y, r + 2);
      }
      speckle(c, rng, 3000, '#000000', '#999999', 1);
      blotches(c, rng, 12, '#203020', 20, 60, 0.05, 0.15);
      return cv;
    },
    grate(rng) {
      const cv = makeCanvas(S, S), c = cv.getContext('2d');
      c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, S, S);
      c.strokeStyle = '#5a6066'; c.lineWidth = 3;
      for (let x = 0; x <= S; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
      for (let y = 0; y <= S; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1;
      for (let x = 0; x <= S; x += 16) { c.beginPath(); c.moveTo(x - 1, 0); c.lineTo(x - 1, S); c.stroke(); }
      return cv;
    },
    hazard(rng) {
      const [cv, c] = base('#1a1a1a');
      c.fillStyle = '#b8961f';
      for (let k = -S; k < S * 2; k += 32) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 16, 0); c.lineTo(k + 16 - S, S); c.lineTo(k - S, S); c.closePath(); c.fill(); }
      speckle(c, rng, 3000, '#000000', '#ffffff', 1);
      blotches(c, rng, 14, '#000000', 20, 50, 0.1, 0.3);
      return cv;
    },
    canvas_mil(rng) {
      const [cv, c] = base('#4b4f35');
      for (let y = 0; y < S; y += 2) { c.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.05})`; c.fillRect(0, y, S, 1); }
      blotches(c, rng, 20, '#2a2c1a', 20, 60, 0.1, 0.3);
      speckle(c, rng, 2000, '#000000', '#a0a080', 1);
      return cv;
    },
    grass(rng) { return gens.dirt(rng, '#2f3420'); },
    mud(rng) { return gens.dirt(rng, '#2b241c'); },
  };

  const MATERIALS = {
    // id: texture, cutaway darkening, physical material, bullet resistance per px, decal tint
    concrete: { tex: 'concrete_dark', dark: 0.45, phys: 'concrete', res: 99, label: 'Concrete' },
    concrete_light: { tex: 'concrete', dark: 0.25, phys: 'concrete', res: 99, label: 'Concrete (light)' },
    brick: { tex: 'brick', dark: 0.35, phys: 'concrete', res: 99, label: 'Brick' },
    tile: { tex: 'tile_green', dark: 0.25, phys: 'concrete', res: 99, label: 'Tile (green)' },
    tile_white: { tex: 'tile_white', dark: 0.25, phys: 'concrete', res: 99, label: 'Tile (white)' },
    wood: { tex: 'wood', dark: 0.3, phys: 'wood', res: 1.6, label: 'Wood' },
    wood_floor: { tex: 'wood_floor', dark: 0.3, phys: 'wood', res: 1.8, label: 'Wood floor' },
    metal: { tex: 'metal', dark: 0.3, phys: 'metal', res: 8, label: 'Steel' },
    corrugated: { tex: 'corrugated', dark: 0.3, phys: 'metal', res: 2.2, label: 'Corrugated metal' },
    dirt: { tex: 'dirt', dark: 0.25, phys: 'dirt', res: 99, label: 'Dirt' },
    grass: { tex: 'grass', dark: 0.2, phys: 'dirt', res: 99, label: 'Grass/earth' },
    asphalt: { tex: 'asphalt', dark: 0.15, phys: 'concrete', res: 99, label: 'Asphalt' },
    rock: { tex: 'rock', dark: 0.3, phys: 'concrete', res: 99, label: 'Rock' },
    plaster: { tex: 'plaster', dark: 0.3, phys: 'concrete', res: 4, label: 'Plaster/drywall' },
    grate: { tex: 'grate', dark: 0, phys: 'metal', res: 0.5, label: 'Metal grating' },
    hazard: { tex: 'hazard', dark: 0.2, phys: 'metal', res: 8, label: 'Hazard steel' },
  };
  const BACKWALLS = {
    tile: 'tile_green', tile_white: 'tile_white', tile_blue: 'tile_blue', brick: 'brick', concrete: 'concrete', plaster: 'plaster',
    plaster_blue: 'plaster_blue', wallpaper: 'wallpaper', wood: 'wood', wood_dark: 'wood_dark', metal: 'metal', corrugated: 'corrugated', rock: 'rock', canvas: 'canvas_mil',
  };

  function get(name) {
    if (!cache[name]) {
      const g = gens[name] || gens.concrete;
      cache[name] = g(makeRng(hashStr(name) + 7));
    }
    return cache[name];
  }
  function pattern(ctx, name) {
    let m = patCache.get(ctx);
    if (!m) { m = {}; patCache.set(ctx, m); }
    if (!m[name]) m[name] = ctx.createPattern(get(name), 'repeat');
    return m[name];
  }
  function warm() { for (const k of Object.keys(gens)) get(k); }
  return { get, pattern, warm, MATERIALS, BACKWALLS, names: () => Object.keys(gens) };
})();
