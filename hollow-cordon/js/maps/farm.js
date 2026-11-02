'use strict';
// =====================================================================
//  MAP — Hollins Farm (rural farm)
//  Corn rows, a two-storey wooden farmhouse (rifle rounds go through
//  the walls), a yard with a tractor and fuel, a barn with a hay loft.
// =====================================================================

(() => {
  const G = 1100, F2 = 860, F3 = 620;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 5400, 300, 'grass'));

  // ---- corn field west
  add(MB.deco('corn', 0, G, { w: 320, h: 140 }), MB.deco('corn', 300, G, { w: 320, h: 130, seed: 2 }), MB.deco('corn', 600, G, { w: 300, h: 140, seed: 3 }));
  add(MB.deco('tree', 150, G, { h: 340 }), MB.deco('fence', 880, G, { w: 100, h: 90 }), MB.deco('flag', 520, G - 0, { w: 60, h: 150 }));
  add(MB.note(820, 1080, 'Hand-painted sign in the corn', 'HOLLINS FARM\nPRIVATE PROPERTY\n\nWE HAVE WATER — NOT FROM THE RIVER\nCOME TO THE HOUSE\n\n(underneath, in different paint:) DONT'));

  // ---- farmhouse (1000-1900) — wooden walls
  add(MB.wall(1000, G, 'door', { mat: 'wood' }), MB.wall(1000, F2, 'window', { mat: 'wood' }));
  add(MB.wall(1876, G, 'door', { mat: 'wood' }), MB.wall(1876, F2, 'window', { mat: 'wood' }));
  add(MB.slab(1000, 1900, F2, [[1500, 1750]], 'wood_floor'), MB.plat(1500, F2, 250, 'wood_floor'), MB.stairs(1500, G, 250, 240, 1, 'wood_floor'));
  add(MB.slab(1000, 1900, F3, [[1100, 1145]], 'wood_floor'), MB.plat(1100, F3, 45, 'wood_floor', 8), MB.ladder(1108, F3, 240));
  add(MB.wall(1400, G, 'arch', { mat: 'wood' }), MB.wall(1320, F2, 'door', { mat: 'wood' }));
  add(MB.bw(1024, 890, 852, 210, 'wallpaper', { wainscot: '#3a2a1a' }), MB.bw(1024, 650, 852, 210, 'wood'));
  add(MB.prop('desk', 1060, G), MB.prop('chair', 1160, G), MB.prop('cabinet', 1330, G), MB.prop('chair', 1700, G), MB.prop('bed', 1060, F2), MB.prop('cabinet', 1250, F2), MB.prop('chair', 1800, F2));
  add(MB.bulb(1200, 890, { color: '#ffb060', flicker: 0.35 }), MB.bulb(1650, 890, { color: '#ffb060' }), MB.bulb(1150, 650, { color: '#ffa050', flicker: 0.5 }), MB.bulb(1650, 650, { color: '#ffb060' }));
  add(MB.deco('window_bg', 1160, 690, { w: 80, h: 100 }), MB.deco('window_bg', 1540, 920, { w: 80, h: 100 }), MB.deco('clock', 1300, 920), MB.deco('blood', 1120, 1000), MB.deco('handprints', 1780, 700));
  add(MB.deco('graffiti', 1420, 690, { text: 'DONT DRINK IT', color: '#8a1a14', w: 200, h: 34 }));
  add(MB.pickup('ammo', 1120, 1050, { ammo: '12g' }), MB.pickup('medkit', 1400, 850));
  add(MB.note(1100, 1040, 'Kitchen radio transcript', '"...repeat, residents of the Marrow Falls district must not use river or municipal water. The cordon is for your protection. Do not approach the line. Do not approach the line. Do not—"\n\nMa wrote underneath: we drank from the well for 40 years. Pa says the well is fed by the river.'));
  add(MB.note(1600, 820, 'Child\'s drawing', 'A crayon house. A tall fence with lights on it. Stick figures on the wrong side of the fence, arms out.\n\nWritten across the top: "THE SOLDIERS WONT LET GRANDMA IN"'));

  // ---- yard
  add(MB.prop('tractor', 1960, G), MB.prop('hay', 2250, G), MB.prop('hay', 2320, G), MB.prop('hay', 2284, G - 44), MB.prop('generator', 2480, G), MB.prop('propane', 2580, G), MB.prop('barrel_red', 2620, G));
  add(MB.lamp(2400, G, { color: '#ffc070', flicker: 0.5 }), MB.deco('fence', 2140, G, { w: 100, h: 90 }), MB.deco('corpse_old', 2200, G));

  // ---- barn (2700-3900)
  add(MB.wall(2700, G, 'door', { mat: 'wood', w: 26 }), MB.block(2700, 630, 26, 260, 'wood'));
  add(MB.wall(3874, G, 'door', { mat: 'wood', w: 26 }), MB.block(3874, 630, 26, 260, 'wood'));
  add(MB.block(2700, 600, 1200, 30, 'wood_floor'));
  add(MB.bw(2726, 630, 1148, 470, 'wood_dark'), MB.plat(2726, 840, 650, 'wood_floor', 12), MB.ladder(3346, 840, 260));
  add(MB.prop('hay', 2760, 840), MB.prop('hay', 2840, 840), MB.prop('hay', 2800, 796), MB.prop('crate', 3200, 840), MB.prop('hay', 3500, G), MB.prop('hay', 3570, G), MB.prop('workbench', 3700, G), MB.prop('crate', 3000, G));
  add(MB.deco('chains', 3100, 630, { h: 160 }), MB.deco('chains', 3600, 630, { h: 220 }), MB.deco('fence', 3420, G, { w: 120, h: 70 }), MB.deco('fence', 3560, G, { w: 120, h: 70 }));
  add(MB.bulb(2900, 630, { color: '#ffa850', flicker: 0.4 }), MB.bulb(3400, 630, { color: '#ffa850' }), MB.bulb(3750, 630, { color: '#ffa850', flicker: 0.7 }));
  add(MB.deco('graffiti', 3480, 700, { text: 'THEY CAME FROM THE CORN', color: '#c8b890', w: 330, h: 34 }));
  add(MB.pickup('ammo', 2950, 830, { ammo: '.308' }), MB.pickup('grenade', 3000, 830));
  add(MB.note(3050, 820, 'Note pinned in the loft', 'Pa went to the line with the truck to beg for medicine. The soldiers had a megaphone. Then they had rifles.\n\nI pulled the ladder up. They can\'t climb. They CAN climb. Oh God they can climb.'));

  // ---- east fields
  add(MB.deco('silo', 4000, G), MB.deco('tree', 4400, G, { h: 300 }), MB.deco('corn', 4600, G, { w: 400, h: 140, seed: 5 }), MB.deco('corn', 5000, G, { w: 400, h: 130, seed: 6 }));
  add(MB.deco('fence', 4200, G, { w: 300, h: 90 }), MB.prop('barrel', 4300, G), MB.prop('crate_small', 4340, G), MB.lamp(4500, G, { flicker: 0.9, color: '#ffc070' }));

  add(MB.spawn(40, G), MB.spawn(380, G), MB.spawn(760, G), MB.spawn(5360, G), MB.spawn(4800, G), MB.spawn(4200, G), MB.spawn(3200, G, 'vent'));
  add(MB.player(1300, G));
  add(MB.zombie('walker', 600, G), MB.zombie('leaper', 4700, G), MB.zombie('crawler', 3300, G));

  MapLib.register({
    id: 'farm', name: 'Hollins Farm', subtitle: 'Rural farm',
    desc: 'Moonlit corn on the edge of the quarantine zone. A wooden farmhouse rounds can punch through, a fuel-cluttered yard and a barn with a hay loft.',
    theme: 'farm', width: 5400, height: 1400, horizon: G,
    ambient: '#323a4e', ambientLevel: 0.28, fog: 0.75, fogColor: '#6a7480', weather: 'none', reverb: 0.15, amb: 'amb_night', bias: { leaper: 1.5, crawler: 1.4 },
    objects: o,
  });
})();
