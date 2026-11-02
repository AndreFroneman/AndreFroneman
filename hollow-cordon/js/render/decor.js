'use strict';
// =====================================================================
//  Decor — environmental storytelling & set dressing painted into
//  cached sprites: windows, signs, graffiti, posters, pipes, lamps,
//  curtains, fences, bodies, tents, trees, cell bars and more.
// =====================================================================

const DECOR_KINDS = {
  window_bg: { label: 'Window (background)', w: 90, h: 110 },
  sign: { label: 'Sign', w: 160, h: 34, text: 'EMERGENCY' },
  graffiti: { label: 'Graffiti', w: 260, h: 60, text: 'THEY HEAR YOU', color: '#b0201a' },
  poster: { label: 'Poster', w: 54, h: 74, text: 'STAY INSIDE' },
  blood: { label: 'Blood smear', w: 120, h: 90 },
  handprints: { label: 'Bloody handprints', w: 90, h: 120 },
  pipe: { label: 'Pipe (horizontal)', w: 300, h: 16 },
  vpipe: { label: 'Pipe (vertical)', w: 16, h: 200 },
  vent: { label: 'Air vent', w: 56, h: 36 },
  fixture: { label: 'Ceiling light fixture', w: 90, h: 10 },
  bulb: { label: 'Hanging bulb', w: 12, h: 60 },
  lamp: { label: 'Street lamp', w: 60, h: 300 },
  curtain: { label: 'Hospital curtain', w: 140, h: 150 },
  iv: { label: 'IV stand', w: 26, h: 130 },
  clock: { label: 'Wall clock', w: 30, h: 30 },
  board: { label: 'Notice board', w: 110, h: 70 },
  tape: { label: 'Barrier tape', w: 220, h: 14, text: 'QUARANTINE — DO NOT CROSS' },
  bars: { label: 'Cell bars', w: 160, h: 150 },
  fence: { label: 'Chain-link fence', w: 200, h: 140 },
  wire: { label: 'Razor wire', w: 200, h: 26 },
  tree: { label: 'Dead tree', w: 140, h: 300 },
  corn: { label: 'Corn rows', w: 300, h: 130 },
  tent: { label: 'Military tent', w: 240, h: 140 },
  flag: { label: 'Tattered flag', w: 80, h: 160 },
  bodybag: { label: 'Body bag', w: 90, h: 22 },
  corpse_old: { label: 'Old remains', w: 90, h: 30 },
  chains: { label: 'Hanging chains', w: 30, h: 160 },
  shelf_bg: { label: 'Shelves (background)', w: 120, h: 160 },
  redcross: { label: 'Medical cross sign', w: 50, h: 50 },
  arrow: { label: 'Arrow sign', w: 110, h: 30, text: 'EXIT' },
  cables: { label: 'Hanging cables', w: 200, h: 60 },
  door_bg: { label: 'Background door', w: 60, h: 130 },
  rails: { label: 'Track rails', w: 400, h: 12 },
  pallet: { label: 'Pallets', w: 90, h: 30 },
  crack: { label: 'Wall crack', w: 80, h: 120 },
  radio: { label: 'Field radio', w: 40, h: 34 },
};

const Decor = (() => {
  const RES = 2;
  const cache = new Map();
  function bake(key, w, h, ax, ay, fn) {
    const pad = 4;
    const cv = makeCanvas((w + pad * 2) * RES, (h + pad * 2) * RES), c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(pad, pad); c.lineJoin = 'round'; c.lineCap = 'round';
    fn(c, makeRng(hashStr(key)));
    return { cv, w: w + pad * 2, h: h + pad * 2, ax: ax + pad, ay: ay + pad };
  }
  const font = (sz, w = 'bold') => `${w} ${sz}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  const painters = {
    window_bg(c, d, w, h, rng) {
      c.fillStyle = '#1c1814'; c.fillRect(-6, -6, w + 12, h + 12);
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0a1020'); g.addColorStop(1, '#202838');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(180,190,210,0.18)'; c.beginPath(); c.arc(w * 0.7, h * 0.25, 22, 0, TAU); c.fill();
      c.fillStyle = '#05070a'; for (let x = 0; x < w; x += rng.range(10, 24)) { const bh = rng.range(20, 60); c.fillRect(x, h - bh, rng.range(8, 20), bh); }
      c.strokeStyle = 'rgba(160,180,200,0.2)'; c.lineWidth = 0.6; for (let i = 0; i < 20; i++) { const x = rng() * w, y = rng() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y + 8); c.stroke(); }
      c.fillStyle = '#2a241e'; c.fillRect(w / 2 - 2, 0, 4, h); c.fillRect(0, h / 2 - 2, w, 4);
      c.strokeStyle = 'rgba(220,235,245,0.15)'; c.lineWidth = 1; c.beginPath(); c.moveTo(4, 4); c.lineTo(w / 2 - 6, h / 2 - 8); c.stroke();
      if (rng() < 0.6) { c.strokeStyle = 'rgba(200,220,230,0.4)'; c.lineWidth = 0.6; const cx = rng.range(10, w - 10), cy = rng.range(10, h - 10); for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + rng.range(-25, 25), cy + rng.range(-25, 25)); c.stroke(); } }
      c.fillStyle = '#2a241e'; c.fillRect(-10, h + 4, w + 20, 6);
    },
    sign(c, d, w, h) {
      c.fillStyle = d.bg || '#1a3a5a'; roundRect(c, 0, 0, w, h, 3); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.2; roundRect(c, 2, 2, w - 4, h - 4, 2); c.stroke();
      c.fillStyle = d.color || '#e8e4d8'; c.font = font(h * 0.55); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d.text || 'SIGN', w / 2, h / 2 + 1);
      c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 12; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 1);
    },
    graffiti(c, d, w, h, rng) {
      const col = d.color || '#b0201a';
      const sz = d.size || h * 0.62;
      c.font = font(sz, '900'); c.textBaseline = 'top';
      const text = d.text || 'THEY HEAR YOU';
      c.save(); c.transform(1, rng.range(-0.04, 0.04), rng.range(-0.15, 0.05), 1, 0, 0);
      c.fillStyle = rgba(col, 0.25); c.fillText(text, 1.5, 1.5);
      c.fillStyle = rgba(col, 0.85); c.fillText(text, 0, 0);
      const tw = Math.min(w, c.measureText(text).width);
      c.restore();
      c.fillStyle = rgba(col, 0.7);
      for (let i = 0; i < Math.ceil(tw / 18); i++) { const x = rng() * tw, len = rng.range(4, 22); c.fillRect(x, sz * 0.8, rng.range(0.8, 1.6), len); c.beginPath(); c.arc(x + 0.5, sz * 0.8 + len, 1.1, 0, TAU); c.fill(); }
      for (let i = 0; i < 40; i++) { c.fillStyle = rgba(col, rng() * 0.4); c.fillRect(rng() * tw, rng() * sz, 1, 1); }
    },
    poster(c, d, w, h, rng) {
      c.fillStyle = d.bg || '#c8c0a0'; c.fillRect(0, 0, w, h);
      c.fillStyle = d.color || '#7a1a14'; c.fillRect(0, 0, w, h * 0.22);
      c.fillStyle = '#f0e8d0'; c.font = font(h * 0.12); c.textAlign = 'center'; c.fillText('NOTICE', w / 2, h * 0.16);
      c.fillStyle = '#1a1a1a'; c.font = font(h * 0.1);
      const words = (d.text || 'STAY INSIDE').split(' ');
      words.forEach((wd, i) => c.fillText(wd, w / 2, h * (0.36 + i * 0.13)));
      c.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 4; i++) c.fillRect(w * 0.15, h * (0.72 + i * 0.05), w * 0.7, 1);
      c.fillStyle = 'rgba(60,40,20,0.3)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(rng() * w, rng() * h, rng() * 8, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(0,0,0,0.6)'; poly(c, [w, h, w - 14, h, w, h - 16]); c.fill();
    },
    blood(c, d, w, h, rng) {
      c.fillStyle = 'rgba(80,6,6,0.85)';
      for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(w / 2 + gauss() * w * 0.2, h * 0.35 + gauss() * h * 0.15, rng.range(1, 9), 0, TAU); c.fill(); }
      for (let i = 0; i < 8; i++) { const x = w / 2 + gauss() * w * 0.25, len = rng.range(10, h * 0.6); c.fillRect(x, h * 0.35, rng.range(1, 2.5), len); }
      c.strokeStyle = 'rgba(70,4,4,0.7)'; c.lineWidth = 7; c.beginPath(); c.moveTo(w * 0.1, h * 0.5); c.quadraticCurveTo(w * 0.5, h * 0.3, w * 0.95, h * 0.62); c.stroke();
    },
    handprints(c, d, w, h, rng) {
      c.fillStyle = 'rgba(90,6,6,0.8)';
      for (let k = 0; k < 4; k++) {
        const x = rng.range(10, w - 20), y = rng.range(10, h - 30);
        c.beginPath(); c.ellipse(x, y + 8, 6, 7, 0, 0, TAU); c.fill();
        for (let f = 0; f < 4; f++) { c.save(); c.translate(x - 5 + f * 3.5, y + 2); c.rotate(-0.2 + f * 0.12); c.fillRect(-1, -9, 2.4, 9); c.restore(); }
        c.fillRect(x - 1, y + 14, 2, rng.range(10, 40));
      }
    },
    pipe(c, d, w, h) {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5a6066'); g.addColorStop(0.4, '#7a8086'); g.addColorStop(1, '#2a2e32');
      c.fillStyle = g; c.fillRect(0, 2, w, h - 4);
      for (let x = 30; x < w; x += 90) { c.fillStyle = '#3a3e42'; c.fillRect(x, 0, 8, h); }
      c.fillStyle = 'rgba(110,50,20,0.4)'; c.fillRect(0, h - 5, w, 2);
    },
    vpipe(c, d, w, h) {
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#2a2e32'); g.addColorStop(0.5, '#7a8086'); g.addColorStop(1, '#2a2e32');
      c.fillStyle = g; c.fillRect(2, 0, w - 4, h);
      for (let y = 30; y < h; y += 90) { c.fillStyle = '#3a3e42'; c.fillRect(0, y, w, 8); }
    },
    vent(c, d, w, h) { c.fillStyle = '#4a4e52'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181a'; for (let y = 4; y < h - 3; y += 5) c.fillRect(4, y, w - 8, 3); c.strokeStyle = '#222'; c.strokeRect(0, 0, w, h); },
    fixture(c, d, w, h) { c.fillStyle = '#2a2c2e'; c.fillRect(0, 0, w, h); c.fillStyle = '#d8e0d8'; c.fillRect(3, h - 4, w - 6, 3); c.fillStyle = '#111'; c.fillRect(w * 0.2, -30, 1, 30); c.fillRect(w * 0.8, -30, 1, 30); },
    bulb(c, d, w, h) { c.fillStyle = '#111'; c.fillRect(w / 2 - 0.5, 0, 1, h - 10); c.fillStyle = '#3a3a3a'; c.fillRect(w / 2 - 3, h - 12, 6, 5); c.fillStyle = '#f0e0b0'; c.beginPath(); c.arc(w / 2, h - 4, 4, 0, TAU); c.fill(); },
    lamp(c, d, w, h) {
      c.fillStyle = '#1e2124'; c.fillRect(w / 2 - 3, 10, 6, h - 10); c.fillRect(w / 2 - 7, h - 14, 14, 14);
      c.fillRect(w / 2, 8, w / 2 - 2, 4); c.fillStyle = '#2a2e32'; poly(c, [w - 14, 6, w + 2, 6, w - 2, 16, w - 10, 16]); c.fill();
      c.fillStyle = '#e8e0b0'; c.fillRect(w - 10, 15, 8, 2);
    },
    curtain(c, d, w, h, rng) {
      c.fillStyle = '#6a6e70'; c.fillRect(0, 0, w, 3);
      for (let x = 0; x < w; x += 8) {
        const g = c.createLinearGradient(x, 0, x + 8, 0); g.addColorStop(0, '#7a9a9a'); g.addColorStop(0.5, '#a8c4c0'); g.addColorStop(1, '#6a8a88');
        c.fillStyle = g; c.fillRect(x, 3, 8, h - 3 - (rng() * 8));
      }
      c.fillStyle = 'rgba(90,10,10,0.7)'; for (let i = 0; i < 10; i++) { c.beginPath(); c.arc(rng() * w, h * rng.range(0.3, 0.9), rng.range(1, 5), 0, TAU); c.fill(); }
      c.fillRect(w * 0.6, h * 0.4, 2, h * 0.4);
    },
    iv(c, d, w, h) { c.fillStyle = '#9aa0a6'; c.fillRect(w / 2 - 1, 8, 2, h - 8); c.fillRect(2, h - 3, w - 4, 3); c.fillRect(w / 2 - 8, 6, 16, 2); c.fillStyle = 'rgba(200,220,210,0.7)'; roundRect(c, w / 2 + 2, 8, 8, 16, 2); c.fill(); c.strokeStyle = 'rgba(200,220,210,0.6)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(w / 2 + 6, 24); c.quadraticCurveTo(w, 60, w / 2 + 4, 90); c.stroke(); },
    clock(c, d, w) { c.fillStyle = '#e8e4d8'; c.beginPath(); c.arc(w / 2, w / 2, w / 2, 0, TAU); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 2; c.stroke(); c.lineWidth = 1.4; c.beginPath(); c.moveTo(w / 2, w / 2); c.lineTo(w / 2 + 6, w / 2 - 5); c.moveTo(w / 2, w / 2); c.lineTo(w / 2 - 1, w / 2 - 11); c.stroke(); c.strokeStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(5, 8); c.lineTo(w - 6, w - 10); c.stroke(); },
    board(c, d, w, h, rng) { c.fillStyle = '#5a4026'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a6a42'; c.fillRect(4, 4, w - 8, h - 8); for (let i = 0; i < 7; i++) { c.fillStyle = pick(['#e8e4d0', '#d8d0a0', '#c8d8e0']); c.save(); c.translate(rng.range(10, w - 25), rng.range(8, h - 25)); c.rotate(rng.range(-0.2, 0.2)); c.fillRect(0, 0, 18, 20); c.fillStyle = 'rgba(0,0,0,0.4)'; for (let k = 0; k < 4; k++) c.fillRect(2, 4 + k * 4, 13, 1); c.fillStyle = '#a01010'; c.fillRect(8, -1, 2, 2); c.restore(); } },
    tape(c, d, w, h) {
      c.save(); c.fillStyle = '#d8b820'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#111'; c.font = font(h * 0.7); c.textBaseline = 'middle';
      const t = (d.text || 'QUARANTINE — DO NOT CROSS') + '   ';
      let x = 2; while (x < w) { c.fillText(t, x, h / 2 + 1); x += c.measureText(t).width; }
      c.restore();
    },
    bars(c, d, w, h) { c.fillStyle = '#2a2e32'; c.fillRect(0, 0, w, 6); c.fillRect(0, h * 0.45, w, 4); for (let x = 4; x < w; x += 14) { const g = c.createLinearGradient(x, 0, x + 5, 0); g.addColorStop(0, '#1a1c1e'); g.addColorStop(0.5, '#6a7078'); g.addColorStop(1, '#1a1c1e'); c.fillStyle = g; c.fillRect(x, 0, 5, h); } },
    fence(c, d, w, h) { c.fillStyle = '#3a3e42'; for (let x = 0; x <= w; x += 100) c.fillRect(x, 0, 5, h); c.fillRect(0, 0, w, 3); c.strokeStyle = 'rgba(120,128,136,0.55)'; c.lineWidth = 0.7; for (let x = -h; x < w; x += 9) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.stroke(); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h, h); c.stroke(); } },
    wire(c, d, w, h) { c.strokeStyle = '#8a9096'; c.lineWidth = 0.8; for (let x = 0; x < w; x += 7) { c.beginPath(); c.ellipse(x, h / 2, 8, h / 2 - 1, 0.3, 0, TAU); c.stroke(); } c.fillStyle = '#c0c8d0'; for (let x = 3; x < w; x += 9) c.fillRect(x, h / 2 + ((x * 7) % 9) - 4, 2, 1); },
    tree(c, d, w, h, rng) {
      c.strokeStyle = '#0c0c0c'; c.lineCap = 'round';
      const branch = (x, y, a, len, wd, dpt) => { if (dpt > 6 || len < 4) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; c.lineWidth = wd; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); branch(x2, y2, a - rng.range(0.2, 0.6), len * rng.range(0.6, 0.8), wd * 0.65, dpt + 1); branch(x2, y2, a + rng.range(0.2, 0.6), len * rng.range(0.6, 0.8), wd * 0.65, dpt + 1); };
      branch(w / 2, h, -Math.PI / 2, h * 0.32, 12, 0);
    },
    corn(c, d, w, h, rng) { for (let x = 0; x < w; x += 5) { const sh = rng.range(h * 0.6, h); c.strokeStyle = shade('#3a3a20', rng.range(-0.3, 0.2)); c.lineWidth = 2; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + rng.range(-6, 6), h - sh * 0.5, x + rng.range(-10, 10), h - sh); c.stroke(); c.lineWidth = 1; for (let k = 0; k < 3; k++) { const yy = h - sh * rng.range(0.3, 0.9); c.beginPath(); c.moveTo(x, yy); c.quadraticCurveTo(x + 10, yy - 6, x + rng.range(10, 18), yy + 4); c.stroke(); } } },
    tent(c, d, w, h, rng) { c.fillStyle = Tex.get('canvas_mil') ? '#4b4f35' : '#4b4f35'; poly(c, [0, h, w * 0.12, h * 0.25, w * 0.5, 0, w * 0.88, h * 0.25, w, h]); c.fill(); c.fillStyle = 'rgba(0,0,0,0.3)'; poly(c, [w * 0.5, 0, w * 0.88, h * 0.25, w, h, w * 0.5, h]); c.fill(); c.fillStyle = '#1a1c14'; poly(c, [w * 0.4, h, w * 0.5, h * 0.4, w * 0.6, h]); c.fill(); c.fillStyle = '#e8e8e0'; c.fillRect(w * 0.2, h * 0.5, 20, 20); c.fillStyle = '#a01010'; c.fillRect(w * 0.2 + 8, h * 0.5 + 3, 4, 14); c.fillRect(w * 0.2 + 3, h * 0.5 + 8, 14, 4); },
    flag(c, d, w, h, rng) { c.fillStyle = '#2a2a2a'; c.fillRect(0, 0, 3, h); c.fillStyle = '#5a1a14'; c.beginPath(); c.moveTo(3, 4); for (let x = 3; x < w; x += 6) c.lineTo(x, 4 + Math.sin(x / 9) * 3); c.lineTo(w - rng.range(0, 10), 44); for (let x = w; x > 3; x -= 6) c.lineTo(x, 44 + Math.sin(x / 7) * 4 + rng.range(-3, 3)); c.fill(); c.fillStyle = '#c8b860'; c.fillRect(14, 16, 26, 4); c.fillRect(25, 10, 4, 18); },
    bodybag(c, d, w, h) { c.fillStyle = '#1a1c20'; roundRect(c, 0, 2, w, h - 2, h / 2); c.fill(); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(6, 5, w - 12, 2); c.fillStyle = '#8a8e92'; c.fillRect(8, h / 2, w - 16, 1); c.fillStyle = 'rgba(90,6,6,0.7)'; c.beginPath(); c.ellipse(w * 0.7, h, w * 0.25, 3, 0, 0, TAU); c.fill(); },
    corpse_old(c, d, w, h) { c.fillStyle = '#3a3428'; roundRect(c, 10, h - 14, w - 20, 12, 6); c.fill(); c.fillStyle = '#c8bca0'; c.beginPath(); c.arc(w - 12, h - 10, 7, 0, TAU); c.fill(); c.fillStyle = '#222'; c.fillRect(w - 13, h - 12, 3, 3); c.strokeStyle = '#c8bca0'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(w * 0.55, h - 6, 8 + i * 2, Math.PI * 1.1, Math.PI * 1.6); c.stroke(); } c.fillStyle = 'rgba(70,6,6,0.6)'; c.beginPath(); c.ellipse(w / 2, h, w * 0.5, 3, 0, 0, TAU); c.fill(); },
    chains(c, d, w, h) { c.strokeStyle = '#4a4e52'; c.lineWidth = 1.6; for (let y = 0; y < h; y += 6) { c.beginPath(); c.ellipse(w / 2 + Math.sin(y / 30) * 2, y, 2.4, 3.5, (y / 6) % 2 ? 0 : Math.PI / 2, 0, TAU); c.stroke(); } c.fillStyle = '#5a5e62'; c.beginPath(); c.arc(w / 2, h, 6, 0, Math.PI); c.fill(); },
    shelf_bg(c, d, w, h, rng) { c.fillStyle = '#2a2c2e'; c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h); for (let y = 10; y < h; y += h / 4) { c.fillStyle = '#3a3e42'; c.fillRect(0, y, w, 4); for (let x = 6; x < w - 10; x += rng.range(10, 20)) { const bh = rng.range(10, h / 4 - 8); c.fillStyle = pick(['#5a4a32', '#3a4a5a', '#6a2a2a', '#7a7a6a', '#2a3a2a']); c.fillRect(x, y - bh, rng.range(6, 12), bh); } } },
    redcross(c, d, w, h) { c.fillStyle = '#e8e4d8'; roundRect(c, 0, 0, w, h, 4); c.fill(); c.fillStyle = '#b01a14'; c.fillRect(w * 0.38, h * 0.15, w * 0.24, h * 0.7); c.fillRect(w * 0.15, h * 0.38, w * 0.7, h * 0.24); },
    arrow(c, d, w, h) { c.fillStyle = d.bg || '#1a5a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8f0e0'; c.font = font(h * 0.6); c.textBaseline = 'middle'; c.fillText(d.text || 'EXIT', 6, h / 2 + 1); poly(c, [w - 22, h * 0.25, w - 8, h / 2, w - 22, h * 0.75]); c.fill(); },
    cables(c, d, w, h, rng) { for (let i = 0; i < 5; i++) { c.strokeStyle = pick(['#111', '#2a2a1a', '#3a1a1a']); c.lineWidth = rng.range(1, 3); c.beginPath(); c.moveTo(0, rng() * 6); c.quadraticCurveTo(w / 2, h * rng.range(0.5, 1), w, rng() * 6); c.stroke(); } },
    door_bg(c, d, w, h) { c.fillStyle = '#1a1612'; c.fillRect(-4, -4, w + 8, h + 4); c.fillStyle = d.color || '#4a3a2a'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(6, 8, w - 12, h * 0.4); c.fillRect(6, h * 0.55, w - 12, h * 0.38); c.fillStyle = '#9a8a5a'; c.fillRect(w - 10, h * 0.5, 4, 3); if (d.text) { c.fillStyle = '#e8e4d8'; c.font = font(9); c.textAlign = 'center'; c.fillText(d.text, w / 2, 22); } },
    rails(c, d, w, h) { c.fillStyle = '#3a2a1a'; for (let x = 0; x < w; x += 20) c.fillRect(x, h * 0.4, 12, h * 0.6); c.fillStyle = '#7a7e82'; c.fillRect(0, 0, w, 4); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(0, 0, w, 1); },
    pallet(c, d, w, h) { for (let i = 0; i < 3; i++) { const y = h - (i + 1) * 10; c.fillStyle = '#6a5034'; c.fillRect(0, y, w, 3); c.fillRect(0, y + 7, w, 3); c.fillStyle = '#4a3420'; c.fillRect(4, y + 3, 8, 4); c.fillRect(w / 2 - 4, y + 3, 8, 4); c.fillRect(w - 12, y + 3, 8, 4); } },
    crack(c, d, w, h, rng) { c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.2; const br = (x, y, a, n) => { if (n <= 0) return; const l = rng.range(8, 24); const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); br(x2, y2, a + rng.range(-0.6, 0.6), n - 1); if (rng() < 0.3) br(x2, y2, a + rng.range(-1.2, 1.2), n - 2); }; br(w / 2, 0, Math.PI / 2, 8); },
    radio(c, d, w, h) { c.fillStyle = '#3a3e2a'; roundRect(c, 0, 4, w, h - 4, 2); c.fill(); c.fillStyle = '#1a1a14'; c.fillRect(4, 8, w * 0.5, h * 0.4); c.fillStyle = '#a8c040'; c.fillRect(6, 10, 6, 3); c.fillStyle = '#222'; c.fillRect(w - 8, -14, 2, 18); c.beginPath(); c.arc(w * 0.75, h * 0.5, 4, 0, TAU); c.fill(); },
  };
  // anchor: most decor anchors at top-left; floor items anchor bottom
  const BOTTOM = new Set(['lamp', 'iv', 'tree', 'corn', 'tent', 'flag', 'bodybag', 'corpse_old', 'fence', 'wire', 'shelf_bg', 'pallet', 'radio', 'door_bg', 'rails']);
  function sprite(d) {
    const def = DECOR_KINDS[d.kind];
    if (!def) return null;
    const w = d.w || def.w, h = d.h || def.h;
    const key = d.kind + '|' + w + '|' + h + '|' + (d.text || def.text || '') + '|' + (d.color || '') + '|' + (d.bg || '') + '|' + (d.seed || 0);
    let s = cache.get(key);
    if (!s) {
      const dd = Object.assign({}, def, d);
      s = bake(key, w, h, 0, BOTTOM.has(d.kind) ? h : 0, (c, rng) => painters[d.kind](c, dd, w, h, rng));
      cache.set(key, s);
    }
    return s;
  }
  return { sprite, painters, BOTTOM };
})();
