'use strict';
// =====================================================================
//  Lighting — low-res light map (ambient + additive point lights with
//  flicker and room clipping, ray-cast flashlight cone), multiplied
//  over the scene; plus additive halos and volumetric light shafts.
// =====================================================================

const Lighting = (() => {
  let lm = null, lc = null;
  const sprCache = {};
  let cone = null;

  function radial(col) {
    if (sprCache[col]) return sprCache[col];
    const S = 128, cv = makeCanvas(S, S), c = cv.getContext('2d');
    const [r, g, b] = hexToRgb(col);
    const grd = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grd.addColorStop(0.25, `rgba(${r},${g},${b},0.6)`);
    grd.addColorStop(0.6, `rgba(${r},${g},${b},0.18)`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = grd; c.fillRect(0, 0, S, S);
    return (sprCache[col] = cv);
  }
  function coneSprite() {
    if (cone) return cone;
    const W = 256, H = 256, cv = makeCanvas(W, H), c = cv.getContext('2d');
    // fan of light pointing +x from (0, H/2)
    for (let i = 0; i < 40; i++) {
      const t = i / 39;
      const a = (t - 0.5) * 0.9;
      const k = Math.pow(1 - Math.abs(t - 0.5) * 2, 1.4);
      const g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, `rgba(255,245,220,${0.10 * k})`);
      g.addColorStop(0.5, `rgba(255,240,210,${0.06 * k})`);
      g.addColorStop(1, 'rgba(255,240,210,0)');
      c.strokeStyle = g; c.lineWidth = 9;
      c.beginPath(); c.moveTo(0, H / 2); c.lineTo(Math.cos(a) * W, H / 2 + Math.sin(a) * W); c.stroke();
    }
    return (cone = cv);
  }
  function flickerK(L, t) {
    if (!L.flicker) return 1;
    const f = L.flicker;
    const n = noise1(t * 7 + L.seed * 13, L.seed);
    if (L.kind === 'fluoro') {
      // mostly on, occasional bursts of blinking
      const burst = noise1(t * 0.6 + L.seed, L.seed + 3);
      if (burst > 1 - f * 0.55) return Math.sin(t * 60 + L.seed) > 0.2 ? 1 : 0.08;
      return 1;
    }
    if (L.kind === 'fire') return 0.75 + 0.35 * n + 0.1 * Math.sin(t * 23 + L.seed);
    if (L.kind === 'emergency') return 0.55 + 0.45 * Math.sin(t * 3 + L.seed);
    return 1 - f * 0.6 * (n > 0.6 ? (n - 0.6) * 2.5 : 0);
  }

  function ensure(w, h) {
    if (!lm || lm.width !== w || lm.height !== h) { lm = makeCanvas(w, h); lc = lm.getContext('2d'); }
  }

  // world->lightmap transform = view transform * q
  function render(game, ctx, view) {
    const q = Settings.data.lighting >= 2 ? 0.5 : 0.25;
    const W = Math.ceil(ctx.canvas.width * q), H = Math.ceil(ctx.canvas.height * q);
    ensure(W, H);
    const amb = game.ambient;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = amb.color;
    lc.fillRect(0, 0, W, H);
    lc.setTransform(view.scale * q, 0, 0, view.scale * q, -view.x * view.scale * q, -view.y * view.scale * q);
    lc.globalCompositeOperation = 'lighter';
    const t = game.time;
    const vx0 = view.x - 400, vy0 = view.y - 400, vx1 = view.x + view.w + 400, vy1 = view.y + view.h + 400;
    for (const L of game.lights) {
      if (!L.on || L.x + L.r < vx0 || L.x - L.r > vx1 || L.y + L.r < vy0 || L.y - L.r > vy1) continue;
      const k = flickerK(L, t) * L.int;
      L.cur = k;
      if (k <= 0.01) continue;
      lc.save();
      if (L.clip) { lc.beginPath(); lc.rect(L.clip.x, L.clip.y, L.clip.w, L.clip.h); lc.clip(); }
      lc.globalAlpha = Math.min(1, k);
      const spr = radial(L.color);
      lc.drawImage(spr, L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      if (k > 1) { lc.globalAlpha = Math.min(1, k - 1); lc.drawImage(spr, L.x - L.r * 0.6, L.y - L.r * 0.6, L.r * 1.2, L.r * 1.2); }
      if (L.shaft) {
        // downward cone lighting the floor (street lamps, flood lights)
        lc.globalAlpha = Math.min(1, k) * 0.5;
        const g = lc.createLinearGradient(0, L.y, 0, L.y + L.shaft);
        g.addColorStop(0, rgba(L.color, 0.9)); g.addColorStop(1, rgba(L.color, 0));
        lc.fillStyle = g;
        poly(lc, [L.x - 8, L.y, L.x + 8, L.y, L.x + L.shaft * 0.45, L.y + L.shaft, L.x - L.shaft * 0.45, L.y + L.shaft]); lc.fill();
      }
      lc.restore();
    }
    lc.globalAlpha = 1;
    for (const L of game.fx.lights) {
      const k = L.int * (L.life / L.max);
      lc.globalAlpha = Math.min(1, k);
      lc.drawImage(radial(L.col), L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    lc.globalAlpha = 1;
    // flashlight
    const p = game.player;
    if (p && !p.dead && p.flashlight) {
      const ox = p.x + p.body.j.head.x * p.face, oy = p.y + p.body.j.head.y + 4;
      let a = p.aimAng;
      const range = 760, half = 0.42, n = 34;
      const pts = [ox, oy];
      for (let i = 0; i <= n; i++) {
        const aa = a - half + (i / n) * half * 2;
        const dx = Math.cos(aa), dy = Math.sin(aa);
        const d = game.world.rayDist(ox, oy, dx, dy, range);
        pts.push(ox + dx * (d + 6), oy + dy * (d + 6));
      }
      lc.save();
      poly(lc, pts); lc.clip();
      lc.translate(ox, oy); lc.rotate(a);
      lc.globalAlpha = 1;
      lc.drawImage(coneSprite(), 0, -range / 2, range, range);
      lc.drawImage(coneSprite(), 0, -range * 0.3, range * 0.6, range * 0.6);
      lc.restore();
      // ambient spill around the survivor so they're always readable
      lc.globalAlpha = 0.5;
      lc.drawImage(radial('#a0a4b0'), p.x - 140, p.y - 200, 280, 280);
      lc.globalAlpha = 1;
    } else if (p && !p.dead) {
      lc.globalAlpha = 0.35; lc.drawImage(radial('#8890a0'), p.x - 120, p.y - 180, 240, 240); lc.globalAlpha = 1;
    }
    lc.globalCompositeOperation = 'source-over';
    lc.setTransform(1, 0, 0, 1, 0, 0);
    Scene.vignetteInto(lc, W, H);
    // composite
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lm, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  // additive halos / glows drawn in world space after multiply
  function glows(game, ctx, view) {
    const t = game.time;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of game.lights) {
      if (!L.on || L.cur === undefined || L.cur < 0.05) continue;
      if (L.x < view.x - 300 || L.x > view.x + view.w + 300 || L.y < view.y - 300 || L.y > view.y + view.h + 300) continue;
      const k = Math.min(1.2, L.cur);
      if (L.halo !== false) {
        ctx.globalAlpha = 0.35 * k;
        const hs = L.kind === 'fire' ? 90 : L.kind === 'fluoro' ? 70 : 54;
        ctx.drawImage(radial(L.color), L.x - hs, L.y - hs, hs * 2, hs * 2);
        ctx.globalAlpha = 0.8 * k;
        ctx.drawImage(radial('#ffffff'), L.x - 7, L.y - 7, 14, 14);
      }
      if (L.shaft && Settings.data.fog) {
        ctx.globalAlpha = 0.07 * k;
        const g = ctx.createLinearGradient(0, L.y, 0, L.y + L.shaft);
        g.addColorStop(0, L.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        poly(ctx, [L.x - 6, L.y, L.x + 6, L.y, L.x + L.shaft * 0.45, L.y + L.shaft, L.x - L.shaft * 0.45, L.y + L.shaft]); ctx.fill();
      }
    }
    // flashlight beam haze
    const p = game.player;
    if (p && !p.dead && p.flashlight && Settings.data.fog) {
      const ox = p.x + p.body.j.head.x * p.face, oy = p.y + p.body.j.head.y + 4;
      ctx.globalAlpha = 0.05;
      ctx.translate(ox, oy); ctx.rotate(p.aimAng);
      ctx.drawImage(coneSprite(), 0, -230, 460, 460);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.restore();
  }

  // approximate brightness at a point (0..~1.5) for stealth checks
  function levelAt(game, x, y) {
    let v = game.ambient.level;
    for (const L of game.lights) {
      if (!L.on) continue;
      const d = dist(x, y, L.x, L.y);
      if (d > L.r) continue;
      if (L.clip && (x < L.clip.x || x > L.clip.x + L.clip.w || y < L.clip.y || y > L.clip.y + L.clip.h)) continue;
      v += (1 - d / L.r) * (L.cur === undefined ? L.int : L.cur) * 0.8;
    }
    return v;
  }
  return { render, glows, levelAt, radial };
})();
