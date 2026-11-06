'use strict';
// =====================================================================
//  FX — particles (blood, mist, sparks, debris, smoke, fire, glass),
//  gibs (flesh, bone, brain, eyes, organs), intestine ropes, shell
//  casings, tracers, transient lights and blood-spurt emitters.
// =====================================================================

const P = { BLOOD: 0, MIST: 1, SPARK: 2, DEBRIS: 3, SMOKE: 4, FIRE: 5, DUST: 6, GLASS: 7, BILE: 8, EMBER: 9, WATER: 10 };

const GibArt = (() => {
  const RES = 2;
  const cache = {};
  function bake(key, w, h, fn) {
    const cv = makeCanvas(w * RES, h * RES), c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(w / 2, h / 2); c.lineJoin = 'round';
    fn(c, makeRng(hashStr(key)));
    return { cv, w, h };
  }
  function blob(c, rng, r, col, n = 9, jag = 0.35) {
    c.beginPath();
    for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = r * (1 - jag + rng() * jag * 1.6); k ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); }
    c.closePath(); c.fillStyle = col; c.fill();
  }
  const makers = {
    flesh: (i) => bake('flesh' + i, 14, 12, (c, rng) => {
      blob(c, rng, 5 + rng() * 1.5, '#5a0a0a'); blob(c, rng, 3.8, '#8a1a1a'); blob(c, rng, 2, '#b04040', 7, 0.5);
      c.fillStyle = 'rgba(255,220,200,0.35)'; c.beginPath(); c.arc(-1.5, -1.5, 0.9, 0, TAU); c.fill();
      if (rng() < 0.5) { c.fillStyle = '#ddd2bb'; c.fillRect(-1, 1, 4, 1.4); }
    }),
    skinflesh: (i) => bake('skinf' + i, 14, 12, (c, rng) => {
      blob(c, rng, 5.2, '#6a7a60'); c.fillStyle = '#6a0c0c'; c.beginPath(); c.ellipse(1, 1, 3.6, 2.6, 0, 0, TAU); c.fill();
      c.fillStyle = '#a02222'; c.beginPath(); c.ellipse(1.4, 1.2, 2, 1.4, 0, 0, TAU); c.fill();
    }),
    bone: (i) => bake('bone' + i, 16, 8, (c, rng) => {
      c.fillStyle = '#e0d6c0'; c.strokeStyle = '#5a4a3a'; c.lineWidth = 0.5;
      poly(c, [-6, -1.2, 4, -1.6, 6, -0.4, 5, 1.6, -5, 1.4, -6.5, 0.2]); c.fill(); c.stroke();
      c.fillStyle = '#8a2020'; c.beginPath(); c.arc(-6, 0, 1.5, 0, TAU); c.fill();
    }),
    rib: () => bake('rib', 18, 10, (c) => { c.strokeStyle = '#ddd2ba'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 6, 8, -2.6, -0.5); c.stroke(); c.strokeStyle = '#7a1a1a'; c.lineWidth = 1; c.beginPath(); c.arc(0, 6, 8, -2.7, -2.55); c.stroke(); }),
    brain: (i) => bake('brain' + i, 14, 12, (c, rng) => {
      blob(c, rng, 5, '#c4848a', 12, 0.2);
      c.strokeStyle = '#8a4a52'; c.lineWidth = 0.6;
      for (let k = 0; k < 6; k++) { c.beginPath(); const x = rng.range(-4, 3), y = rng.range(-3, 3); c.moveTo(x, y); c.bezierCurveTo(x + 1, y - 1.5, x + 2, y + 1.5, x + 3, y); c.stroke(); }
      c.fillStyle = 'rgba(120,0,0,0.5)'; c.beginPath(); c.arc(2, 2, 1.6, 0, TAU); c.fill();
    }),
    eye: () => bake('eye', 12, 8, (c) => {
      c.strokeStyle = '#7a1a1a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1, 0); c.quadraticCurveTo(-4, 1, -5.5, -1); c.stroke();
      c.fillStyle = '#e8e0d0'; c.beginPath(); c.arc(1, 0, 2.6, 0, TAU); c.fill();
      c.fillStyle = '#6a7a50'; c.beginPath(); c.arc(2.4, 0, 1.1, 0, TAU); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(2.8, 0, 0.5, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(160,20,20,0.6)'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(-1, -1); c.lineTo(0.5, -0.3); c.stroke();
    }),
    skull: (i) => bake('skull' + i, 16, 14, (c, rng) => {
      c.fillStyle = '#d8ccb4'; c.beginPath(); c.arc(0, 2, 6, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(rng.range(2, 4), 1); c.lineTo(-1, 3); c.lineTo(-5, 1.5); c.closePath(); c.fill();
      c.fillStyle = '#5a6a50'; c.beginPath(); c.arc(0, 2, 6.6, Math.PI * 1.1, Math.PI * 1.7); c.arc(0, 2, 5.4, Math.PI * 1.7, Math.PI * 1.1, true); c.fill();
      c.fillStyle = '#2a1a10'; c.beginPath(); c.arc(0, 2, 7, Math.PI * 1.2, Math.PI * 1.5); c.arc(0, 2, 6.4, Math.PI * 1.5, Math.PI * 1.2, true); c.fill();
      c.fillStyle = '#8a1414'; c.fillRect(-4, 1, 7, 1.6);
    }),
    organ: (i) => bake('organ' + i, 16, 14, (c, rng) => {
      blob(c, rng, 6, '#4a0810', 10, 0.2); blob(c, rng, 4.6, '#6e1420', 10, 0.2);
      c.fillStyle = 'rgba(255,190,190,0.3)'; c.beginPath(); c.ellipse(-1.5, -2, 2, 1, -0.4, 0, TAU); c.fill();
      c.strokeStyle = '#2a0408'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-3, 2); c.quadraticCurveTo(0, 0, 3, 3); c.stroke();
    }),
    tooth: () => bake('tooth', 6, 6, (c) => { c.fillStyle = '#e0d8b8'; c.fillRect(-1, -1.5, 2, 3); c.fillStyle = '#7a1a1a'; c.fillRect(-1, 1, 2, 0.6); }),
    wood: (i) => bake('wood' + i, 18, 8, (c, rng) => { c.fillStyle = rng() < 0.5 ? '#6a4a2a' : '#5a3e22'; poly(c, [-8, -1.5, 6, -2, 8.5, 0, 5, 2, -7, 1.6]); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.4; c.stroke(); c.beginPath(); c.moveTo(-6, 0); c.lineTo(5, -0.5); c.stroke(); }),
    plank: (i) => bake('plank' + i, 46, 10, (c, rng) => { c.fillStyle = '#6e4e2e'; poly(c, [-22, -3, 18, -3.5, 22, -1, 20, 3.2, -21, 3]); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.6; c.stroke(); c.fillStyle = '#222'; c.fillRect(-18, -1, 1.5, 1.5); c.fillRect(15, -1, 1.5, 1.5); }),
    glass: (i) => bake('glass' + i, 10, 10, (c, rng) => { c.fillStyle = 'rgba(170,200,210,0.55)'; poly(c, [rng.range(-4, -2), rng.range(-4, -1), rng.range(1, 4), rng.range(-4, -2), rng.range(1, 4), rng.range(1, 4)]); c.fill(); c.strokeStyle = 'rgba(230,250,255,0.8)'; c.lineWidth = 0.4; c.stroke(); }),
    concrete: (i) => bake('conc' + i, 10, 10, (c, rng) => blob(c, rng, 3, '#5a5a58', 6, 0.5)),
    metal: (i) => bake('metal' + i, 12, 8, (c, rng) => { c.fillStyle = '#4a4f55'; poly(c, [-4, -2, 4, -1.5, 5, 1.5, -3, 2]); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.4; c.stroke(); }),
    helmet: () => bake('helmet', 26, 22, (c) => { c.fillStyle = '#121418'; c.beginPath(); c.arc(0, 4, 11, Math.PI, 0); c.closePath(); c.fill(); c.fillStyle = 'rgba(90,110,120,0.4)'; c.fillRect(4, 0, 8, 8); c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 4, 9, Math.PI * 1.2, Math.PI * 1.6); c.stroke(); }),
    milhelmet: () => bake('milhelmet', 26, 20, (c) => { c.fillStyle = '#4a4c34'; c.beginPath(); c.arc(0, 4, 11, Math.PI, 0); c.lineTo(13, 5); c.lineTo(-13, 5); c.closePath(); c.fill(); c.strokeStyle = '#1a1a10'; c.lineWidth = 0.6; c.stroke(); }),
    pustule: (i) => bake('pus' + i, 12, 10, (c, rng) => { blob(c, rng, 4.5, '#6a7a2a', 9, 0.3); c.fillStyle = '#b8c050'; c.beginPath(); c.arc(-1, -1, 1.6, 0, TAU); c.fill(); }),
  };
  const counts = { flesh: 5, skinflesh: 3, bone: 3, brain: 3, skull: 3, organ: 3, wood: 3, plank: 3, glass: 4, concrete: 3, metal: 3, pustule: 2 };
  function get(kind, i) {
    const n = counts[kind] || 1;
    const idx = i === undefined ? (Math.random() * n) | 0 : i % n;
    const key = kind + idx;
    if (!cache[key]) cache[key] = makers[kind](idx);
    return cache[key];
  }
  return { get };
})();

class FX {
  constructor(game) {
    this.game = game;
    this.parts = [];
    this.gibs = [];
    this.ropes = [];
    this.shells = [];
    this.tracers = [];
    this.lights = [];
    this.emitters = [];
    this.flashes = [];   // muzzle flash sprites
    this.texts = [];
    this.tmp = [];
  }
  get world() { return this.game.world; }

  // ------------------------------------------------------------ particles
  add(type, x, y, vx, vy, life, size, col) {
    if (this.parts.length >= Settings.data.particleLimit) {
      if (type === P.MIST || type === P.DUST || type === P.SMOKE) return null;
      // recycle an old particle
      const i = (Math.random() * this.parts.length) | 0;
      this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop();
    }
    const p = { type, x, y, px: x, py: y, vx, vy, life, max: life, size, col, rot: Math.random() * TAU, vr: 0, wallT: -1, n: 0 };
    this.parts.push(p);
    return p;
  }
  blood(x, y, dirx, diry, amount, speed = 1, opts = {}) {
    const g = Settings.goreMul();
    if (g <= 0) return;
    const n = Math.ceil(amount * g);
    const indoor = this.world.isIndoor(x, y);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(diry, dirx) + gauss() * (opts.spread || 0.45);
      const sp = rand(80, 520) * speed;
      const p = this.add(P.BLOOD, x + rand(-2, 2), y + rand(-2, 2), Math.cos(a) * sp, Math.sin(a) * sp - rand(0, 120), rand(0.8, 2), rand(1.1, 2.6) * (opts.big || 1), opts.col);
      if (p && indoor && Math.random() < 0.35) p.wallT = rand(0.04, 0.22);
    }
    const m = Math.ceil(n * 0.6);
    for (let i = 0; i < m; i++) {
      const a = Math.atan2(diry, dirx) + gauss() * 0.6;
      const sp = rand(40, 220) * speed;
      const p = this.add(P.MIST, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.2, 0.5), rand(3, 7), opts.col);
      if (p && indoor && Math.random() < 0.25) p.wallT = rand(0.03, 0.12);
    }
  }
  bile(x, y, n) {
    for (let i = 0; i < n; i++) { const a = rand(-Math.PI, 0); const sp = rand(100, 500); this.add(P.BILE, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.8, 1.6), rand(1.5, 3.5)); }
    for (let i = 0; i < n / 2; i++) this.add(P.SMOKE, x + rand(-30, 30), y + rand(-30, 10), rand(-30, 30), rand(-40, -10), rand(1.5, 3), rand(18, 40), '#6a7a30');
  }
  sparks(x, y, nx, ny, n = 6, col) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + gauss() * 0.8, sp = rand(150, 700);
      this.add(P.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.1, 0.45), rand(0.8, 1.6), col);
    }
  }
  debris(x, y, nx, ny, mat, n = 5) {
    const col = mat === 'wood' ? '#6a4a2c' : mat === 'dirt' ? '#4a3a28' : mat === 'metal' ? '#555a60' : '#7a7a76';
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + gauss() * 0.7, sp = rand(80, 380);
      this.add(P.DEBRIS, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 1.4), rand(1, 2.6), col);
    }
    for (let i = 0; i < n * 0.8; i++) {
      const a = Math.atan2(ny, nx) + gauss() * 0.5, sp = rand(20, 120);
      this.add(P.DUST, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 1.1), rand(4, 10), mat === 'wood' ? '#7a6a50' : '#8a8a84');
    }
  }
  smoke(x, y, n, col = '#3a3a3a', size = 30, rise = 40) {
    for (let i = 0; i < n; i++) this.add(P.SMOKE, x + rand(-8, 8), y + rand(-8, 8), rand(-25, 25), -rand(rise * 0.4, rise), rand(1.5, 3.5), rand(size * 0.5, size), col);
  }
  fire(x, y, n, size = 14) {
    for (let i = 0; i < n; i++) this.add(P.FIRE, x + rand(-6, 6), y + rand(-4, 4), rand(-30, 30), -rand(40, 140), rand(0.25, 0.6), rand(size * 0.5, size));
  }
  glass(x, y, vx, n = 14) {
    for (let i = 0; i < n; i++) this.add(P.GLASS, x + rand(-4, 4), y + rand(-25, 25), vx * rand(0.3, 1.2) + rand(-80, 80), rand(-200, 60), rand(1.5, 3), rand(1, 2.5));
    for (let i = 0; i < n / 2; i++) this.gib('glass', x, y + rand(-20, 20), vx * rand(0.3, 1) + rand(-60, 60), rand(-150, 30), { life: 14 });
  }

  // ------------------------------------------------------------ gibs
  gib(kind, x, y, vx, vy, o = {}) {
    if (this.gibs.length >= Settings.data.gibLimit) {
      // drop the oldest resting gib
      let k = this.gibs.findIndex((g) => g.rest);
      if (k < 0) k = 0;
      this.gibs.splice(k, 1);
    }
    const spr = o.spr || GibArt.get(kind);
    const g = { kind, x, y, vx, vy, rot: rand(0, TAU), vr: rand(-14, 14), spr, r: o.r || Math.max(2, spr.h * 0.3), rest: false, restT: 0, life: o.life || 1e9, bleed: o.bleed === undefined ? (kind === 'flesh' || kind === 'brain' || kind === 'organ' || kind === 'skull' || kind === 'skinflesh' ? 1.2 : 0) : o.bleed, bounce: o.bounce || 0.3, scale: o.scale || 1, sound: o.sound || null, smearT: 0, alpha: 1 };
    this.gibs.push(g);
    return g;
  }
  rope(points, color = '#b06a72') {
    if (this.ropes.length > 24) this.ropes.shift();
    const r = { pts: points, col: color, seg: 5, rest: 0 };
    this.ropes.push(r);
    return r;
  }
  intestines(x, y, vx, vy, attach) {
    if (Settings.goreMul() <= 0) return null;
    const n = randi(10, 15), pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: x + i * 1.5, y: y + i * 0.5, px: x + i * 1.5 - vx * 0.016 * (1 - i / n), py: y + i * 0.5 - vy * 0.016 * (1 - i / n) });
    const r = this.rope(pts);
    r.attach = attach || null;
    return r;
  }

  // ------------------------------------------------------------ casings
  shell(x, y, face, type, vx0 = 0) {
    if (this.shells.length >= Settings.data.shellLimit) this.shells.shift();
    const sp = type === 'shotgun' ? rand(90, 160) : rand(110, 210);
    this.shells.push({ x, y, vx: -face * sp * rand(0.5, 1) + vx0, vy: -rand(150, 260), rot: rand(0, TAU), vr: rand(-30, 30), type, rest: false, b: 0 });
  }

  tracer(x0, y0, x1, y1, w = 1, col = null) { this.tracers.push({ x0, y0, x1, y1, life: 0.07, max: 0.07, w, col }); }
  light(x, y, r, col, int, life) { this.lights.push({ x, y, r, col, int, life, max: life }); }
  muzzle(x, y, ang, size) { this.flashes.push({ x, y, ang, size, life: 0.045, seed: Math.random() }); }
  emit(fn, rate, life, opts = {}) { this.emitters.push({ fn, rate, life, t: 0, acc: 0, opts }); }
  text(x, y, str, col = '#e8d9b0', size = 14) { this.texts.push({ x, y, str, col, size, life: 1.2, max: 1.2 }); }

  // ------------------------------------------------------------ update
  update(dt) {
    const w = this.world, gy = 1500;
    // particles
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.px = p.x; p.py = p.y;
      switch (p.type) {
        case P.BLOOD: case P.BILE: {
          p.vy += gy * dt; p.vx *= 1 - 0.4 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.wallT > 0) {
            p.wallT -= dt;
            if (p.wallT <= 0) {
              if (w.isIndoor(p.x, p.y) && !w.solidAt(p.x, p.y)) { if (p.type === P.BLOOD) Decal.wall(w, p.x, p.y, p.size * rand(0.8, 1.8), Math.atan2(p.vy, p.vx)); else Decal.bile(w, p.x, p.y, 6); }
              parts[i] = parts[parts.length - 1]; parts.pop(); continue;
            }
          }
          const b = w.solidAt(p.x, p.y, p.vy > 0) || this.game.solidPropAt(p.x, p.y);
          if (b && !(b.oneway && p.py > b.y + 2)) {
            if (p.type === P.BLOOD) {
              if (p.py <= b.y + 1) Decal.floor(w, p.x, b.y, p.size * rand(0.9, 1.8));
              else if (!b.isProp) Decal.wall(w, clamp(p.x, b.x, b.x + b.w), p.y, p.size * 0.7, Math.atan2(p.vy, p.vx));
            } else if (p.py <= b.y + 1) Decal.bile(w, p.x, b.y, 5);
            parts[i] = parts[parts.length - 1]; parts.pop(); continue;
          }
          break;
        }
        case P.MIST: {
          p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt; p.vy += 60 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 10;
          if (p.wallT > 0) { p.wallT -= dt; if (p.wallT <= 0) { if (w.isIndoor(p.x, p.y) && !w.solidAt(p.x, p.y)) Decal.wall(w, p.x, p.y, rand(0.8, 2), Math.atan2(p.vy, p.vx)); p.wallT = -1; } }
          break;
        }
        case P.SPARK: case P.DEBRIS: case P.GLASS: case P.EMBER: case P.WATER: {
          p.vy += (p.type === P.EMBER ? -50 : gy) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          const b = w.solidAt(p.x, p.y, p.vy > 0);
          if (b && !(b.oneway && p.py > b.y + 2)) {
            if (p.py <= b.y + 1) { p.y = b.y - 0.5; p.vy *= -0.35; p.vx *= 0.6; }
            else { p.x = p.px; p.vx *= -0.4; }
            if (p.type === P.WATER) p.life = 0;
          }
          break;
        }
        case P.SMOKE: case P.DUST: {
          p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 1.2 * dt; if (p.type === P.SMOKE) p.vy -= 12 * dt;
          p.x += p.vx * dt + Math.sin(p.life * 2 + p.rot) * 8 * dt; p.y += p.vy * dt; p.size += dt * (p.type === P.SMOKE ? 14 : 8);
          break;
        }
        case P.FIRE: {
          p.vy -= 60 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.size *= 1 - 1.2 * dt;
          if (Math.random() < 0.04) this.add(P.SMOKE, p.x, p.y, rand(-10, 10), -40, rand(1, 2), 18, '#2a2a2a');
          break;
        }
      }
    }
    // gibs
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      if (g.life < 1) g.alpha = Math.max(0, g.life);
      if (g.life <= 0) { this.gibs.splice(i, 1); continue; }
      if (g.rest) continue;
      g.vy += gy * dt; g.vx *= 1 - 0.3 * dt;
      const ox = g.x, oy = g.y;
      g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.vr * dt;
      if (g.bleed > 0) {
        g.bleed -= dt;
        if (Math.random() < 0.5 && Settings.goreMul() > 0) this.add(P.BLOOD, g.x, g.y, g.vx * 0.2 + rand(-30, 30), g.vy * 0.2, 0.8, rand(0.8, 1.5));
      }
      const foot = g.y + g.r;
      let b = w.solidAt(g.x, foot, g.vy > 0) || this.game.solidPropAt(g.x, foot);
      if (b && !(b.oneway && oy + g.r > b.y + 3)) {
        if (oy + g.r <= b.y + 3) {
          g.y = b.y - g.r;
          if (Math.abs(g.vy) > 120) {
            if (g.bleed > 0 || g.kind === 'flesh' || g.kind === 'organ' || g.kind === 'brain' || g.kind === 'limb') { Decal.floor(w, g.x, b.y, rand(2, 4)); if (g.vy > 300) Sfx.play('splat', { x: g.x, y: g.y, vol: 0.35 }); }
            if (g.sound && g.vy > 200) Sfx.play(g.sound, { x: g.x, y: g.y, vol: 0.4 });
          }
          if (Math.abs(g.vx) > 60 && g.bleed > 0) Decal.smear(w, ox, b.y + 0.5, g.x, b.y + 0.5, 2);
          g.vy *= -g.bounce; g.vx *= 0.6; g.vr *= 0.6;
          if (Math.abs(g.vy) < 40 && Math.abs(g.vx) < 15) { g.restT += dt; if (g.restT > 0.3) { g.rest = true; g.vx = g.vy = 0; } }
        } else { g.x = ox; g.vx *= -0.4; }
      }
      if (g.y > w.h + 200) this.gibs.splice(i, 1);
    }
    // ropes (verlet)
    for (const r of this.ropes) this.updateRope(r, dt);
    // shells
    for (const s of this.shells) {
      if (s.rest) continue;
      s.vy += gy * dt; const ox = s.x, oy = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      const b = w.solidAt(s.x, s.y + 1.2, s.vy > 0);
      if (b && !(b.oneway && oy > b.y + 2)) {
        if (oy <= b.y + 2) {
          s.y = b.y - 1.2;
          if (s.vy > 80 && s.b < 3) { Sfx.play(s.type === 'shotgun' ? 'brass_sg' : 'brass', { x: s.x, y: s.y, vol: 0.18 / (s.b + 1), rateVar: 0.15 }); }
          s.b++; s.vy *= -0.35; s.vx *= 0.55; s.vr *= 0.5;
          if (Math.abs(s.vy) < 30) { s.rest = true; s.rot = Math.round(s.rot / Math.PI) * Math.PI + rand(-0.2, 0.2); }
        } else { s.x = ox; s.vx *= -0.5; }
      }
      if (s.y > w.h + 100) s.rest = true;
    }
    // tracers, lights, flashes, texts
    for (let i = this.tracers.length - 1; i >= 0; i--) if ((this.tracers[i].life -= dt) <= 0) this.tracers.splice(i, 1);
    for (let i = this.lights.length - 1; i >= 0; i--) if ((this.lights[i].life -= dt) <= 0) this.lights.splice(i, 1);
    for (let i = this.flashes.length - 1; i >= 0; i--) if ((this.flashes[i].life -= dt) <= 0) this.flashes.splice(i, 1);
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.y -= 26 * dt; if ((t.life -= dt) <= 0) this.texts.splice(i, 1); }
    // emitters (blood spurts from stumps etc.)
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.life -= dt; e.t += dt;
      const src = e.fn();
      if (!src || e.life <= 0) { this.emitters.splice(i, 1); continue; }
      const pulse = 0.5 + 0.5 * Math.sin(e.t * 9);
      e.acc += e.rate * dt * pulse * Math.min(1, e.life);
      const g = Settings.goreMul();
      while (e.acc >= 1) {
        e.acc -= 1;
        if (g <= 0) continue;
        const a = src[2] + gauss() * 0.25, sp = rand(120, 330) * (e.opts.power || 1) * Math.min(1, e.life * 0.6 + 0.3);
        const p = this.add(P.BLOOD, src[0], src[1], Math.cos(a) * sp + (src[3] || 0), Math.sin(a) * sp + (src[4] || 0), rand(0.8, 1.6), rand(1.1, 2.1));
        if (p && Math.random() < 0.2) p.wallT = rand(0.05, 0.2);
      }
    }
  }
  updateRope(r, dt) {
    const pts = r.pts, w = this.world, g = 1500;
    let moving = 0;
    for (const p of pts) {
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + g * dt * dt;
      moving += Math.abs(vx) + Math.abs(vy);
    }
    if (r.attach) { const a = r.attach(); if (a) { pts[0].x = a[0]; pts[0].y = a[1]; } else r.attach = null; }
    for (let it = 0; it < 4; it++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1, diff = (d - r.seg) / d * 0.5;
        if (i === 0 && r.attach) { B.x -= dx * diff * 2; B.y -= dy * diff * 2; }
        else { A.x += dx * diff; A.y += dy * diff; B.x -= dx * diff; B.y -= dy * diff; }
      }
      for (const p of pts) {
        const b = w.solidAt(p.x, p.y + 2, true);
        if (b && p.py + 2 <= b.y + 4) { p.y = b.y - 2; p.px = p.x - (p.x - p.px) * 0.4; }
        else if (b && !b.oneway) { p.x = p.px; }
      }
    }
    if (moving < 0.5 && !r.attach) r.rest++;
  }

  // ------------------------------------------------------------ draw
  drawGibs(ctx) {
    const M = ctx.getTransform();
    for (const g of this.gibs) {
      ctx.globalAlpha = g.alpha;
      xform(ctx, M, g.x, g.y, g.rot, g.scale, g.scale);
      ctx.drawImage(g.spr.cv, -g.spr.w / 2, -g.spr.h / 2, g.spr.w, g.spr.h);
    }
    ctx.setTransform(M); ctx.globalAlpha = 1;
    for (const r of this.ropes) {
      const pts = r.pts;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); } ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y); };
      path(); ctx.strokeStyle = '#4a1218'; ctx.lineWidth = 5.4; ctx.stroke();
      path(); ctx.strokeStyle = r.col; ctx.lineWidth = 4; ctx.stroke();
      path(); ctx.strokeStyle = 'rgba(255,210,210,0.35)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#7a2a34';
      for (let i = 2; i < pts.length; i += 3) { ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 2.6, 0, TAU); ctx.fill(); }
    }
  }
  drawShells(ctx) {
    const M = ctx.getTransform();
    for (const s of this.shells) {
      ctx.save(); xform(ctx, M, s.x, s.y, s.rot);
      if (s.type === 'shotgun') { ctx.fillStyle = '#8a1a14'; ctx.fillRect(-3.5, -1.4, 5.5, 2.8); ctx.fillStyle = '#b08a3a'; ctx.fillRect(2, -1.5, 1.6, 3); }
      else if (s.type === 'pistol') { ctx.fillStyle = '#b08a3a'; ctx.fillRect(-1.6, -0.8, 3.2, 1.6); }
      else { ctx.fillStyle = '#a8843a'; ctx.fillRect(-2.6, -0.8, 5.2, 1.6); ctx.fillStyle = '#7a5a20'; ctx.fillRect(1.8, -0.6, 1, 1.2); }
      ctx.restore();
    }
  }
  drawParticles(ctx) {
    ctx.lineCap = 'round';
    // blood droplets batched into three stroke widths
    const widths = [1.3, 2.0, 2.8];
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      let any = false;
      for (const p of this.parts) {
        if (p.type !== P.BLOOD) continue;
        const b = p.size < 1.6 ? 0 : p.size < 2.3 ? 1 : 2;
        if (b !== k) continue;
        ctx.moveTo(p.px, p.py); ctx.lineTo(p.x + 0.01, p.y); any = true;
      }
      if (any) { ctx.strokeStyle = '#740a0a'; ctx.lineWidth = widths[k]; ctx.stroke(); }
    }
    ctx.beginPath();
    let bile = false;
    for (const p of this.parts) if (p.type === P.BILE) { ctx.moveTo(p.px, p.py); ctx.lineTo(p.x + 0.01, p.y); bile = true; }
    if (bile) { ctx.strokeStyle = '#7a9a2a'; ctx.lineWidth = 2.2; ctx.stroke(); }
    const mist = Lighting.radial('#6e0808');
    for (const p of this.parts) {
      const t = p.life / p.max;
      switch (p.type) {
        case P.MIST: ctx.globalAlpha = t * 0.5; ctx.drawImage(mist, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case P.DEBRIS: ctx.globalAlpha = Math.min(1, t * 2); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); break;
        case P.DUST: case P.SMOKE: {
          const a = (p.type === P.SMOKE ? 0.5 : 0.4) * t * (1 - t) * 2.4;
          if (a < 0.01) break;
          ctx.globalAlpha = a; const sz = p.size * 1.4;
          ctx.drawImage(Lighting.radial(p.col || '#444444'), p.x - sz, p.y - sz, sz * 2, sz * 2); break;
        }
        case P.GLASS: ctx.globalAlpha = 0.6 * t; ctx.fillStyle = '#c8e6f0'; ctx.fillRect(p.x, p.y, p.size, p.size * 0.6); break;
        case P.WATER: ctx.globalAlpha = 0.35; ctx.strokeStyle = '#96aabe'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = 1;
  }
  drawAdditive(ctx) {
    // sparks, fire, embers, muzzle flashes and tracers (drawn after lighting with 'lighter')
    ctx.lineCap = 'round';
    ctx.beginPath();
    let sp = false;
    for (const p of this.parts) if (p.type === P.SPARK) { ctx.moveTo(p.px - (p.x - p.px) * 1.5, p.py - (p.y - p.py) * 1.5); ctx.lineTo(p.x, p.y); sp = true; }
    if (sp) { ctx.strokeStyle = 'rgba(255,214,120,0.9)'; ctx.lineWidth = 1.3; ctx.stroke(); }
    const fire = FX.fireSprite();
    for (const p of this.parts) {
      const t = p.life / p.max;
      if (p.type === P.FIRE) { ctx.globalAlpha = Math.min(1, t * 1.1); ctx.drawImage(fire, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); }
      else if (p.type === P.EMBER) { ctx.globalAlpha = t; ctx.fillStyle = '#ff8c28'; ctx.fillRect(p.x, p.y, 1.5, 1.5); }
    }
    ctx.globalAlpha = 1;
    for (const tr of this.tracers) {
      const t = tr.life / tr.max;
      const g = ctx.createLinearGradient(tr.x0, tr.y0, tr.x1, tr.y1);
      g.addColorStop(0, 'rgba(255,220,150,0)'); g.addColorStop(0.7, `rgba(255,220,150,${0.35 * t})`); g.addColorStop(1, `rgba(255,245,210,${0.9 * t})`);
      ctx.strokeStyle = g; ctx.lineWidth = tr.w * 1.4;
      ctx.beginPath(); ctx.moveTo(tr.x0, tr.y0); ctx.lineTo(tr.x1, tr.y1); ctx.stroke();
    }
    for (const f of this.flashes) {
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
      const s = f.size * 14 * (0.8 + f.seed * 0.5);
      const g = ctx.createRadialGradient(s * 0.3, 0, 0, s * 0.3, 0, s);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,200,90,0.85)'); g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.18); ctx.lineTo(s * 0.5, -s * 0.42); ctx.lineTo(s * 0.6, -s * 0.12); ctx.lineTo(s * 1.25, 0); ctx.lineTo(s * 0.6, s * 0.12); ctx.lineTo(s * 0.5, s * 0.42); ctx.lineTo(0, s * 0.18);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
  drawTexts(ctx) {
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
      ctx.font = `bold ${t.size}px "Arial Narrow", Impact, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(t.str, t.x + 1, t.y + 1);
      ctx.fillStyle = t.col; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
  static fireSprite() {
    if (FX._fire) return FX._fire;
    const S = 64, cv = makeCanvas(S, S), c = cv.getContext('2d');
    const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,220,140,0.75)'); g.addColorStop(0.4, 'rgba(255,120,30,0.45)'); g.addColorStop(1, 'rgba(120,20,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    return (FX._fire = cv);
  }
  clearBlood() { this.world.decals.clear(); this.gibs.length = 0; this.ropes.length = 0; this.emitters.length = 0; this.parts.length = 0; this.shells.length = 0; }
}
