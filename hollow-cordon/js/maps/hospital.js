'use strict';
// =====================================================================
//  MAP — St. Halloran Memorial Hospital (vertical-slice map)
//  Two floors + roof, ambulance bay, loading dock, fire escapes,
//  stairwell, collapsed corridor floor, isolation ward.
// =====================================================================

(() => {
  const G = 1100, F2 = 860, ROOF = 620;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  // ---- ground & structure
  add(MB.block(0, G, 800, 300, 'asphalt'), MB.block(800, G, 3100, 300, 'concrete'), MB.block(3900, G, 700, 300, 'asphalt'));
  add(MB.block(800, ROOF, 395, 30), MB.block(1240, ROOF, 2660, 30), MB.plat(1195, ROOF, 45, 'metal', 8));
  add(MB.block(800, F2, 1490, 30), MB.block(2350, F2, 350, 30), MB.block(2950, F2, 950, 30));
  add(MB.plat(2700, F2, 250, 'grate', 10)); // stairwell landing / catwalk
  // exterior walls: window + sill on floor 2, door on ground floor
  for (const wx of [800, 3870]) add(MB.block(wx, 650, 30, 90, 'brick'), MB.block(wx, 810, 30, 50, 'brick'), MB.block(wx, 890, 30, 78, 'brick'));
  // interior walls (lintels above doorways)
  add(MB.block(1700, 890, 24, 78), MB.block(2650, 890, 24, 78), MB.block(2950, 890, 24, 78));
  add(MB.block(1700, 650, 24, 78), MB.block(2950, 650, 24, 78), MB.block(3400, 650, 24, 78));
  add(MB.stairs(2700, G, 250, 240, -1));
  add(MB.ladder(1203, ROOF, 240));                 // roof hatch
  add(MB.ladder(766, 810, 290), MB.ladder(3906, 810, 290)); // fire escapes
  add(MB.plat(752, 810, 48, 'grate', 8), MB.plat(3900, 810, 48, 'grate', 8));

  // ---- rooms (back walls)
  add(MB.bw(830, 890, 870, 210, 'tile', { wainscot: '#3a4a40' }));          // lobby
  add(MB.bw(1724, 890, 926, 210, 'tile'));                                    // ER bays
  add(MB.bw(2674, 650, 276, 450, 'concrete'));                                 // stairwell
  add(MB.bw(2974, 890, 896, 210, 'tile_white'));                               // morgue
  add(MB.bw(830, 650, 870, 210, 'tile', { wainscot: '#4a5a50' }));            // ward A
  add(MB.bw(1724, 650, 950, 210, 'plaster'));                                  // ward corridor
  add(MB.bw(2290, 860, 60, 30, 'concrete'));                                   // collapsed floor
  add(MB.bw(2974, 650, 426, 210, 'plaster'));                                  // records
  add(MB.bw(3424, 650, 446, 210, 'tile_white', { dark: 0.5 }));               // isolation

  // ---- doors & windows
  add(MB.barricade(880, G), MB.barricade(3790, G));
  add(MB.door(808, G, { label: 'Entrance' }), MB.door(1705, G), MB.door(2655, G), MB.door(2955, G), MB.door(3877, G, { metal: true }));
  add(MB.door(1705, F2), MB.door(2955, F2), MB.door(3405, F2, { metal: true, locked: true }));
  add(MB.win(807, 740), MB.win(3877, 740));

  // ---- lighting
  add(MB.fluoro(1000, 890, { flicker: 0.25 }), MB.fluoro(1400, 890, { flicker: 0.1 }));
  add(MB.fluoro(1900, 890, { flicker: 0.95 }), MB.fluoro(2350, 890, { int: 0.8 }));
  add(MB.light(2610, 912, { r: 220, color: '#ff2a1e', kind: 'emergency', flicker: 1 }));
  add(MB.bulb(2830, 650, { r: 300 }), MB.light(2830, 905, { r: 200, color: '#ff3020', kind: 'emergency', flicker: 1 }));
  add(MB.fluoro(3200, 890, { color: '#a8c8ff', r: 360 }), MB.fluoro(3620, 890, { color: '#a8c8ff', flicker: 0.6 }));
  add(MB.fluoro(1000, 650, { flicker: 0.15 }), MB.fluoro(1450, 650, { flicker: 0.7 }));
  add(MB.bulb(2050, 650, { r: 240, color: '#ffb870' }), MB.light(2500, 700, { r: 200, color: '#ffb060', int: 0.7, kind: 'fire', flicker: 1 }));
  add(MB.bulb(3180, 650, { r: 280 }), MB.light(3650, 680, { r: 260, color: '#ff2a1e', kind: 'emergency', flicker: 1 }));
  add(MB.lamp(600, G, { flicker: 0.15 }), MB.lamp(4250, G, { flicker: 0.8 }));
  add(MB.light(2320, 600, { r: 160, color: '#9aa8c0', int: 0.4, clip: null }));

  // ---- set dressing / storytelling
  add(MB.deco('sign', 860, 900, { text: 'ST. HALLORAN — EMERGENCY', w: 230, h: 26, bg: '#6a1612' }));
  add(MB.deco('redcross', 640, 860), MB.deco('fence', 0, G, { w: 160, h: 150 }), MB.deco('tape', 20, 1050, { w: 230 }));
  add(MB.deco('poster', 1460, 940, { text: 'STAY INSIDE WAIT FOR ORDERS' }), MB.deco('clock', 1240, 925), MB.deco('board', 960, 950));
  add(MB.deco('handprints', 1620, 975), MB.deco('blood', 1150, 1000, { alpha: 0.9 }));
  add(MB.deco('sign', 1760, 905, { text: 'TRIAGE', w: 90, h: 22, bg: '#1a3a5a' }), MB.deco('curtain', 1790, 908), MB.deco('curtain', 2080, 908), MB.deco('iv', 1955, G), MB.deco('iv', 2250, G));
  add(MB.deco('graffiti', 2380, 920, { text: 'THEY ARE NOT SICK', color: '#9a1a14', w: 240, h: 40 }), MB.deco('bodybag', 2420, G), MB.deco('bodybag', 2515, G));
  add(MB.deco('sign', 2700, 905, { text: 'STAIRS · WARD B ↑', w: 140, h: 22, bg: '#1a4a2a' }), MB.deco('crack', 2780, 660), MB.deco('graffiti', 2730, 720, { text: 'DONT GO UP', color: '#c8c8c0', w: 170, h: 34 }));
  add(MB.deco('sign', 3050, 905, { text: 'MORGUE', w: 100, h: 24, bg: '#2a2a32' }), MB.deco('shelf_bg', 3400, G, { w: 160, h: 160 }), MB.deco('bodybag', 3300, G), MB.deco('corpse_old', 3100, G));
  add(MB.deco('graffiti', 3560, 930, { text: '41 ... THEN 40', color: '#a01a14', w: 200, h: 36 }), MB.deco('vent', 3700, 1060), MB.deco('handprints', 3820, 960));
  add(MB.deco('window_bg', 880, 680, { w: 80, h: 100 }), MB.deco('window_bg', 1550, 680, { w: 80, h: 100 }), MB.deco('curtain', 1080, 668, { w: 120 }));
  add(MB.deco('iv', 1000, F2), MB.deco('iv', 1330, F2), MB.deco('handprints', 1640, 740), MB.deco('vent', 1290, 815));
  add(MB.deco('graffiti', 1800, 690, { text: 'WE WAITED FOR THE CORDON', color: '#a81c16', w: 330, h: 36 }), MB.deco('blood', 2150, 760), MB.deco('poster', 2560, 700, { text: 'WASH HANDS SAVE LIVES' }));
  add(MB.deco('cables', 2270, 650, { w: 100, h: 50 }), MB.deco('board', 3080, 700), MB.deco('poster', 3300, 690, { text: 'DIRECTIVE 9 REMAIN ON SITE', color: '#2a3a5a' }));
  add(MB.deco('sign', 3440, 668, { text: 'ISOLATION — DO NOT OPEN', w: 200, h: 22, bg: '#7a1410' }), MB.deco('handprints', 3470, 720), MB.deco('blood', 3600, 760), MB.deco('bodybag', 3700, F2));
  add(MB.deco('pallet', 4100, G), MB.deco('fence', 4420, G, { w: 180, h: 150 }), MB.deco('sign', 3960, 905, { text: 'LOADING', w: 100, h: 24, bg: '#5a4a1a' }));

  // ---- props
  add(MB.prop('ambulance', 150, G), MB.prop('dumpster', 470, G), MB.prop('barrel_red', 712, G), MB.prop('crate', 380, G));
  add(MB.prop('desk', 1060, G), MB.prop('chair', 1290, G), MB.prop('chair', 1316, G), MB.prop('chair', 1342, G), MB.prop('vending', 1580, G));
  add(MB.prop('gurney', 1840, G), MB.prop('gurney', 2170, G), MB.prop('cabinet', 2560, G), MB.prop('crate_small', 2470, G));
  add(MB.prop('gurney', 3140, G), MB.prop('cabinet', 3760, G), MB.prop('cabinet', 3796, G), MB.prop('propane', 3600, G));
  add(MB.prop('bed', 880, F2), MB.prop('bed', 1290, F2), MB.prop('bed', 1480, F2));
  add(MB.prop('chair', 1900, F2), MB.prop('crate', 2560, F2), MB.prop('desk', 3020, F2), MB.prop('cabinet', 3300, F2), MB.prop('locker', 3520, F2), MB.prop('bed', 3700, F2));
  add(MB.prop('crate', 4060, G), MB.prop('crate', 4064, G - 50), MB.prop('barrel_red', 4300, G), MB.prop('barrel', 4340, G), MB.prop('dumpster', 4440, G));

  // ---- notes
  add(MB.note(1120, 1040, 'Triage log — night shift', '23:10 — Fourteen admitted with the fever. Pupils fixed, temps over 41.\n23:40 — Bay 3 bit Dr. Amsel. Sedation had no effect.\n00:15 — Cordon Directive 9 read out on the radio. No transfers. No discharges.\n00:50 — Bay 3 is empty. The restraints didn\'t break. They were chewed through.'));
  add(MB.note(1600, 820, 'Scrawled on a chart', 'I can hear them under the floor. Nurse Hale told us to keep quiet and the lights off. She went for supplies two hours ago.\n\nIf you find this, she was the only one who stayed.\n— M., bed 6'));
  add(MB.note(3480, 1040, 'Morgue drawer count', 'Drawer count at shift change: 41.\nCounted again at 02:00: 40.\nNobody signed anything out.\n\nI am not opening the drawers again.'));
  add(MB.note(3180, 820, 'Memo — Marrow Falls Health Authority', 'Under CORDON DIRECTIVE 9 all clinical personnel will remain on site until relieved by military medical units.\n\nDo not attempt to leave the quarantine perimeter. Lethal force has been authorised at the line.\n\nThis is for the protection of the wider population.'));
  add(MB.note(430, 1080, 'Ambulance radio log', '"Unit 7 to dispatch. We can\'t get through — they\'re turning ambulances back at the Kessler bridge.\n\nDispatch, the patients in the back... the patients are moving. Dispatch, please advise—"\n\n[static]'));

  // ---- spawns
  add(MB.spawn(40, G), MB.spawn(320, G), MB.spawn(4560, G), MB.spawn(4200, G), MB.spawn(1350, F2, 'vent'), MB.spawn(3720, G, 'vent'), MB.spawn(1100, ROOF));
  add(MB.player(1250, G));
  // a few residents for sandbox / exploration
  add(MB.zombie('walker', 3600, F2), MB.zombie('walker', 3780, F2), MB.zombie('crawler', 3200, G));

  MapLib.register({
    id: 'hospital', name: 'St. Halloran Memorial', subtitle: 'Abandoned hospital',
    desc: 'Two floors of flickering wards, a stairwell, a morgue that keeps losing bodies, fire escapes and an ambulance bay. The first place the fever was named.',
    theme: 'hospital', width: 4600, height: 1400, horizon: G,
    ambient: '#1c2028', ambientLevel: 0.16, fog: 0.45, weather: 'rain', reverb: 0.45, amb: 'amb_room',
    objects: o,
  });
})();
