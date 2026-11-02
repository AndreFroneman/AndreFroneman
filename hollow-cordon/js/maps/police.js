'use strict';
// =====================================================================
//  MAP — Precinct 9 (police station)
//  Lobby, bullpen, holding cells, armory, garage; offices, records and
//  the chief's office upstairs; roof access; riot-gear infected.
// =====================================================================

(() => {
  const G = 1100, F2 = 860, F3 = 620;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 700, 300, 'asphalt'), MB.block(700, G, 3300, 300, 'concrete'), MB.block(4000, G, 600, 300, 'asphalt'));

  // ---- exterior
  add(MB.prop('car_police', 40, G), MB.prop('car_police', 300, G, { flip: true }), MB.prop('sandbags', 470, G), MB.lamp(540, G));
  add(MB.deco('flag', 470, G), MB.deco('tape', 280, 1040, { w: 260, text: 'POLICE LINE — DO NOT CROSS' }));
  add(MB.plat(652, 810, 48, 'grate', 8), MB.ladder(666, 810, 290), MB.plat(4000, 810, 48, 'grate', 8), MB.ladder(4006, 810, 290));

  // ---- shell
  add(MB.wall(700, G, 'door', { w: 30, mat: 'concrete_light' }), MB.wall(700, F2, 'window', { w: 30, mat: 'concrete_light' }));
  add(MB.wall(3970, G, 'door', { w: 30, mat: 'concrete_light', door: { metal: true } }), MB.wall(3970, F2, 'window', { w: 30, mat: 'concrete_light' }));
  add(MB.slab(700, 4000, F2, [[1150, 1400]]), MB.plat(1150, F2, 250, 'grate'), MB.stairs(1150, G, 250, 240, 1));
  add(MB.slab(700, 4000, F3, [[2600, 2645]]), MB.plat(2600, F3, 45, 'metal', 8), MB.ladder(2608, F3, 240));
  // ground floor walls
  add(MB.wall(1500, G, 'door'), MB.wall(2400, G, 'door'), MB.wall(3000, G, 'door', { door: { metal: true } }), MB.wall(3400, G, 'door', { door: { metal: true } }));
  add(MB.wall(2000, F2, 'door'), MB.wall(3000, F2, 'door'));

  // ---- rooms
  add(MB.bw(730, 890, 770, 210, 'plaster_blue', { wainscot: '#2a3446' }), MB.bw(1524, 890, 876, 210, 'plaster'), MB.bw(2424, 890, 576, 210, 'concrete', { dark: 0.5 }));
  add(MB.bw(3024, 890, 376, 210, 'metal'), MB.bw(3424, 890, 546, 210, 'corrugated'));
  add(MB.bw(730, 650, 1270, 210, 'plaster_blue'), MB.bw(2024, 650, 976, 210, 'wood_dark'), MB.bw(3024, 650, 946, 210, 'wallpaper'));

  // lobby
  add(MB.deco('sign', 760, 905, { text: 'MARROW FALLS PD — PRECINCT 9', w: 280, h: 26, bg: '#1a2a4a' }), MB.deco('poster', 1060, 945, { text: 'WANTED INFORMATION', color: '#2a3a5a' }), MB.deco('clock', 1440, 920));
  add(MB.prop('counter', 880, G), MB.prop('chair', 1040, G), MB.prop('chair', 1066, G), MB.deco('handprints', 1460, 980));
  add(MB.fluoro(950, 890), MB.fluoro(1300, 890, { flicker: 0.3 }));
  // bullpen
  add(MB.prop('desk', 1600, G), MB.prop('chair', 1700, G), MB.prop('desk', 1850, G), MB.prop('cabinet', 2050, G), MB.prop('cabinet', 2090, G), MB.prop('desk', 2200, G));
  add(MB.deco('board', 1640, 930), MB.deco('graffiti', 1860, 925, { text: 'RIOT GEAR DIDNT HELP', color: '#a01a14', w: 300, h: 36 }), MB.deco('blood', 2250, 960));
  add(MB.fluoro(1700, 890, { flicker: 0.5 }), MB.fluoro(2150, 890, { flicker: 0.9 }));
  add(MB.note(1880, 1040, 'Desk sergeant\'s log', '0300 — Riot kit issued to all shifts. Orders: hold the inner cordon at Kessler bridge.\n0420 — Garcia and Pell bitten on the line. Both fine. Both FINE.\n0510 — Pell is in cell 2. Garcia is in cell 3. Neither is talking anymore.\n0600 — The visors don\'t stop the teeth.'));
  // holding cells
  add(MB.deco('bars', 2440, 950, { w: 260, h: 150 }), MB.deco('bars', 2720, 950, { w: 260, h: 150 }), MB.deco('tape', 2450, 1010, { w: 520, text: 'EVIDENCE — DO NOT DISTURB' }));
  add(MB.deco('corpse_old', 2560, G), MB.deco('crack', 2900, 900), MB.deco('handprints', 2600, 960));
  add(MB.light(2700, 905, { r: 260, color: '#e0e8ff', kind: 'fluoro', flicker: 0.95 }), MB.deco('fixture', 2655, 890));
  add(MB.note(2850, 1060, 'Scratched into the cell wall', 'PELL — DAY 2\nTHEY SAID 24 HOURS OBSERVATION\nI CAN HEAR GARCIA EATING\nTELL MY DAUGHTER I'));
  // armory
  add(MB.prop('locker', 3040, G), MB.prop('locker', 3082, G), MB.prop('ammo_crate', 3180, G), MB.prop('ammo_crate', 3184, G - 34));
  add(MB.pickup('ammo', 3260, 1090, { ammo: '.45' }), MB.pickup('ammo', 3290, 1090, { ammo: '12g' }), MB.pickup('ammo', 3320, 1090, { ammo: '5.56' }), MB.pickup('armor', 3350, 1090));
  add(MB.light(3210, 905, { r: 230, color: '#ff2a1e', kind: 'emergency', flicker: 1 }), MB.deco('sign', 3050, 905, { text: 'ARMORY', w: 90, h: 22, bg: '#3a3a3a' }));
  add(MB.note(3330, 1050, 'Armory sign-out sheet', 'Shotguns: 11 out, 0 returned.\nRifles: 6 out, 1 returned (empty, bloody).\nRiot shields: all out.\n\nIf you are reading this and you are not police — take what is left. Nobody is coming to arrest you.'));
  // garage
  add(MB.prop('car_police', 3520, G), MB.prop('barrel_red', 3760, G), MB.prop('tires', 3800, G), MB.prop('generator', 3870, G));
  add(MB.bulb(3600, 890, { flicker: 0.3 }), MB.bulb(3880, 890), MB.deco('sign', 3450, 905, { text: 'MOTOR POOL', w: 110, h: 22, bg: '#4a3a1a' }));
  // upstairs offices
  add(MB.prop('desk', 800, F2), MB.prop('chair', 900, F2), MB.prop('desk', 1500, F2), MB.prop('cabinet', 1700, F2), MB.prop('cabinet', 1740, F2), MB.prop('chair', 1880, F2));
  add(MB.fluoro(1000, 650, { flicker: 0.3 }), MB.fluoro(1650, 650), MB.deco('window_bg', 760, 690, { w: 70, h: 100 }), MB.deco('board', 1200, 700));
  add(MB.prop('shelf', 2100, F2), MB.prop('shelf', 2190, F2), MB.prop('shelf', 2600, F2), MB.prop('shelf', 2850, F2), MB.bulb(2300, 650), MB.bulb(2750, 650, { flicker: 0.7 }));
  add(MB.deco('graffiti', 2200, 690, { text: 'FILES BURNED', color: '#c8c8c0', w: 190, h: 34 }));
  add(MB.prop('desk', 3500, F2), MB.prop('chair', 3600, F2), MB.prop('cabinet', 3880, F2), MB.deco('flag', 3780, F2), MB.bulb(3550, 650, { color: '#ffd090' }), MB.deco('window_bg', 3180, 690, { w: 80, h: 100 }));
  add(MB.pickup('ammo', 3640, 850, { ammo: '.357' }), MB.pickup('grenade', 3700, 850));
  add(MB.note(3560, 820, 'Memo from the Chief', 'To all officers: by order of the Cordon Authority we are now an extension of the line. Directive 9 supersedes department policy.\n\nI know what that means. So do you.\n\nGod forgive us. — Chief R. Halvorsen'));

  // ---- east lot
  add(MB.prop('car', 4130, G), MB.prop('dumpster', 4400, G), MB.lamp(4520, G, { flicker: 0.4 }), MB.deco('fence', 4380, G, { w: 220, h: 150 }));

  add(MB.spawn(40, G), MB.spawn(400, G), MB.spawn(4560, G), MB.spawn(4280, G), MB.spawn(2900, G, 'vent'), MB.spawn(3700, F3));
  add(MB.player(1000, G));
  add(MB.zombie('riot', 2550, G), MB.zombie('riot', 2850, G), MB.zombie('walker', 3200, F2));

  MapLib.register({
    id: 'police', name: 'Precinct 9', subtitle: 'Police station',
    desc: 'The precinct that held the inner cordon. Holding cells, a half-emptied armory, a motor pool and the chief\'s office. Many officers are still in uniform.',
    theme: 'police', width: 4600, height: 1400, horizon: G,
    ambient: '#1a1e28', ambientLevel: 0.16, fog: 0.35, weather: 'none', reverb: 0.45, amb: 'amb_room', bias: { riot: 2.5 },
    objects: o,
  });
})();
