'use strict';
// =====================================================================
//  Scene — sky & parallax backdrops per theme, static geometry
//  (back walls, decor, blocks, ladders), fog, weather and post FX.
// =====================================================================

const THEMES = {
  hospital: { sky: ['#06080e', '#141c28', '#2a3038'], far: '#0d1118', mid: '#0a0d12', windows: '#c8b070', moon: true, fog: '#5a6470', weather: 'rain', bgKind: 'city' },
  streets: { sky: ['#07080c', '#1a1a24', '#3a2a26'], far: '#100f14', mid: '#0b0b0f', windows: '#d0a060', moon: false, fog: '#5a5054', weather: 'rain', bgKind: 'city', fires: true },
  police: { sky: ['#05070c', '#121826', '#262c38'], far: '#0c1018', mid: '#090c12', windows: '#a8b8d0', moon: true, fog: '#56606e', weather: 'none', bgKind: 'city' },
  factory: { sky: ['#0a0806', '#1e1610', '#3a2618'], far: '#120e0a', mid: '#0c0a08', windows: '#d08040', moon: false, fog: '#6a5a4a', weather: 'ash', bgKind: 'industrial' },
  farm: { sky: ['#0a0a12', '#1c2030', '#3a3a40'], far: '#0e1210', mid: '#0a0d0b', windows: '#d0a050', moon: true, fog: '#70787a', weather: 'none', bgKind: 'rural' },
  tunnels: { sky: ['#000000', '#030303', '#060606'], far: '#000', mid: '#000', windows: '#000', moon: false, fog: '#3a4040', weather: 'dust', bgKind: 'none' },
  bunker: { sky: ['#000000', '#020202', '#040404'], far: '#000', mid: '#000', windows: '#000', moon: false, fog: '#2a2e30', weather: 'dust', bgKind: 'none' },
  checkpoint: { sky: ['#06070a', '#161a1e', '#2c2a26'], far: '#0e100e', mid: '#0a0c0a', windows: '#c8c090', moon: false, fog: '#605a50', weather: 'ash', bgKind: 'military' },
};

const Scene = (() => {
  const layerCache = {};
  let fogTex = null, grainTex = null, vignette = null;
  const weather = [];

  function makeLayer(theme, kind, depth) {
    const key = theme + kind + depth;
    if (layerCache[key]) return layerCache[key];
    const T = THEMES[theme] || THEMES.streets;
    const W = 2048, H = 600;
    const cv = makeCanvas(W, H), c = cv.getContext('2d');
    const rng = makeRng(hashStr(key));
    const col = depth === 0 ? T.far : T.mid;
    if (T.bgKind === 'city' || T.bgKind === 'industrial') {
      let x = 0;
      while (x < W) {
        const bw = rng.range(60, 200) * (depth ? 1.3 : 1), bh = rng.range(120, 460) * (depth ? 0.75 : 1);
        c.fillStyle = shade(col, rng.range(-0.2, 0.2));
        if (T.bgKind === 'industrial' && rng() < 0.4) {
          // chimneys, tanks, gantries
          c.fillRect(x, H - bh * 0.5, bw, bh * 0.5);
          c.fillRect(x + bw * 0.3, H - bh * 1.1, bw * 0.16, bh * 0.7);
          c.beginPath(); c.arc(x + bw * 0.7, H - bh * 0.5, bw * 0.25, Math.PI, 0); c.fill();
        } else {
          c.fillRect(x, H - bh, bw, bh);
          if (rng() < 0.3) c.fillRect(x + bw * 0.4, H - bh - 30, 4, 30); // antenna
          if (rng() < 0.2) { c.beginPath(); c.moveTo(x, H - bh); c.lineTo(x + bw / 2, H - bh - 25); c.lineTo(x + bw, H - bh); c.fill(); }
          // windows
          for (let wy = H - bh + 14; wy < H - 10; wy += 18) for (let wx = x + 8; wx < x + bw - 8; wx += 14) {
            const r = rng();
            if (r < 0.06) { c.fillStyle = rgba(T.windows, rng.range(0.25, 0.7)); c.fillRect(wx, wy, 6, 9); }
            else if (r < 0.5) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(wx, wy, 6, 9); }
          }
        }
        x += bw + rng.range(-10, 20);
      }
      if (T.fires && depth === 0) for (let i = 0; i < 3; i++) {
        const fx = rng() * W, fy = H - rng.range(150, 350);
        const g = c.createRadialGradient(fx, fy, 0, fx, fy, 120);
        g.addColorStop(0, 'rgba(255,120,40,0.35)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        c.fillStyle = g; c.fillRect(fx - 120, fy - 120, 240, 240);
      }
    } else if (T.bgKind === 'rural') {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 16) c.lineTo(x, H - 120 - Math.sin(x / W * TAU * 2 + depth) * 50 - noise1(x / 90, depth) * 60 * (depth ? 0.6 : 1));
      c.lineTo(W, H); c.fill();
      // tree line
      for (let x = 0; x < W; x += rng.range(8, 24)) {
        const th = rng.range(40, 120) * (depth ? 1.4 : 0.8), base = H - 120 - Math.sin(x / W * TAU * 2 + depth) * 50 - noise1(x / 90, depth) * 60 * (depth ? 0.6 : 1) + 6;
        c.fillStyle = shade(col, rng.range(-0.3, 0.1));
        c.beginPath(); c.moveTo(x - th * 0.25, base); c.lineTo(x, base - th); c.lineTo(x + th * 0.25, base); c.fill();
      }
      if (depth) { c.fillStyle = col; for (let x = 100; x < W; x += 400) { c.fillRect(x, H - 260, 4, 200); c.fillRect(x - 20, H - 250, 44, 3); } c.strokeStyle = shade(col, 0.1); c.lineWidth = 1; for (let x = 100; x < W - 400; x += 400) { c.beginPath(); c.moveTo(x, H - 248); c.quadraticCurveTo(x + 200, H - 225, x + 400, H - 248); c.stroke(); } }
    } else if (T.bgKind === 'military') {
      c.fillStyle = col;
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 20) c.lineTo(x, H - 90 - noise1(x / 140, depth + 2) * 90);
      c.lineTo(W, H); c.fill();
      for (let x = 60; x < W; x += rng.range(250, 500)) { c.fillRect(x, H - 300, 6, 220); c.fillRect(x - 24, H - 320, 54, 30); c.fillRect(x + 20, H - 300, 6, 220); }
      c.strokeStyle = shade(col, 0.15); c.lineWidth = 1;
      for (let x = 0; x < W; x += 6) { c.beginPath(); c.moveTo(x, H - 60); c.lineTo(x + 6, H - 100); c.stroke(); }
    }
    return (layerCache[key] = cv);
  }

  function fogTexture() {
    if (fogTex) return fogTex;
    const W = 1024, H = 256, cv = makeCanvas(W, H), c = cv.getContext('2d');
    const rng = makeRng(99);
    for (let i = 0; i < 70; i++) {
      const x = rng() * W, y = rng.range(40, H - 40), r = rng.range(40, 130);
      for (const ox of [-W, 0, W]) {
        const g = c.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(x + ox - r, y - r, r * 2, r * 2);
      }
    }
    return (fogTex = cv);
  }
  function grain() {
    if (grainTex) return grainTex;
    const S = 256, cv = makeCanvas(S, S), c = cv.getContext('2d');
    const id = c.createImageData(S, S);
    for (let i = 0; i < S * S; i++) { const v = Math.random() * 255; id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
    c.putImageData(id, 0, 0);
    return (grainTex = cv);
  }

  // ------------------------------------------------------------ background
  function background(game, ctx, view) {
    const T = THEMES[game.theme] || THEMES.streets;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, T.sky[0]); g.addColorStop(0.55, T.sky[1]); g.addColorStop(1, T.sky[2]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    if (T.bgKind !== 'none') {
      if (T.moon) {
        const mx = cw * 0.72 - view.x * 0.02 * view.scale, my = ch * 0.18;
        const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 160 * view.scale);
        mg.addColorStop(0, 'rgba(200,210,230,0.35)'); mg.addColorStop(1, 'rgba(200,210,230,0)');
        ctx.fillStyle = mg; ctx.fillRect(mx - 200 * view.scale, my - 200 * view.scale, 400 * view.scale, 400 * view.scale);
        ctx.fillStyle = '#c8ccd4'; ctx.beginPath(); ctx.arc(mx, my, 22 * view.scale, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(120,130,140,0.4)'; ctx.beginPath(); ctx.arc(mx - 6 * view.scale, my - 4 * view.scale, 6 * view.scale, 0, TAU); ctx.fill();
      }
      // drifting cloud bands
      ctx.globalAlpha = 0.25;
      const ft = fogTexture();
      const cx = -((view.x * 0.05 + game.time * 6) % 1024) * view.scale * 1.5;
      for (let x = cx; x < cw; x += 1024 * view.scale * 1.5) ctx.drawImage(ft, x, ch * 0.05, 1024 * view.scale * 1.5, 200 * view.scale);
      ctx.globalAlpha = 1;
      const horizon = game.map.horizon || game.world.h - 300;
      for (let depth = 0; depth < 2; depth++) {
        const L = makeLayer(game.theme, T.bgKind, depth);
        const pf = depth ? 0.32 : 0.12;
        const s = view.scale * (depth ? 1.1 : 0.9);
        const w = L.width * s, h = L.height * s;
        const baseY = (horizon - view.y) * view.scale * (0.55 + pf) + (depth ? 30 : 60) * view.scale;
        let x = -((view.x * pf * view.scale) % w);
        if (x > 0) x -= w;
        for (; x < cw; x += w) ctx.drawImage(L, x, baseY - h, w, h);
        ctx.fillStyle = depth ? T.mid : T.far;
        if (baseY < ch) ctx.fillRect(0, baseY - 1, cw, ch - baseY + 1);
      }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ static
  function backwalls(game, ctx, view) {
    for (const w of game.world.backwalls) {
      if (w.x > view.x + view.w || w.x + w.w < view.x || w.y > view.y + view.h || w.y + w.h < view.y) continue;
      ctx.fillStyle = Tex.pattern(ctx, Tex.BACKWALLS[w.mat] || 'concrete');
      ctx.fillRect(w.x, w.y, w.w, w.h);
      // darken back plane & grime gradient toward the floor
      ctx.fillStyle = `rgba(0,0,0,${w.dark === undefined ? 0.35 : w.dark})`;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      const g = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
      g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.18, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(20,14,8,0.05)'); g.addColorStop(1, 'rgba(10,6,2,0.45)');
      ctx.fillStyle = g; ctx.fillRect(w.x, w.y, w.w, w.h);
      if (w.wainscot) { ctx.fillStyle = rgba(w.wainscot, 0.85); ctx.fillRect(w.x, w.y + w.h - 46, w.w, 46); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(w.x, w.y + w.h - 47, w.w, 2); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(w.x, w.y + w.h - 45, w.w, 1); }
    }
  }
  function blocks(game, ctx, view) {
    const tmp = game.tmpBlocks2 || (game.tmpBlocks2 = []);
    game.world.query(view.x - 10, view.y - 10, view.x + view.w + 10, view.y + view.h + 10, tmp);
    for (const b of tmp) {
      const m = b.mdef;
      if (b.stair) continue;
      if (b.oneway) {
        // platforms: thin slab with supports
        ctx.fillStyle = Tex.pattern(ctx, m.tex);
        ctx.fillRect(b.x, b.y, b.w, b.h);
        if (b.mat !== 'grate') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(b.x, b.y, b.w, b.h); }
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(b.x, b.y, b.w, 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x, b.y + b.h - 1.5, b.w, 1.5);
        continue;
      }
      ctx.fillStyle = Tex.pattern(ctx, m.tex);
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (m.dark) { ctx.fillStyle = `rgba(4,4,6,${m.dark})`; ctx.fillRect(b.x, b.y, b.w, b.h); }
      // bevel: lit top surface, dark underside
      const top = Math.min(6, b.h * 0.3);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(b.x, b.y, b.w, top);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(b.x, b.y, b.w, 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(b.x, b.y + b.h - 3, b.w, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(b.x, b.y, 1.5, b.h); ctx.fillRect(b.x + b.w - 1.5, b.y, 1.5, b.h);
    }
  }
  function stairs(game, ctx, view) {
    for (const s of game.world.stairs) {
      if (s.x > view.x + view.w || s.x + s.w < view.x) continue;
      const n = Math.max(2, Math.round(s.h / 14)), sh = s.h / n, sw = s.w / n;
      const x0 = s.dir > 0 ? s.x : s.x + s.w, x1 = s.dir > 0 ? s.x + s.w : s.x;
      // stringer
      ctx.fillStyle = '#26282a';
      poly(ctx, [x0, s.y, x1, s.y - s.h, x1, s.y - s.h + 26, x0 + (x1 - x0) * 0.1, s.y]); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      poly(ctx, [x0, s.y, x1, s.y - s.h + 20, x1, s.y - s.h + 26, x0 + (x1 - x0) * 0.1, s.y]); ctx.fill();
      // steps
      for (let i = 0; i < n; i++) {
        const sx = s.dir > 0 ? s.x + i * sw : s.x + s.w - (i + 1) * sw;
        const ty = s.y - (i + 1) * sh;
        ctx.fillStyle = Tex.pattern(ctx, 'concrete'); ctx.fillRect(sx, ty, sw + 0.6, sh);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx, ty, sw + 0.6, sh);
        ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(sx, ty, sw + 0.6, 1.5);
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(s.dir > 0 ? sx : sx + sw - 1, ty, 1.2, sh);
      }
      // hand rail
      ctx.strokeStyle = '#3e4246'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, s.y - 46); ctx.lineTo(x1, s.y - s.h - 46); ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 0; i <= n; i += 3) { const t = i / n; const px = lerp(x0, x1, t), py = lerp(s.y, s.y - s.h, t); ctx.beginPath(); ctx.moveTo(px, py - 46); ctx.lineTo(px, py); ctx.stroke(); }
    }
  }
  function ladders(game, ctx, view) {
    for (const L of game.world.ladders) {
      if (L.x > view.x + view.w || L.x + L.w < view.x) continue;
      ctx.fillStyle = '#3a3e42';
      ctx.fillRect(L.x, L.y - 10, 4, L.h + 10); ctx.fillRect(L.x + L.w - 4, L.y - 10, 4, L.h + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(L.x, L.y - 10, 1, L.h + 10); ctx.fillRect(L.x + L.w - 4, L.y - 10, 1, L.h + 10);
      for (let y = L.y; y < L.y + L.h; y += 16) { ctx.fillStyle = '#4a4e52'; ctx.fillRect(L.x + 2, y, L.w - 4, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(L.x + 2, y + 3, L.w - 4, 1); }
    }
  }
  function decor(game, ctx, view, layer) {
    for (const d of game.world.decor) {
      if ((d.front ? 1 : 0) !== layer) continue;
      const s = Decor.sprite(d);
      if (!s) continue;
      const w = s.w, h = s.h;
      if (d.x + w < view.x - 50 || d.x - w > view.x + view.w + 50 || d.y + h < view.y - 50 || d.y - h > view.y + view.h + 50) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.rot) ctx.rotate(d.rot);
      if (d.flip) ctx.scale(-1, 1);
      ctx.globalAlpha = d.alpha === undefined ? 1 : d.alpha;
      ctx.drawImage(s.cv, -s.ax, -s.ay, w, h);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ fog / weather
  let fogBuf = null;
  function fog(game, ctx, view) {
    if (!Settings.data.fog) return;
    const T = THEMES[game.theme] || THEMES.streets;
    const dens = game.map.fog === undefined ? 0.5 : game.map.fog;
    if (dens <= 0) return;
    const ft = fogTexture();
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    // composite all fog layers into a half-resolution buffer, then blit once
    const bw = Math.ceil(cw / 2), bh = Math.ceil(ch / 2);
    if (!fogBuf || fogBuf.width !== bw || fogBuf.height !== bh) fogBuf = makeCanvas(bw, bh);
    const fc = fogBuf.getContext('2d');
    fc.setTransform(1, 0, 0, 1, 0, 0); fc.globalAlpha = 1; fc.clearRect(0, 0, bw, bh);
    const fogCol = game.map.fogColor || T.fog;
    const key = '_fog' + fogCol;
    if (!Scene[key]) { const cv = makeCanvas(ft.width, ft.height), c = cv.getContext('2d'); c.drawImage(ft, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = fogCol; c.fillRect(0, 0, cv.width, cv.height); Scene[key] = cv; }
    const tex = Scene[key];
    const sc0 = view.scale / 2;
    for (let i = 0; i < 3; i++) {
      const pf = 0.4 + i * 0.35, sc = sc0 * (1.6 + i * 0.5);
      const w = tex.width * sc, h = tex.height * sc;
      const y = ((game.map.horizon || game.world.h - 300) - view.y) * sc0 - h * (0.75 - i * 0.12);
      let x = -(((view.x * pf + game.time * (8 + i * 6)) * sc0) % w);
      if (x > 0) x -= w;
      fc.globalAlpha = Math.min(1, dens * (0.35 + i * 0.12));
      for (; x < bw; x += w) fc.drawImage(tex, x, y, w, h);
    }
    fc.globalAlpha = Math.min(1, dens * 0.12); fc.fillStyle = fogCol; fc.fillRect(0, 0, bw, bh);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fogBuf, 0, 0, cw, ch);
    ctx.restore();
  }
  function weatherFx(game, ctx, view, dt) {
    const T = THEMES[game.theme] || THEMES.streets;
    const kind = game.map.weather || T.weather;
    if (!kind || kind === 'none') return;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const n = kind === 'rain' ? 260 : kind === 'ash' ? 120 : 70;
    while (weather.length < n) weather.push({ x: Math.random() * cw, y: Math.random() * ch, s: Math.random() });
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (kind === 'rain') {
      ctx.strokeStyle = 'rgba(160,180,200,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const p of weather) {
        p.y += (900 + p.s * 500) * dt * view.scale; p.x -= 160 * dt * view.scale;
        if (p.y > ch) { p.y -= ch + 20; p.x = Math.random() * cw * 1.2; }
        if (p.x < 0) p.x += cw;
        // skip drops inside buildings
        const [wx, wy] = [view.x + p.x / view.scale, view.y + p.y / view.scale];
        const len = 14 + p.s * 10;
        if (wy + len / view.scale > game.world.skyY(wx)) continue;
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 4, p.y + len);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = kind === 'ash' ? 'rgba(170,165,160,0.5)' : 'rgba(200,190,170,0.25)';
      for (const p of weather) {
        p.y += (kind === 'ash' ? 30 + p.s * 30 : 6) * dt * view.scale; p.x += Math.sin(game.time + p.s * 10) * 20 * dt;
        if (p.y > ch) { p.y = -5; p.x = Math.random() * cw; }
        const sz = (kind === 'ash' ? 1.5 + p.s * 2 : 1 + p.s) * view.scale;
        ctx.fillRect(p.x, p.y, sz, sz);
      }
    }
    ctx.restore();
  }
  function post(game, ctx, dmgFlash) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const p = game.player;
    const low = p && !p.dead ? clamp(1 - p.hp / 45, 0, 1) : 0;
    const red = Math.max(dmgFlash, low * (0.45 + 0.25 * Math.sin(game.time * 6)));
    if (red > 0.01) {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
      g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(120,0,0,${red * 0.8})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }
    if (Settings.data.filmGrain) {
      const gt = grain();
      ctx.globalAlpha = 0.035;
      const ox = -Math.random() * 256, oy = -Math.random() * 256;
      for (let x = ox; x < cw; x += 256) for (let y = oy; y < ch; y += 256) ctx.drawImage(gt, x, y);
    }
    ctx.restore();
  }
  // vignette, drawn into the light map so it costs no extra full-screen pass
  function vignetteInto(c, w, h) {
    if (!vignette || vignette.width !== w || vignette.height !== h) {
      vignette = makeCanvas(w, h);
      const v = vignette.getContext('2d');
      const g = v.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.75)');
      v.fillStyle = g; v.fillRect(0, 0, w, h);
    }
    c.drawImage(vignette, 0, 0);
  }
  return { background, backwalls, blocks, stairs, ladders, decor, fog, weather: weatherFx, post, vignetteInto };
})();
