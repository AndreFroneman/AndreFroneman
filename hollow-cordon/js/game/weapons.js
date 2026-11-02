'use strict';
// =====================================================================
//  Weapons — definitions, procedural gun sprites, ammo types
//  Gun art coordinates: x toward muzzle, y down, origin = trigger hand.
// =====================================================================

const GCOL = {
  steel: '#2c2f33', steelD: '#1c1e21', steelL: '#4a4f55', poly: '#1f2022', polyL: '#2d2f31',
  wood: '#6a4426', woodD: '#4a2d18', woodL: '#86592f', olive: '#4b4c37', tan: '#8a7b58', chrome: '#9aa0a6',
  brass: '#b08a3a', rubber: '#141414', park: '#3b3e37', red: '#6a1a14', blue: '#2a3346',
};

const AMMO = {
  '9mm': { name: '9mm', box: 34, price: 30, max: 300 },
  '.45': { name: '.45 ACP', box: 24, price: 36, max: 200 },
  '.357': { name: '.357 Mag', box: 18, price: 40, max: 120 },
  '.500': { name: '.500 S&W', box: 10, price: 55, max: 60 },
  '12g': { name: '12 gauge', box: 12, price: 40, max: 96 },
  '5.56': { name: '5.56mm', box: 45, price: 50, max: 360 },
  '7.62': { name: '7.62x39', box: 40, price: 50, max: 300 },
  '.308': { name: '.308 Win', box: 24, price: 60, max: 200 },
  '.338': { name: '.338 Lapua', box: 10, price: 70, max: 60 },
  '.50': { name: '.50 BMG', box: 6, price: 90, max: 30 },
  'belt': { name: '7.62 belt', box: 100, price: 120, max: 600 },
  'grenade': { name: 'Frag grenade', box: 1, price: 120, max: 6 },
};

const SLOT_CATS = { 1: 'melee', 2: 'pistol', 3: 'smg', 4: 'shotgun', 5: 'rifle', 6: 'battle', 7: 'sniper', 8: 'mg' };
const CAT_LABEL = { melee: 'Melee', pistol: 'Pistols & Revolvers', smg: 'SMGs', shotgun: 'Shotguns', rifle: 'Assault Rifles', battle: 'Battle Rifles / DMR', sniper: 'Sniper Rifles', mg: 'Machine Guns' };

// ---------------------------------------------------------------- defs
const WEAPONS = {};
const WEAPON_LIST = [];
function defWeapon(w) {
  const base = {
    pellets: 1, spread: 0.03, aimSpread: 0.012, bloom: 0.012, bloomMax: 0.09, bloomRec: 0.25,
    kick: 0.05, back: 4, shake: 2, recover: 9, rpm: 400, mode: 'semi', mag: 10, reload: 2,
    reloadType: 'mag', shellTime: 0.5, cycleTime: 0, pen: 20, range: 800, falloff: 0.6, force: 160,
    dismember: 1, gib: 1, noise: 1100, weight: 1, price: 0, unlock: 1, hold: 'rifle', shell: 'rifle',
    flash: 1, ammo: '9mm', startReserve: 3, desc: '',
  };
  const d = Object.assign(base, w);
  d.slot = +Object.keys(SLOT_CATS).find((k) => SLOT_CATS[k] === d.cat);
  WEAPONS[d.id] = d; WEAPON_LIST.push(d);
  return d;
}

// ===== MELEE =====
defWeapon({
  id: 'machete', name: 'Cane Machete', cat: 'melee', dmg: 55, reach: 62, swing: 0.2, windup: 0.12, recoverT: 0.22,
  force: 140, dismember: 1.6, blade: true, stamina: 9, hold: 'melee', price: 0, noise: 120, weight: 1,
  desc: 'Long rust-pitted blade. Severs limbs with clean swings.',
  art: { len: 52, parts: [['r', -4, -2, 13, 4, GCOL.woodD, 1.5], ['r', -5, -2.6, 2.5, 5.2, GCOL.steelD], ['p', [7, -2.2, 48, -4.5, 54, -2.5, 50, 1.8, 7, 2], '#6f7377'], ['l', 10, -1.5, 47, -3.6, 0.6, 'rgba(255,255,255,0.35)']], hand: [0, 0] },
});

// ===== PISTOLS =====
defWeapon({
  id: 'p9', name: 'Warden 9', cat: 'pistol', dmg: 30, rpm: 420, mode: 'semi', mag: 15, ammo: '9mm', reload: 1.35,
  spread: 0.028, aimSpread: 0.01, bloom: 0.02, kick: 0.07, back: 3.5, shake: 1.6, pen: 14, range: 700, force: 150,
  hold: 'pistol', shell: 'pistol', flash: 0.7, noise: 1000, price: 0, startReserve: 4, weight: 1,
  desc: 'Polymer service pistol. Reliable, accurate, forgiving.',
  snd: { crack: [2600, 0.007, 0.9], blast: [3400, 0.045, 1], thump: [115, 0.06, 0.8], tail: [1500, 0.25, 0.35], drive: 2.4, len: 0.7, mech: 0.25 },
  art: {
    hand: [2, 3], muzzle: [23.5, -4], eject: [11, -7], len: 24,
    parts: [['p', [-1, -1, 7, -1, 5.5, 12, -3.5, 12], GCOL.poly], ['r', -3.5, 11, 8, 2, GCOL.steelD], ['r', -0.5, -2.5, 21, 3, GCOL.polyL], ['a', 9.5, 1.2, 3.2, GCOL.poly],
      ['r', -2.5, -8, 25, 6, GCOL.steel, 1], ['l', 0, -7, 0, -3.5, 0.5, '#444'], ['l', 1.3, -7, 1.3, -3.5, 0.5, '#444'], ['l', 2.6, -7, 2.6, -3.5, 0.5, '#444'], ['r', 20, -9, 1.8, 1.4, GCOL.steelD], ['r', -1.8, -9, 2.5, 1.4, GCOL.steelD]],
    mag: [['r', -2.5, 10.5, 7.2, 2.4, GCOL.steelD]],
  },
});

// ===== SHOTGUNS =====
defWeapon({
  id: 'parish', name: 'Parish 12 Pump', cat: 'shotgun', dmg: 17, pellets: 9, rpm: 75, mode: 'pump', cycleTime: 0.55, mag: 6, ammo: '12g',
  reloadType: 'shell', shellTime: 0.48, reload: 0.5, spread: 0.075, aimSpread: 0.06, bloom: 0.02, kick: 0.16, back: 9, shake: 7, pen: 6, range: 340, falloff: 0.25,
  force: 95, dismember: 1.4, gib: 1.6, shell: 'shotgun', flash: 1.5, noise: 1500, price: 600, unlock: 1, startReserve: 3, weight: 0.95,
  desc: 'Riot-pattern pump gun. Devastating up close — cycle every shot.',
  snd: { crack: [1800, 0.014, 0.8], blast: [1500, 0.14, 1.4], thump: [58, 0.17, 1.5], tail: [850, 0.65, 0.6], drive: 4, len: 1.3, echo: [0.22, 0.25] },
  art: {
    hand: [0, 3], fore: [31, 0], muzzle: [64, -4.2], eject: [8, -6], len: 64, stock: [-28, 1], pump: [26, 36],
    parts: [['p', [-29, -3, -5, -4, -3, 3, -28, 7], GCOL.wood], ['r', -29.5, -3.5, 2.6, 11, GCOL.rubber], ['p', [-3, -1, 4, -1, 1, 9, -5, 9], GCOL.wood], ['r', -5, -7, 26, 8, GCOL.steel, 1], ['a', 5, 2.4, 3, GCOL.steelD],
      ['r', 20, -6.4, 44, 2.8, GCOL.steelD], ['r', 20, -3.4, 38, 2.6, GCOL.steel], ['r', 58, -3.6, 2, 3, GCOL.steelD], ['r', 62, -7, 1.6, 1.4, '#888']],
    pumpParts: [['r', 0, -4.2, 15, 5, GCOL.woodD, 1.5], ['l', 2, -3.2, 13, -3.2, 0.4, 'rgba(0,0,0,0.6)'], ['l', 2, -1.4, 13, -1.4, 0.4, 'rgba(0,0,0,0.6)'], ['l', 2, 0.4, 13, 0.4, 0.4, 'rgba(0,0,0,0.6)']],
  },
});

// ===== ASSAULT RIFLES =====
defWeapon({
  id: 'kolba', name: 'Kolba-74', cat: 'rifle', dmg: 36, rpm: 620, mode: 'auto', mag: 30, ammo: '7.62', reload: 2.3,
  spread: 0.032, aimSpread: 0.01, bloom: 0.011, bloomMax: 0.08, kick: 0.045, back: 4.5, shake: 2.4, pen: 40, range: 1100, force: 170,
  flash: 1.1, noise: 1400, price: 1400, unlock: 2, startReserve: 2, weight: 0.92,
  desc: 'Stamped-steel 7.62 rifle with a wooden stock. Hits hard, climbs harder.',
  snd: { crack: [3300, 0.01, 1.1], blast: [2300, 0.085, 1.2], thump: [74, 0.1, 1.15], tail: [1050, 0.5, 0.48], drive: 3, len: 1.1, echo: [0.18, 0.2], mech: 0.15 },
  art: {
    hand: [0, 3], fore: [31, -1], muzzle: [66, -4.5], eject: [8, -7.5], len: 66, stock: [-30, 0],
    parts: [['p', [-31, -2.5, -6, -5, -5, 1, -30, 6.5], GCOL.wood], ['r', -31.5, -3, 2.5, 10, GCOL.woodD], ['l', -28, 0, -10, -2, 0.5, 'rgba(0,0,0,0.4)'], ['p', [-2, -1, 4, -1, 1.5, 10, -4.5, 9.5], GCOL.woodD],
      ['r', -6, -7, 31, 7.5, GCOL.steel], ['r', -4, -9.5, 27, 2.8, GCOL.steelL, 1], ['a', 6, 2, 3, GCOL.steelD], ['r', 25, -6.5, 15, 5.5, GCOL.wood, 1.5], ['r', 25, -9.5, 13, 3, GCOL.woodD, 1],
      ['r', 38, -5.5, 24, 2.2, GCOL.steelD], ['r', 39, -9, 18, 1.8, GCOL.steel], ['r', 34, -11.5, 2, 2.5, GCOL.steel], ['r', 57, -9, 2.6, 4, GCOL.steel], ['r', 61, -6.4, 5.5, 3.2, GCOL.steelD], ['r', 12, -9.2, 4, 1, '#888']],
    mag: [['p', [9, 0.5, 16, 0.5, 18, 6, 21, 13, 14, 15.5, 11.5, 8], GCOL.steelD], ['l', 10.5, 3, 18, 10, 0.4, 'rgba(255,255,255,0.15)']],
  },
});

// ---------------------------------------------------------------- art baking
const GunArt = (() => {
  const RES = 2.5;
  const cache = {};
  function drawParts(c, parts) {
    for (const p of parts) {
      const t = p[0];
      c.beginPath();
      if (t === 'r') { if (p[6]) roundRect(c, p[1], p[2], p[3], p[4], p[6]); else c.rect(p[1], p[2], p[3], p[4]); }
      else if (t === 'p') poly(c, p[1]);
      else if (t === 'c') c.arc(p[1], p[2], p[3], 0, TAU);
      else if (t === 'a') { c.lineWidth = 1.1; c.strokeStyle = p[4]; c.arc(p[1], p[2], p[3], 0, Math.PI); c.stroke(); continue; }
      else if (t === 'l') { c.lineWidth = p[5]; c.strokeStyle = p[6]; c.moveTo(p[1], p[2]); c.lineTo(p[3], p[4]); c.stroke(); continue; }
      const col = t === 'r' ? p[5] : t === 'p' ? p[2] : p[4];
      c.fillStyle = col; c.fill();
      // shading: top highlight, bottom shadow
      const bb = partBounds(p);
      const g = c.createLinearGradient(0, bb[1], 0, bb[3]);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.35, 'rgba(255,255,255,0.03)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 0.55; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.stroke();
    }
  }
  function partBounds(p) {
    if (p[0] === 'r') return [p[1], p[2], p[1] + p[3], p[2] + p[4]];
    if (p[0] === 'c') return [p[1] - p[3], p[2] - p[3], p[1] + p[3], p[2] + p[3]];
    const pts = p[1]; let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    return [x0, y0, x1, y1];
  }
  function bounds(parts) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of parts) {
      let q;
      if (p[0] === 'l') q = [Math.min(p[1], p[3]), Math.min(p[2], p[4]), Math.max(p[1], p[3]), Math.max(p[2], p[4])];
      else if (p[0] === 'a') q = [p[1] - p[3], p[2] - p[3], p[1] + p[3], p[2] + p[3]];
      else q = partBounds(p);
      b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
    }
    return b;
  }
  function bakeParts(parts, hand) {
    const b = bounds(parts);
    const pad = 2;
    const ox = b[0] - hand[0] - pad, oy = b[1] - hand[1] - pad, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    const cv = makeCanvas(w * RES, h * RES), c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(-ox - hand[0], -oy - hand[1]);
    c.lineJoin = 'round';
    drawParts(c, parts);
    return { cv, ox, oy, w, h };
  }
  function get(def) {
    if (cache[def.id]) return cache[def.id];
    const a = def.art;
    const out = { body: bakeParts(a.parts, a.hand) };
    if (a.mag) out.mag = bakeParts(a.mag, a.hand);
    if (a.pumpParts) out.pump = bakeParts(a.pumpParts, [0, 0]);
    // offsets relative to hand
    const rel = (p) => (p ? [p[0] - a.hand[0], p[1] - a.hand[1]] : null);
    out.muzzle = rel(a.muzzle) || [a.len || 20, -2];
    out.fore = rel(a.fore);
    out.eject = rel(a.eject) || [6, -5];
    out.stock = rel(a.stock);
    out.pumpPos = a.pump ? [a.pump[0] - a.hand[0], -a.hand[1]] : null;
    out.pumpTravel = a.pump ? a.pump[1] - a.pump[0] : 0;
    // icon for HUD (silhouette)
    const ic = makeCanvas(out.body.cv.width, out.body.cv.height), icc = ic.getContext('2d');
    icc.drawImage(out.body.cv, 0, 0);
    if (out.mag) icc.drawImage(out.mag.cv, (out.mag.ox - out.body.ox) * RES, (out.mag.oy - out.body.oy) * RES);
    if (out.pump) icc.drawImage(out.pump.cv, (out.pumpPos[0] + out.pump.ox - out.body.ox) * RES, (out.pumpPos[1] + out.pump.oy - out.body.oy) * RES);
    icc.globalCompositeOperation = 'source-atop'; icc.fillStyle = 'rgba(210,205,190,0.92)'; icc.fillRect(0, 0, ic.width, ic.height);
    out.icon = ic;
    out.full = makeCanvas(out.body.cv.width, out.body.cv.height);
    const fc = out.full.getContext('2d');
    fc.drawImage(out.body.cv, 0, 0);
    if (out.mag) fc.drawImage(out.mag.cv, (out.mag.ox - out.body.ox) * RES, (out.mag.oy - out.body.oy) * RES);
    if (out.pump) fc.drawImage(out.pump.cv, (out.pumpPos[0] + out.pump.ox - out.body.ox) * RES, (out.pumpPos[1] + out.pump.oy - out.body.oy) * RES);
    cache[def.id] = out;
    return out;
  }
  return { get, RES };
})();

// Generate gunshot sounds for all firearms
function genWeaponSounds() {
  for (const w of WEAPON_LIST) if (w.snd) Sfx.genGun('gun_' + w.id, w.snd);
}

// runtime state for a carried weapon
class GunState {
  constructor(def) {
    this.def = def;
    this.mag = def.mag || 0;
    this.cool = 0;
    this.cycle = 0;        // pump / bolt action timer
    this.cycleEjected = false;
    this.reloading = false;
    this.rt = 0;           // reload elapsed
    this.reloadPhase = 0;
    this.shellsQueued = 0;
    this.bloom = 0;
    this.chamberEmpty = false;
    this.burstLeft = 0;
  }
}
