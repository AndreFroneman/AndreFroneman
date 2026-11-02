'use strict';
// =====================================================================
//  MAP — Kessler Avenue (city streets)
//  Police roadblock, Rossi Pharmacy, burning wrecks, a crashed bus,
//  the three-storey Calder Apartments with an exterior fire escape.
// =====================================================================

(() => {
  const G = 1100, F2 = 860, F3 = 620, F4 = 380;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 5400, 300, 'asphalt'));

  // ---- west roadblock
  add(MB.prop('car_police', 110, G), MB.prop('jersey', 400, G), MB.prop('jersey', 560, G, { flip: true }));
  add(MB.deco('tape', 360, 1046, { w: 330 }), MB.lamp(690, G, { flicker: 0.1 }));
  add(MB.deco('sign', 40, 900, { text: 'CORDON LINE — TURN BACK', w: 220, h: 26, bg: '#7a1410' }), MB.deco('corpse_old', 330, G));

  // ---- Rossi Pharmacy (800-1700)
  add(MB.wall(800, G, 'door', { w: 30, mat: 'brick' }), MB.wall(800, F2, 'window', { w: 30, mat: 'brick' }));
  add(MB.wall(1670, G, 'door', { w: 30, mat: 'brick' }), MB.wall(1670, F2, 'window', { w: 30, mat: 'brick' }));
  add(MB.slab(800, 1700, F2, [[1350, 1600]]), MB.plat(1350, F2, 250, 'grate'), MB.stairs(1350, G, 250, 240, 1));
  add(MB.slab(800, 1700, F3, [[880, 925]]), MB.plat(880, F3, 45, 'metal', 8), MB.ladder(888, F3, 240));
  add(MB.bw(830, 890, 840, 210, 'tile_blue', { wainscot: '#2a3a40' }), MB.bw(830, 650, 840, 210, 'wallpaper'));
  add(MB.fluoro(1000, 890, { flicker: 0.2 }), MB.fluoro(1460, 890, { flicker: 0.7 }), MB.bulb(1150, 650), MB.bulb(1520, 650, { flicker: 0.6 }));
  add(MB.deco('sign', 860, 905, { text: 'ROSSI PHARMACY', w: 170, h: 24, bg: '#1a5a2a' }), MB.deco('redcross', 1260, 915), MB.deco('poster', 1080, 950, { text: 'NO MORE ANTIVIRALS' }));
  add(MB.deco('graffiti', 1360, 975, { text: 'LOOTED', color: '#c8c8c0', w: 150, h: 40 }), MB.deco('handprints', 1600, 970), MB.deco('window_bg', 960, 690, { w: 80, h: 100 }));
  add(MB.deco('clock', 1300, 690), MB.deco('board', 1420, 700), MB.deco('blood', 1200, 760));
  add(MB.prop('shelf', 860, G), MB.prop('shelf', 950, G), MB.prop('counter', 1170, G), MB.prop('cabinet', 1300, G));
  add(MB.prop('bed', 860, F2), MB.prop('desk', 1080, F2), MB.prop('chair', 1190, F2), MB.prop('locker', 1630, F2));
  add(MB.pickup('medkit', 1220, 1048), MB.pickup('ammo', 1320, 1090, { ammo: '9mm' }));
  add(MB.note(1240, 1030, 'Pharmacy ledger — last page', 'Antiviral stock: 0. Saline: 0. Sedatives: 0.\n\nThe Health Authority van never came. A man in a Cordon armband took the last crate at gunpoint and said it was "for the line".\n\nThe fever does not care what we give it. Lock the door at night. They come when they hear the bell.'));

  // ---- street middle
  add(MB.prop('car', 1790, G), MB.fire(1900, G - 84, { harmless: true }));
  add(MB.prop('bus', 2160, G), MB.prop('crate_small', 2700, G), MB.prop('barrel_red', 2760, G));
  add(MB.lamp(2050, G, { flicker: 0.9 }), MB.deco('graffiti', 2240, 900, { text: 'GOD LEFT MARROW FALLS', color: '#b02a1a', w: 360, h: 50 }));
  add(MB.deco('corpse_old', 2000, G), MB.deco('bodybag', 2700, G));

  // ---- Calder Apartments (2900-3800)
  for (const x of [2900, 3770]) add(MB.wall(x, G, 'door', { w: 30, mat: 'brick' }), MB.wall(x, F2, 'window', { w: 30, mat: 'brick' }), MB.wall(x, F3, 'window', { w: 30, mat: 'brick' }));
  add(MB.slab(2900, 3800, F2, [[3400, 3650]]), MB.plat(3400, F2, 250, 'grate'), MB.stairs(3400, G, 250, 240, 1));
  add(MB.slab(2900, 3800, F3, [[3050, 3300]]), MB.plat(3050, F3, 250, 'grate'), MB.stairs(3050, F2, 250, 240, -1));
  add(MB.slab(2900, 3800, F4, [[3700, 3745]]), MB.plat(3700, F4, 45, 'metal', 8), MB.ladder(3708, F4, 240));
  add(MB.wall(3360, F2, 'door'), MB.wall(3500, F3, 'door'));
  add(MB.bw(2930, 890, 840, 210, 'brick'), MB.bw(2930, 650, 840, 210, 'wallpaper'), MB.bw(2930, 410, 840, 210, 'plaster'));
  add(MB.plat(3800, 810, 70, 'grate', 8), MB.plat(3800, 570, 70, 'grate', 8), MB.ladder(3822, 810, 290), MB.ladder(3822, 570, 240));
  add(MB.bulb(3100, 890), MB.bulb(3550, 890, { flicker: 0.5 }), MB.bulb(3050, 650, { color: '#ffb070' }), MB.bulb(3600, 650), MB.bulb(3200, 410, { flicker: 0.4 }), MB.bulb(3650, 410));
  add(MB.deco('sign', 2950, 905, { text: 'CALDER APARTMENTS', w: 190, h: 24, bg: '#3a2a1a' }), MB.deco('shelf_bg', 3150, G, { w: 120, h: 120 }), MB.deco('graffiti', 3000, 690, { text: 'APT 3B HAS FOOD', color: '#a01a14', w: 230, h: 36 }));
  add(MB.deco('window_bg', 3200, 690, { w: 80, h: 100 }), MB.deco('window_bg', 2990, 450, { w: 80, h: 100 }), MB.deco('window_bg', 3380, 450, { w: 80, h: 100 }), MB.deco('handprints', 3700, 700), MB.deco('blood', 3550, 520));
  add(MB.prop('chair', 3000, G), MB.prop('crate', 3300, G), MB.prop('bed', 2950, F2), MB.prop('cabinet', 3250, F2), MB.prop('desk', 3550, F2), MB.prop('bed', 3560, F3), MB.prop('locker', 3300, F3), MB.prop('chair', 3420, F3));
  add(MB.pickup('ammo', 3620, 610, { ammo: '12g' }), MB.pickup('planks', 3000, 850, { amount: 3 }));
  add(MB.note(3450, 590, 'Diary — Apt 5C', 'Day 9. From the roof you can see the cordon lights along the river. Searchlights all night.\n\nDay 11. Somebody tried to swim it. The searchlight followed him all the way across. Then the shooting.\n\nDay 12. The stairwell is quiet. Too quiet. I can hear breathing that isn\'t mine.'));

  // ---- east
  add(MB.prop('car', 3980, G, { rot: Math.PI }), MB.lamp(4250, G), MB.prop('mil_truck', 4480, G), MB.fire(4640, G - 130, { harmless: true }), MB.prop('dumpster', 4950, G), MB.prop('crate', 5100, G));
  add(MB.deco('fence', 5160, G, { w: 220, h: 150 }), MB.lamp(5050, G, { flicker: 0.6 }), MB.deco('corpse_old', 4300, G), MB.deco('wire', 4440, 960, { w: 120 }));
  add(MB.note(4420, 1080, 'Cordon field order (torn)', '...vehicles attempting to breach the inner line are to be disabled. Units will not render aid to the infected or the exposed. There is no distinction in the field.\n\n— Directive 9, Annex C'));

  // ---- spawns
  add(MB.spawn(40, G), MB.spawn(280, G), MB.spawn(2620, G, 'vent'), MB.spawn(5360, G), MB.spawn(4860, G), MB.spawn(3880, G), MB.spawn(1150, F3));
  add(MB.player(1100, G));
  add(MB.zombie('walker', 2400, G - 130), MB.zombie('walker', 3200, F3), MB.zombie('runner', 4300, G));

  MapLib.register({
    id: 'streets', name: 'Kessler Avenue', subtitle: 'City streets',
    desc: 'A rain-soaked avenue between a police roadblock and the river. A looted pharmacy, burning wrecks, a crashed bus and a three-storey apartment block with a fire escape.',
    theme: 'streets', width: 5400, height: 1400, horizon: G,
    ambient: '#262630', ambientLevel: 0.22, fog: 0.55, weather: 'rain', reverb: 0.22, amb: 'amb_rain', bias: { runner: 1.4 },
    objects: o,
  });
})();
