'use strict';
// =====================================================================
//  BodyArt — bakes detailed, hand-painted-style body part sprites for
//  survivors and infected from a "look" description. Sprites are
//  rendered once at 2x resolution and drawn rotated per bone.
// =====================================================================

const BodyArt = (() => {
  const RES = 3;
  const cache = new Map();
  const CACHE_MAX = 140; // sprite sets kept for reuse; live bodies hold their own reference

  function dimsFor(s, build = 1, limb = 1) {
    return {
      s, build, limb,
      torso: 34 * s, torsoT: 22 * s * build, waistT: 19 * s * build,
      neck: 6 * s, headR: 10.5 * s,
      ua: 19 * s * limb, uaT: 9.5 * s * build, fa: 18 * s * limb, faT: 8 * s * build,
      th: 25 * s * limb, thT: 13 * s * build, sh: 24 * s * limb, shT: 10 * s * build,
      footH: 4.5 * s, shoulderDrop: 5 * s,
    };
  }

  function bake(w, h, ox, oy, fn) {
    const cv = makeCanvas(w * RES, h * RES);
    const c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(-ox, -oy);
    c.lineJoin = 'round'; c.lineCap = 'round';
    fn(c);
    return { cv, ox, oy, w, h };
  }
  function darkVariant(spr, amt = 0.38) {
    const cv = makeCanvas(spr.cv.width, spr.cv.height), c = cv.getContext('2d');
    c.drawImage(spr.cv, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = `rgba(8,8,14,${amt})`; c.fillRect(0, 0, cv.width, cv.height);
    return { cv, ox: spr.ox, oy: spr.oy, w: spr.w, h: spr.h };
  }

  // ---------------------------------------------------- painting helpers
  function limbPath(c, L, t0, t1, bulge = 0) {
    c.beginPath();
    c.moveTo(0, -t0 / 2);
    c.quadraticCurveTo(L * 0.45, -t0 / 2 - bulge, L, -t1 / 2);
    c.arc(L, 0, t1 / 2, -Math.PI / 2, Math.PI / 2);
    c.quadraticCurveTo(L * 0.45, t0 / 2 + bulge * 0.6, 0, t0 / 2);
    c.arc(0, 0, t0 / 2, Math.PI / 2, Math.PI * 1.5);
    c.closePath();
  }
  // outline only the long sides at full strength; the rounded ends overlap
  // the neighbouring segment at a joint, so they get a faint line
  function limbOutline(c, L, t0, t1, bulge, col) {
    c.strokeStyle = col; c.lineWidth = 0.75;
    c.beginPath(); c.moveTo(0, -t0 / 2); c.quadraticCurveTo(L * 0.45, -t0 / 2 - bulge, L, -t1 / 2);
    c.moveTo(L, t1 / 2); c.quadraticCurveTo(L * 0.45, t0 / 2 + bulge * 0.6, 0, t0 / 2); c.stroke();
    c.strokeStyle = 'rgba(10,8,8,0.28)'; c.lineWidth = 0.5;
    c.beginPath(); c.arc(L, 0, t1 / 2, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(0, 0, t0 / 2, Math.PI / 2, Math.PI * 1.5); c.stroke();
  }
  // stitched seam along a curve
  function seam(c, pts, col) {
    c.strokeStyle = rgba(shade(col, -0.5), 0.8); c.lineWidth = 0.45; c.beginPath(); c.moveTo(pts[0], pts[1]);
    if (pts.length === 6) c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); else c.lineTo(pts[2], pts[3]); c.stroke();
    c.strokeStyle = rgba(shade(col, 0.45), 0.45); c.lineWidth = 0.28; c.setLineDash([0.7, 0.6]); c.stroke(); c.setLineDash([]);
  }
  // blood running from a wound, toward -x (downward on an upright torso) or +x on a hanging limb
  function bloodRun(c, rng, x, y, len, dir, s) {
    c.strokeStyle = 'rgba(70,6,6,0.75)'; c.lineCap = 'round';
    let xx = x, yy = y, w = rng.range(0.6, 1.1) * s;
    c.beginPath(); c.moveTo(xx, yy);
    for (let k = 0; k < 5; k++) { xx += dir * len / 5; yy += rng.range(-0.5, 0.5) * s; c.lineTo(xx, yy); }
    c.lineWidth = w; c.stroke();
    c.fillStyle = 'rgba(60,4,4,0.85)'; c.beginPath(); c.arc(xx, yy, w * 0.75, 0, TAU); c.fill();
  }
  // cloth creases: n short folds around x, on side sgn (-1 front/top, 1 back)
  function creases(c, rng, x, spread, T, n, col, sgn = 0) {
    for (let i = 0; i < n; i++) {
      const xx = x + rng.range(-spread, spread), y0 = sgn ? sgn * T * 0.05 : -T * 0.42, y1 = sgn ? sgn * T * 0.45 : T * 0.42;
      const bend = rng.range(-1.6, 1.6);
      c.strokeStyle = rgba(shade(col, -0.55), 0.7); c.lineWidth = 0.45;
      c.beginPath(); c.moveTo(xx, y0); c.quadraticCurveTo(xx + bend, (y0 + y1) / 2, xx + rng.range(-1, 1), y1); c.stroke();
      c.strokeStyle = rgba(shade(col, 0.35), 0.35); c.lineWidth = 0.35;
      c.beginPath(); c.moveTo(xx + 0.55, y0); c.quadraticCurveTo(xx + bend + 0.55, (y0 + y1) / 2, xx + 0.55 + rng.range(-1, 1), y1); c.stroke();
    }
  }
  function shadeAcross(c, x0, x1, T, col, litSide = -1) {
    const g = c.createLinearGradient(0, -T / 2 * litSide * -1, 0, T / 2 * litSide * -1);
    g.addColorStop(0, shade(col, -0.5));
    g.addColorStop(0.55, shade(col, 0.05));
    g.addColorStop(0.8, shade(col, 0.16));
    g.addColorStop(1, shade(col, -0.15));
    c.fillStyle = g; c.fillRect(x0, -T, x1 - x0, T * 2);
  }
  function fabricNoise(c, rng, x0, y0, w, h, n, dark = 0.18) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${dark})` : `rgba(255,255,255,${dark * 0.4})`;
      c.fillRect(x0 + rng() * w, y0 + rng() * h, 0.5, 0.5);
    }
  }
  function stain(c, rng, x, y, r, col = '#5e0b0b', a = 0.75) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.7, rgba(col, a * 0.6)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g;
    c.beginPath();
    for (let k = 0; k < 9; k++) { const a2 = k / 9 * TAU, rr = r * rng.range(0.6, 1.1); k ? c.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr) : c.moveTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr); }
    c.closePath(); c.fill();
  }
  function camo(c, rng, x0, y0, w, h, cols) {
    for (let i = 0; i < 26; i++) {
      c.fillStyle = rgba(rng.pick(cols), 0.75);
      const x = x0 + rng() * w, y = y0 + rng() * h, r = rng.range(1.5, 4);
      c.beginPath(); c.ellipse(x, y, r * 1.4, r, rng() * 3, 0, TAU); c.fill();
    }
  }
  function outline(c, col, lw = 0.7) { c.strokeStyle = col; c.lineWidth = lw; c.stroke(); }
  function skinTone(look) { return look.skin; }
  function seamLine(c, x0, x1, y, col) { c.strokeStyle = col; c.lineWidth = 0.4; c.setLineDash([1, 1]); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.setLineDash([]); }

  // zombie flesh details
  function rottenPatch(c, rng, x, y, r) {
    c.fillStyle = '#3a1a14'; c.beginPath(); c.ellipse(x, y, r, r * 0.7, rng() * 3, 0, TAU); c.fill();
    c.fillStyle = '#7a1e18'; c.beginPath(); c.ellipse(x, y, r * 0.7, r * 0.45, rng() * 3, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(220,200,170,0.5)'; c.lineWidth = 0.5;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.4 + k * r * 0.4); c.lineTo(x + r * 0.5, y - r * 0.3 + k * r * 0.4); c.stroke(); }
  }
  function veins(c, rng, x0, y0, w, h, n) {
    c.strokeStyle = 'rgba(50,20,60,0.35)'; c.lineWidth = 0.4;
    for (let i = 0; i < n; i++) {
      let x = x0 + rng() * w, y = y0 + rng() * h;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rng.range(-2, 2); y += rng.range(-2, 2); c.lineTo(x, y); }
      c.stroke();
    }
  }

  // ---------------------------------------------------- part painters
  function paintTorso(d, look, rng, gutted) {
    const L = d.torso, T = d.torsoT, W = d.waistT;
    const s = d.s;
    const ext = look.coat ? 16 * s : 0;
    const belly = look.fat ? T * 0.25 : 0;
    return bake(L + 14 * s + ext, T + 22 * s + belly * 2, -7 * s - ext, -T / 2 - 11 * s - belly, (c) => {
      const body = () => {
        c.beginPath();
        c.moveTo(-3 * s - ext, -W / 2);
        c.bezierCurveTo(L * 0.3, -W / 2 - 1 * s, L * 0.65, -T / 2, L * 0.9, -T / 2 + 1.5 * s);
        c.quadraticCurveTo(L + 3 * s, -T / 2 + 3 * s, L + 2.5 * s, 0);
        c.quadraticCurveTo(L + 2 * s, T / 2 - 2 * s, L * 0.82, T / 2);
        c.bezierCurveTo(L * 0.55, T / 2 + 1.5 * s + belly * 0.3, L * 0.3, W / 2 + belly, -3 * s - ext, W / 2 + belly * 0.5);
        c.closePath();
      };
      // skin under clothes (visible through tears / tank tops)
      const shirt = look.shirt;
      body();
      c.fillStyle = shirt; c.fill();
      c.save(); body(); c.clip();
      shadeAcross(c, -10 * s - ext, L + 4 * s, T + belly * 2, shirt, 1);
      fabricNoise(c, rng, -6 * s - ext, -T, L + 12 * s + ext, T * 2, 260);
      if (look.camo) camo(c, rng, -6 * s - ext, -T / 2, L + 10 * s + ext, T, look.camo);
      // gown: open back showing skin + dots
      if (look.shirtType === 'gown') {
        c.fillStyle = shade(look.skin, -0.15); c.fillRect(L * 0.15, -T / 2 - 2, L * 0.75, 3.2 * s);
        c.fillStyle = 'rgba(30,50,90,0.35)';
        for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(rng() * L, rng.range(-T / 2, T / 2), 0.6 * s, 0, TAU); c.fill(); }
        c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(L * 0.4, -T / 2 + 2.6 * s); c.lineTo(L * 0.44, -T / 2 + 4 * s); c.stroke();
      }
      if (look.shirtType === 'tank') { c.fillStyle = look.skin; c.beginPath(); c.ellipse(L * 0.95, T * 0.15, 5 * s, T * 0.32, 0, 0, TAU); c.fill(); }
      // collar
      c.fillStyle = shade(shirt, -0.3); c.fillRect(L - 2 * s, -T / 2, 5 * s, T);
      if (look.shirtType === 'shirt' || look.shirtType === 'uniform' || look.shirtType === 'coat') {
        c.fillStyle = shade(shirt, 0.15); poly(c, [L - 1 * s, T * 0.05, L + 2 * s, T * 0.35, L - 4 * s, T * 0.3]); c.fill();
        c.fillStyle = 'rgba(230,230,220,0.6)';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(L * (0.2 + i * 0.2), T / 2 - 1.8 * s, 0.6 * s, 0, TAU); c.fill(); }
        c.fillStyle = shade(shirt, -0.25); c.fillRect(L * 0.55, T / 2 - 6 * s, 6 * s, 5 * s); // pocket
      }
      if (look.shirtType === 'hoodie') {
        c.fillStyle = shade(shirt, -0.2); c.beginPath(); c.ellipse(L + 1 * s, -T * 0.25, 6 * s, T * 0.3, 0, 0, TAU); c.fill(); // hood bunched at back of neck
        c.strokeStyle = 'rgba(240,240,240,0.7)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(L - 2 * s, T * 0.3); c.lineTo(L - 8 * s, T * 0.35); c.stroke();
        c.fillStyle = shade(shirt, -0.15); c.fillRect(L * 0.2, T / 2 - 4 * s, L * 0.35, 4 * s);
      }
      if (look.shirtType === 'jacket') {
        // zip with teeth and pull, zipped chest pocket, hem band, shoulder yoke, stand collar
        const zy = T / 2 - 1.7 * s;
        c.fillStyle = shade(shirt, -0.45); c.fillRect(1 * s, zy - 0.6 * s, L - 1 * s, 1.2 * s);
        c.strokeStyle = 'rgba(205,205,195,0.55)'; c.lineWidth = 0.4; c.setLineDash([0.45, 0.45]); c.beginPath(); c.moveTo(1 * s, zy); c.lineTo(L, zy); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#a4a498'; roundRect(c, L * 0.8, zy - 0.5 * s, 2 * s, 1 * s, 0.3 * s); c.fill();
        c.fillStyle = shade(shirt, -0.15); roundRect(c, L * 0.48, T / 2 - 8 * s, 7.5 * s, 5.2 * s, 0.8 * s); c.fill();
        c.strokeStyle = shade(shirt, -0.55); c.lineWidth = 0.4; c.stroke();
        c.strokeStyle = 'rgba(205,205,195,0.5)'; c.lineWidth = 0.35; c.beginPath(); c.moveTo(L * 0.48 + 7 * s, T / 2 - 7.4 * s); c.lineTo(L * 0.48 + 0.6 * s, T / 2 - 7.4 * s); c.stroke();
        c.fillStyle = shade(shirt, -0.22); c.fillRect(1.5 * s, -T, 2.6 * s, T * 2);
        seam(c, [1.5 * s, -T / 2, 1.5 * s, T / 2], shirt); seam(c, [4.1 * s, -T / 2, 4.1 * s, T / 2], shirt);
        seam(c, [L * 0.7, -T / 2, L * 0.8, 0, L * 0.74, T / 2], shirt);
        c.fillStyle = shade(shirt, -0.12); c.beginPath(); c.moveTo(L - 3 * s, -T / 2 + 1 * s); c.quadraticCurveTo(L + 4 * s, -T * 0.1, L + 1.5 * s, T / 2 - 0.5 * s); c.lineTo(L - 1.5 * s, T / 2 - 1 * s); c.closePath(); c.fill();
        c.strokeStyle = shade(shirt, -0.55); c.lineWidth = 0.45; c.stroke();
      }
      if (look.shirtType === 'uniform') {
        // button placket, flapped chest pocket, epaulette
        c.fillStyle = shade(shirt, 0.08); c.fillRect(1 * s, T / 2 - 2.6 * s, L - 1 * s, 1.6 * s);
        seam(c, [1 * s, T / 2 - 2.6 * s, L, T / 2 - 2.6 * s], shirt);
        c.fillStyle = shade(shirt, -0.12); roundRect(c, L * 0.52, T / 2 - 8.5 * s, 6.5 * s, 5.5 * s, 0.6 * s); c.fill();
        c.fillStyle = shade(shirt, -0.28); c.beginPath(); c.moveTo(L * 0.52 + 6.5 * s, T / 2 - 8.5 * s); c.lineTo(L * 0.52, T / 2 - 8.5 * s); c.lineTo(L * 0.52 + 0.5 * s, T / 2 - 6 * s); c.lineTo(L * 0.52 + 6 * s, T / 2 - 6 * s); c.closePath(); c.fill();
        c.fillStyle = '#c8c4b0'; c.beginPath(); c.arc(L * 0.52 + 3.2 * s, T / 2 - 6.6 * s, 0.45 * s, 0, TAU); c.fill();
        c.fillStyle = shade(shirt, -0.3); roundRect(c, L - 5 * s, -T / 2 + 0.5 * s, 4 * s, T * 0.55, 0.6 * s); c.fill();
      }
      if (look.shirtType === 'hoodie') {
        // ribbed hem, hood rim, drawcords with aglets
        c.fillStyle = shade(shirt, -0.18); c.fillRect(0, -T, 3.2 * s, T * 2);
        c.strokeStyle = rgba(shade(shirt, -0.5), 0.6); c.lineWidth = 0.3; for (let y = -T / 2; y < T / 2; y += 0.9 * s) { c.beginPath(); c.moveTo(0, y); c.lineTo(3.2 * s, y); c.stroke(); }
        seam(c, [L - 5 * s, -T / 2, L - 1 * s, -T * 0.05, L - 3 * s, T / 2], shirt);
        c.strokeStyle = 'rgba(235,235,230,0.8)'; c.lineWidth = 0.55;
        for (const dy of [0.28, 0.4]) { c.beginPath(); c.moveTo(L - 2 * s, T * dy); c.quadraticCurveTo(L - 6 * s, T * dy + 0.8 * s, L - 9.5 * s, T * dy + 0.3 * s); c.stroke(); c.fillStyle = '#d8d8d0'; c.fillRect(L - 10.4 * s, T * dy, 1 * s, 0.6 * s); }
      }
      if (!look.zombie) seam(c, [L * 0.05, 0, L * 0.5, -T * 0.06, L * 0.86, 0], shirt); // side seam
      if (look.shirtType === 'scrubs') { c.fillStyle = shade(shirt, -0.2); poly(c, [L, T * 0.1, L - 7 * s, T / 2, L, T / 2]); c.fill(); }
      // fabric gathers at the waist, and a rim light along the back
      if (!look.armor && !look.hazmat) creases(c, rng, L * 0.22, L * 0.12, T, 3, shirt, 1);
      c.strokeStyle = 'rgba(255,240,225,0.15)'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(0, -W / 2 + 0.8); c.bezierCurveTo(L * 0.3, -W / 2 - 1 * s + 0.8, L * 0.65, -T / 2 + 0.8, L * 0.9, -T / 2 + 1.5 * s + 0.8); c.stroke();
      // vest overlays
      if (look.vest) {
        const vc = look.vest === 'police' ? '#1b2230' : look.vest === 'military' ? '#4a4b33' : look.vest === 'hivis' ? '#c8d22a' : '#2a2a2a';
        c.fillStyle = vc; c.fillRect(L * 0.18, -T / 2 - 1, L * 0.72, T + 2);
        shadeAcross(c, L * 0.18, L * 0.9, T, vc, 1);
        if (look.vest === 'hivis') {
          for (const x of [L * 0.3, L * 0.6]) {
            const g2 = c.createLinearGradient(0, -T / 2, 0, T / 2); g2.addColorStop(0, '#f4f4ee'); g2.addColorStop(0.5, '#b8b8b0'); g2.addColorStop(1, '#e8e8e0');
            c.fillStyle = g2; c.fillRect(x, -T / 2, 2.2 * s, T); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, -T / 2, 2.2 * s, 0.4);
          }
          c.fillStyle = shade(vc, -0.18); roundRect(c, L * 0.38, T / 2 - 6 * s, 6 * s, 5 * s, 0.6 * s); c.fill(); seam(c, [L * 0.38, T / 2 - 6 * s, L * 0.38 + 6 * s, T / 2 - 6 * s], vc);
          c.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 160; i++) c.fillRect(L * 0.18 + rng() * L * 0.72, -T / 2 + rng() * T, 0.35, 0.35); // mesh
        }
        else {
          // webbing rows across the panel
          for (const x of [L * 0.32, L * 0.44, L * 0.56]) { c.fillStyle = shade(vc, -0.25); c.fillRect(x, -T / 2, 1.3 * s, T); c.fillStyle = 'rgba(0,0,0,0.45)'; for (let y = -T / 2 + 1 * s; y < T / 2; y += 2.2 * s) c.fillRect(x, y, 1.3 * s, 0.35); }
          c.fillStyle = shade(vc, -0.35);
          for (let i = 0; i < 3; i++) { roundRect(c, L * (0.22 + i * 0.2), T / 2 - 6.5 * s, 5.2 * s, 7 * s, 1); c.fill(); }
          c.strokeStyle = shade(vc, 0.2); c.lineWidth = 0.4;
          for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(L * (0.22 + i * 0.2), T / 2 - 5 * s); c.lineTo(L * (0.22 + i * 0.2) + 5.2 * s, T / 2 - 5 * s); c.stroke(); }
          if (look.vest === 'police') {
            c.fillStyle = '#c9b25a'; c.beginPath(); c.arc(L * 0.78, T * 0.2, 1.4 * s, 0, TAU); c.fill();
            c.fillStyle = 'rgba(255,255,230,0.5)'; c.beginPath(); c.arc(L * 0.78 + 0.4 * s, T * 0.2 - 0.4 * s, 0.5 * s, 0, TAU); c.fill();
            c.fillStyle = 'rgba(230,230,220,0.85)'; c.fillRect(L * 0.46, -T / 2 + 1 * s, L * 0.28, 2.4 * s); // POLICE back panel
            c.fillStyle = 'rgba(20,24,34,0.9)'; for (let k = 0; k < 6; k++) c.fillRect(L * 0.48 + k * L * 0.042, -T / 2 + 1.4 * s, L * 0.025, 1.6 * s);
          }
          // shoulder radio with antenna
          c.fillStyle = '#111316'; roundRect(c, L * 0.66, T / 2 - 4.5 * s, 4.2 * s, 3.4 * s, 0.6 * s); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(L * 0.66, T / 2 - 4.5 * s, 4.2 * s, 0.4);
          c.fillStyle = '#7a2a1a'; c.fillRect(L * 0.66 + 0.6 * s, T / 2 - 3.8 * s, 0.8 * s, 0.8 * s);
          c.strokeStyle = '#0c0d0f'; c.lineWidth = 0.7 * s; c.beginPath(); c.moveTo(L * 0.66 + 4 * s, T / 2 - 3.6 * s); c.lineTo(L * 0.66 + 8.5 * s, T / 2 - 3.8 * s); c.stroke();
        }
      }
      if (look.armor) { // riot shoulder/chest plates
        c.fillStyle = '#16181c'; roundRect(c, L * 0.25, -T / 2 - 1, L * 0.7, T + 2, 3 * s); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(L * 0.3, -T / 2 + 1, L * 0.6, 2 * s);
        c.strokeStyle = '#2c3038'; c.lineWidth = 0.6; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(L * (0.35 + i * 0.18), -T / 2); c.lineTo(L * (0.35 + i * 0.18), T / 2); c.stroke(); }
      }
      if (look.hazmat) { c.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 5; i++) c.fillRect(rng() * L, -T / 2, 0.6 * s, T); }
      // zombie: torn cloth revealing grey flesh, ribs
      if (look.zombie) {
        for (let i = 0; i < (look.decay > 0.5 ? 3 : 2); i++) {
          const x = rng.range(L * 0.2, L * 0.8), y = rng.range(-T * 0.2, T * 0.35), r = rng.range(2.5, 4.5) * s;
          c.fillStyle = shade(look.skin, -0.1);
          c.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, rr = r * rng.range(0.6, 1.2); k ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill();
          if (rng() < 0.6) rottenPatch(c, rng, x, y, r * 0.6);
          if (look.decay > 0.5 && i === 0) { // ribs showing through the tear
            c.fillStyle = '#3a0808'; c.beginPath(); c.ellipse(x, y, r * 0.75, r * 0.55, 0, 0, TAU); c.fill();
            c.strokeStyle = '#d8cdb4'; c.lineWidth = 0.8 * s; for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x + k * r * 0.42, y - r * 0.45); c.quadraticCurveTo(x + k * r * 0.42 + r * 0.12, y, x + k * r * 0.42, y + r * 0.45); c.stroke(); }
          }
          bloodRun(c, rng, x - r * 0.4, y + rng.range(-r, r) * 0.4, rng.range(4, 9) * s, -1, s);
        }
        for (let i = 0; i < 4 + look.blood * 6; i++) stain(c, rng, rng.range(L * 0.4, L + 2 * s), rng.range(-T * 0.1, T / 2), rng.range(2, 5) * s, '#4a0808', 0.7);
      } else if (look.blood) {
        for (let i = 0; i < look.blood * 4; i++) stain(c, rng, rng.range(0, L), rng.range(-T / 2, T / 2), rng.range(1.5, 3.5) * s, '#4a0808', 0.5);
      }
      // belt + trouser top at pelvis
      if (!look.coat && look.shirtType !== 'gown' && !look.hazmat) {
        c.fillStyle = look.pants; c.fillRect(-8 * s, -T, 7 * s, T * 2);
        c.fillStyle = '#18140f'; c.fillRect(-1.5 * s, -T, 3 * s, T * 2);
        c.fillStyle = '#8a7a50'; c.fillRect(-1.5 * s, W / 2 - 3.5 * s, 3 * s, 2.5 * s);
      }
      if (look.backpack) {
        c.fillStyle = '#2e2a20'; roundRect(c, L * 0.15, -T / 2 - 2, L * 0.65, 6 * s, 2 * s); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(L * 0.2, -T / 2 + 2.5 * s); c.lineTo(L * 0.75, -T / 2 + 2.5 * s); c.stroke();
        // harness strap over the shoulder and down the chest
        c.strokeStyle = '#1e1b15'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(L * 0.82, -T / 2); c.quadraticCurveTo(L + 1 * s, T * 0.05, L * 0.62, T / 2 - 2 * s); c.lineTo(L * 0.3, T / 2 - 2.5 * s); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.4; c.stroke();
        c.fillStyle = '#5a5648'; roundRect(c, L * 0.58, T / 2 - 3.3 * s, 2 * s, 1.8 * s, 0.4 * s); c.fill(); // buckle
      }
      if (!look.zombie && !look.coat && look.shirtType !== 'gown' && !look.hazmat) {
        // belt pouch / holster on the hip
        const pc = look.vest === 'police' ? '#121212' : '#2c281f';
        c.fillStyle = pc; roundRect(c, -6 * s, -T * 0.08, 5.2 * s, T * 0.38, 1 * s); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(-6 * s, -T * 0.08, 5.2 * s, 0.5);
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(-2.4 * s, -T * 0.08); c.lineTo(-2.4 * s, T * 0.3); c.stroke();
        c.fillStyle = '#8a7a50'; c.beginPath(); c.arc(-1.6 * s, T * 0.1, 0.5 * s, 0, TAU); c.fill();
      }
      // gutted torso cavity
      if (gutted) {
        c.fillStyle = '#2a0404'; c.beginPath(); c.ellipse(L * 0.35, T * 0.12, L * 0.3, T * 0.45, 0, 0, TAU); c.fill();
        c.fillStyle = '#6a0f12'; c.beginPath(); c.ellipse(L * 0.33, T * 0.15, L * 0.22, T * 0.33, 0, 0, TAU); c.fill();
        c.strokeStyle = '#d8ccb0'; c.lineWidth = 1.1 * s;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(L * (0.5 + i * 0.1), -T * 0.1, T * 0.42, 0.2, 1.3); c.stroke(); }
        c.fillStyle = '#b5606a';
        for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(L * rng.range(0.15, 0.5), T * rng.range(-0.1, 0.35), 2.5 * s, 1.8 * s, rng() * 3, 0, TAU); c.fill(); }
        c.fillStyle = 'rgba(255,200,200,0.3)';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(L * rng.range(0.15, 0.5), T * rng.range(-0.1, 0.35), 0.8 * s, 0, TAU); c.fill(); }
      }
      c.restore();
      body(); outline(c, 'rgba(10,8,8,0.85)', 0.8);
      if (look.backpack) {
        // the pack itself, standing off the back: flap, compression straps, side pocket, bedroll
        const x0 = L * 0.12, x1 = L * 0.82, y0 = -T / 2 - 7 * s, y1 = -T / 2 + 1.6 * s, pc = '#3b3526';
        const pack = () => { c.beginPath(); roundRect(c, x0, y0, x1 - x0, y1 - y0, 2.4 * s); };
        pack(); c.fillStyle = pc; c.fill();
        c.save(); pack(); c.clip();
        const g3 = c.createLinearGradient(0, y0, 0, y1); g3.addColorStop(0, shade(pc, -0.45)); g3.addColorStop(0.45, shade(pc, 0.1)); g3.addColorStop(1, shade(pc, -0.25));
        c.fillStyle = g3; c.fillRect(x0, y0, x1 - x0, y1 - y0);
        fabricNoise(c, rng, x0, y0, x1 - x0, y1 - y0, 220, 0.22);
        c.fillStyle = shade(pc, -0.12); roundRect(c, x1 - 8 * s, y0 - 1, 8.5 * s, y1 - y0 + 2, 1.5 * s); c.fill(); // top flap
        seam(c, [x1 - 8 * s, y0 + 1 * s, x1 - 8 * s, y1 - 1 * s], pc);
        c.fillStyle = shade(pc, -0.08); roundRect(c, x0 + 1 * s, y0 + 0.8 * s, 9 * s, 4.6 * s, 1.2 * s); c.fill(); seam(c, [x0 + 1 * s, y0 + 2.2 * s, x0 + 10 * s, y0 + 2.2 * s], pc);
        for (const xx of [x0 + (x1 - x0) * 0.4, x0 + (x1 - x0) * 0.62]) { c.fillStyle = '#1a1712'; c.fillRect(xx, y0, 1.4 * s, y1 - y0); c.fillStyle = '#6a6656'; c.fillRect(xx - 0.2 * s, y0 + 1.2 * s, 1.8 * s, 1.4 * s); }
        c.restore();
        pack(); c.strokeStyle = 'rgba(10,8,8,0.85)'; c.lineWidth = 0.7; c.stroke();
        // bedroll strapped on top
        const bc = '#4a5038'; c.fillStyle = bc; roundRect(c, x1 - 1 * s, y0 + 0.5 * s, 5 * s, y1 - y0 - 1 * s, 2.4 * s); c.fill();
        c.save(); roundRect(c, x1 - 1 * s, y0 + 0.5 * s, 5 * s, y1 - y0 - 1 * s, 2.4 * s); c.clip();
        const g4 = c.createLinearGradient(x1 - 1 * s, 0, x1 + 4 * s, 0); g4.addColorStop(0, shade(bc, -0.35)); g4.addColorStop(0.5, shade(bc, 0.2)); g4.addColorStop(1, shade(bc, -0.4)); c.fillStyle = g4; c.fillRect(x1 - 1 * s, y0, 5 * s, y1 - y0);
        c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.3; for (let k = 1; k < 4; k++) { c.beginPath(); c.arc(x1 + 1.5 * s, (y0 + y1) / 2, k * 0.9 * s, 0, TAU); c.stroke(); }
        c.restore();
        c.strokeStyle = 'rgba(10,8,8,0.8)'; c.lineWidth = 0.6; roundRect(c, x1 - 1 * s, y0 + 0.5 * s, 5 * s, y1 - y0 - 1 * s, 2.4 * s); c.stroke();
        c.fillStyle = '#1a1712'; c.fillRect(x1 + 0.3 * s, y0 + 0.5 * s, 1 * s, y1 - y0 - 1 * s);
      }
    });
  }

  function paintLimb(kind, d, look, rng, noHand = false) {
    const s = d.s;
    const isArm = kind === 'ua' || kind === 'fa';
    const L = d[kind], T = d[kind + 'T'];
    const t1 = T * (kind === 'th' ? 0.78 : kind === 'sh' ? 0.72 : kind === 'ua' ? 0.85 : 0.78);
    const padF = kind === 'sh' ? 16 * s : kind === 'fa' ? 6 * s : 3 * s;
    return bake(L + padF + 6 * s, T + (kind === 'sh' ? 26 * s : 10 * s), -4 * s, kind === 'sh' ? -T / 2 - 18 * s : -T / 2 - 5 * s, (c) => {
      // decide covering
      let cloth = null, clothTo = 0;
      if (isArm) {
        const sleeve = look.sleeve || 'short';
        cloth = look.shirt;
        if (look.armor && kind === 'ua') { cloth = '#16181c'; clothTo = L; }
        else if (sleeve === 'long') clothTo = kind === 'ua' ? L : L - 4 * s;
        else if (sleeve === 'rolled') clothTo = kind === 'ua' ? L : L * 0.25;
        else if (sleeve === 'short') clothTo = kind === 'ua' ? L * 0.55 : 0;
        else clothTo = 0;
        if (look.zombie && sleeve === 'long' && kind === 'fa' && rng() < 0.5) clothTo = L * 0.4;
      } else {
        cloth = look.pants;
        if (look.pantsType === 'shorts') clothTo = kind === 'th' ? L * 0.7 : 0;
        else if (look.pantsType === 'bare') clothTo = 0;
        else clothTo = L + 2 * s;
        if (look.shirtType === 'gown') { cloth = look.shirt; clothTo = kind === 'th' ? L * 0.6 : 0; }
        if (look.zombie && kind === 'sh' && rng() < 0.35) clothTo = L * 0.55;
      }
      const skin = skinTone(look);
      const lp = () => limbPath(c, L, T, t1, kind === 'th' ? 1.2 * s : kind === 'ua' ? 0.8 * s : 0.3 * s);
      lp(); c.fillStyle = skin; c.fill();
      c.save(); lp(); c.clip();
      shadeAcross(c, -T, L + T, T, skin, -1);
      if (look.zombie) { veins(c, rng, 0, -T / 2, L, T, 5); if (rng() < 0.5) rottenPatch(c, rng, rng.range(L * 0.3, L * 0.8), rng.range(-T * 0.2, T * 0.2), T * 0.3); }
      if (clothTo > 0) {
        c.save();
        c.beginPath();
        // ragged cloth edge
        c.moveTo(-T, -T);
        c.lineTo(clothTo, -T);
        const seg = 6;
        for (let k = 0; k <= seg; k++) c.lineTo(clothTo + (look.zombie ? rng.range(-2, 1.5) * s : 0), -T + (2 * T) * k / seg);
        c.lineTo(-T, T); c.closePath(); c.clip();
        c.fillStyle = cloth; c.fillRect(-T, -T, clothTo + T + 3 * s, T * 2);
        shadeAcross(c, -T, clothTo + 3 * s, T, cloth, -1);
        fabricNoise(c, rng, -T, -T, clothTo + T, T * 2, 140);
        if (look.camo) camo(c, rng, 0, -T / 2, clothTo, T, look.camo);
        if (!isArm && look.pantsType !== 'shorts') {
          seamLine(c, 0, clothTo, T * 0.18, shade(cloth, -0.45));
          c.strokeStyle = shade(cloth, -0.35); c.lineWidth = 0.5;
          for (let k = 0; k < 3; k++) { const x = L * rng.range(0.55, 0.95); c.beginPath(); c.moveTo(x, -T * 0.45); c.quadraticCurveTo(x + 1.5 * s, 0, x, T * 0.2); c.stroke(); }
          if (kind === 'th' && look.cargo) { c.fillStyle = shade(cloth, -0.18); roundRect(c, L * 0.35, T * 0.05, 8 * s, T * 0.4, 1); c.fill(); }
        }
        if (isArm) { c.strokeStyle = shade(cloth, -0.4); c.lineWidth = 0.5; c.beginPath(); c.moveTo(clothTo - 1, -T / 2); c.lineTo(clothTo - 1, T / 2); c.stroke(); }
        // sleeve cuff
        if (kind === 'fa' && !look.zombie && clothTo > L * 0.5) { c.fillStyle = shade(cloth, -0.18); c.fillRect(clothTo - 2.2 * s, -T, 2.2 * s, T * 2); seam(c, [clothTo - 2.2 * s, -T / 2, clothTo - 2.2 * s, T / 2], cloth); }
        // unit patch on the upper sleeve
        if (kind === 'ua' && !look.zombie && (look.patch || look.vest === 'police') && clothTo > L * 0.45) {
          const pc = look.vest === 'police' ? '#1c2434' : '#5a5a3e';
          c.fillStyle = pc; c.beginPath(); c.moveTo(L * 0.16, -T * 0.3); c.lineTo(L * 0.46, -T * 0.3); c.lineTo(L * 0.46, T * 0.12); c.quadraticCurveTo(L * 0.31, T * 0.34, L * 0.16, T * 0.12); c.closePath(); c.fill();
          c.strokeStyle = look.vest === 'police' ? '#b89a4a' : '#2e2e20'; c.lineWidth = 0.45; c.stroke();
          c.fillStyle = look.vest === 'police' ? '#b89a4a' : '#8a8a62'; c.fillRect(L * 0.24, -T * 0.16, L * 0.14, T * 0.1);
        }
        // back pocket on the trousers
        if (kind === 'th' && look.pantsType !== 'shorts' && look.shirtType !== 'gown') {
          c.fillStyle = shade(cloth, -0.12); roundRect(c, L * 0.06, T * 0.06, L * 0.28, T * 0.38, 0.6 * s); c.fill();
          seam(c, [L * 0.06, T * 0.06, L * 0.34, T * 0.06], cloth); seam(c, [L * 0.34, T * 0.06, L * 0.34, T * 0.44], cloth);
        }
        // infected: threads hanging from the torn edge
        if (look.zombie && clothTo < L) {
          c.strokeStyle = rgba(shade(cloth, -0.2), 0.8); c.lineWidth = 0.3;
          for (let k = 0; k < 4; k++) { const y = rng.range(-T * 0.4, T * 0.4); c.beginPath(); c.moveTo(clothTo, y); c.quadraticCurveTo(clothTo + 1.5 * s, y + rng.range(-1, 1) * s, clothTo + rng.range(2, 4) * s, y + rng.range(-1.5, 1.5) * s); c.stroke(); }
        }
        c.restore();
      }
      if (clothTo > 0) {
        // creases where the cloth bends: elbow, inner elbow, knee, ankle
        const cc = cloth;
        c.save(); c.beginPath(); c.rect(-T, -T, clothTo + T, T * 2); c.clip();
        if (kind === 'ua') creases(c, rng, L * 0.86, L * 0.08, T, 2, cc);
        if (kind === 'fa') creases(c, rng, 2.5 * s, 1.5 * s, T, 2, cc, 1);
        if (kind === 'th') creases(c, rng, L * 0.86, L * 0.07, T, 3, cc, -1);
        if (kind === 'sh' && clothTo > L) { creases(c, rng, 3 * s, 2 * s, T, 2, cc, 1); creases(c, rng, L - 3.5 * s, 2 * s, T, 3, cc); }
        c.restore();
      }
      // ambient occlusion where the limb leaves the body, and a rim light down the leading edge
      if (kind === 'ua' || kind === 'th') {
        const ao = c.createLinearGradient(0, 0, T * 1.1, 0); ao.addColorStop(0, 'rgba(0,0,0,0.32)'); ao.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = ao; c.fillRect(-T, -T, T * 2.1, T * 2);
      }
      c.strokeStyle = 'rgba(255,240,225,0.16)'; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(1 * s, -T / 2 + 0.7); c.quadraticCurveTo(L * 0.45, -T / 2 - (kind === 'th' ? 1.2 * s : 0.6 * s) + 0.7, L - 1 * s, -t1 / 2 + 0.7); c.stroke();
      if (look.hivisBand && !isArm) { c.fillStyle = 'rgba(220,220,220,0.8)'; c.fillRect(L * 0.6, -T, 1.8 * s, T * 2); }
      if (look.blood || look.zombie) for (let i = 0; i < (look.zombie ? 2 + look.blood * 3 : look.blood * 2); i++) {
        const sx = rng.range(0, L), sy = rng.range(-T / 2, T / 2);
        stain(c, rng, sx, sy, rng.range(1.2, 3) * s, '#4a0808', 0.65);
        if (look.zombie && rng() < 0.6) bloodRun(c, rng, sx, sy, rng.range(3, 7) * s, 1, s);
      }
      if (kind === 'th' && look.kneepads) { c.fillStyle = '#1e1e1e'; roundRect(c, L - 5 * s, -T / 2 - 1, 7 * s, T * 0.6, 2); c.fill(); }
      if (kind === 'sh' && look.kneepads) { c.fillStyle = '#1e1e1e'; roundRect(c, -2 * s, -T / 2 - 1, 6 * s, T * 0.6, 2); c.fill(); }
      c.restore();
      limbOutline(c, L, T, t1, kind === 'th' ? 1.2 * s : kind === 'ua' ? 0.8 * s : 0.3 * s, 'rgba(10,8,8,0.85)');

      // ---- hand
      if (kind === 'fa' && !noHand) {
        const hc = look.gloves || skin;
        c.save(); c.translate(L + 1.5 * s, 0);
        if (look.zombie && !look.gloves) {
          c.fillStyle = hc;
          c.beginPath(); c.ellipse(0, 0, 4.2 * s, 3.6 * s, 0, 0, TAU); c.fill(); outline(c, 'rgba(10,8,8,0.8)', 0.6);
          c.strokeStyle = hc; c.lineWidth = 1.6 * s;
          for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(2 * s, k * 1.6 * s); c.quadraticCurveTo(6 * s, k * 2.3 * s, 7.5 * s, k * 2.4 * s + 1.5 * s); c.stroke(); }
          c.strokeStyle = 'rgba(20,10,10,0.7)'; c.lineWidth = 0.4;
          for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(7 * s, k * 2.4 * s + 1.5 * s); c.lineTo(7.8 * s, k * 2.4 * s + 2.1 * s); c.stroke(); }
        } else {
          // clenched fist: back of the hand, curled fingers with knuckles, thumb wrapped over
          const fist = () => { c.beginPath(); c.moveTo(-2 * s, -3.4 * s); c.quadraticCurveTo(3 * s, -4.4 * s, 5.6 * s, -2.6 * s); c.quadraticCurveTo(7 * s, 0, 5.8 * s, 3 * s); c.quadraticCurveTo(2.5 * s, 4.6 * s, -1.8 * s, 3.4 * s); c.quadraticCurveTo(-3 * s, 0, -2 * s, -3.4 * s); c.closePath(); };
          fist(); c.fillStyle = hc; c.fill();
          c.save(); fist(); c.clip();
          const g = c.createLinearGradient(0, -4.4 * s, 0, 4.6 * s); g.addColorStop(0, 'rgba(255,240,225,0.18)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
          c.fillStyle = g; c.fillRect(-4 * s, -5 * s, 12 * s, 10 * s);
          // finger segments curling under
          c.strokeStyle = 'rgba(20,10,10,0.5)'; c.lineWidth = 0.42;
          for (let k = 0; k < 3; k++) { const y = -1.6 * s + k * 1.6 * s; c.beginPath(); c.moveTo(2.4 * s, y); c.quadraticCurveTo(5 * s, y + 0.2 * s, 6.2 * s, y + 0.9 * s); c.stroke(); }
          c.fillStyle = 'rgba(255,235,220,0.22)';
          for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(5.3 * s, -2.3 * s + k * 1.55 * s, 0.55 * s, 0, TAU); c.fill(); } // knuckles
          if (look.gloves) { c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.35; c.setLineDash([0.6, 0.5]); c.beginPath(); c.moveTo(-1.5 * s, -2.8 * s); c.quadraticCurveTo(2 * s, -3.6 * s, 4.8 * s, -2.2 * s); c.stroke(); c.setLineDash([]); }
          c.restore();
          fist(); outline(c, 'rgba(10,8,8,0.82)', 0.55);
          // thumb
          c.fillStyle = hc; c.beginPath(); c.ellipse(1.8 * s, -3.2 * s, 3 * s, 1.35 * s, -0.12, 0, TAU); c.fill(); outline(c, 'rgba(10,8,8,0.65)', 0.42);
          c.fillStyle = 'rgba(255,240,225,0.18)'; c.beginPath(); c.ellipse(2 * s, -3.7 * s, 2 * s, 0.5 * s, -0.12, 0, TAU); c.fill();
          if (!look.gloves) { c.fillStyle = 'rgba(240,220,210,0.55)'; c.beginPath(); c.ellipse(4.3 * s, -3.3 * s, 0.7 * s, 0.45 * s, 0, 0, TAU); c.fill(); } // thumbnail
        }
        if (look.watch) { c.fillStyle = '#1a1a1a'; c.fillRect(-3.5 * s, -T * 0.4, 2 * s, T * 0.8); c.fillStyle = '#8a8a7a'; c.fillRect(-3.2 * s, -1 * s, 1.4 * s, 2 * s); }
        c.restore();
      }
      // ---- foot / boot
      if (kind === 'sh') {
        const shoe = look.shoes || '#1c1a18';
        c.save(); c.translate(L, 0);
        if (look.shoeType === 'bare') {
          c.fillStyle = skin;
          c.beginPath(); c.moveTo(-4 * s, 3.5 * s); c.quadraticCurveTo(-5 * s, -3 * s, -1 * s, -12 * s); c.quadraticCurveTo(2.5 * s, -13.5 * s, 3 * s, -9 * s); c.lineTo(3.2 * s, 3.5 * s); c.closePath(); c.fill();
          outline(c, 'rgba(10,8,8,0.8)', 0.6);
          c.fillStyle = 'rgba(60,20,20,0.4)'; c.fillRect(1.6 * s, -12 * s, 1.4 * s, 15 * s);
        } else {
          const boot = look.shoeType === 'boot';
          c.fillStyle = shoe;
          c.beginPath();
          c.moveTo(boot ? -9 * s : -4 * s, 4.5 * s);
          c.lineTo(boot ? -9 * s : -4 * s, -4 * s);
          c.quadraticCurveTo(-3.5 * s, -13.5 * s, 0 * s, -14 * s);
          c.quadraticCurveTo(3.4 * s, -14 * s, 3.4 * s, -10 * s);
          c.lineTo(3.4 * s, 5 * s);
          c.closePath(); c.fill();
          const g = c.createLinearGradient(-6 * s, 0, 4 * s, 0); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
          c.fillStyle = g; c.fill();
          outline(c, 'rgba(5,5,5,0.9)', 0.6);
          c.fillStyle = look.shoeType === 'sneaker' ? '#d6d2c6' : '#0c0b0a';
          c.fillRect(1.8 * s, -14 * s, 1.8 * s, 19 * s); // sole
          if (look.shoeType === 'sneaker') { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-2 * s, -9 * s, 0.7 * s, 6 * s); }
          c.fillStyle = 'rgba(0,0,0,0.6)'; for (let k = 0; k < 6; k++) c.fillRect(3 * s, -13 * s + k * 3.1 * s, 0.6 * s, 1.4 * s); // tread
          c.fillStyle = 'rgba(255,255,255,0.14)'; c.beginPath(); c.ellipse(-0.6 * s, -11.5 * s, 1.4 * s, 2.2 * s, 0.3, 0, TAU); c.fill(); // toe cap
          if (boot) {
            c.strokeStyle = 'rgba(200,190,170,0.5)'; c.lineWidth = 0.4; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(-7 * s + k * 2 * s, -5 * s); c.lineTo(-6 * s + k * 2 * s, -3 * s); c.stroke(); }
            c.fillStyle = 'rgba(150,140,120,0.6)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(-7.4 * s + k * 2 * s, -2.4 * s, 0.35 * s, 0, TAU); c.fill(); } // lace hooks
            c.fillStyle = shade(shoe, -0.35); roundRect(c, -9.6 * s, -4.4 * s, 2.4 * s, 9.2 * s, 0.8 * s); c.fill(); // padded ankle collar
            c.fillStyle = '#0a0908'; c.fillRect(0.4 * s, 1.4 * s, 3.2 * s, 3.4 * s); // heel block
          }
        }
        c.restore();
      }
    });
  }

  function paintHead(d, look, rng) {
    const s = d.s, R = d.headR;
    const big = look.helmet || look.hat === 'hazmat' ? 4 * s : 0;
    return bake(R * 2 + 14 * s + big, R * 2 + 24 * s + big, -R - 6 * s - big / 2, -R - 6 * s - big, (c) => {
      const skin = look.skin;
      const Z = look.zombie;
      const jawDrop = Z ? (look.jawOpen || 2.2) * s : 0;
      // neck
      c.fillStyle = shade(skin, -0.2);
      c.beginPath(); c.moveTo(-5 * s, 4 * s); c.lineTo(2.5 * s, 5 * s); c.lineTo(3 * s, 17 * s); c.lineTo(-5 * s, 17 * s); c.closePath(); c.fill();
      outline(c, 'rgba(10,8,8,0.7)', 0.6);
      if (Z) { c.strokeStyle = 'rgba(80,10,10,0.6)'; c.lineWidth = 0.8 * s; c.beginPath(); c.moveTo(1 * s, 8 * s); c.lineTo(1.5 * s, 16 * s); c.stroke(); }
      // skull + face silhouette
      const face = () => {
        c.beginPath();
        c.moveTo(-6 * s, 7 * s);
        c.arc(-1 * s, -2 * s, R, Math.PI * 0.7, Math.PI * 1.9);
        c.quadraticCurveTo(R * 0.95, -5 * s, R * 0.92, -3 * s);   // brow
        c.lineTo(R + 2.6 * s, 1.6 * s);                         // nose tip
        c.lineTo(R + 0.6 * s, 3 * s);
        c.lineTo(R + 0.9 * s, 4.6 * s);                          // upper lip
        c.lineTo(R + 0.2 * s, 5.6 * s);
        c.lineTo(R + 0.5 * s, 6.6 * s + jawDrop);               // lower lip
        c.quadraticCurveTo(R + 0.3 * s, 9.6 * s + jawDrop, R - 3 * s, 10 * s + jawDrop); // chin
        c.quadraticCurveTo(-1 * s, 9.5 * s + jawDrop * 0.6, -3 * s, 7 * s);
        c.closePath();
      };
      face();
      c.fillStyle = skin; c.fill();
      c.save(); face(); c.clip();
      const g = c.createRadialGradient(R * 0.6, -4 * s, 1, 0, 0, R * 1.6);
      g.addColorStop(0, shade(skin, 0.18)); g.addColorStop(0.6, skin); g.addColorStop(1, shade(skin, -0.45));
      c.fillStyle = g; c.fillRect(-R * 2, -R * 2, R * 4, R * 4);
      // cheek shading & jaw
      { const cg = c.createRadialGradient(R * 0.3, 5 * s, 0, R * 0.3, 5 * s, 4.5 * s); cg.addColorStop(0, 'rgba(0,0,0,0.13)'); cg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = cg; c.fillRect(R * 0.3 - 5 * s, 0, 10 * s, 10 * s); } // soft cheek hollow
      if (look.beard) { c.fillStyle = rgba(look.hair, 0.55); fabricNoise(c, rng, R * 0.1, 4 * s, R + 2 * s, 7 * s + jawDrop, 220, 0.5); c.beginPath(); c.ellipse(R * 0.5, 7.5 * s, R * 0.6, 3 * s, 0, 0, TAU); c.fill(); }
      if (look.stubble) fabricNoise(c, rng, R * 0.1, 3.5 * s, R + 2 * s, 7 * s, 160, 0.45);
      if (Z) {
        veins(c, rng, -R, -R, R * 2, R * 2, 7);
        // sunken socket
        const sg = c.createRadialGradient(R - 3.4 * s, -1.2 * s, 0, R - 3.4 * s, -1.2 * s, 4.2 * s);
        sg.addColorStop(0, 'rgba(20,0,0,0.85)'); sg.addColorStop(1, 'rgba(20,0,0,0)');
        c.fillStyle = sg; c.fillRect(R - 9 * s, -7 * s, 11 * s, 11 * s);
        // mouth gore
        for (let i = 0; i < 3 + look.blood * 3; i++) stain(c, rng, rng.range(R - 3 * s, R + 1 * s), rng.range(5 * s, 11 * s), rng.range(1, 2.4) * s, '#4a0606', 0.8);
        if (look.decay > 0.4) rottenPatch(c, rng, R * 0.2, 3 * s, 2.6 * s);
        if (look.decay > 0.6) { c.fillStyle = '#d9d0bd'; c.beginPath(); c.ellipse(-2 * s, -8 * s, 3.5 * s, 2.2 * s, -0.4, 0, TAU); c.fill(); c.strokeStyle = '#6a2a20'; c.lineWidth = 0.5; c.stroke(); }
      }
      c.restore();
      face(); outline(c, 'rgba(10,8,8,0.9)', 0.8);
      // mouth
      if (Z) {
        c.fillStyle = '#1a0505';
        c.beginPath(); c.moveTo(R - 2.6 * s, 5.4 * s); c.lineTo(R + 0.3 * s, 5.4 * s); c.lineTo(R + 0.3 * s, 6.2 * s + jawDrop); c.lineTo(R - 2.2 * s, 6.4 * s + jawDrop); c.closePath(); c.fill();
        c.fillStyle = '#cfc6a0';
        for (let k = 0; k < 3; k++) { c.fillRect(R - 2.2 * s + k * 0.9 * s, 5.4 * s, 0.7 * s, 1.1 * s); c.fillRect(R - 2 * s + k * 0.9 * s, 5.2 * s + jawDrop, 0.7 * s, 1 * s); }
      } else {
        c.strokeStyle = 'rgba(60,20,20,0.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(R - 2.2 * s, 5.7 * s); c.lineTo(R + 0.3 * s, 5.5 * s); c.stroke();
        c.fillStyle = rgba(shade(skin, -0.25), 0.55); c.beginPath(); c.ellipse(R - 0.6 * s, 6.5 * s, 1.5 * s, 0.6 * s, 0, 0, TAU); c.fill();   // lower lip
        c.fillStyle = 'rgba(255,230,215,0.25)'; c.beginPath(); c.ellipse(R - 0.6 * s, 6.3 * s, 0.8 * s, 0.25 * s, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(R + 0.6 * s, 2.9 * s, 1.5 * s, 0.7 * s, 0, 0, TAU); c.fill();           // under the nose
        c.fillStyle = 'rgba(30,10,8,0.6)'; c.beginPath(); c.arc(R + 1 * s, 2.7 * s, 0.42 * s, 0, TAU); c.fill();                            // nostril
        c.fillStyle = 'rgba(255,240,230,0.14)'; c.beginPath(); c.ellipse(R + 1.4 * s, -0.8 * s, 0.6 * s, 2.2 * s, 0.25, 0, TAU); c.fill(); // nose bridge
        c.fillStyle = 'rgba(255,235,220,0.1)'; c.beginPath(); c.ellipse(R * 0.42, 1.8 * s, 2.6 * s, 1.3 * s, -0.2, 0, TAU); c.fill();      // cheekbone
        c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(R * 0.25, 10.2 * s, 5 * s, 1.6 * s, 0.15, 0, TAU); c.fill();           // shadow under the jaw
      }
      // ear
      // ear: rim, inner fold and lobe, set back on the head
      c.fillStyle = shade(skin, -0.08); c.beginPath(); c.moveTo(-1.2 * s, -2.4 * s); c.bezierCurveTo(-4.4 * s, -2.8 * s, -4.6 * s, 2.6 * s, -2.4 * s, 3.4 * s); c.quadraticCurveTo(-0.8 * s, 3.6 * s, -0.9 * s, 2 * s); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(10,8,8,0.45)'; c.lineWidth = 0.45; c.stroke();
      c.strokeStyle = 'rgba(60,25,20,0.45)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(-1.6 * s, -1.4 * s); c.bezierCurveTo(-3.4 * s, -1.6 * s, -3.4 * s, 1.6 * s, -2.1 * s, 2 * s); c.stroke();
      c.fillStyle = 'rgba(255,230,215,0.15)'; c.beginPath(); c.ellipse(-3.3 * s, -0.4 * s, 0.5 * s, 1.4 * s, 0.1, 0, TAU); c.fill();
      // eye
      const ex = R - 3.4 * s, ey = -1.4 * s;
      if (Z) {
        c.fillStyle = look.eyeGlow || '#cdbf8a';
        c.beginPath(); c.ellipse(ex, ey, 1.6 * s, 1.0 * s, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(120,20,10,0.6)'; c.beginPath(); c.arc(ex + 0.6 * s, ey, 0.5 * s, 0, TAU); c.fill();
      } else {
        c.fillStyle = '#e8e2d6'; c.beginPath(); c.ellipse(ex, ey, 1.8 * s, 1.05 * s, 0, 0, TAU); c.fill();
        c.fillStyle = look.eyes || '#3a2a1a'; c.beginPath(); c.arc(ex + 0.8 * s, ey + 0.1 * s, 0.85 * s, 0, TAU); c.fill();
        c.fillStyle = '#000'; c.beginPath(); c.arc(ex + 0.95 * s, ey + 0.1 * s, 0.4 * s, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(ex + 0.65 * s, ey - 0.25 * s, 0.24 * s, 0, TAU); c.fill(); // catchlight
        c.strokeStyle = 'rgba(30,15,10,0.85)'; c.lineWidth = 0.65; c.beginPath(); c.ellipse(ex, ey, 1.8 * s, 1.05 * s, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.5; c.beginPath(); c.ellipse(ex, ey - 0.6 * s, 2 * s, 1.3 * s, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); // lid crease
        c.strokeStyle = 'rgba(0,0,0,0.14)'; c.beginPath(); c.ellipse(ex - 0.2 * s, ey + 1.2 * s, 1.6 * s, 0.6 * s, 0, Math.PI * 0.1, Math.PI * 0.9); c.stroke(); // under-eye
      }
      // brow
      c.strokeStyle = Z ? 'rgba(20,20,15,0.6)' : shade(look.hair || '#2a2018', -0.1); c.lineWidth = 0.9 * s;
      c.beginPath(); c.moveTo(ex - 2 * s, ey - 2.4 * s); c.quadraticCurveTo(ex, ey - 3 * s, ex + 2 * s, ey - 2.2 * s); c.stroke();
      // hair styles
      const hair = look.hair || '#2a2018';
      const hs = look.hairStyle || 'short';
      if (!look.helmet && hs !== 'bald') {
        c.fillStyle = hair;
        c.beginPath();
        if (hs === 'buzz') { c.arc(-1 * s, -2 * s, R + 0.4 * s, Math.PI * 0.95, Math.PI * 1.85); c.quadraticCurveTo(R * 0.3, -6 * s, -6 * s, -2 * s); }
        else if (hs === 'long') { c.arc(-1 * s, -2.5 * s, R + 1 * s, Math.PI * 0.55, Math.PI * 1.85); c.quadraticCurveTo(R * 0.4, -7 * s, 0, -6 * s); c.quadraticCurveTo(-7 * s, -2 * s, -6 * s, 14 * s); c.lineTo(-10 * s, 14 * s); }
        else if (hs === 'ponytail') { c.arc(-1 * s, -2.3 * s, R + 0.8 * s, Math.PI * 0.85, Math.PI * 1.85); c.quadraticCurveTo(R * 0.4, -7 * s, -1 * s, -6 * s); c.quadraticCurveTo(-6 * s, -4 * s, -7 * s, 2 * s); c.moveTo(-9 * s, -3 * s); c.quadraticCurveTo(-16 * s, 2 * s, -13 * s, 10 * s); c.quadraticCurveTo(-11 * s, 3 * s, -8 * s, 0); }
        else if (hs === 'balding') { c.arc(-1 * s, -2 * s, R + 0.5 * s, Math.PI * 0.8, Math.PI * 1.25); c.lineTo(-6 * s, -4 * s); }
        else if (hs === 'wild') { for (let k = 0; k < 10; k++) { const a = Math.PI * (0.75 + k * 0.12); c.moveTo(-1 * s + Math.cos(a) * R * 0.7, -2 * s + Math.sin(a) * R * 0.7); c.lineTo(-1 * s + Math.cos(a + 0.06) * (R + 3.5 * s), -2 * s + Math.sin(a + 0.06) * (R + 3.5 * s)); c.lineTo(-1 * s + Math.cos(a + 0.12) * R * 0.8, -2 * s + Math.sin(a + 0.12) * R * 0.8); } }
        else { c.arc(-1 * s, -2.2 * s, R + 1.1 * s, Math.PI * 0.85, Math.PI * 1.87); c.quadraticCurveTo(R * 0.5, -6.5 * s, 2 * s, -6 * s); c.quadraticCurveTo(-4 * s, -4 * s, -6 * s, 1 * s); }
        c.closePath(); c.fill();
        // strands following the skull, with a soft sheen band
        c.save(); c.clip();
        for (let k = 0; k < 34; k++) {
          const a0 = Math.PI * rng.range(0.7, 1.85), rr = R * rng.range(0.55, 1.12);
          c.strokeStyle = rng() < 0.6 ? rgba(shade(hair, -0.45), 0.55) : rgba(shade(hair, 0.35), 0.4); c.lineWidth = rng.range(0.25, 0.5);
          c.beginPath(); c.arc(-1 * s, -2 * s, rr, a0, a0 + rng.range(0.15, 0.45)); c.stroke();
        }
        c.strokeStyle = rgba(shade(hair, 0.5), 0.22); c.lineWidth = 1.1 * s; c.beginPath(); c.arc(-1 * s, -2 * s, R * 0.82, Math.PI * 1.2, Math.PI * 1.55); c.stroke();
        c.restore();
        c.fillStyle = 'rgba(255,255,255,0.08)'; fabricNoise(c, rng, -R, -R - 2 * s, R * 1.8, R, 120, 0.35);
        if (Z && rng() < 0.6) { c.fillStyle = shade(skin, -0.15); c.beginPath(); c.ellipse(-3 * s, -9 * s, 3 * s, 2 * s, 0, 0, TAU); c.fill(); }
      }
      // hats & helmets
      if (look.hat === 'cap') {
        c.fillStyle = look.hatColor || '#2a3a5a';
        c.beginPath(); c.arc(-1 * s, -3 * s, R + 0.8 * s, Math.PI * 1.0, Math.PI * 1.95); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(R * 0.6, -6.6 * s); c.quadraticCurveTo(R + 6 * s, -7 * s, R + 6 * s, -5 * s); c.lineTo(R * 0.6, -5 * s); c.closePath(); c.fill();
        outline(c, 'rgba(0,0,0,0.7)', 0.6);
      } else if (look.hat === 'beanie') {
        c.fillStyle = look.hatColor || '#4a2a2a';
        c.beginPath(); c.arc(-1 * s, -3 * s, R + 1 * s, Math.PI * 0.95, Math.PI * 2.0); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-R - 1 * s, -5 * s, R * 2 + 2 * s, 1.5 * s);
      } else if (look.hat === 'surgical') {
        c.fillStyle = '#5f8aa0'; c.beginPath(); c.arc(-1 * s, -3 * s, R + 0.9 * s, Math.PI * 0.9, Math.PI * 1.98); c.closePath(); c.fill();
        fabricNoise(c, rng, -R, -R - 3 * s, R * 2, R, 80, 0.3);
      } else if (look.helmet === 'riot') {
        c.fillStyle = '#121418';
        c.beginPath(); c.arc(-1 * s, -2 * s, R + 2.6 * s, Math.PI * 0.62, Math.PI * 2.02); c.lineTo(R + 1.5 * s, 2 * s); c.lineTo(-3 * s, 7 * s); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(-1 * s, -2 * s, R + 1.8 * s, Math.PI * 1.15, Math.PI * 1.55); c.lineWidth = 1.2 * s; c.strokeStyle = 'rgba(255,255,255,0.12)'; c.stroke();
        // visor
        c.fillStyle = 'rgba(90,110,120,0.38)';
        c.beginPath(); c.moveTo(R * 0.2, -6 * s); c.quadraticCurveTo(R + 5 * s, -5 * s, R + 4 * s, 7 * s); c.lineTo(R * 0.3, 8 * s); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(200,220,230,0.5)'; c.lineWidth = 0.5; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(R + 1 * s, -3 * s, 0.8 * s, 6 * s);
      } else if (look.helmet === 'mil') {
        c.fillStyle = look.helmetColor || '#4a4c34';
        c.beginPath(); c.arc(-1 * s, -2.5 * s, R + 2.4 * s, Math.PI * 0.95, Math.PI * 2.03); c.quadraticCurveTo(R + 3 * s, -1 * s, R + 2 * s, -1.5 * s); c.lineTo(-R - 2 * s, -1.5 * s); c.closePath(); c.fill();
        camo(c, rng, -R, -R - 4 * s, R * 2, R, ['#2f3022', '#5d5a3c', '#3b3a28']);
        outline(c, 'rgba(0,0,0,0.8)', 0.6);
        c.strokeStyle = '#1a1a14'; c.lineWidth = 0.7 * s; c.beginPath(); c.moveTo(-3 * s, -1 * s); c.lineTo(R * 0.4, 9 * s); c.stroke();
        c.fillStyle = '#1e1e18'; c.fillRect(-R + 1 * s, -6 * s, 4 * s, 2.5 * s);
      } else if (look.hat === 'hazmat') {
        c.fillStyle = '#c8b030';
        c.beginPath(); c.arc(-1 * s, -1 * s, R + 3.2 * s, 0, TAU); c.fill();
        c.fillStyle = 'rgba(80,110,110,0.45)'; c.beginPath(); c.ellipse(R * 0.5, 0, 5 * s, 7 * s, 0, 0, TAU); c.fill();
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 0.8 * s; c.stroke();
        c.fillStyle = '#222'; c.beginPath(); c.arc(R * 0.4, 8 * s, 2.6 * s, 0, TAU); c.fill();
      }
      if (look.mask) { c.fillStyle = '#cfd6d8'; c.beginPath(); c.moveTo(R * 0.2, 1.5 * s); c.lineTo(R + 2.5 * s, 2 * s); c.lineTo(R + 1 * s, 9 * s); c.lineTo(R * 0.1, 8 * s); c.closePath(); c.fill(); c.strokeStyle = '#8a9497'; c.lineWidth = 0.4; c.stroke(); }
    });
  }

  function paintJaw(d, look) {
    const s = d.s, R = d.headR;
    return bake(R + 10 * s, 14 * s, -4 * s, -2 * s, (c) => {
      c.fillStyle = shade(look.skin, -0.1);
      c.beginPath(); c.moveTo(-2 * s, 0); c.lineTo(R + 0.5 * s, 1 * s); c.quadraticCurveTo(R + 0.3 * s, 5 * s, R - 3 * s, 5.5 * s); c.quadraticCurveTo(0, 5 * s, -2 * s, 0); c.closePath(); c.fill();
      c.fillStyle = '#cfc6a0'; for (let k = 0; k < 5; k++) c.fillRect(1 * s + k * 1.6 * s, -0.4 * s, 1.1 * s, 1.4 * s);
      c.fillStyle = '#8a2a35'; c.beginPath(); c.ellipse(4 * s, 1.5 * s, 4 * s, 1.5 * s, 0, 0, TAU); c.fill();
      c.fillStyle = '#4a0505'; c.fillRect(-2 * s, -0.6 * s, R + 3 * s, 0.9 * s);
    });
  }

  // ------------------------------------------------ weapon grip hands
  // Drawn in the weapon's own frame (x toward the muzzle, origin at the
  // trigger hand) so they wrap the grip and handguard at the right angle.
  //   grip: firing hand around the pistol grip, index finger on the trigger
  //   fore: support hand cradling the handguard from below
  //   cup:  support hand wrapped round the firing hand (two-handed pistol)
  function paintHands(d, look, dark) {
    const s = d.s, k = Math.min(1.2, Math.max(0.85, s)); // hands stay in proportion to the weapon
    const base = look.gloves || look.skin, hc = dark ? shade(base, -0.22) : base, gl = !!look.gloves;
    const line = 'rgba(12,8,6,0.85)';
    const finger = (c, x0, y0, x1, y1, w) => {
      c.strokeStyle = line; c.lineWidth = w + 0.9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = hc; c.lineWidth = w; c.stroke();
      c.strokeStyle = 'rgba(255,240,225,0.2)'; c.lineWidth = w * 0.35; c.beginPath(); c.moveTo(x0, y0 - w * 0.22); c.lineTo(x1, y1 - w * 0.22); c.stroke();
    };
    const shadeFill = (c, y0, y1) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(255,240,225,0.2)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.38)'); c.fillStyle = g; c.fill(); };
    const grip = bake(16 * k, 15 * k, -6.5 * k, -5.5 * k, (c) => {
      c.save(); c.scale(k, k);
      // back of the hand / palm wrapped round the grip
      const palm = () => { c.beginPath(); c.moveTo(-4.4, -3.4); c.quadraticCurveTo(-0.6, -4.4, 2.8, -3.6); c.lineTo(3.4, 0.2); c.quadraticCurveTo(3.4, 4.8, 2.2, 6.6); c.quadraticCurveTo(-0.6, 7.6, -2.8, 6.4); c.quadraticCurveTo(-5.6, 2.2, -4.4, -3.4); c.closePath(); };
      palm(); c.fillStyle = hc; c.fill(); palm(); shadeFill(c, -4, 7); palm(); c.strokeStyle = line; c.lineWidth = 0.6; c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(-3.6, 4.6); c.quadraticCurveTo(-1.2, 2.2, -0.4, -2.6); c.stroke(); // tendon line
      // three fingers curled round the front strap, knuckle to tip
      for (let i = 0; i < 3; i++) { const y = 1.1 + i * 1.95; finger(c, 0.6, y, 3.9, y + 0.35, 1.7); c.fillStyle = 'rgba(255,235,220,0.25)'; c.beginPath(); c.arc(1.1, y - 0.3, 0.45, 0, TAU); c.fill(); }
      if (gl && look.patch) { c.fillStyle = 'rgba(10,10,8,0.7)'; for (let i = 0; i < 3; i++) { c.beginPath(); roundRect(c, 0.2, 0.3 + i * 1.95, 1.4, 1.5, 0.5); c.fill(); } } // knuckle armour
      // index finger laid along the guard onto the trigger
      finger(c, 1.4, -1.3, 5.2, -1.0, 1.55); finger(c, 5.2, -1.0, 6.4, 0.4, 1.4);
      // thumb along the frame
      finger(c, -3.4, -3.3, 1.8, -3.9, 1.7);
      if (!gl) { c.fillStyle = 'rgba(240,220,210,0.6)'; c.beginPath(); c.ellipse(1.6, -4.2, 0.6, 0.35, -0.1, 0, TAU); c.fill(); }
      else { c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.3; c.setLineDash([0.5, 0.45]); c.beginPath(); c.moveTo(-4, -2.2); c.quadraticCurveTo(-1, -3.2, 2.4, -2.6); c.stroke(); c.setLineDash([]); }
      c.restore();
    });
    const fore = bake(14 * k, 14 * k, -6 * k, -7.5 * k, (c) => {
      c.save(); c.scale(k, k);
      // palm under the handguard, fingers curling up its near side
      const palm = () => { c.beginPath(); c.moveTo(-4.4, -0.4); c.quadraticCurveTo(0, -1.2, 4.6, -0.2); c.quadraticCurveTo(5.2, 2.8, 3.2, 4.6); c.quadraticCurveTo(-0.6, 5.6, -4, 4.2); c.quadraticCurveTo(-5.6, 2, -4.4, -0.4); c.closePath(); };
      palm(); c.fillStyle = hc; c.fill(); palm(); shadeFill(c, -1, 5.5); palm(); c.strokeStyle = line; c.lineWidth = 0.6; c.stroke();
      for (let i = 0; i < 4; i++) { const x = -2.9 + i * 1.95; finger(c, x, 1.6, x + 0.5, -4.2 + Math.abs(i - 1.5) * 0.5, 1.6); }
      finger(c, 3.8, 2.2, 5.6, 0.2, 1.6); // thumb tip showing at the front
      c.restore();
    });
    const cup = bake(14 * k, 14 * k, -4 * k, -4 * k, (c) => {
      c.save(); c.scale(k, k);
      // fingers of the support hand wrapped over the firing hand's fingers
      for (let i = 0; i < 4; i++) { const y = 1.4 + i * 1.75; finger(c, 1.6, y - 0.6, 5.4, y + 0.2, 1.6); }
      finger(c, 1.2, -2.6, 6.2, -2.2, 1.5); // support thumb forward along the frame
      c.restore();
    });
    return { grip, fore, cup };
  }

  function get(look, d) {
    const key = JSON.stringify(look) + '|' + d.s + '|' + d.build + '|' + d.limb;
    let set = cache.get(key);
    if (set) return set;
    const rng = makeRng(hashStr(key));
    set = { torso: paintTorso(d, look, rng, false), torsoGut: paintTorso(d, look, makeRng(hashStr(key) + 1), true), head: paintHead(d, look, rng), jaw: paintJaw(d, look) };
    for (const k of ['ua', 'fa', 'th', 'sh']) {
      const r = k === 'fa' ? makeRng(hashStr(key) + 11) : rng;
      set[k] = paintLimb(k, d, look, r); set[k + 'B'] = darkVariant(set[k]);
    }
    // forearm without the hand, for when the grip hands are drawn on the weapon
    if (!look.zombie) { // only survivors hold weapons
      set.faN = paintLimb('fa', d, look, makeRng(hashStr(key) + 11), true); set.faNB = darkVariant(set.faN);
      set.hands = paintHands(d, look, false); set.handsB = paintHands(d, look, true);
    }
    set.torsoB = darkVariant(set.torso);
    cache.set(key, set);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return set;
  }

  return { get, dimsFor, RES, stain };
})();
