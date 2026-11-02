'use strict';
// =====================================================================
//  MAP — Varga Steelworks (industrial factory)
//  One cavernous hall: two catwalk tiers, ladders, a roaring furnace,
//  shipping containers, gas cylinders and an elevated control room.
// =====================================================================

(() => {
  const G = 1100, C1 = 860, C2 = 640, ROOF = 400;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 600, 300, 'dirt'), MB.block(600, G, 3600, 300, 'concrete'), MB.block(4200, G, 1000, 300, 'dirt'));
  // hall shell
  add(MB.wall(600, G, 'door', { w: 30, mat: 'corrugated', door: { metal: true } }), MB.block(600, ROOF + 30, 30, 460, 'corrugated'));
  add(MB.wall(4170, G, 'door', { w: 30, mat: 'corrugated', door: { metal: true } }), MB.block(4170, ROOF + 30, 30, 460, 'corrugated'));
  add(MB.block(600, ROOF, 3600, 30, 'metal'));
  add(MB.bw(630, ROOF + 30, 3540, 670, 'corrugated', { dark: 0.45 }));
  // catwalks + ladders
  add(MB.plat(700, C1, 700, 'grate'), MB.plat(2800, C1, 900, 'grate'));
  add(MB.plat(1200, C2, 2100, 'grate'));
  add(MB.ladder(676, C1, 240), MB.ladder(1352, C2, 220), MB.ladder(2420, C2, 460), MB.ladder(2840, C1, 240), MB.ladder(3311, C2, 220));
  // control room (raised, solid floor)
  add(MB.block(3350, C2, 820, 30, 'metal'), MB.plat(3300, C2, 50, 'metal', 8), MB.wall(3600, C2, 'door', { mat: 'metal', door: { metal: true } }));
  add(MB.bw(3624, ROOF + 30, 546, 210, 'plaster'));
  add(MB.prop('desk', 3700, C2), MB.prop('chair', 3800, C2), MB.prop('cabinet', 4080, C2), MB.deco('radio', 3720, C2 - 44), MB.deco('board', 3900, 470));
  add(MB.bulb(3880, ROOF + 30, { color: '#ffe0a0' }), MB.deco('window_bg', 3660, 470, { w: 70, h: 80 }));
  add(MB.note(3760, 610, 'Shift supervisor\'s report', 'River intake 3 tested positive for the agent on the 2nd. Varga management ordered the result sealed and production continued.\n\nBy the 6th, half of B-shift was running fevers. By the 8th they were back on the floor. Walking the line. Not working.\n\nThe furnace has not been banked in a week. Nobody will go near it.'));

  // furnace & heavy plant
  add(MB.deco('furnace', 2000, G), MB.light(2150, 1000, { r: 520, color: '#ff8a30', kind: 'fire', flicker: 1, int: 1.3, clip: null }), MB.fire(2150, 800, { r: 260 }));
  add(MB.prop('container', 1480, G), MB.prop('container', 3420, G), MB.prop('forklift', 1050, G), MB.prop('workbench', 2500, G), MB.prop('workbench', 3200, G));
  add(MB.prop('propane', 1860, G), MB.prop('propane', 1890, G), MB.prop('barrel_red', 2380, G), MB.prop('barrel', 2420, G), MB.prop('crate', 860, G), MB.prop('crate', 864, G - 50), MB.prop('crate_small', 920, G));
  add(MB.prop('shelf', 3950, G), MB.prop('crate', 4040, G), MB.prop('ammo_crate', 1250, C1), MB.prop('barrel', 3000, C1), MB.prop('crate_small', 1700, C2));
  add(MB.pickup('ammo', 1300, C1 - 40, { ammo: '7.62' }), MB.pickup('medkit', 2000, C2 - 10), MB.pickup('ammo', 3100, C1 - 10, { ammo: '.308' }));
  // set dressing
  for (const x of [900, 1300, 1700, 2600, 3000, 3900]) add(MB.deco('chains', x, ROOF + 30, { h: rand(120, 260) | 0 }));
  add(MB.deco('pipe', 630, 470, { w: 1200 }), MB.deco('pipe', 2400, 470, { w: 1200 }), MB.deco('vpipe', 1440, ROOF + 30, { h: 400 }), MB.deco('cables', 2500, ROOF + 30, { w: 300, h: 70 }));
  add(MB.deco('sign', 700, 560, { text: 'VARGA STEELWORKS — HALL 2', w: 260, h: 28, bg: '#5a3a14' }), MB.deco('sign', 2700, 540, { text: 'DAYS SINCE LAST INCIDENT: 0', w: 270, h: 24, bg: '#2a2a2a', color: '#e8b030' }));
  add(MB.deco('graffiti', 1500, 900, { text: 'THE WATER', color: '#c8c8c0', w: 150, h: 40 }), MB.deco('blood', 2700, 980), MB.deco('handprints', 3550, 950), MB.deco('window_bg', 1000, 470, { w: 90, h: 90 }), MB.deco('window_bg', 3100, 470, { w: 90, h: 90 }));
  add(MB.deco('pallet', 2700, G), MB.deco('corpse_old', 1200, G), MB.deco('bodybag', 3300, G));
  add(MB.note(2260, 1060, 'Foreman\'s note, taped to the furnace', 'DO NOT LET THE FIRE DIE.\nThey are scared of it. It is the only thing they are scared of.\nKeep the gas cylinders AWAY from the mouth.'));
  // lights
  for (const x of [800, 1250, 1700, 2650, 3100]) add(MB.bulb(x, ROOF + 30, { r: 300, flicker: x === 1700 ? 0.8 : 0.25, color: '#ffc880' }));
  add(MB.light(700, 840, { r: 200, color: '#ff2a1e', kind: 'emergency', flicker: 1 }), MB.light(4100, 1000, { r: 220, color: '#ff2a1e', kind: 'emergency', flicker: 1 }));

  // yards
  add(MB.prop('mil_truck', 150, G), MB.deco('fence', 470, G, { w: 120, h: 150 }), MB.lamp(520, G, { flicker: 0.3 }));
  add(MB.prop('container', 4400, G), MB.prop('barrel_red', 4750, G), MB.prop('barrel', 4790, G), MB.deco('pallet', 4900, G), MB.lamp(4700, G));
  add(MB.deco('sign', 4250, 900, { text: 'GOODS IN', w: 100, h: 24, bg: '#5a4a1a' }));

  add(MB.spawn(40, G), MB.spawn(420, G), MB.spawn(5160, G), MB.spawn(4980, G), MB.spawn(1100, C1, 'vent'), MB.spawn(3500, G, 'vent'), MB.spawn(4500, G - 130));
  add(MB.player(1750, G));
  add(MB.zombie('walker', 3000, G), MB.zombie('bloater', 2600, G), MB.zombie('walker', 1800, C2));

  MapLib.register({
    id: 'factory', name: 'Varga Steelworks', subtitle: 'Industrial factory',
    desc: 'A cavernous steel hall lit by a furnace nobody dares bank. Two tiers of catwalks, shipping containers, gas cylinders — and the control room where the water results were buried.',
    theme: 'factory', width: 5200, height: 1400, horizon: G,
    ambient: '#1e1a16', ambientLevel: 0.15, fog: 0.5, weather: 'ash', reverb: 0.6, amb: 'amb_factory', bias: { bloater: 1.6 },
    objects: o,
  });
})();
