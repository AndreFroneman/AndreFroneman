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

// ===== MORE MELEE =====
defWeapon({
  id: 'bat', name: 'Nailed Bat', cat: 'melee', dmg: 46, reach: 60, swing: 0.16, windup: 0.12, recoverT: 0.2, force: 320, dismember: 0.5, blade: false, stamina: 8, hold: 'melee', price: 200, noise: 120,
  desc: 'Ash bat studded with roofing nails. Fast, staggering hits.',
  art: { hand: [0, 0], len: 54, parts: [['p', [-6, -1.7, 40, -3.6, 53, -4, 53, 4, 40, 3.6, -6, 1.7], GCOL.woodL], ['r', -6, -2.1, 11, 4.2, '#1e1e1e', 1], ['l', 36, -3.5, 36, -7, 0.7, '#9aa0a6'], ['l', 42, -3.8, 43, -7.5, 0.7, '#9aa0a6'], ['l', 47, 3.8, 48, 7.5, 0.7, '#9aa0a6'], ['l', 40, 3.6, 39, 7, 0.7, '#9aa0a6'], ['l', 50, -4, 51, -7.5, 0.7, '#9aa0a6']] },
});
defWeapon({
  id: 'axe', name: 'Fire Axe', cat: 'melee', dmg: 95, reach: 72, swing: 0.22, windup: 0.26, recoverT: 0.36, force: 280, dismember: 2.4, blade: true, heavy: true, stamina: 16, hold: 'melee', price: 500, unlock: 2, noise: 140, weight: 0.95,
  desc: 'Red-headed station axe. Takes limbs — and heads — clean off.',
  art: { hand: [0, 0], len: 62, parts: [['r', -6, -1.7, 60, 3.4, GCOL.woodL, 1.2], ['p', [44, -2, 51, -13, 57, -13, 57, 11, 51, 11, 45, 2], '#8a1a14'], ['p', [56, -14, 61, -14, 61, 12, 56, 12], '#a8aeb4'], ['p', [44, -1, 37, -7, 39, -1], '#8a1a14'], ['l', 58, -12, 58, 10, 0.5, 'rgba(255,255,255,0.5)']] },
});
defWeapon({
  id: 'sledge', name: 'Sledgehammer', cat: 'melee', dmg: 120, reach: 72, swing: 0.26, windup: 0.34, recoverT: 0.44, force: 680, dismember: 0.6, gib: 2, blade: false, heavy: true, stamina: 20, hold: 'melee', price: 700, unlock: 3, noise: 160, weight: 0.9,
  desc: 'Ten-pound demolition hammer. Crushes skulls, flattens anything that stands up.',
  art: { hand: [0, 0], len: 64, parts: [['r', -6, -1.8, 58, 3.6, GCOL.woodD, 1.2], ['r', 50, -10, 13, 20, GCOL.steelD, 1.5], ['r', 51, -9, 11, 2, 'rgba(255,255,255,0.2)']] },
});

// ===== MORE PISTOLS =====
defWeapon({
  id: 'keeper', name: 'Keeper .45', cat: 'pistol', dmg: 42, rpm: 330, mode: 'semi', mag: 8, ammo: '.45', reload: 1.5,
  spread: 0.03, aimSpread: 0.011, bloom: 0.024, kick: 0.1, back: 4.5, shake: 2.2, pen: 13, range: 650, force: 210,
  hold: 'pistol', shell: 'pistol', flash: 0.85, noise: 1100, price: 450, unlock: 1, startReserve: 3,
  desc: 'Single-stack steel .45 with walnut grips. Eight heavy rounds.',
  snd: { crack: [2200, 0.008, 0.9], blast: [2600, 0.06, 1.1], thump: [90, 0.085, 1], tail: [1300, 0.3, 0.4], drive: 2.6, len: 0.8, mech: 0.25 },
  art: {
    hand: [2, 3], muzzle: [23.5, -5.2], eject: [11, -8], len: 24,
    parts: [['p', [-1, -1, 7, -1, 5, 12, -4, 12], GCOL.woodD], ['l', 0, 2, 3, 10, 0.5, 'rgba(0,0,0,0.4)'], ['r', -1, -2.5, 20, 3, GCOL.steel], ['a', 9.5, 1.2, 3.2, GCOL.steel], ['r', -3, -8.5, 26, 6, GCOL.steelL, 0.8], ['l', -1, -7.5, -1, -3.5, 0.5, '#333'], ['l', 0.4, -7.5, 0.4, -3.5, 0.5, '#333'], ['r', -4.5, -9.5, 2.5, 3, GCOL.steelD], ['r', 21, -9.8, 1.8, 1.4, GCOL.steelD]],
    mag: [['r', -3, 11, 7.5, 2.2, GCOL.steelD]],
  },
});
defWeapon({
  id: 'magistrate', name: 'Magistrate .357', cat: 'pistol', dmg: 70, rpm: 200, mode: 'semi', mag: 6, ammo: '.357', reload: 2.5, reloadType: 'cyl',
  spread: 0.022, aimSpread: 0.006, bloom: 0.03, kick: 0.17, back: 6, shake: 4, pen: 26, range: 900, force: 300, gib: 1.3, dismember: 1.3,
  hold: 'pistol', shell: 'pistol', flash: 1.2, noise: 1500, price: 900, unlock: 2, startReserve: 3,
  desc: 'Six-shot service revolver. Slow to reload, devastating per shot.',
  snd: { crack: [3000, 0.01, 1.1], blast: [2700, 0.09, 1.25], thump: [80, 0.12, 1.15], tail: [1100, 0.5, 0.5], drive: 3, len: 1.1, ring: 2400 },
  art: {
    hand: [1, 3], muzzle: [28, -5.3], eject: [6, -4], len: 28,
    parts: [['p', [-2, 0, 5, 0, 4, 12, -5, 11], GCOL.wood], ['p', [-3, -7, 11, -7, 12, -1, 5, 2, -1, 0], GCOL.steel], ['a', 6.5, 1.5, 3, GCOL.steel], ['r', 2, -7.8, 10, 6.6, GCOL.steelL, 1.5], ['l', 2.5, -5.5, 11.5, -5.5, 0.5, 'rgba(0,0,0,0.5)'], ['l', 2.5, -3, 11.5, -3, 0.5, 'rgba(0,0,0,0.5)'],
      ['r', 11, -7.2, 17, 3.8, GCOL.steel], ['r', 12, -3.6, 11, 1.4, GCOL.steelD], ['r', 26, -8.6, 1.6, 1.6, GCOL.steelD], ['p', [-4, -7, -2, -10.5, 0, -7], GCOL.steelD]],
  },
});
defWeapon({
  id: 'bastion', name: 'Bastion .500', cat: 'pistol', dmg: 145, rpm: 120, mode: 'semi', mag: 5, ammo: '.500', reload: 3, reloadType: 'cyl',
  spread: 0.025, aimSpread: 0.006, bloom: 0.05, kick: 0.33, back: 10, shake: 9, pen: 48, range: 1000, force: 540, gib: 2, dismember: 1.8,
  hold: 'pistol', shell: 'pistol', flash: 1.9, noise: 2000, price: 1800, unlock: 5, startReserve: 3, weight: 0.97,
  desc: 'Five-shot hunting hand-cannon with a ported barrel. Punches through two bodies.',
  snd: { crack: [3200, 0.012, 1.2], blast: [2000, 0.13, 1.4], thump: [60, 0.17, 1.5], tail: [800, 0.8, 0.6], drive: 4, len: 1.5, ring: 1800, echo: [0.25, 0.25] },
  art: {
    hand: [1, 3], muzzle: [37, -5.8], eject: [6, -4], len: 37,
    parts: [['p', [-2, 0, 6, 0, 5, 13, -5, 12], '#1c1c1c'], ['p', [-3, -8, 12, -8, 13, -1, 6, 2, -1, 0], GCOL.chrome], ['a', 7, 1.6, 3.2, GCOL.steelL], ['r', 2, -8.8, 11, 7.6, '#b8bcc0', 1.5], ['l', 2.5, -6, 12.5, -6, 0.5, 'rgba(0,0,0,0.5)'], ['l', 2.5, -3, 12.5, -3, 0.5, 'rgba(0,0,0,0.5)'],
      ['r', 12, -8.4, 25, 5, GCOL.chrome], ['r', 12, -3.4, 18, 1.6, GCOL.steelL], ['r', 31, -8.6, 6, 5.4, GCOL.steelD], ['l', 32, -8, 32, -3.5, 0.6, '#000'], ['l', 34, -8, 34, -3.5, 0.6, '#000'], ['r', 15, -10.2, 18, 1.6, GCOL.steelD], ['p', [-4, -8, -2, -11.5, 0, -8], GCOL.steelD]],
  },
});

// ===== SMGs =====
defWeapon({
  id: 'vex', name: 'Vex-9 SMG', cat: 'smg', dmg: 24, rpm: 800, mode: 'auto', mag: 30, ammo: '9mm', reload: 2,
  spread: 0.035, aimSpread: 0.014, bloom: 0.008, bloomMax: 0.07, kick: 0.03, back: 2.5, shake: 1.3, pen: 14, range: 600, force: 110,
  flash: 0.8, noise: 1000, price: 900, unlock: 1, startReserve: 3, weight: 0.98,
  desc: 'Roller-delayed police SMG. Controllable and hungry for 9mm.',
  snd: { crack: [3000, 0.006, 0.8], blast: [3800, 0.035, 0.9], thump: [125, 0.05, 0.65], tail: [1700, 0.2, 0.28], drive: 2.2, len: 0.6, mech: 0.15 },
  art: {
    hand: [1, 3], fore: [30, -1], muzzle: [46, -5], eject: [10, -8.5], stock: [-26, -1], len: 46,
    parts: [['r', -24, -5, 18, 2, GCOL.steelD], ['r', -26, -6.5, 3, 9, GCOL.poly], ['r', -6, -8, 30, 7, GCOL.poly, 1], ['r', -4, -10.5, 26, 2.8, GCOL.steel], ['p', [-1, -1, 5, -1, 3.5, 10, -3.5, 10], GCOL.poly], ['a', 7, 1.5, 3, GCOL.poly],
      ['r', 24, -7.5, 14, 6, GCOL.polyL, 2], ['r', 38, -6, 8, 2.2, GCOL.steel], ['r', 35.5, -12.5, 3, 4.5, GCOL.steel], ['r', -5, -12.5, 3, 2.5, GCOL.steel], ['r', 18, -11, 5, 1.5, GCOL.steelD]],
    mag: [['p', [8, -1, 13, -1, 15, 6, 17, 13, 12, 14, 10, 6], GCOL.steelD]],
  },
});
defWeapon({
  id: 'ratchet', name: 'Ratchet .45', cat: 'smg', dmg: 28, rpm: 950, mode: 'auto', mag: 25, ammo: '.45', reload: 1.8,
  spread: 0.06, aimSpread: 0.035, bloom: 0.012, bloomMax: 0.1, kick: 0.05, back: 2.5, shake: 1.6, pen: 12, range: 420, force: 120,
  hold: 'pistol', shell: 'pistol', flash: 0.8, noise: 1100, price: 700, unlock: 1, startReserve: 3,
  desc: 'Stamped-steel machine pistol. Sprays a brutal wall of .45 up close.',
  snd: { crack: [2600, 0.006, 0.8], blast: [3000, 0.04, 1], thump: [105, 0.06, 0.8], tail: [1500, 0.22, 0.3], drive: 2.4, len: 0.6 },
  art: {
    hand: [4, 3], muzzle: [26, -5], eject: [12, -8.5], len: 26,
    parts: [['r', -10, -7, 7, 3, GCOL.steelD], ['r', -4, -8.5, 25, 8, GCOL.steel, 1], ['p', [2, -1, 8, -1, 7, 12, 1, 12], GCOL.poly], ['a', 11, 1.3, 3, GCOL.steel], ['r', 21, -6.2, 6, 2.2, GCOL.steelD], ['r', 8, -10.5, 4, 2, GCOL.steelD], ['l', -2, -6, 18, -6, 0.5, 'rgba(255,255,255,0.15)']],
    mag: [['r', 2.2, 11, 5.6, 9, GCOL.steelD]],
  },
});
defWeapon({
  id: 'kestrel', name: 'Kestrel PDW', cat: 'smg', dmg: 22, rpm: 900, mode: 'auto', mag: 50, ammo: '9mm', reload: 2.6,
  spread: 0.03, aimSpread: 0.012, bloom: 0.006, bloomMax: 0.06, kick: 0.025, back: 2, shake: 1.2, pen: 18, range: 650, force: 100,
  flash: 0.7, noise: 1000, price: 1500, unlock: 4, startReserve: 2, weight: 0.98,
  desc: 'Bullpup personal defence weapon with a 50-round top-mounted magazine.',
  snd: { crack: [3300, 0.006, 0.8], blast: [4000, 0.03, 0.85], thump: [135, 0.045, 0.6], tail: [1900, 0.18, 0.25], drive: 2.1, len: 0.55 },
  art: {
    hand: [1, 3], fore: [14, 1], muzzle: [28, -5], eject: [-14, 2], stock: [-22, -2], len: 28,
    parts: [['p', [-22, -9, 18, -9, 22, -3, 20, 4, 6, 4, 4, 10, -2, 10, -2, 3, -20, 3, -22, -3], '#3a3d33'], ['r', -4, -15, 10, 3, GCOL.poly], ['r', 22, -6.2, 6, 2, GCOL.steelD], ['l', -18, -2, 14, -2, 0.5, 'rgba(0,0,0,0.4)']],
    mag: [['r', -16, -12.5, 30, 3.5, '#6a7466', 1]],
  },
});

// ===== MORE SHOTGUNS =====
defWeapon({
  id: 'breaker', name: 'Breaker Double', cat: 'shotgun', dmg: 20, pellets: 10, rpm: 420, mode: 'semi', mag: 2, ammo: '12g', reload: 1.9, reloadType: 'break',
  spread: 0.09, aimSpread: 0.07, bloom: 0.02, kick: 0.2, back: 10, shake: 8, pen: 6, range: 300, falloff: 0.2, force: 105, dismember: 1.6, gib: 1.8,
  shell: 'shotgun', flash: 1.7, noise: 1600, price: 400, unlock: 1, startReserve: 3, weight: 0.97,
  desc: 'Side-by-side farm gun. Two barrels, one terrible decision for anything in front of it.',
  snd: { crack: [1700, 0.016, 0.8], blast: [1400, 0.16, 1.5], thump: [52, 0.19, 1.6], tail: [800, 0.7, 0.6], drive: 4.2, len: 1.3, echo: [0.24, 0.25] },
  art: {
    hand: [-2, 3], fore: [18, 0], muzzle: [54, -5], eject: [4, -4], stock: [-30, 1], len: 54,
    parts: [['p', [-30, -2, -6, -4, -4, 2, -28, 8], GCOL.wood], ['r', -30.5, -2.5, 2.5, 11, GCOL.woodD], ['p', [-4, -1, 2, -1, 0, 8, -6, 8], GCOL.wood], ['r', -6, -7.5, 12, 8, GCOL.steelL, 1], ['a', 1, 1.6, 2.8, GCOL.steel],
      ['r', 6, -7.8, 48, 2.6, GCOL.steel], ['r', 6, -5.1, 48, 2.6, GCOL.steelD], ['r', 10, -3, 18, 4.4, GCOL.wood, 1.5], ['c', 53, -8.2, 0.8, '#ddd']],
  },
});
defWeapon({
  id: 'thresher', name: 'Thresher Semi-12', cat: 'shotgun', dmg: 15, pellets: 8, rpm: 220, mode: 'semi', mag: 8, ammo: '12g', reloadType: 'shell', shellTime: 0.42,
  spread: 0.08, aimSpread: 0.065, bloom: 0.02, kick: 0.14, back: 7, shake: 6, pen: 6, range: 320, falloff: 0.25, force: 85, dismember: 1.3, gib: 1.4,
  shell: 'shotgun', flash: 1.4, noise: 1500, price: 1600, unlock: 4, startReserve: 3, weight: 0.94,
  desc: 'Gas-operated tactical shotgun. As fast as you can pull the trigger.',
  snd: { crack: [1900, 0.013, 0.8], blast: [1600, 0.13, 1.35], thump: [60, 0.16, 1.4], tail: [900, 0.6, 0.55], drive: 3.8, len: 1.2, echo: [0.2, 0.22] },
  art: {
    hand: [0, 3], fore: [30, 0], muzzle: [61, -5.6], eject: [10, -7], stock: [-28, 1], len: 61,
    parts: [['p', [-28, -3, -5, -4, -3, 3, -27, 7], GCOL.poly], ['r', -28.5, -3.5, 2.4, 10.5, GCOL.rubber], ['p', [-2, -1, 4, -1, 2, 9, -4, 9], GCOL.poly], ['r', -5, -8, 28, 8, GCOL.poly, 1], ['a', 6, 1.8, 3, GCOL.poly],
      ['r', 23, -7, 38, 2.6, GCOL.steelD], ['r', 23, -4.2, 32, 2.6, GCOL.poly], ['r', 22, -4.6, 16, 4.6, GCOL.polyL, 1.5], ['r', -2, -10, 20, 1.8, GCOL.steelD], ['r', 58, -9, 2, 2, '#ddd']],
  },
});
defWeapon({
  id: 'mauler', name: 'Mauler Auto-12', cat: 'shotgun', dmg: 13, pellets: 8, rpm: 300, mode: 'auto', mag: 20, ammo: '12g', reload: 3,
  spread: 0.09, aimSpread: 0.075, bloom: 0.015, bloomMax: 0.06, kick: 0.1, back: 6, shake: 5, pen: 5, range: 300, falloff: 0.25, force: 75, dismember: 1.3, gib: 1.3,
  shell: 'shotgun', flash: 1.4, noise: 1600, price: 3600, unlock: 8, startReserve: 2, weight: 0.86,
  desc: 'Drum-fed automatic shotgun. Turns corridors into abattoirs.',
  snd: { crack: [1800, 0.012, 0.8], blast: [1700, 0.11, 1.3], thump: [62, 0.14, 1.35], tail: [900, 0.55, 0.5], drive: 3.6, len: 1.1 },
  art: {
    hand: [0, 3], fore: [28, 1], muzzle: [53, -5.5], eject: [12, -9], stock: [-30, -1], len: 53,
    parts: [['p', [-30, -6, -8, -7, -8, 2, -30, 4], GCOL.poly], ['r', -8, -9, 40, 10, GCOL.poly, 1.5], ['r', 0, -14, 22, 3, GCOL.polyL], ['r', 2, -12, 2, 3, GCOL.polyL], ['r', 18, -12, 2, 3, GCOL.polyL], ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly],
      ['r', 32, -7, 17, 3, GCOL.steelD], ['r', 48, -8.2, 5, 5.4, GCOL.steelD], ['l', 49.5, -7.5, 49.5, -3.5, 0.6, '#000'], ['l', 51.5, -7.5, 51.5, -3.5, 0.6, '#000']],
    mag: [['c', 12, 7.5, 7.5, GCOL.polyL], ['c', 12, 7.5, 3, GCOL.poly]],
  },
});

// ===== MORE ASSAULT RIFLES =====
defWeapon({
  id: 'c7', name: 'C7 Carbine', cat: 'rifle', dmg: 30, rpm: 760, mode: 'auto', mag: 30, ammo: '5.56', reload: 2.1,
  spread: 0.025, aimSpread: 0.007, bloom: 0.008, bloomMax: 0.06, kick: 0.033, back: 3.5, shake: 1.8, pen: 34, range: 1200, force: 140,
  flash: 1, noise: 1300, price: 1700, unlock: 3, startReserve: 2, weight: 0.93,
  desc: 'Flat-top 5.56 carbine with a red-dot optic. Accurate, light, forgiving.',
  snd: { crack: [3600, 0.01, 1.2], blast: [2900, 0.065, 1.05], thump: [88, 0.085, 1], tail: [1350, 0.45, 0.42], drive: 2.9, len: 1, echo: [0.17, 0.18], mech: 0.12 },
  art: {
    hand: [0, 3], fore: [30, 0], muzzle: [58, -6.5], eject: [8, -9], stock: [-30, 0], len: 58,
    parts: [['p', [-30, -4, -14, -6, -14, 0, -30, 4], GCOL.poly], ['r', -14, -5.5, 10, 3, GCOL.poly], ['r', -6, -6, 24, 6, GCOL.poly], ['r', -6, -10, 28, 4.5, GCOL.steelD], ['r', 2, -14.5, 12, 4, GCOL.poly, 1], ['r', 13, -14.2, 1.3, 3.6, '#3a6a7a'],
      ['r', 22, -10, 18, 8, GCOL.polyL, 1], ['l', 23, -8, 39, -8, 0.5, 'rgba(0,0,0,0.6)'], ['l', 23, -4, 39, -4, 0.5, 'rgba(0,0,0,0.6)'], ['r', 40, -7.5, 14, 2, GCOL.steelD], ['p', [38, -10, 41, -10, 40.4, -15, 38.6, -15], GCOL.steelD], ['r', 54, -8, 4, 3, GCOL.steelD],
      ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly], ['a', 4, 1.5, 3, GCOL.poly]],
    mag: [['p', [7, 0, 13, 0, 14, 12, 8, 13], GCOL.steelD]],
  },
});
defWeapon({
  id: 'spindle', name: 'Spindle Bullpup', cat: 'rifle', dmg: 32, rpm: 900, mode: 'burst', burst: 3, mag: 30, ammo: '5.56', reload: 2.4,
  spread: 0.022, aimSpread: 0.006, bloom: 0.009, bloomMax: 0.05, kick: 0.028, back: 3, shake: 1.7, pen: 34, range: 1300, force: 140,
  flash: 0.9, noise: 1300, price: 2200, unlock: 5, startReserve: 2, weight: 0.94,
  desc: 'Compact 3-round-burst bullpup with a magnified optic. Precise headshot machine.',
  snd: { crack: [3700, 0.01, 1.2], blast: [3000, 0.06, 1], thump: [92, 0.08, 0.95], tail: [1400, 0.42, 0.4], drive: 2.8, len: 1 },
  art: {
    hand: [3, 3], fore: [16, 0], muzzle: [39, -6.5], eject: [-16, -6], stock: [-24, -3], len: 39,
    parts: [['p', [-24, -10, 20, -10, 24, -4, 22, 2, 8, 2, 6, 10, 0, 10, 0, 2, -22, 2, -24, -2], '#3f4436'], ['r', -6, -15.5, 16, 4.5, GCOL.poly, 1.5], ['r', 9.5, -15, 1.4, 3.6, '#3a6a7a'], ['r', 24, -7, 12, 2, GCOL.steelD], ['r', 35, -8.2, 4, 3.8, GCOL.steelD], ['l', -20, -7, 16, -7, 0.5, 'rgba(0,0,0,0.4)']],
    mag: [['p', [-12, 1, -6, 1, -5, 12, -11, 12], GCOL.steelD]],
  },
});

// ===== BATTLE RIFLES / DMR =====
defWeapon({
  id: 'graver', name: 'Graver .308', cat: 'battle', dmg: 58, rpm: 560, mode: 'auto', mag: 20, ammo: '.308', reload: 2.6,
  spread: 0.03, aimSpread: 0.008, bloom: 0.018, bloomMax: 0.1, kick: 0.07, back: 5.5, shake: 3.4, pen: 70, range: 1500, force: 230, dismember: 1.3, gib: 1.3,
  flash: 1.3, noise: 1700, price: 2800, unlock: 6, startReserve: 2, weight: 0.9,
  desc: 'Full-power .308 battle rifle. Each round goes through the first infected and into the next.',
  snd: { crack: [4000, 0.012, 1.3], blast: [2000, 0.11, 1.3], thump: [65, 0.13, 1.3], tail: [900, 0.8, 0.55], drive: 3.4, len: 1.3, echo: [0.22, 0.25] },
  art: {
    hand: [0, 3], fore: [34, 0], muzzle: [68, -5.8], eject: [10, -9], stock: [-34, 1], len: 68,
    parts: [['p', [-34, -3, -8, -5, -6, 2, -33, 7], GCOL.poly], ['r', -34.5, -3.5, 2.5, 10.5, GCOL.rubber], ['r', -8, -9, 34, 8, GCOL.steel, 1], ['r', 6, -13, 14, 2.5, GCOL.steelD], ['r', 8, -11, 2, 2.5, GCOL.steelD], ['r', 18, -11, 2, 2.5, GCOL.steelD],
      ['r', 26, -8, 18, 6.5, GCOL.poly, 1.5], ['r', 44, -6.5, 20, 2.4, GCOL.steelD], ['r', 63, -7.5, 5, 3.4, GCOL.steelD], ['r', 58, -11, 2, 4.5, GCOL.steelD], ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly], ['a', 4, 1.5, 3, GCOL.steel]],
    mag: [['p', [8, -1, 15, -1, 16, 11, 9, 12], GCOL.steelD]],
  },
});
defWeapon({
  id: 'longshank', name: 'Longshank DMR', cat: 'battle', dmg: 92, rpm: 280, mode: 'semi', mag: 10, ammo: '.308', reload: 2.4,
  spread: 0.02, aimSpread: 0.002, bloom: 0.03, kick: 0.11, back: 6, shake: 4, pen: 90, range: 2000, force: 280, dismember: 1.4, gib: 1.6, scope: true,
  flash: 1.3, noise: 1700, price: 3000, unlock: 6, startReserve: 2, weight: 0.92,
  desc: 'Walnut-stocked marksman rifle with a 4x scope. Hold aim to look far down the street.',
  snd: { crack: [4200, 0.013, 1.35], blast: [1900, 0.12, 1.35], thump: [62, 0.14, 1.35], tail: [850, 0.9, 0.55], drive: 3.5, len: 1.4, echo: [0.24, 0.26] },
  art: {
    hand: [0, 3], fore: [26, -1], muzzle: [67, -5.4], eject: [6, -9], stock: [-35, 1], len: 67,
    parts: [['p', [-36, -3, -6, -5, 8, -4, 8, 1, -2, 3, -34, 8], GCOL.wood], ['r', -36.5, -3.5, 2.5, 11.5, GCOL.woodD], ['r', 8, -6.5, 30, 5.5, GCOL.wood, 2], ['r', -6, -9, 22, 4, GCOL.steel],
      ['r', -6, -16.5, 26, 4.5, GCOL.poly, 2], ['r', 18, -17.8, 5, 7, GCOL.poly, 1], ['r', -9, -17.2, 4, 6, GCOL.poly, 1], ['r', 22.5, -16.5, 0.9, 4.4, '#4a7a8a'], ['r', 0, -12.5, 3, 3.5, GCOL.steelD], ['r', 12, -12.5, 3, 3.5, GCOL.steelD],
      ['r', 38, -6, 26, 2.3, GCOL.steelD], ['r', 63, -7, 4, 3.2, GCOL.steelD]],
    mag: [['r', 6, 0, 7, 10, GCOL.steelD]],
  },
});

// ===== SNIPER RIFLES =====
defWeapon({
  id: 'palehorse', name: 'Pale Horse .338', cat: 'sniper', dmg: 230, rpm: 60, mode: 'bolt', cycleTime: 1.05, mag: 5, ammo: '.338', reload: 2.8,
  spread: 0.014, aimSpread: 0.0008, bloom: 0.02, kick: 0.22, back: 9, shake: 7, pen: 180, range: 3000, force: 420, dismember: 2, gib: 2.5, scope: true,
  flash: 1.5, noise: 2400, price: 4200, unlock: 7, startReserve: 2, weight: 0.88,
  desc: 'Bolt-action .338 precision rifle. Pierces a whole column of infected.',
  snd: { crack: [4500, 0.015, 1.4], blast: [1800, 0.14, 1.4], thump: [55, 0.16, 1.5], tail: [700, 1.2, 0.6], drive: 3.8, len: 1.7, echo: [0.3, 0.3] },
  art: {
    hand: [0, 3], fore: [30, -1], muzzle: [76, -5], eject: [0, -7], stock: [-40, 2], len: 76,
    parts: [['p', [-40, -4, -6, -6, 6, -6, 10, -2, 40, -2, 40, 2, 8, 2, 4, 5, -2, 4, -38, 9], '#6a6048'], ['r', -40.5, -4.5, 2.5, 13.5, GCOL.rubber], ['r', -6, -8.5, 20, 3.6, GCOL.steel],
      ['r', -8, -17.5, 34, 5, GCOL.poly, 2], ['r', 24, -19, 6, 8, GCOL.poly, 1], ['r', -11, -18.5, 4, 7, GCOL.poly, 1], ['r', 29.6, -18, 0.9, 6, '#4a7a8a'], ['r', -2, -13, 3, 4.5, GCOL.steelD], ['r', 16, -13, 3, 4.5, GCOL.steelD],
      ['l', 2, -7, -1, -1, 1.4, GCOL.steelL], ['c', -1, -0.5, 1.6, GCOL.steelL], ['r', 40, -5.6, 32, 2.6, GCOL.steelD], ['r', 71, -7, 5, 4.2, GCOL.steelD], ['l', 36, 1.5, 54, 2.5, 1.2, GCOL.steelD]],
    mag: [['r', 8, 1, 6, 5, GCOL.steelD]],
  },
});
defWeapon({
  id: 'ironwake', name: 'Ironwake .50', cat: 'sniper', dmg: 520, rpm: 90, mode: 'semi', mag: 5, ammo: '.50', reload: 3.4,
  spread: 0.016, aimSpread: 0.001, bloom: 0.05, kick: 0.36, back: 13, shake: 15, pen: 460, range: 4000, force: 900, dismember: 3, gib: 4, scope: true,
  flash: 2.5, noise: 2900, price: 6500, unlock: 9, startReserve: 2, weight: 0.78,
  desc: 'Semi-automatic .50 anti-materiel rifle. Erases whatever it touches — and whatever is behind it.',
  snd: { crack: [3800, 0.02, 1.4], blast: [1200, 0.2, 1.6], thump: [40, 0.25, 1.8], tail: [500, 1.6, 0.7], drive: 5, len: 2.2, echo: [0.35, 0.35, 0.3] },
  art: {
    hand: [0, 3], fore: [30, 2], muzzle: [93, -5.5], eject: [18, -10], stock: [-46, 1], len: 93,
    parts: [['p', [-44, -6, -14, -8, -14, 4, -42, 10], GCOL.poly], ['r', -46, -7, 3, 17, GCOL.rubber], ['r', -14, -10, 60, 10, GCOL.steelD, 1.5], ['r', 14, -13.5, 12, 3, GCOL.steel],
      ['r', -6, -19.5, 32, 5.5, GCOL.poly, 2], ['r', 23, -21, 6, 8.6, GCOL.poly, 1], ['r', -9, -20.5, 4, 7.5, GCOL.poly, 1], ['r', 0, -14.5, 3, 4.5, GCOL.steelD], ['r', 16, -14.5, 3, 4.5, GCOL.steelD],
      ['r', 46, -7, 40, 3.4, GCOL.steelD], ['r', 84, -9.5, 9, 8.4, GCOL.steelD], ['l', 86.5, -9, 86.5, -1.5, 0.8, '#000'], ['l', 89.5, -9, 89.5, -1.5, 0.8, '#000'], ['l', 40, 0, 30, 20, 1.4, GCOL.steelD], ['l', 40, 0, 50, 20, 1.4, GCOL.steelD],
      ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly]],
    mag: [['r', 14, 0, 9, 9, GCOL.steelD]],
  },
});

// ===== MACHINE GUNS =====
defWeapon({
  id: 'brushfire', name: 'Brushfire LMG', cat: 'mg', dmg: 30, rpm: 820, mode: 'auto', mag: 100, ammo: '5.56', reload: 4.6,
  spread: 0.04, aimSpread: 0.016, bloom: 0.006, bloomMax: 0.08, kick: 0.03, back: 3.5, shake: 2.2, pen: 34, range: 1100, force: 140,
  flash: 1.1, noise: 1500, price: 4400, unlock: 7, startReserve: 2, weight: 0.8,
  desc: 'Box-fed 5.56 squad automatic. A hundred rounds before you need to think.',
  snd: { crack: [3500, 0.01, 1.15], blast: [2800, 0.06, 1.05], thump: [85, 0.08, 1], tail: [1300, 0.4, 0.42], drive: 2.9, len: 0.95 },
  art: {
    hand: [0, 3], fore: [40, 0], muzzle: [75, -5.7], eject: [14, -1], stock: [-34, 0], len: 75,
    parts: [['p', [-34, -5, -8, -7, -8, 2, -33, 6], GCOL.poly], ['r', -8, -11, 40, 10, GCOL.steelD, 1], ['r', -4, -13.5, 26, 3, GCOL.steel], ['r', 32, -9, 18, 7, GCOL.polyL, 1.5], ['r', 50, -6.5, 22, 2.6, GCOL.steelD], ['r', 71, -7.5, 4, 3.6, GCOL.steelD],
      ['p', [36, -11, 40, -17, 52, -17, 54, -11], GCOL.steel], ['l', 46, -2, 64, -2, 1.4, GCOL.steelD], ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly]],
    mag: [['r', 8, -1, 15, 13, '#4a4c37', 1.5], ['l', 12, -2, 15, -10, 1, GCOL.brass]],
  },
});
defWeapon({
  id: 'grinder', name: 'Grinder GPMG', cat: 'mg', dmg: 46, rpm: 650, mode: 'auto', mag: 100, ammo: 'belt', reload: 5.2,
  spread: 0.045, aimSpread: 0.018, bloom: 0.008, bloomMax: 0.09, kick: 0.045, back: 4.5, shake: 3.2, pen: 55, range: 1300, force: 200, dismember: 1.2,
  flash: 1.4, noise: 1800, price: 5500, unlock: 9, startReserve: 2, weight: 0.72,
  desc: 'Belt-fed 7.62 general-purpose machine gun. Shreds limbs, cover and crowds.',
  snd: { crack: [3400, 0.011, 1.25], blast: [2200, 0.09, 1.25], thump: [70, 0.11, 1.2], tail: [1000, 0.6, 0.5], drive: 3.2, len: 1.1 },
  art: {
    hand: [0, 3], fore: [30, 2], muzzle: [86, -5.7], eject: [16, -1], stock: [-38, 0], len: 86,
    parts: [['p', [-38, -5, -9, -8, -9, 3, -36, 7], GCOL.poly], ['r', -9, -12, 46, 11, GCOL.steel, 1], ['r', -4, -15, 30, 3.5, GCOL.steelD], ['r', 37, -9.5, 26, 6, GCOL.steelD, 1],
      ['c', 41, -6.5, 1, '#000'], ['c', 45, -6.5, 1, '#000'], ['c', 49, -6.5, 1, '#000'], ['c', 53, -6.5, 1, '#000'], ['c', 57, -6.5, 1, '#000'],
      ['r', 63, -6.5, 18, 2.8, GCOL.steelD], ['r', 80, -8, 6, 4.6, GCOL.steelD], ['l', 58, -3, 48, 20, 1.4, GCOL.steelD], ['l', 58, -3, 68, 20, 1.4, GCOL.steelD], ['p', [26, -12, 28, -19, 40, -19, 42, -12], GCOL.steelD], ['p', [-1, 0, 5, 0, 3, 10, -3, 10], GCOL.poly]],
    mag: [['r', 6, -1, 16, 15, '#4a4c37', 1.5], ['l', 10, -2, 16, -13, 1.4, GCOL.brass]],
  },
});

// ---------------------------------------------------------------- detail pass
// Extra details drawn over each weapon's silhouette (same coordinates as
// its art.parts): serrations, ejection ports, rails, vents, pins, screws,
// blade edges and wear.
const GUN_DETAIL = {
  machete: [['edge', [7.5, 1.6, 50, 1.4, 53.6, -2.3]], ['rust', 12, -3.4, 36, 4.6, 16], ['pin', 0, 0, 0.75], ['pin', 5.5, 0, 0.75]],
  bat: [['tape', -6, -2.1, 11, 4.2], ['rust', 34, -3.5, 18, 7, 6]],
  axe: [['pin', 50.5, -0.5, 0.9], ['rust', 45, -12, 10, 22, 8], ['edge', [60.5, -13.5, 60.5, 11.5]]],
  sledge: [['rust', 50, -10, 13, 20, 12], ['tape', -6, -1.8, 13, 3.6], ['pin', 56.5, 0, 1]],
  p9: [['port', 9.5, -7.4, 6, 2.2], ['pin', 4.6, 0.6, 0.5], ['pin', 9.5, -1, 0.5]],
  keeper: [['port', 9, -7.9, 6, 2.2], ['screw', 1.4, 2.6, 0.8], ['screw', 0.4, 9, 0.8], ['pin', 5.2, -0.6, 0.5]],
  magistrate: [['pin', 7, -4.4, 0.75], ['screw', -1.3, -4.5, 0.6], ['screw', 0.4, 5.2, 0.7]],
  bastion: [['pin', 7.5, -5, 0.8], ['screw', -1.4, -5, 0.6], ['screw', 0.6, 5.5, 0.7]],
  vex: [['rail', 0, -10.6, 16], ['port', 10, -7.2, 7, 2.2], ['vents', 25.5, -6, 11, 2.4, 4], ['pin', 2, -2.8, 0.5], ['pin', 16, -2.8, 0.5]],
  ratchet: [['port', 9, -7.6, 6, 2.2], ['serr', -2.5, -8.2, 6, 2.2, 5], ['pin', 14, -2.2, 0.5]],
  kestrel: [['vents', -16, -6.5, 10, 2.4, 4], ['port', -18.5, -1.4, 5, 2], ['pin', 8, -3, 0.5], ['pin', 15, -3, 0.5]],
  parish: [['port', 6, -6.3, 7, 2.2], ['pin', -1, -2.4, 0.6], ['pin', 15, -2.4, 0.6]],
  breaker: [['screw', -3, -3.4, 0.6], ['screw', 2.8, -3.4, 0.6], ['pin', -1.2, -6, 0.45]],
  thresher: [['rail', -2, -10, 20], ['port', 6, -7.3, 7, 2.2], ['vents', 24, -3.8, 12, 2, 4], ['pin', -1, -2, 0.5], ['pin', 16, -2, 0.5]],
  mauler: [['rail', 0, -14, 22], ['port', 6, -8, 7, 2.4], ['vents', 33, -6.4, 13, 1.8, 4], ['pin', 26, -3, 0.55]],
  kolba: [['port', 7, -6.6, 7, 2.2], ['serr', 16, -9.3, 5, 2.4, 5], ['pin', -3, -2.2, 0.55], ['pin', 3, -2.2, 0.55], ['pin', 21, -2.2, 0.55], ['pin', 21, -5.4, 0.55]],
  c7: [['rail', -5, -10.2, 26], ['port', 8, -8.6, 7, 2.2], ['vents', 24, -6.6, 14, 2, 4], ['pin', 1, -4, 0.5], ['pin', 13, -4, 0.5]],
  spindle: [['port', -18, -7.2, 6, 2.2], ['vents', 8, -7.2, 10, 2.2, 4], ['pin', -8, -4, 0.5], ['pin', 14, -4, 0.5]],
  graver: [['rail', 6, -13, 14], ['port', 8, -8.2, 8, 2.4], ['vents', 27.5, -6.4, 14, 2.4, 4], ['vents', 63.5, -7, 4, 2.4, 2], ['pin', 0, -3, 0.55], ['pin', 20, -3, 0.55]],
  longshank: [['port', 3, -8.6, 7, 2], ['screw', -2.5, -0.5, 0.6], ['pin', 10, -7.5, 0.5]],
  palehorse: [['port', 4, -8.2, 7, 2], ['screw', -4.5, -2.8, 0.6], ['screw', 30, 0, 0.55]],
  ironwake: [['rail', -4, -14.6, 26], ['port', 20, -9.4, 9, 2.6], ['vents', 85, -8.8, 7.5, 3, 2], ['pin', 0, -4, 0.6], ['pin', 30, -4, 0.6], ['pin', 40, 0, 0.9]],
  brushfire: [['rail', -2, -13.6, 22], ['vents', 33.5, -7, 15, 2.4, 5], ['port', 12, -2.4, 8, 1.8], ['pin', 0, -4, 0.6], ['pin', 26, -4, 0.6]],
  grinder: [['rail', -2, -15, 26], ['port', 14, -2.6, 9, 1.8], ['pin', 0, -5, 0.6], ['pin', 30, -5, 0.6], ['pin', 58, -3, 0.9]],
};

// ---------------------------------------------------------------- art baking
const GunArt = (() => {
  const RES = 3;
  const cache = {};
  // ------------------------------------------------ materials
  // Each part's colour picks its material: steel, bright (polished /
  // chrome / blades), poly (polymer furniture), wood, rubber, paint,
  // brass or glass (optics). The material sets the shading and texture.
  const MAT = {
    [GCOL.steel]: 'steel', [GCOL.steelD]: 'steel', [GCOL.steelL]: 'steel', '#888': 'steel', '#333': 'steel', '#444': 'steel', '#000': 'steel',
    [GCOL.chrome]: 'bright', '#a8aeb4': 'bright', '#b8bcc0': 'bright', '#6f7377': 'bright', '#ddd': 'bright',
    [GCOL.poly]: 'poly', [GCOL.polyL]: 'poly', '#1c1c1c': 'poly', '#1e1e1e': 'rubber', '#3a3d33': 'poly', '#3f4436': 'poly', '#6a7466': 'poly', '#6a6048': 'poly', '#4a4c37': 'paint', [GCOL.olive]: 'paint', [GCOL.tan]: 'poly',
    [GCOL.wood]: 'wood', [GCOL.woodD]: 'wood', [GCOL.woodL]: 'wood',
    [GCOL.rubber]: 'rubber', [GCOL.brass]: 'brass', '#8a1a14': 'paint', [GCOL.red]: 'paint',
    '#3a6a7a': 'glass', '#4a7a8a': 'glass',
  };
  const matOf = (col) => (typeof col === 'string' && col[0] === '#' ? MAT[col] || 'steel' : 'none');
  function path(c, p) {
    c.beginPath();
    const t = p[0];
    if (t === 'r') { if (p[6]) roundRect(c, p[1], p[2], p[3], p[4], p[6]); else c.rect(p[1], p[2], p[3], p[4]); }
    else if (t === 'p') poly(c, p[1]);
    else if (t === 'c') c.arc(p[1], p[2], p[3], 0, TAU);
  }
  // vertical shading ramps: [stop, lightness shift]
  const RAMP = {
    steel: [[0, 0.32], [0.14, 0.1], [0.5, -0.04], [0.86, -0.38], [1, -0.18]],
    bright: [[0, 0.6], [0.2, 0.18], [0.42, -0.1], [0.56, 0.28], [0.8, -0.25], [1, -0.45]],
    poly: [[0, 0.14], [0.3, 0.04], [1, -0.32]],
    wood: [[0, 0.22], [0.18, 0.08], [0.6, -0.06], [1, -0.38]],
    rubber: [[0, 0.08], [1, -0.3]],
    paint: [[0, 0.22], [0.35, 0.02], [1, -0.36]],
    brass: [[0, 0.55], [0.3, 0.15], [0.7, -0.15], [1, -0.4]],
    glass: [[0, 0.4], [0.5, -0.2], [1, -0.5]],
  };
  function texture(c, mat, col, bb, rng) {
    const [x0, y0, x1, y1] = bb, w = x1 - x0, h = y1 - y0;
    const g = c.createLinearGradient(0, y0, 0, y1);
    for (const [t, a] of RAMP[mat]) g.addColorStop(t, a >= 0 ? rgba(shade(col, a), 1) : rgba(shade(col, a), 1));
    c.fillStyle = g; c.fillRect(x0 - 1, y0 - 1, w + 2, h + 2);
    if (mat === 'steel' || mat === 'bright') {
      // brushed finish + a hard specular line under the top edge
      for (let i = 0; i < w * h * 0.35; i++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'; c.fillRect(x0 + rng() * w, y0 + rng() * h, rng.range(1.5, 5), 0.18); }
      c.fillStyle = mat === 'bright' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'; c.fillRect(x0, y0 + Math.min(1, h * 0.18), w, 0.35);
    } else if (mat === 'poly' || mat === 'rubber' || mat === 'paint') {
      for (let i = 0; i < w * h * 1.4; i++) { c.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)'; c.fillRect(x0 + rng() * w, y0 + rng() * h, 0.32, 0.32); }
      if (mat === 'paint') { // chipped edges show bare metal
        for (let i = 0; i < (w + h) * 0.6; i++) { const e = rng() < 0.5; c.fillStyle = 'rgba(170,170,165,0.55)'; c.fillRect(e ? x0 + rng() * w : (rng() < 0.5 ? x0 : x1 - 0.6), e ? (rng() < 0.5 ? y0 : y1 - 0.6) : y0 + rng() * h, rng.range(0.3, 1), rng.range(0.3, 0.8)); }
      }
    } else if (mat === 'wood') {
      // long grain lines following the part, a few darker figure streaks and knots
      for (let i = 0; i < h * 2.2; i++) {
        let y = y0 + rng() * h; const a = rng.range(0.12, 0.3);
        c.strokeStyle = `rgba(30,14,4,${a})`; c.lineWidth = rng.range(0.18, 0.4);
        c.beginPath(); c.moveTo(x0 - 1, y);
        for (let x = x0; x <= x1 + 2; x += 3) { y += rng.range(-0.25, 0.25); c.lineTo(x, y); }
        c.stroke();
      }
      for (let i = 0; i < w * 0.05; i++) { c.fillStyle = 'rgba(25,10,2,0.35)'; c.beginPath(); c.ellipse(x0 + rng() * w, y0 + rng() * h, rng.range(0.6, 1.4), rng.range(0.3, 0.6), 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(x0, y0 + h * 0.18, w, Math.max(0.4, h * 0.12)); // varnish sheen
    } else if (mat === 'brass') {
      c.fillStyle = 'rgba(255,240,190,0.4)'; c.fillRect(x0, y0 + h * 0.2, w, 0.3);
    } else if (mat === 'glass') {
      const r = c.createRadialGradient(x0 + w * 0.35, y0 + h * 0.3, 0, x0 + w * 0.5, y0 + h * 0.5, Math.max(w, h));
      r.addColorStop(0, 'rgba(220,250,255,0.75)'); r.addColorStop(0.3, 'rgba(120,190,210,0.3)'); r.addColorStop(1, 'rgba(0,10,20,0)');
      c.fillStyle = r; c.fillRect(x0, y0, w, h);
    }
  }
  function drawSolid(c, p, rng) {
    const t = p[0], col = t === 'r' ? p[5] : t === 'p' ? p[2] : p[4], mat = matOf(col);
    if (mat === 'none') { path(c, p); c.fillStyle = col; c.fill(); return; }
    const bb = partBounds(p);
    // base with a soft contact shadow cast onto the parts beneath
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 1.6 * RES; c.shadowOffsetY = 0.55 * RES;
    path(c, p); c.fillStyle = col; c.fill(); c.restore();
    c.save(); path(c, p); c.clip();
    texture(c, mat, col, bb, rng);
    // bevel: light catches the top edges, the bottom edges fall into shadow
    c.translate(0, 0.65); path(c, p); c.strokeStyle = mat === 'bright' || mat === 'brass' ? 'rgba(255,255,255,0.55)' : mat === 'steel' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)'; c.lineWidth = 0.6; c.stroke();
    c.translate(0, -1.3); path(c, p); c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.7; c.stroke();
    c.restore();
    path(c, p); c.lineWidth = 0.5; c.strokeStyle = 'rgba(0,0,0,0.9)'; c.stroke();
  }
  // ------------------------------------------------ detail primitives
  function drawDetail(c, p, rng) {
    const t = p[0];
    if (t === 'serr') { // slide / grip serrations
      const [, x, y, w, h, n] = p;
      for (let i = 0; i < n; i++) { const xx = x + (i + 0.5) * w / n; c.fillStyle = 'rgba(0,0,0,0.75)'; c.fillRect(xx - 0.25, y, 0.5, h); c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(xx + 0.3, y, 0.3, h); }
    } else if (t === 'rail') { // picatinny rail
      const [, x, y, w] = p;
      c.fillStyle = '#17191b'; c.fillRect(x, y, w, 1.7);
      for (let xx = x + 0.4; xx < x + w - 0.8; xx += 1.7) { c.fillStyle = '#2a2d31'; c.fillRect(xx, y - 1.1, 1.0, 1.2); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(xx, y - 1.1, 1.0, 0.25); }
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, w, 0.3);
    } else if (t === 'port') { // ejection port
      const [, x, y, w, h] = p;
      c.fillStyle = '#070708'; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(176,138,58,0.7)'; c.fillRect(x + w * 0.25, y + h * 0.3, w * 0.5, h * 0.45); // case visible in the chamber
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x, y + h - 0.3, w, 0.3);
    } else if (t === 'pin' || t === 'screw') {
      const [, x, y, r = 0.7] = p;
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      g.addColorStop(0, '#9aa0a6'); g.addColorStop(1, '#1a1c1e');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      if (t === 'screw') { c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 0.25; c.beginPath(); c.moveTo(x - r * 0.7, y + r * 0.3); c.lineTo(x + r * 0.7, y - r * 0.3); c.stroke(); }
    } else if (t === 'vents') { // row of cooling slots
      const [, x, y, w, h, n] = p;
      for (let i = 0; i < n; i++) { const xx = x + i * w / n + 0.3; roundRect(c, xx, y, w / n - 0.8, h, Math.min(h, w / n) * 0.45); c.fillStyle = '#060607'; c.fill(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(xx, y + h - 0.25, w / n - 0.8, 0.25); }
    } else if (t === 'tape') { // grip tape wrap
      const [, x, y, w, h] = p;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = 0.45;
      for (let xx = x - h; xx < x + w; xx += 1.4) { c.beginPath(); c.moveTo(xx, y + h); c.lineTo(xx + h, y); c.stroke(); }
      c.restore();
    } else if (t === 'edge') { // sharpened edge bevel along a blade
      const [, pts] = p;
      c.strokeStyle = 'rgba(235,240,245,0.85)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke();
    } else if (t === 'rust') {
      const [, x, y, w, h, n] = p;
      for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${rng.int(90, 130)},${rng.int(40, 60)},20,${rng.range(0.25, 0.6)})`; c.beginPath(); c.ellipse(x + rng() * w, y + rng() * h, rng.range(0.3, 1.3), rng.range(0.2, 0.7), rng() * 3, 0, TAU); c.fill(); }
    }
  }
  // ------------------------------------------------ automatic details from the geometry
  function autoDetail(c, parts, rng, isMag) {
    for (const p of parts) {
      if (p[0] !== 'r' && p[0] !== 'p') continue;
      const col = p[0] === 'r' ? p[5] : p[2], mat = matOf(col);
      if (mat === 'none' || mat === 'glass') continue;
      const [x0, y0, x1, y1] = partBounds(p), w = x1 - x0, h = y1 - y0;
      c.save(); path(c, p); c.clip();
      if (isMag) {
        // magazine: stamped ridges and a lighter base plate
        c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 0.35;
        for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(x0 + w * 0.22 * i, y0 + 0.8); c.lineTo(x0 + w * 0.22 * i + w * 0.18, y1 - 1.4); c.stroke(); }
        c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x0, y1 - 1.3, w, 1.3);
      } else if (p[0] === 'p' && y0 > -2.5 && h > 7 && x1 < 9 && x0 > -7 && h > w * 0.9) {
        // pistol grip: checkering (synthetic) or a grip panel with screw (wood)
        if (mat === 'wood') { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x0, y0, w, h); }
        c.strokeStyle = mat === 'wood' ? 'rgba(20,8,2,0.45)' : 'rgba(0,0,0,0.42)'; c.lineWidth = 0.3;
        for (let k = -h; k < w + h; k += 1.1) { c.beginPath(); c.moveTo(x0 + k, y0 + 1.5); c.lineTo(x0 + k + h, y1); c.stroke(); c.beginPath(); c.moveTo(x0 + k + h, y0 + 1.5); c.lineTo(x0 + k, y1); c.stroke(); }
      } else if ((mat === 'steel' || mat === 'bright') && p[0] === 'r' && h <= 3.4 && w >= 10) {
        // barrel / tube: dark bore line underneath and a bright crown at the muzzle end
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x0, y1 - h * 0.25, w, h * 0.25);
        c.fillStyle = 'rgba(220,225,230,0.5)'; c.fillRect(x1 - 0.5, y0, 0.5, h);
      } else if (mat === 'rubber' && h > w * 2) {
        for (let yy = y0 + 1; yy < y1; yy += 1.3) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x0, yy, w, 0.35); }
      } else if ((mat === 'steel' || mat === 'poly' || mat === 'paint') && p[0] === 'r' && h >= 5 && w >= 14) {
        // receiver / slide: machined panel line and a darker lower flat
        c.fillStyle = 'rgba(0,0,0,0.38)'; c.fillRect(x0 + 1, y0 + h * 0.42, w - 2, 0.35);
        c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x0 + 1, y0 + h * 0.42 + 0.35, w - 2, 0.25);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x0, y0 + h * 0.45, w, h * 0.55);
      } else if ((mat === 'poly' || mat === 'paint') && p[0] === 'p' && x1 < -4 && w > 14) {
        // synthetic stock: recessed side panel
        c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(x0 + w * 0.18, y0 + h * 0.45); c.lineTo(x1 - w * 0.12, y0 + h * 0.35); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.07)'; c.beginPath(); c.moveTo(x0 + w * 0.18, y0 + h * 0.45 + 0.4); c.lineTo(x1 - w * 0.12, y0 + h * 0.35 + 0.4); c.stroke();
      }
      c.restore();
    }
    // a trigger inside every trigger guard
    for (const p of parts) if (p[0] === 'a') {
      const [, x, y, r] = p;
      c.strokeStyle = '#141516'; c.lineWidth = 0.9; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x - r * 0.15, y - r * 0.55); c.quadraticCurveTo(x + r * 0.35, y + r * 0.05, x - r * 0.05, y + r * 0.6); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.3; c.stroke();
    }
  }
  function drawParts(c, parts, rng, isMag) {
    for (const p of parts) {
      const t = p[0];
      if (t === 'a') { c.beginPath(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.arc(p[1], p[2], p[3], 0, Math.PI); c.stroke(); c.beginPath(); c.lineWidth = 0.8; c.strokeStyle = rgba(shade(p[4], 0.25), 1); c.arc(p[1], p[2] - 0.15, p[3], 0.15, Math.PI - 0.15); c.stroke(); continue; }
      if (t === 'l') { c.beginPath(); c.lineWidth = p[5]; c.strokeStyle = p[6]; c.moveTo(p[1], p[2]); c.lineTo(p[3], p[4]); c.stroke(); continue; }
      if (t === 'r' || t === 'p' || t === 'c') { drawSolid(c, p, rng); continue; }
      drawDetail(c, p, rng);
    }
    autoDetail(c, parts, rng, isMag);
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
      else if (p[0] === 'r' || p[0] === 'p' || p[0] === 'c') q = partBounds(p);
      else continue; // detail primitives sit inside the silhouette
      b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])];
    }
    return b;
  }
  function bakeParts(parts, hand, seed, isMag) {
    const b = bounds(parts);
    const pad = 2.5;
    const ox = b[0] - hand[0] - pad, oy = b[1] - hand[1] - pad, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
    const cv = makeCanvas(w * RES, h * RES), c = cv.getContext('2d');
    c.scale(RES, RES); c.translate(-ox - hand[0], -oy - hand[1]);
    c.lineJoin = 'round';
    drawParts(c, parts, makeRng(hashStr(seed)), isMag);
    return { cv, ox, oy, w, h };
  }
  function get(def) {
    if (cache[def.id]) return cache[def.id];
    const a = def.art;
    const extra = GUN_DETAIL[def.id] || [];
    const out = { body: bakeParts(a.parts.concat(extra), a.hand, def.id) };
    if (a.mag) out.mag = bakeParts(a.mag, a.hand, def.id + 'm', true);
    if (a.pumpParts) out.pump = bakeParts(a.pumpParts, [0, 0], def.id + 'p');
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
