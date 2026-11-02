'use strict';
// =====================================================================
//  Props — interactive and physical world objects: doors, breakable
//  windows, barricades, movable crates/barrels, explosive tanks,
//  vehicles and furniture. Each prop owns an AABB (x,y = top-left).
// =====================================================================

const PropArt = (() => {
  const RES = 2;
  const cache = {};
  function bake(key, w, h, fn) {
    if (cache[key]) return cache[key];
    const pad = 6;
    const cv = makeCanvas((w + pad * 2) * RES, (h + pad * 2) * RES), c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(pad, pad); c.lineJoin = 'round';
    fn(c, w, h, makeRng(hashStr(key)));
    return (cache[key] = { cv, pad, w, h });
  }
  function shadeBox(c, x, y, w, h, col, r = 0) {
    c.beginPath(); if (r) roundRect(c, x, y, w, h, r); else c.rect(x, y, w, h);
    c.fillStyle = col; c.fill();
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 0.8; c.stroke();
  }
  function grime(c, rng, w, h, n = 40, a = 0.25) {
    for (let i = 0; i < n; i++) { c.fillStyle = `rgba(0,0,0,${rng() * a})`; c.fillRect(rng() * w, rng() * h, rng() * 3 + 0.5, rng() * 3 + 0.5); }
  }
  function wheel(c, x, y, r) {
    c.fillStyle = '#111'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.fillStyle = '#3a3c40'; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill();
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(x, y, r * 0.2, 0, TAU); c.fill();
  }
  const painters = {
    crate(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h, '#6a4a2a');
      c.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = h / 4; y < h; y += h / 4) c.fillRect(0, y, w, 1);
      c.strokeStyle = '#4a3218'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, w - 5, h - 5);
      c.beginPath(); c.moveTo(4, 4); c.lineTo(w - 4, h - 4); c.stroke();
      c.strokeStyle = 'rgba(255,230,190,0.12)'; c.lineWidth = 1; c.strokeRect(1, 1, w - 2, h - 2);
      c.fillStyle = 'rgba(20,20,20,0.6)'; c.font = 'bold 7px monospace'; c.fillText('FRAGILE', w * 0.22, h * 0.62);
      grime(c, rng, w, h, 50);
    },
    ammo_crate(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h, '#3e4430', 2);
      c.fillStyle = '#2a2e20'; c.fillRect(0, h * 0.25, w, 3); c.fillRect(0, h * 0.7, w, 3);
      c.fillStyle = '#c8b880'; c.font = 'bold 6px monospace'; c.fillText('7.62 CTG', 4, h * 0.55);
      c.fillStyle = '#1a1a14'; c.fillRect(w / 2 - 4, -2, 8, 3);
      grime(c, rng, w, h, 30);
    },
    barrel(c, w, h, rng) { painters._barrel(c, w, h, rng, '#4a4f3a', false); },
    barrel_red(c, w, h, rng) { painters._barrel(c, w, h, rng, '#8a1c14', true); },
    _barrel(c, w, h, rng, col, hazard) {
      c.beginPath(); roundRect(c, 0, 0, w, h, 3); c.fillStyle = col; c.fill();
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(0.35, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#111'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.4)'; for (const y of [h * 0.22, h * 0.5, h * 0.78]) c.fillRect(0, y - 1.5, w, 3);
      c.fillStyle = 'rgba(255,255,255,0.12)'; for (const y of [h * 0.22, h * 0.5, h * 0.78]) c.fillRect(0, y - 1.5, w, 0.8);
      if (hazard) {
        c.fillStyle = '#d8c030'; c.beginPath(); c.moveTo(w / 2, h * 0.28); c.lineTo(w / 2 + 7, h * 0.44); c.lineTo(w / 2 - 7, h * 0.44); c.closePath(); c.fill();
        c.fillStyle = '#111'; c.font = 'bold 8px sans-serif'; c.fillText('!', w / 2 - 1.5, h * 0.43);
        c.fillStyle = '#e8e0c0'; c.font = 'bold 5px monospace'; c.fillText('FLAMMABLE', w * 0.08, h * 0.64);
      }
      for (let i = 0; i < 8; i++) { const yy = rng() * h; const gg = c.createLinearGradient(0, yy, 0, yy + 12); gg.addColorStop(0, 'rgba(110,50,20,0.5)'); gg.addColorStop(1, 'rgba(110,50,20,0)'); c.fillStyle = gg; c.fillRect(rng() * w, yy, 2, 12); }
    },
    propane(c, w, h) {
      c.beginPath(); roundRect(c, 0, h * 0.15, w, h * 0.85, w / 2); c.fillStyle = '#b8b8b0'; c.fill();
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.4, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#222'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#5a5a58'; c.fillRect(w * 0.3, 0, w * 0.4, h * 0.18);
      c.fillStyle = '#a02018'; c.fillRect(w * 0.1, h * 0.5, w * 0.8, 4);
    },
    dumpster(c, w, h, rng) {
      shadeBox(c, 0, 6, w, h - 10, '#2f4a32', 2);
      c.fillStyle = '#1e3220'; c.fillRect(-2, 2, w + 4, 6);
      c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 8; x < w; x += 14) c.fillRect(x, 10, 3, h - 18);
      wheel(c, 10, h - 3, 4); wheel(c, w - 10, h - 3, 4);
      for (let i = 0; i < 10; i++) { const y = rng() * h; c.fillStyle = 'rgba(110,55,20,0.5)'; c.fillRect(rng() * w, y, 2, 10); }
      c.fillStyle = 'rgba(220,220,210,0.4)'; c.font = 'bold 7px sans-serif'; c.fillText('MARROW SANITATION', 8, h * 0.55);
    },
    car(c, w, h, rng, col = '#5a2a22', kind = 'sedan') {
      // body
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(2, h * 0.62); c.lineTo(4, h * 0.42); c.lineTo(w * 0.22, h * 0.36); c.lineTo(w * 0.34, h * 0.06); c.lineTo(w * 0.7, h * 0.06); c.lineTo(w * 0.82, h * 0.36); c.lineTo(w - 3, h * 0.42); c.lineTo(w - 1, h * 0.7); c.lineTo(w - 2, h * 0.84); c.lineTo(3, h * 0.84); c.closePath(); c.fill();
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.45, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#0a0a0a'; c.lineWidth = 1; c.stroke();
      // windows (broken)
      c.fillStyle = '#10161a';
      poly(c, [w * 0.25, h * 0.36, w * 0.36, h * 0.11, w * 0.5, h * 0.11, w * 0.5, h * 0.36]); c.fill();
      poly(c, [w * 0.53, h * 0.36, w * 0.53, h * 0.11, w * 0.68, h * 0.11, w * 0.78, h * 0.36]); c.fill();
      c.strokeStyle = 'rgba(180,200,210,0.35)'; c.lineWidth = 0.5;
      for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(w * rng.range(0.3, 0.7), h * 0.12); c.lineTo(w * rng.range(0.3, 0.7), h * 0.34); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(w * 0.505, h * 0.36, 1.5, h * 0.42); // door seam
      c.fillRect(w * 0.27, h * 0.36, 1.2, h * 0.42);
      c.fillStyle = '#c8c0a0'; c.fillRect(w - 6, h * 0.45, 4, 4); c.fillStyle = '#8a1a10'; c.fillRect(3, h * 0.46, 3, 4);
      c.fillStyle = '#18181a'; c.fillRect(0, h * 0.62, 8, 5); c.fillRect(w - 8, h * 0.62, 8, 5);
      wheel(c, w * 0.2, h * 0.84, h * 0.16); wheel(c, w * 0.8, h * 0.84, h * 0.16);
      if (kind === 'police') {
        c.fillStyle = '#e8e8e0'; c.fillRect(w * 0.27, h * 0.4, w * 0.48, h * 0.2); c.fillStyle = '#1a2235'; c.font = `bold ${h * 0.13}px sans-serif`; c.fillText('POLICE', w * 0.33, h * 0.55);
        c.fillStyle = '#222'; c.fillRect(w * 0.42, 0, w * 0.16, h * 0.07); c.fillStyle = '#a01010'; c.fillRect(w * 0.42, 0, w * 0.08, h * 0.06); c.fillStyle = '#1030a0'; c.fillRect(w * 0.5, 0, w * 0.08, h * 0.06);
      }
      for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(70,35,15,${rng() * 0.5})`; c.fillRect(rng() * w, h * 0.3 + rng() * h * 0.5, rng() * 6, rng() * 3); }
      for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(0,0,0,0.7)'; c.beginPath(); c.arc(rng() * w, h * 0.4 + rng() * h * 0.3, 1, 0, TAU); c.fill(); }
    },
    car_police(c, w, h, rng) { painters.car(c, w, h, rng, '#1a1e28', 'police'); },
    ambulance(c, w, h, rng) {
      shadeBox(c, w * 0.28, 0, w * 0.72, h * 0.82, '#d8d4c8', 2);
      c.fillStyle = '#d8d4c8'; poly(c, [2, h * 0.82, 2, h * 0.42, w * 0.08, h * 0.2, w * 0.3, h * 0.18, w * 0.3, h * 0.82]); c.fill(); c.strokeStyle = '#111'; c.stroke();
      c.fillStyle = '#10161a'; poly(c, [w * 0.1, h * 0.24, w * 0.26, h * 0.22, w * 0.26, h * 0.42, w * 0.05, h * 0.42]); c.fill();
      c.fillStyle = '#a81c14'; c.fillRect(w * 0.28, h * 0.48, w * 0.72, h * 0.08); c.fillRect(0, h * 0.5, w * 0.28, h * 0.06);
      c.fillStyle = '#a81c14'; c.fillRect(w * 0.6, h * 0.14, 6, 18); c.fillRect(w * 0.6 - 6, h * 0.14 + 6, 18, 6);
      c.fillStyle = 'rgba(0,0,0,0.65)'; c.font = `bold ${h * 0.1}px sans-serif`; c.fillText('ST. HALLORAN EMS', w * 0.33, h * 0.72);
      c.fillStyle = '#222'; c.fillRect(w * 0.3, -3, w * 0.18, 4); c.fillStyle = '#c01010'; c.fillRect(w * 0.3, -3, w * 0.09, 3); c.fillStyle = '#1040c0'; c.fillRect(w * 0.39, -3, w * 0.09, 3);
      wheel(c, w * 0.16, h * 0.84, h * 0.14); wheel(c, w * 0.8, h * 0.84, h * 0.14);
      for (let i = 0; i < 24; i++) { c.fillStyle = `rgba(80,10,10,${rng() * 0.5})`; c.beginPath(); c.arc(w * 0.3 + rng() * w * 0.7, rng() * h * 0.7, rng() * 3, 0, TAU); c.fill(); }
      grime(c, rng, w, h, 80, 0.2);
    },
    gurney(c, w, h) {
      c.fillStyle = '#8a8e92'; c.fillRect(0, h * 0.25, w, 3);
      c.fillStyle = '#b8b4a8'; roundRect(c, 2, h * 0.08, w - 4, h * 0.2, 3); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 0.6; c.stroke();
      c.fillStyle = 'rgba(110,10,10,0.6)'; c.beginPath(); c.ellipse(w * 0.55, h * 0.12, w * 0.15, 3, 0, 0, TAU); c.fill();
      c.strokeStyle = '#6a6e72'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(6, h * 0.3); c.lineTo(w - 8, h * 0.88); c.moveTo(w - 6, h * 0.3); c.lineTo(8, h * 0.88); c.stroke();
      wheel(c, 7, h - 3, 3); wheel(c, w - 7, h - 3, 3);
    },
    desk(c, w, h, rng) {
      shadeBox(c, 0, 0, w, 6, '#5a3c24'); shadeBox(c, 3, 6, w * 0.38, h - 6, '#4a3020'); c.fillStyle = '#6a4a2c'; c.fillRect(w - 6, 6, 4, h - 6);
      for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(5, 10 + i * (h - 10) / 3, w * 0.38 - 4, 1); c.fillStyle = '#a89060'; c.fillRect(w * 0.18, 13 + i * (h - 10) / 3, 5, 1.5); }
      c.fillStyle = '#d8d4c0'; c.fillRect(w * 0.5, -3, 12, 3); c.fillStyle = '#2a2a2a'; c.fillRect(w * 0.72, -12, 14, 12); c.fillStyle = '#1a3030'; c.fillRect(w * 0.73, -11, 12, 8);
    },
    locker(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h, '#4a5a62', 1);
      for (let x = 0; x < w; x += w / 2) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x, 0, 1, h); for (let y = 6; y < 22; y += 4) c.fillRect(x + 4, y, w / 2 - 8, 1.5); c.fillStyle = '#9aa'; c.fillRect(x + w / 2 - 5, h * 0.45, 2, 7); c.fillStyle = 'rgba(0,0,0,0.4)'; }
      grime(c, rng, w, h, 40);
    },
    sandbags(c, w, h, rng) {
      const rows = Math.max(2, Math.round(h / 11));
      for (let r = 0; r < rows; r++) {
        const y = h - (r + 1) * (h / rows), off = (r % 2) * 10;
        for (let x = -off; x < w; x += 20) {
          const bx = Math.max(0, x), bw = Math.min(20, w - bx);
          if (bw < 6) continue;
          c.beginPath(); roundRect(c, bx, y, bw, h / rows + 1, 5);
          c.fillStyle = shade('#8a7a58', rng.range(-0.2, 0.1)); c.fill();
          const g = c.createLinearGradient(0, y, 0, y + h / rows); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
          c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(30,25,15,0.8)'; c.lineWidth = 0.7; c.stroke();
        }
      }
    },
    jersey(c, w, h, rng) {
      c.fillStyle = '#7a7872'; poly(c, [0, h, w * 0.12, h * 0.55, w * 0.3, h * 0.05, w * 0.7, h * 0.05, w * 0.88, h * 0.55, w, h]); c.fill();
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = g; c.fill();
      c.strokeStyle = '#222'; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = 'rgba(200,170,40,0.7)'; for (let x = w * 0.32; x < w * 0.68; x += 12) c.fillRect(x, h * 0.2, 6, 3);
      grime(c, rng, w, h, 50);
    },
    hay(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h, '#a08840', 4);
      c.strokeStyle = 'rgba(80,60,20,0.6)'; c.lineWidth = 0.5;
      for (let i = 0; i < 60; i++) { const x = rng() * w, y = rng() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng.range(-6, 6), y + rng.range(-2, 2)); c.stroke(); }
      c.fillStyle = '#5a3a1a'; c.fillRect(w * 0.3, 0, 1.5, h); c.fillRect(w * 0.7, 0, 1.5, h);
    },
    vending(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h, '#7a1a1a', 2);
      c.fillStyle = '#101418'; c.fillRect(4, 6, w * 0.62, h * 0.66);
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) { c.fillStyle = pick(['#c8a030', '#3a6a9a', '#a03030', '#4a8a4a']); c.fillRect(7 + k * (w * 0.62 - 6) / 4, 10 + r * h * 0.12, 5, 7); }
      c.strokeStyle = 'rgba(200,220,230,0.4)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(8, 8); c.lineTo(w * 0.5, h * 0.6); c.moveTo(w * 0.3, 8); c.lineTo(w * 0.6, h * 0.4); c.stroke();
      c.fillStyle = '#d8d0b0'; c.font = 'bold 6px sans-serif'; c.fillText('FIZZ', w * 0.7, 14);
      c.fillStyle = '#222'; c.fillRect(w * 0.72, h * 0.3, 8, 14); c.fillRect(6, h * 0.78, w * 0.6, 8);
    },
    bed(c, w, h, rng) {
      c.fillStyle = '#7a7e82'; c.fillRect(0, h * 0.4, w, 4); c.fillRect(2, h * 0.4, 3, h * 0.6); c.fillRect(w - 5, h * 0.4, 3, h * 0.6); c.fillRect(w - 5, 0, 3, h * 0.5);
      c.fillStyle = '#c8c8bc'; roundRect(c, 3, h * 0.22, w - 9, h * 0.2, 3); c.fill(); c.strokeStyle = '#444'; c.lineWidth = 0.5; c.stroke();
      c.fillStyle = '#e4e2d8'; roundRect(c, w - 26, h * 0.12, 18, h * 0.14, 3); c.fill();
      c.fillStyle = 'rgba(110,8,8,0.7)'; c.beginPath(); c.ellipse(w * 0.4, h * 0.3, w * 0.18, 4, 0, 0, TAU); c.fill(); c.fillRect(w * 0.35, h * 0.3, 2, 18);
    },
    tires(c, w, h) { const n = Math.max(1, Math.round(h / 12)); for (let i = 0; i < n; i++) { const y = h - (i + 1) * h / n; c.fillStyle = '#151515'; roundRect(c, 0, y, w, h / n, 5); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 1; c.stroke(); c.fillStyle = '#2a2a2a'; c.fillRect(w * 0.3, y + 3, w * 0.4, h / n - 6); } },
    cabinet(c, w, h, rng) { shadeBox(c, 0, 0, w, h, '#6a6e66', 1); for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(2, i * h / 4 + 1, w - 4, 1); c.fillStyle = '#aaa'; c.fillRect(w / 2 - 4, i * h / 4 + h / 8, 8, 2); } grime(c, rng, w, h, 30); },
    chair(c, w, h) { c.strokeStyle = '#3a3a3e'; c.lineWidth = 2; c.beginPath(); c.moveTo(3, h); c.lineTo(5, h * 0.55); c.lineTo(w - 3, h * 0.55); c.lineTo(w - 3, h); c.moveTo(4, h * 0.55); c.lineTo(2, 0); c.stroke(); c.fillStyle = '#4a3a2a'; c.fillRect(2, h * 0.5, w - 3, 4); c.fillRect(0, 2, 5, h * 0.42); },
    generator(c, w, h, rng) { shadeBox(c, 0, 4, w, h - 8, '#a07a20', 2); c.fillStyle = '#222'; c.fillRect(4, 10, w * 0.5, h - 22); for (let y = 14; y < h - 14; y += 4) { c.fillStyle = '#444'; c.fillRect(6, y, w * 0.5 - 4, 1.5); } wheel(c, 8, h - 3, 4); wheel(c, w - 8, h - 3, 4); c.fillStyle = '#c01010'; c.fillRect(w * 0.7, 12, 6, 6); },
    tank_truck(c, w, h, rng) { painters.mil_truck(c, w, h, rng); },
    mil_truck(c, w, h, rng) {
      shadeBox(c, w * 0.3, h * 0.05, w * 0.7, h * 0.65, '#4a4c34', 2);
      c.fillStyle = '#3e402c'; for (let x = w * 0.3; x < w; x += 16) c.fillRect(x, h * 0.05, 2, h * 0.65);
      c.fillStyle = '#4a4c34'; poly(c, [w * 0.02, h * 0.8, w * 0.02, h * 0.38, w * 0.08, h * 0.2, w * 0.29, h * 0.2, w * 0.29, h * 0.8]); c.fill(); c.strokeStyle = '#111'; c.stroke();
      c.fillStyle = '#10161a'; c.fillRect(w * 0.1, h * 0.25, w * 0.15, h * 0.17);
      c.fillStyle = '#222'; c.fillRect(0, h * 0.7, w, h * 0.08);
      wheel(c, w * 0.14, h * 0.84, h * 0.16); wheel(c, w * 0.62, h * 0.84, h * 0.16); wheel(c, w * 0.84, h * 0.84, h * 0.16);
      c.fillStyle = '#e8e0c0'; c.font = `bold ${h * 0.08}px monospace`; c.fillText('CORDON-9', w * 0.55, h * 0.45);
      grime(c, rng, w, h, 60, 0.2);
    },
    hesco(c, w, h, rng) {
      c.fillStyle = '#8a7a58'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#4a4a40'; c.lineWidth = 1;
      for (let x = 0; x <= w; x += 8) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += 8) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(70,60,40,0.5)'; c.fillRect(0, 0, w, 4);
    },
    tractor(c, w, h, rng) {
      shadeBox(c, w * 0.05, h * 0.38, w * 0.62, h * 0.3, '#7a2a18', 3);
      c.fillStyle = '#2a2a2a'; c.fillRect(w * 0.5, h * 0.05, w * 0.3, 3); c.fillRect(w * 0.5, h * 0.05, 3, h * 0.35); c.fillRect(w * 0.78, h * 0.05, 3, h * 0.35);
      c.fillStyle = '#3a3a3a'; c.fillRect(w * 0.2, h * 0.12, 4, h * 0.28);
      wheel(c, w * 0.2, h * 0.8, h * 0.18); wheel(c, w * 0.72, h * 0.66, h * 0.32);
      grime(c, rng, w, h, 60, 0.25);
    },
    train(c, w, h, rng) {
      shadeBox(c, 0, 0, w, h * 0.86, '#5a5e60', 6);
      c.fillStyle = '#3a6a8a'; c.fillRect(0, h * 0.62, w, 6);
      for (let x = 18; x < w - 40; x += 46) { c.fillStyle = '#10161a'; c.fillRect(x, h * 0.18, 34, h * 0.3); c.strokeStyle = 'rgba(180,200,210,0.3)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + 4, h * 0.2); c.lineTo(x + 30, h * 0.44); c.stroke(); }
      c.fillStyle = '#2a2e30'; c.fillRect(w * 0.45, h * 0.15, 30, h * 0.6);
      c.fillStyle = '#e0e0d0'; c.font = `bold ${h * 0.07}px sans-serif`; c.fillText('LINE 4  ·  KESSLER  ↔  HARBOR', 20, h * 0.58);
      wheel(c, w * 0.12, h * 0.9, 8); wheel(c, w * 0.22, h * 0.9, 8); wheel(c, w * 0.78, h * 0.9, 8); wheel(c, w * 0.88, h * 0.9, 8);
      grime(c, rng, w, h, 120, 0.2);
      for (let i = 0; i < 10; i++) { c.fillStyle = 'rgba(90,10,10,0.5)'; c.beginPath(); c.arc(rng() * w, rng() * h * 0.6, rng() * 4, 0, TAU); c.fill(); }
    },
    forklift(c, w, h, rng) {
      shadeBox(c, w * 0.2, h * 0.45, w * 0.6, h * 0.35, '#c09020', 2);
      c.fillStyle = '#222'; c.fillRect(w * 0.3, h * 0.05, 3, h * 0.42); c.fillRect(w * 0.7, h * 0.05, 3, h * 0.42); c.fillRect(w * 0.3, h * 0.05, w * 0.42, 3);
      c.fillStyle = '#333'; c.fillRect(w * 0.06, 0, 4, h * 0.82); c.fillRect(0, h * 0.78, w * 0.24, 3);
      wheel(c, w * 0.32, h * 0.86, h * 0.13); wheel(c, w * 0.72, h * 0.86, h * 0.13);
    },
    bus(c, w, h, rng) {
      shadeBox(c, 0, 4, w, h * 0.82, '#8a7a2a', 6);
      c.fillStyle = '#6a5a1a'; c.fillRect(0, h * 0.62, w, 5);
      for (let x = 30; x < w - 50; x += 52) { c.fillStyle = '#0e1418'; c.fillRect(x, h * 0.16, 40, h * 0.3); c.strokeStyle = 'rgba(180,200,210,0.3)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + 4, h * 0.18); c.lineTo(x + 34, h * 0.42); c.stroke(); }
      c.fillStyle = '#0e1418'; c.fillRect(w - 34, h * 0.14, 26, h * 0.62); c.fillRect(8, h * 0.14, 16, h * 0.34);
      c.fillStyle = '#e0d8b0'; c.font = `bold ${h * 0.09}px sans-serif`; c.fillText('ROUTE 12 · KESSLER AVE', 40, h * 0.58);
      wheel(c, w * 0.15, h * 0.86, h * 0.13); wheel(c, w * 0.8, h * 0.86, h * 0.13);
      for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(60,30,10,${rng() * 0.5})`; c.fillRect(rng() * w, rng() * h * 0.8, rng() * 10, rng() * 4); }
      for (let i = 0; i < 12; i++) { c.fillStyle = 'rgba(90,10,10,0.6)'; c.beginPath(); c.arc(rng() * w, h * 0.3 + rng() * h * 0.4, rng() * 4, 0, TAU); c.fill(); }
    },
    container(c, w, h, rng) {
      const col = pick(['#6a2a1a', '#2a4a5a', '#4a5a2a', '#7a5a1a']);
      shadeBox(c, 0, 0, w, h, col, 1);
      for (let x = 6; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, 3, 3, h - 6); c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x + 3, 3, 1, h - 6); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4); c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
      c.fillStyle = 'rgba(230,220,200,0.7)'; c.font = `bold ${h * 0.13}px monospace`; c.fillText('VARGA LOG ' + (100 + (rng() * 899 | 0)), w * 0.1, h * 0.3);
      for (let i = 0; i < 16; i++) { const yy = rng() * h; const g = c.createLinearGradient(0, yy, 0, yy + 30); g.addColorStop(0, 'rgba(110,50,20,0.5)'); g.addColorStop(1, 'rgba(110,50,20,0)'); c.fillStyle = g; c.fillRect(rng() * w, yy, 3, 30); }
    },
    counter(c, w, h, rng) { shadeBox(c, 0, 0, w, 7, '#4a3a2a'); shadeBox(c, 2, 7, w - 4, h - 7, '#3a4a50'); c.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 10; x < w; x += 30) c.fillRect(x, 10, 2, h - 12); c.fillStyle = '#2a2a2a'; c.fillRect(w * 0.6, -14, 20, 14); c.fillStyle = '#4a8a5a'; c.fillRect(w * 0.62, -12, 8, 4); },
    workbench(c, w, h, rng) { shadeBox(c, 0, 0, w, 6, '#5a4a3a'); c.fillStyle = '#3a3a3a'; c.fillRect(4, 6, 4, h - 6); c.fillRect(w - 8, 6, 4, h - 6); c.fillRect(4, h * 0.65, w - 8, 3); c.fillStyle = '#7a7e82'; c.fillRect(w * 0.2, -6, 16, 6); c.fillStyle = '#a02018'; c.fillRect(w * 0.55, -8, 18, 8); },
    shelf(c, w, h, rng) {
      c.fillStyle = '#4a4e52'; c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
      for (let y = 4; y < h; y += h / 4) { c.fillStyle = '#5a5e62'; c.fillRect(0, y, w, 3); for (let x = 5; x < w - 8; x += rng.range(8, 16)) { c.fillStyle = pick(['#6a5a3a', '#3a4a5a', '#7a2a2a', '#8a8a7a']); const bh = rng.range(6, h / 4 - 4); c.fillRect(x, y - bh, rng.range(5, 10), bh); } }
    },
  };
  function get(kind, w, h) {
    const p = painters[kind] || painters.crate;
    return bake(kind + ':' + w + 'x' + h, w, h, p);
  }
  return { get, painters };
})();

// prop definitions: size, physics and damage behaviour
const PROP_DEFS = {
  crate: { label: 'Wooden crate', w: 54, h: 50, movable: true, mass: 3, hp: 140, mat: 'wood', res: 1.2, gib: 'plank' },
  crate_small: { label: 'Small crate', art: 'crate', w: 36, h: 34, movable: true, mass: 1.6, hp: 80, mat: 'wood', res: 1.2, gib: 'plank' },
  ammo_crate: { label: 'Ammo crate (cover)', w: 60, h: 34, movable: true, mass: 4, hp: 300, mat: 'wood', res: 2, gib: 'plank' },
  barrel: { label: 'Steel drum', w: 34, h: 52, movable: true, mass: 3, hp: 400, mat: 'metal', res: 2 },
  barrel_red: { label: 'Fuel drum (explosive)', w: 34, h: 52, movable: true, mass: 3, hp: 34, mat: 'metal', res: 1, explosive: { r: 200, dmg: 260 } },
  propane: { label: 'Propane tank (explosive)', w: 22, h: 40, movable: true, mass: 1.5, hp: 20, mat: 'metal', res: 1, explosive: { r: 150, dmg: 180 } },
  dumpster: { label: 'Dumpster', w: 120, h: 70, movable: true, mass: 14, hp: 2000, mat: 'metal', res: 8 },
  gurney: { label: 'Gurney', w: 82, h: 46, movable: true, mass: 2.4, hp: 300, mat: 'metal', res: 0.4, passable: true, vault: true },
  chair: { label: 'Chair', w: 22, h: 34, movable: true, mass: 0.7, hp: 40, mat: 'wood', res: 0.4, gib: 'wood' },
  desk: { label: 'Desk', w: 90, h: 44, movable: true, mass: 6, hp: 300, mat: 'wood', res: 1.5, gib: 'plank' },
  locker: { label: 'Locker', w: 40, h: 110, movable: true, mass: 5, hp: 600, mat: 'metal', res: 2, passable: true },
  cabinet: { label: 'Filing cabinet', w: 34, h: 70, movable: true, mass: 4, hp: 400, mat: 'metal', res: 3 },
  bed: { label: 'Hospital bed', w: 110, h: 56, movable: true, mass: 4, hp: 500, mat: 'metal', res: 0.4, passable: true },
  vending: { label: 'Vending machine', w: 50, h: 116, movable: false, hp: 900, mat: 'metal', res: 6, passable: true },
  sandbags: { label: 'Sandbag wall', w: 90, h: 46, movable: false, hp: 3000, mat: 'dirt', res: 12 },
  jersey: { label: 'Concrete barrier', w: 110, h: 50, movable: false, hp: 1e9, mat: 'concrete', res: 99 },
  hesco: { label: 'HESCO barrier', w: 70, h: 110, movable: false, hp: 1e9, mat: 'dirt', res: 99 },
  hay: { label: 'Hay bale', w: 70, h: 44, movable: true, mass: 3, hp: 250, mat: 'wood', res: 2.5 },
  tires: { label: 'Tyre stack', w: 44, h: 48, movable: true, mass: 2, hp: 600, mat: 'dirt', res: 3 },
  generator: { label: 'Generator', w: 70, h: 54, movable: true, mass: 6, hp: 600, mat: 'metal', res: 4 },
  counter: { label: 'Shop counter', w: 120, h: 50, movable: false, hp: 600, mat: 'wood', res: 1.6 },
  workbench: { label: 'Workbench', w: 100, h: 46, movable: true, mass: 6, hp: 500, mat: 'wood', res: 1.4 },
  container: { label: 'Shipping container', w: 260, h: 120, movable: false, hp: 1e9, mat: 'metal', res: 40 },
  bus: { label: 'Wrecked bus', w: 480, h: 130, movable: false, hp: 1e9, mat: 'metal', res: 40 },
  shelf: { label: 'Storage shelf', w: 80, h: 120, movable: false, hp: 400, mat: 'metal', res: 0.6, passable: true },
  car: { label: 'Wrecked sedan', w: 220, h: 84, movable: false, hp: 1e9, mat: 'metal', res: 30 },
  car_police: { label: 'Police cruiser', w: 230, h: 86, movable: false, hp: 1e9, mat: 'metal', res: 30, siren: true },
  ambulance: { label: 'Ambulance', w: 280, h: 120, movable: false, hp: 1e9, mat: 'metal', res: 30, siren: true },
  mil_truck: { label: 'Military truck', w: 300, h: 130, movable: false, hp: 1e9, mat: 'metal', res: 40 },
  tractor: { label: 'Tractor', w: 170, h: 110, movable: false, hp: 1e9, mat: 'metal', res: 30 },
  train: { label: 'Subway car', w: 520, h: 130, movable: false, hp: 1e9, mat: 'metal', res: 40 },
  forklift: { label: 'Forklift', w: 110, h: 110, movable: false, hp: 1e9, mat: 'metal', res: 20 },
};

class Prop {
  constructor(game, def, x, y, o = {}) {
    this.game = game;
    this.kind = o.kind;
    this.def = def;
    this.w = o.w || def.w; this.h = o.h || def.h;
    this.x = x; this.y = y;   // top-left
    this.vx = 0; this.vy = 0;
    this.hp = def.hp; this.maxHp = def.hp;
    this.mat = def.mat;
    this.isProp = true;
    this.solid = !def.passable;
    this.rot = o.rot || 0;
    this.grounded = false;
    this.sleep = false;
    this.dead = false;
    this.flip = o.flip ? -1 : 1;
    this.art = PropArt.get(def.art || o.kind, this.w, this.h);
    this.burnT = 0;
    this.leak = 0;
    this.id = o.id || uid();
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  blocksBullets() { return !this.dead && this.solid; }
  update(dt) {
    if (this.def.explosive && this.leak > 0) {
      this.leak -= dt;
      this.game.fx.fire(this.x + this.w * 0.5 + rand(-4, 4), this.y + this.h * 0.3, 1, 10);
      this.hp -= dt * 12;
      if (this.hp <= 0) this.destroy();
    }
    if (!this.def.movable || this.sleep) return;
    const w = this.game.world;
    this.vy += 1700 * dt;
    if (this.grounded) this.vx *= Math.max(0, 1 - 7 * dt);
    else this.vx *= 1 - 0.5 * dt;
    // horizontal
    this.x += this.vx * dt;
    const tmp = this.game.tmpBlocks;
    for (const b of w.query(this.x, this.y + 1, this.x + this.w, this.y + this.h - 1, tmp)) {
      if (b.oneway) continue;
      if (this.vx > 0) this.x = b.x - this.w; else if (this.vx < 0) this.x = b.x + b.w;
      this.vx = 0;
    }
    for (const o of this.game.props) {
      if (o === this || !o.solid || o.dead || o.isDoor || o.isWindow) continue;
      if (rectsOverlap(this.x, this.y + 1, this.w, this.h - 2, o.x, o.y, o.w, o.h)) {
        if (o.def && o.def.movable) { o.vx += this.vx * 0.3; o.sleep = false; }
        if (this.vx > 0) this.x = o.x - this.w; else if (this.vx < 0) this.x = o.x + o.w;
        this.vx *= -0.1;
      }
    }
    for (const o of this.game.props) {
      if (!(o.isDoor || o.isWindow) || !o.solid) continue;
      if (rectsOverlap(this.x, this.y + 1, this.w, this.h - 2, o.x, o.y, o.w, o.h)) { if (this.vx > 0) this.x = o.x - this.w; else this.x = o.x + o.w; this.vx = 0; }
    }
    // vertical
    const oy = this.y;
    this.y += this.vy * dt;
    this.grounded = false;
    for (const b of w.query(this.x + 1, this.y, this.x + this.w - 1, this.y + this.h, tmp)) {
      if (b.oneway && oy + this.h > b.y + 1) continue;
      if (this.vy > 0) { this.y = b.y - this.h; if (this.vy > 300) this.impactSound(); this.vy = 0; this.grounded = true; }
      else if (this.vy < 0 && !b.oneway) { this.y = b.y + b.h; this.vy = 0; }
    }
    for (const o of this.game.props) {
      if (o === this || !o.solid || o.dead) continue;
      if (rectsOverlap(this.x + 1, this.y, this.w - 2, this.h, o.x, o.y, o.w, o.h) && oy + this.h <= o.y + 2) {
        this.y = o.y - this.h; if (this.vy > 300) this.impactSound(); this.vy = 0; this.grounded = true;
      }
    }
    if (this.grounded && Math.abs(this.vx) < 2) { this.vx = 0; this.restT = (this.restT || 0) + dt; if (this.restT > 0.5) this.sleep = true; } else this.restT = 0;
    if (this.y > w.h + 200) this.dead = true;
  }
  impactSound() { Sfx.play(this.mat === 'metal' ? 'metal_bash' : 'bash', { x: this.cx, y: this.cy, vol: 0.35 }); }
  push(vx) { if (!this.def.movable) return 0; this.vx = vx / Math.max(1, this.def.mass * 0.6); this.sleep = false; return 1 / Math.max(1, this.def.mass * 0.5); }
  impulse(ix, iy) { if (!this.def.movable) return; this.vx += ix / this.def.mass; this.vy += iy / this.def.mass; this.sleep = false; }
  damage(dmg, x, y, type) {
    if (this.dead || this.hp > 1e8) return;
    this.hp -= dmg;
    if (this.def.explosive && this.hp > 0 && type === 'bullet' && this.leak <= 0 && chance(0.5)) this.leak = 6;
    if (this.hp <= 0) this.destroy();
  }
  destroy() {
    if (this.dead) return;
    this.dead = true; this.solid = false;
    const fx = this.game.fx;
    if (this.def.explosive) { Combat.explode(this.game, this.cx, this.cy, this.def.explosive.r, this.def.explosive.dmg, this); return; }
    if (this.mat === 'wood') {
      Sfx.play('wood_break', { x: this.cx, y: this.cy });
      for (let i = 0; i < 6; i++) fx.gib(this.def.gib || 'wood', this.cx + rand(-this.w / 3, this.w / 3), this.cy + rand(-this.h / 3, this.h / 3), rand(-200, 200), rand(-300, -60), { life: 25 });
      fx.debris(this.cx, this.cy, 0, -1, 'wood', 14);
    } else {
      Sfx.play('metal_bash', { x: this.cx, y: this.cy });
      for (let i = 0; i < 5; i++) fx.gib('metal', this.cx, this.cy, rand(-200, 200), rand(-300, -60), { life: 25 });
    }
  }
  draw(ctx, t) {
    if (this.dead) return;
    const a = this.art;
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    if (this.rot) ctx.rotate(this.rot);
    if (this.flip < 0) ctx.scale(-1, 1);
    ctx.drawImage(a.cv, -this.w / 2 - a.pad, -this.h / 2 - a.pad, this.w + a.pad * 2, this.h + a.pad * 2);
    if (this.hp < this.maxHp * 0.5 && this.maxHp < 1e8) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h); }
    ctx.restore();
  }
}

// ----------------------------------------------------------------- Door
class Door {
  constructor(game, x, y, o = {}) {
    this.game = game; this.isDoor = true; this.isProp = true;
    this.w = o.w || 14; this.h = o.h || 132;
    this.x = x; this.y = y;
    this.open = !!o.open; this.locked = !!o.locked;
    this.mat = o.metal ? 'metal' : 'wood';
    this.maxHp = o.metal ? 900 : 420; this.hp = this.maxHp;
    this.boards = 0; this.boardHp = 0;
    this.dead = false; this.anim = this.open ? 1 : 0; this.swing = 1;
    this.label = o.label || '';
    this.id = o.id || uid();
  }
  get solid() { return !this.dead && (!this.open || this.boards > 0); }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  blocksBullets() { return this.solid; }
  toggle(fromX) {
    if (this.dead || this.boards > 0) return;
    if (this.locked) { Sfx.play('dry', { x: this.cx, y: this.cy }); this.game.hud.toast('Locked'); return; }
    if (this.open) {
      // don't slam shut on someone standing in the frame
      for (const z of this.game.zombies) if (!z.dead && Math.abs(z.x - this.cx) < this.w / 2 + z.hw && z.y > this.y && z.y - z.h < this.y + this.h) return;
      const p = this.game.player; if (p && !p.dead && Math.abs(p.x - this.cx) < this.w / 2 + p.hw) return;
    }
    this.open = !this.open;
    this.swing = fromX < this.cx ? 1 : -1;
    Sfx.play(this.open ? 'door_open' : 'door_close', { x: this.cx, y: this.cy, vol: 0.8 });
    this.game.noise(this.cx, this.cy, 350);
  }
  update(dt) { this.anim = approach(this.anim, this.open ? 1 : 0, dt * 5); }
  damage(dmg, x, y, type) {
    if (this.dead) return;
    if (this.boards > 0) {
      this.boardHp -= dmg;
      if (this.boardHp <= 0) {
        this.boards--; this.boardHp = this.boards > 0 ? 160 : 0;
        Sfx.play('wood_break', { x: this.cx, y: this.cy, vol: 0.8 });
        this.game.fx.gib('plank', this.cx, this.y + this.h * 0.5, rand(-120, 120), -rand(60, 200), { life: 25 });
      }
      return;
    }
    if (this.open) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      Sfx.play(this.mat === 'metal' ? 'metal_bash' : 'wood_break', { x: this.cx, y: this.cy });
      for (let i = 0; i < 5; i++) this.game.fx.gib(this.mat === 'metal' ? 'metal' : 'plank', this.cx, this.y + rand(10, this.h - 10), rand(-160, 160), -rand(40, 240), { life: 25 });
      this.game.fx.debris(this.cx, this.cy, 0, -1, this.mat, 12);
    }
  }
  addBoard() { if (this.dead || this.boards >= 3) return false; this.open = false; this.boards++; this.boardHp = 160; return true; }
  draw(ctx) {
    const x = this.x, y = this.y, w = this.w, h = this.h;
    // frame
    ctx.fillStyle = '#1a1612'; ctx.fillRect(x - 3, y - 4, w + 6, 4);
    if (this.dead) { ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 2, y, 2, h); ctx.fillRect(x + w, y, 2, h); }
    else if (this.anim > 0.02 && this.boards === 0) {
      // swung open: perspective panel
      const pw = lerp(w, 46, this.anim) * this.swing;
      const x0 = this.swing > 0 ? x : x + w;
      ctx.fillStyle = this.mat === 'metal' ? '#3c4246' : '#5a3e26';
      poly(ctx, [x0, y, x0 + pw, y + 6 * this.anim, x0 + pw, y + h - 6 * this.anim, x0, y + h]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#8a7a50'; ctx.fillRect(x0 + pw * 0.8, y + h * 0.5, 2.5 * Math.sign(pw), 3);
    } else {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      const base = this.mat === 'metal' ? '#4a5258' : '#6a4a2c';
      g.addColorStop(0, shade(base, -0.3)); g.addColorStop(0.5, shade(base, 0.1)); g.addColorStop(1, shade(base, -0.4));
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#100c08'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 2, y + 10, w - 4, h * 0.35); ctx.fillRect(x + 2, y + h * 0.52, w - 4, h * 0.4);
      ctx.fillStyle = '#9a8a5a'; ctx.fillRect(x + w / 2 - 1.5, y + h * 0.5, 3, 5);
      const dmg = 1 - this.hp / this.maxHp;
      if (dmg > 0.3) { ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 2, y + h * 0.3); ctx.lineTo(x + w - 2, y + h * 0.45); ctx.lineTo(x + 3, y + h * 0.6); ctx.stroke(); }
      if (dmg > 0.65) { ctx.fillStyle = '#0a0806'; ctx.fillRect(x + 2, y + h * 0.4, w - 5, 14); }
    }
    drawBoards(ctx, this, x - 10, y + 16, w + 20, h - 30);
  }
}

// --------------------------------------------------------------- Window
class Win {
  constructor(game, x, y, o = {}) {
    this.game = game; this.isWindow = true; this.isProp = true;
    this.w = o.w || 16; this.h = o.h || 70;
    this.x = x; this.y = y;
    this.glass = o.broken ? 0 : 1; this.glassHp = 12;
    this.boards = o.boards || 0; this.boardHp = this.boards ? 140 : 0;
    this.dead = false; this.mat = 'glass';
    this.id = o.id || uid();
    this.cracks = [];
  }
  get solid() { return this.glass > 0 || this.boards > 0; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  blocksBullets() { return this.boards > 0; }
  update() {}
  shatter(vx = 0) {
    if (!this.glass) return;
    this.glass = 0;
    Sfx.play('glass', { x: this.cx, y: this.cy });
    this.game.fx.glass(this.cx, this.cy, vx, 16);
    this.game.noise(this.cx, this.cy, 600);
  }
  damage(dmg, x, y, type, dir = 0) {
    if (this.boards > 0) {
      this.boardHp -= dmg;
      if (this.boardHp <= 0) {
        this.boards--; this.boardHp = this.boards > 0 ? 140 : 0;
        Sfx.play('wood_break', { x: this.cx, y: this.cy, vol: 0.8 });
        this.game.fx.gib('plank', this.cx, this.cy, rand(-120, 120), -rand(60, 200), { life: 25 });
      }
      return;
    }
    if (this.glass) { this.glassHp -= dmg; if (this.cracks.length < 5) this.cracks.push([rand(0.2, 0.8), rand(0.1, 0.9)]); if (this.glassHp <= 0 || type !== 'bullet') this.shatter(dir * 200); }
  }
  addBoard() { if (this.boards >= 3) return false; this.boards++; this.boardHp = 140; return true; }
  draw(ctx) {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#16120e'; ctx.fillRect(x - 2, y - 3, w + 4, 3); ctx.fillRect(x - 2, y + h, w + 4, 3);
    if (this.glass) {
      ctx.fillStyle = 'rgba(120,150,165,0.28)'; ctx.fillRect(x + 3, y, w - 6, h);
      ctx.strokeStyle = 'rgba(220,240,250,0.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x + 5, y + 4); ctx.lineTo(x + w - 5, y + h * 0.3); ctx.stroke();
      for (const [u, v] of this.cracks) { ctx.beginPath(); const cx = x + w * u, cy = y + h * v; for (let k = 0; k < 5; k++) { ctx.moveTo(cx, cy); ctx.lineTo(cx + rand(-8, 8), cy + rand(-12, 12)); } ctx.stroke(); }
    } else {
      ctx.fillStyle = 'rgba(170,200,210,0.5)';
      poly(ctx, [x + 3, y, x + w - 3, y, x + w / 2, y + 9]); ctx.fill();
      poly(ctx, [x + 3, y + h, x + w - 3, y + h, x + w / 2 - 2, y + h - 7]); ctx.fill();
    }
    drawBoards(ctx, this, x - 12, y + 6, w + 24, h - 12);
  }
}
function drawBoards(ctx, o, x, y, w, h) {
  if (!o.boards) return;
  const spr = GibArt.get('plank', 0);
  for (let i = 0; i < o.boards; i++) {
    ctx.save();
    ctx.translate(x + w / 2, y + h * (0.2 + i * 0.3));
    ctx.rotate((i % 2 ? -1 : 1) * 1.35);
    ctx.drawImage(spr.cv, -h * 0.42, -5, h * 0.84, 10);
    ctx.restore();
  }
}

// ------------------------------------------------- Barricade (standalone)
class Barricade {
  constructor(game, x, y, o = {}) {
    this.game = game; this.isProp = true; this.isBarricade = true;
    this.w = o.w || 24; this.h = o.h || 100; this.x = x; this.y = y;
    this.maxHp = o.hp || 600; this.hp = o.hp0 === undefined ? this.maxHp : o.hp0;
    this.mat = 'wood'; this.dead = false;
    this.id = o.id || uid();
  }
  get solid() { return this.hp > 0; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  blocksBullets() { return false; }
  update() {}
  damage(dmg) {
    if (this.hp <= 0) return;
    const before = this.hp;
    this.hp -= dmg;
    if (Math.floor(before / 150) !== Math.floor(Math.max(0, this.hp) / 150)) {
      Sfx.play('wood_break', { x: this.cx, y: this.cy, vol: 0.7 });
      this.game.fx.gib('plank', this.cx, this.cy, rand(-150, 150), -rand(60, 220), { life: 25 });
    }
  }
  repair(amt) { if (this.hp >= this.maxHp) return false; this.hp = Math.min(this.maxHp, Math.max(0, this.hp) + amt); return true; }
  draw(ctx) {
    const n = Math.ceil(Math.max(0, this.hp) / this.maxHp * 5);
    const spr = GibArt.get('plank', 1);
    ctx.fillStyle = '#2a1e12'; ctx.fillRect(this.x + 2, this.y, 4, this.h); ctx.fillRect(this.x + this.w - 6, this.y, 4, this.h);
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.translate(this.cx, this.y + this.h * (0.12 + i * 0.19)); ctx.rotate(Math.PI / 2 + (i % 2 ? 0.25 : -0.25));
      ctx.drawImage(spr.cv, -this.w * 0.7, -6, this.w * 1.4, 12); ctx.restore();
    }
    if (n === 0) { ctx.fillStyle = 'rgba(60,40,20,0.6)'; ctx.fillRect(this.x, this.y + this.h - 6, this.w, 6); }
  }
}
