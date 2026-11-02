'use strict';
// =====================================================================
//  MAP — Checkpoint Sable (military checkpoint)
//  The refugee queue, HESCO line, a watchtower with a floodlight, the
//  container command post and the overrun camp behind the line.
// =====================================================================

(() => {
  const G = 1100, TOWER = 820;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 1400, 300, 'dirt'), MB.block(1400, G, 2800, 300, 'asphalt'), MB.block(4200, G, 1400, 300, 'dirt'));

  // ---- refugee side
  add(MB.prop('car', 160, G), MB.prop('car', 760, G, { flip: true }), MB.deco('tent', 420, G, { w: 220, h: 120 }), MB.deco('tent', 1040, G, { w: 200, h: 110 }));
  add(MB.prop('crate_small', 600, G), MB.prop('crate_small', 1250, G), MB.deco('corpse_old', 330, G), MB.deco('corpse_old', 1180, G), MB.deco('bodybag', 940, G));
  add(MB.fire(540, G - 4, { r: 280, harmless: true }), MB.deco('fence', 1250, G, { w: 150, h: 150 }), MB.deco('wire', 1260, G - 26, { w: 140 }));
  add(MB.note(700, 1080, 'Refugee\'s letter', 'They told us to queue. Families first, papers ready, no sick.\nWe queued for four days. On the fifth they said the line was closed.\n\nA man coughed near the gate and they shot him. Then everyone ran.\nThen they shot everyone.'));

  // ---- the line
  add(MB.barricade(1380, G), MB.barricade(2300, G), MB.prop('hesco', 1440, G), MB.prop('hesco', 1520, G), MB.prop('jersey', 1640, G), MB.prop('sandbags', 1770, G), MB.deco('wire', 1420, G - 110, { w: 180 }));
  add(MB.deco('sign', 1600, 880, { text: 'CHECKPOINT SABLE — HALT', w: 250, h: 28, bg: '#4a1a10' }), MB.deco('sign', 1600, 912, { text: 'LETHAL FORCE AUTHORISED', w: 250, h: 22, bg: '#1a1a1a', color: '#e8c030' }));
  // watchtower
  add(MB.block(1925, TOWER, 135, 16, 'wood'), MB.plat(1885, TOWER, 40, 'grate', 8), MB.ladder(1891, TOWER, G - TOWER));
  add(MB.block(1870, 640, 200, 14, 'corrugated'), MB.deco('vpipe', 1880, 654, { h: 446 }), MB.deco('vpipe', 2044, 654, { h: 446 }), MB.prop('sandbags', 1960, TOWER, { w: 90, h: 40 }));
  add(MB.light(2010, 668, { r: 620, color: '#e8f0ff', kind: 'street', shaft: 430, clip: null, int: 1.2 }), MB.light(1600, 820, { r: 380, color: '#e8f0ff', kind: 'street', shaft: 270, flicker: 0.4, clip: null }));
  add(MB.pickup('ammo', 1990, 800, { ammo: '.338' }), MB.pickup('ammo', 2020, 800, { ammo: '.308' }));
  add(MB.note(2040, 790, 'Rules of engagement — Directive 9', '1. The cordon will be maintained at all costs.\n2. Any person crossing the line without clearance is presumed infected.\n3. Presumed infected persons will be stopped by any means.\n4. There will be no exceptions for age, condition or claim of immunity.\n\nPencil in the margin: "They stopped being people around day 6. We stopped being soldiers around day 4."'));

  // ---- container command post (2400-2760)
  add(MB.wall(2400, G, 'door', { mat: 'metal', door: { metal: true } }), MB.wall(2736, G, 'door', { mat: 'metal', door: { metal: true } }), MB.block(2400, 860, 360, 30, 'corrugated'));
  add(MB.bw(2424, 890, 312, 210, 'metal'), MB.bulb(2580, 890, { color: '#e8f0d0', flicker: 0.3 }));
  add(MB.prop('desk', 2470, G), MB.prop('cabinet', 2690, G), MB.deco('radio', 2500, G - 44), MB.deco('board', 2600, 920));
  add(MB.pickup('armor', 2640, 1090), MB.pickup('ammo', 2560, 1090, { ammo: '5.56' }));
  add(MB.note(2620, 1050, 'Radio log — CP Sable', '0412 SABLE to CORDON: line breached at grid 4, requesting fire support.\n0413 CORDON: negative. Hold.\n0430 SABLE: half the platoon is symptomatic. Requesting medevac.\n0431 CORDON: negative. You are inside the line now. Hold.\n0500 SABLE: ...\n0600 SABLE: ...'));

  // ---- military camp
  add(MB.prop('mil_truck', 2860, G), MB.deco('tent', 3220, G, { w: 260, h: 140 }), MB.prop('generator', 3520, G), MB.prop('ammo_crate', 3620, G), MB.prop('ammo_crate', 3624, G - 34), MB.prop('barrel_red', 3700, G));
  add(MB.prop('mil_truck', 3780, G, { flip: true }), MB.deco('flag', 3500, G, { h: 200 }), MB.fire(3460, G - 4, { r: 260, harmless: true }), MB.prop('sandbags', 4120, G));
  add(MB.light(3300, 820, { r: 420, color: '#e8f0ff', kind: 'street', shaft: 270, flicker: 0.85, clip: null }), MB.deco('lamp', 3270, G));
  add(MB.pickup('grenade', 3640, 1000), MB.pickup('ammo', 3200, 1090, { ammo: 'belt' }));
  add(MB.deco('graffiti', 2900, 850, { text: 'SABLE NEVER FELL', color: '#c8c8b8', w: 260, h: 36 }), MB.deco('corpse_old', 3100, G), MB.deco('bodybag', 3900, G));

  // ---- inner cordon & road to the city
  add(MB.prop('hesco', 4300, G), MB.prop('hesco', 4380, G), MB.deco('wire', 4280, G - 110, { w: 180 }), MB.prop('car', 4700, G), MB.fire(4820, G - 84, { harmless: true }), MB.prop('jersey', 5200, G));
  add(MB.deco('tree', 5000, G, { h: 280 }), MB.lamp(4550, G, { flicker: 0.7 }));

  add(MB.spawn(40, G), MB.spawn(500, G), MB.spawn(1100, G), MB.spawn(5560, G), MB.spawn(5000, G), MB.spawn(4500, G));
  add(MB.player(2200, G));
  add(MB.zombie('soldier', 3400, G), MB.zombie('soldier', 3900, G), MB.zombie('walker', 900, G));

  MapLib.register({
    id: 'checkpoint', name: 'Checkpoint Sable', subtitle: 'Military checkpoint',
    desc: 'Where the cordon met the people it was built to keep in. HESCO walls, razor wire, a floodlit watchtower, the container command post and an overrun camp.',
    theme: 'checkpoint', width: 5600, height: 1400, horizon: G,
    ambient: '#28282e', ambientLevel: 0.22, fog: 0.5, weather: 'ash', reverb: 0.15, amb: 'amb_wind', bias: { soldier: 3, riot: 0.3 },
    objects: o,
  });
})();
