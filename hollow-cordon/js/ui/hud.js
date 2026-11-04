'use strict';
// =====================================================================
//  HUD — canvas-drawn health/armour/stamina, weapon & ammo, slot bar,
//  mode info, banners, toasts, interaction prompts and the dynamic
//  crosshair (spread, reload progress, hit markers).
// =====================================================================

class HUD {
  constructor(game) {
    this.game = game;
    this.bannerT = 0; this.bannerTitle = ''; this.bannerSub = '';
    this.toasts = [];
    this.slotsT = 0;
    this.hitT = 0;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
  }
  banner(t, s) { this.bannerTitle = t; this.bannerSub = s || ''; this.bannerT = 4.5; }
  toast(m) { if (this.toasts.length && this.toasts[this.toasts.length - 1].m === m) { this.toasts[this.toasts.length - 1].t = 2.2; return; } this.toasts.push({ m, t: 2.2 }); if (this.toasts.length > 4) this.toasts.shift(); }
  showSlots() { this.slotsT = 2; }
  hit() { this.hitT = 0.15; }
  update(dt) {
    this.bannerT -= dt; this.slotsT -= dt; this.hitT -= dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
  }
  draw(ctx) {
    const g = this.game, p = g.player;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const s = ch / 720;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textBaseline = 'alphabetic';
    const F = (sz, w = 'bold') => `${w} ${Math.round(sz * s)}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
    const txt = (t, x, y, col = '#e6dcc4', sz = 14, align = 'left', w = 'bold') => {
      ctx.font = F(sz, w); ctx.textAlign = align;
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(t, x + 1.5 * s, y + 1.5 * s);
      ctx.fillStyle = col; ctx.fillText(t, x, y);
    };
    // ------------------------------------------------- mode info
    const info = g.mode.hudInfo ? g.mode.hudInfo() : null;
    if (info) {
      let y = 30 * s;
      for (const [k, v] of info.left || []) { txt(k, 22 * s, y, '#8a8270', 11); txt(String(v), 22 * s, y + 20 * s, '#efe4c8', 20); y += 46 * s; }
      if (info.center) txt(info.center, cw / 2, 34 * s, '#e8dcc0', 18);
      if (info.centerSub) txt(info.centerSub, cw / 2, 54 * s, '#9a927e', 12, 'center', 'normal');
      if (info.combo) txt(info.combo, cw / 2, 82 * s, '#e8a050', 22, 'center');
    }
    if (Settings.data.showFps) txt(this.fps + ' FPS', cw - 16 * s, 24 * s, '#8a8a80', 12, 'right');
    if (p) {
      // ------------------------------------------------- vitals
      const bx = 22 * s, by = ch - 62 * s, bw = 230 * s, bh = 14 * s;
      const bar = (y, frac, col, h = bh, back = 'rgba(0,0,0,0.55)') => {
        ctx.fillStyle = back; ctx.fillRect(bx, y, bw, h);
        ctx.fillStyle = col; ctx.fillRect(bx + 2 * s, y + 2 * s, Math.max(0, (bw - 4 * s) * clamp(frac, 0, 1)), h - 4 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx + 2 * s, y + 2 * s, Math.max(0, (bw - 4 * s) * clamp(frac, 0, 1)), (h - 4 * s) * 0.4);
      };
      const hpCol = p.hp > 50 ? '#9a2a22' : p.hp > 25 ? '#b8361e' : (Math.sin(g.time * 10) > 0 ? '#e0401e' : '#8a1a10');
      bar(by, p.hp / p.maxHp, hpCol);
      txt('+', bx - 14 * s, by + 12 * s, '#c84a3a', 16);
      txt(Math.ceil(Math.max(0, p.hp)) + '', bx + bw + 8 * s, by + 12 * s, '#efe4c8', 15);
      if (p.armor > 0) { bar(by - 12 * s, p.armor / 100, '#3a5a8a', 9 * s); }
      bar(by + 18 * s, p.stamina / 100, '#8a7a3a', 6 * s);
      let ix = bx;
      const item = (label, n, col) => { txt(label + ' ' + n, ix, by + 44 * s, n > 0 ? col : '#5a564a', 12); ix += 74 * s; };
      item('MED[' + Input.label('medkit') + ']', p.medkits, '#d89090');
      item('PLANK', p.planksFree ? '∞' : p.planks, '#c8a070');
      item('GREN[' + Input.label('grenade') + ']', p.grenades, '#b8c090');
      if (g.mode.blackout) {
        // flashlight battery: drains while the light is on, flashes when nearly flat
        const bw2 = 90 * s, bh2 = 9 * s, bx2 = ix + 6 * s, by2 = by + 36 * s, b = (p.battery || 0) / 100;
        const low = b < 0.25, col = b < 0.08 ? '#d04020' : low ? '#d8a030' : '#c8d070';
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx2, by2, bw2, bh2);
        if (!(low && Math.sin(g.time * 10) < 0 && p.flashlight)) { ctx.fillStyle = col; ctx.fillRect(bx2 + 1, by2 + 1, (bw2 - 2) * b, bh2 - 2); }
        ctx.fillStyle = 'rgba(200,200,190,0.6)'; ctx.fillRect(bx2 + bw2, by2 + 2.5 * s, 3 * s, bh2 - 5 * s);
        txt((p.flashlight ? 'LIGHT ' : 'light ') + '[' + Input.label('flashlight') + '] ' + Math.ceil(b * 100) + '%', bx2 + bw2 + 8 * s, by2 + 8 * s, p.flashlight ? col : '#6a6a5a', 11);
      }
      // ------------------------------------------------- weapon
      const gun = p.gun;
      if (gun) {
        const def = gun.def, gs = GunArt.get(def);
        const rx = cw - 24 * s;
        const iw = Math.min(150 * s, gs.icon.width / GunArt.RES * 1.9 * s), ih = iw * gs.icon.height / gs.icon.width;
        ctx.globalAlpha = 0.9; ctx.drawImage(gs.icon, rx - iw, ch - 110 * s - ih / 2, iw, ih); ctx.globalAlpha = 1;
        txt(def.name.toUpperCase(), rx, ch - 76 * s, '#cfc4a8', 13, 'right');
        const tags = Object.values(def.att || {}).filter(Boolean).concat(gun.base.integral || []).map((k) => ({ suppressor: 'SUPP', light: 'LIGHT', laser: 'LASER', reddot: 'RED DOT', scope: '4×', extmag: 'EXT MAG', grip: 'GRIP' }[k]));
        if (tags.length) { ctx.font = F(13); const nw = ctx.measureText(def.name.toUpperCase()).width; txt(tags.join(' · ') + '  |', rx - nw - 8 * s, ch - 76 * s, '#8a9a7a', 10, 'right'); }
        if (def.cat !== 'melee') {
          const res = p.infAmmo ? '∞' : (p.reserve[def.ammo] || 0);
          ctx.font = F(34); const rw = ctx.measureText(String(res)).width;
          txt(String(gun.mag), rx - 34 * s - rw * 0.55, ch - 22 * s, gun.mag === 0 ? '#e0502a' : gun.mag <= def.mag * 0.25 ? '#e8a040' : '#f2e8d0', 34, 'right');
          txt('/ ' + res, rx, ch - 24 * s, '#8a8270', 18, 'right');
          txt(AMMO[def.ammo].name + '  ·  ' + def.mode.toUpperCase(), rx, ch - 61 * s, '#7a7466', 10, 'right', 'normal');
          if (gun.reloading) {
            const fr = def.reloadType === 'shell' ? gun.mag / def.mag : gun.rt;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(rx - 150 * s, ch - 16 * s, 150 * s, 5 * s);
            ctx.fillStyle = '#c8b070'; ctx.fillRect(rx - 150 * s, ch - 16 * s, 150 * s * clamp(fr, 0, 1), 5 * s);
          }
        } else txt('MELEE', rx, ch - 26 * s, '#8a8270', 18, 'right');
      }
      // ------------------------------------------------- slot bar
      if (this.slotsT > 0 && p.weapons.length) {
        ctx.globalAlpha = Math.min(1, this.slotsT * 2);
        const slots = [1, 2, 3, 4, 5, 6, 7, 8].filter((n) => p.weapons.some((w) => w.def.slot === n));
        const sw = 104 * s, sx0 = cw / 2 - slots.length * sw / 2, sy = ch - 150 * s;
        slots.forEach((n, i) => {
          const list = p.weapons.filter((w) => w.def.slot === n);
          const curIn = list.indexOf(p.gun);
          const w = curIn >= 0 ? list[curIn] : list[0];
          const x = sx0 + i * sw, sel = curIn >= 0;
          ctx.fillStyle = sel ? 'rgba(200,170,110,0.25)' : 'rgba(0,0,0,0.5)'; ctx.fillRect(x + 3 * s, sy, sw - 6 * s, 56 * s);
          ctx.strokeStyle = sel ? '#c8a870' : 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(x + 3 * s, sy, sw - 6 * s, 56 * s);
          const ic = GunArt.get(w.def).icon, maxW = sw - 26 * s, ih = Math.min(24 * s, maxW * ic.height / ic.width);
          ctx.globalAlpha *= sel ? 1 : 0.6;
          ctx.drawImage(ic, x + sw / 2 - ih * ic.width / ic.height / 2, sy + 8 * s, ih * ic.width / ic.height, ih);
          ctx.globalAlpha = Math.min(1, this.slotsT * 2);
          txt(String(n), x + 8 * s, sy + 14 * s, '#c8a870', 11);
          if (list.length > 1) txt((Math.max(0, curIn) + 1) + '/' + list.length, x + sw - 8 * s, sy + 14 * s, '#8a8270', 9, 'right');
          txt(w.def.name, x + sw / 2, sy + 50 * s, sel ? '#efe4c8' : '#8a8270', 10, 'center', 'normal');
        });
        ctx.globalAlpha = 1;
      }
      // ------------------------------------------------- prompt
      if (p.interactTarget && !p.dead) {
        const [sx, sy] = g.worldToScreen(p.x, p.y - p.h - 26);
        const k = Input.label('interact');
        ctx.font = F(12); const tw = ctx.measureText(`[${k}] ${p.interactTarget.label}`).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - tw / 2 - 8 * s, sy - 15 * s, tw + 16 * s, 21 * s);
        txt(`[${k}] ${p.interactTarget.label}`, sx, sy, '#efe0b8', 12, 'center');
      }
      // ------------------------------------------------- pinned
      if (p.pinnedBy && !p.dead) {
        const k = Input.label('melee');
        const y = ch * 0.62;
        txt('PINNED!  MASH [' + k + '] TO BREAK FREE', cw / 2, y, Math.sin(g.time * 14) > 0 ? '#ff7050' : '#efe4c8', 20, 'center', '900');
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(cw / 2 - 120 * s, y + 10 * s, 240 * s, 8 * s);
        ctx.fillStyle = '#e8a050'; ctx.fillRect(cw / 2 - 118 * s, y + 12 * s, 236 * s * clamp(p.pinBreak || 0, 0, 1), 4 * s);
      }
      if (g.mode.drawScreen) g.mode.drawScreen(ctx, s);
      // ------------------------------------------------- crosshair
      if (!p.dead && !UI.anyOverlay()) this.crosshair(ctx, p, s);
    }
    // ------------------------------------------------- banner & toasts
    if (this.bannerT > 0) {
      const a = Math.min(1, this.bannerT, (4.5 - this.bannerT) * 3);
      ctx.globalAlpha = a;
      const y = ch * 0.3;
      const gr = ctx.createLinearGradient(0, y - 50 * s, 0, y + 40 * s);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, y - 50 * s, cw, 90 * s);
      txt(this.bannerTitle, cw / 2, y, '#e8d8b8', 42, 'center', '900');
      if (this.bannerSub) txt(this.bannerSub, cw / 2, y + 28 * s, '#a89c84', 14, 'center', 'normal');
      ctx.globalAlpha = 1;
    }
    let ty = ch - 120 * s;
    for (const t of this.toasts) { ctx.globalAlpha = Math.min(1, t.t * 2); txt(t.m, cw / 2, ty, '#e8c890', 14, 'center'); ty -= 22 * s; }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  crosshair(ctx, p, s) {
    const g = p.gun, mx = Input.mx, my = Input.my;
    const v = this.game.view;
    let gap = 6 * s;
    if (g && g.def.cat !== 'melee') {
      const def = g.def;
      let spread = Input.act('aim') ? def.aimSpread : def.spread;
      spread *= 1 + Math.min(1.2, Math.abs(p.vx) / 160) * 0.7;
      if (!p.grounded) spread *= 1.8;
      spread += g.bloom + p.kick * 0.3;
      const d = dist(p.x, p.y - 80, p.mx, p.my);
      gap = Math.max(5 * s, Math.tan(spread) * d * v.scale + 4 * s);
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3.5 * s;
    const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const L = 8 * s;
    const draw = () => { seg(mx - gap - L, my, mx - gap, my); seg(mx + gap, my, mx + gap + L, my); seg(mx, my - gap - L, mx, my - gap); seg(mx, my + gap, mx, my + gap + L); };
    draw();
    ctx.strokeStyle = this.hitT > 0 ? '#ff6040' : 'rgba(235,225,200,0.9)'; ctx.lineWidth = 1.5 * s; draw();
    ctx.fillStyle = 'rgba(235,225,200,0.9)'; ctx.fillRect(mx - 1 * s, my - 1 * s, 2 * s, 2 * s);
    if (g && g.reloading) {
      const fr = g.def.reloadType === 'shell' ? g.mag / g.def.mag : g.rt;
      ctx.strokeStyle = 'rgba(200,176,112,0.9)'; ctx.lineWidth = 2.5 * s;
      ctx.beginPath(); ctx.arc(mx, my, gap + L + 6 * s, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(fr, 0, 1)); ctx.stroke();
    } else if (g && g.def.cat !== 'melee' && g.mag === 0) {
      ctx.font = `bold ${Math.round(11 * s)}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = '#e0502a'; ctx.fillText('RELOAD [' + Input.label('reload') + ']', mx, my + gap + L + 18 * s);
    }
    ctx.restore();
  }
}
