'use strict';
// =====================================================================
//  MAPS — Continuity Site 7 ("The Sump"). Three long bunker levels for
//  Blackout mode: the Quarantine Block, the Barracks & Generator Hall
//  and the Surface Gate. Two storeys (G / F2) of poured concrete, blast
//  doors sealing each sector, dead fluorescents that only come back
//  when you restore power, and almost no light at all.
// =====================================================================

(() => {
  const G = 1100, F2 = 860, TOP = 650, LC = 890, UC = 650; // floors, lower/upper ceilings

  function bunker(W) {
    const o = [], gaps = [], uppers = [], talls = [];
    const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };
    const B = {
      o, add,
      upper(a, b) { uppers.push([a, b]); },
      tall(a, b) { talls.push([a, b]); },
      stairs(x, dir) { gaps.push([x, x + 250]); add(MB.plat(x, F2, 250, 'grate'), MB.stairs(x, G, 250, G - F2, dir)); },
      ladder(x) { gaps.push([x, x + 45]); add(MB.plat(x, F2, 45, 'metal', 8), MB.ladder(x + 8, F2, G - F2)); },
      // sealed blast door across the lower storey (upper storey must be solid here)
      blast(x, id, hint) { add(MB.wall(x, G, 'door', { w: 40, mat: 'hazard', door: { blast: true, id, hint } })); },
      emerg: (x, y = LC + 14, o2 = {}) => MB.light(x, y, Object.assign({ r: 230, color: '#ff2a1e', kind: 'emergency', flicker: 1, int: 0.5, clip: null }, o2)),
      dead: (x, y = LC) => MB.deco('fixture', x - 45, y),
      power: (x, group, y = LC, o2 = {}) => MB.fluoro(x, y, Object.assign({ off: true, group, flicker: 0.25, r: 300, int: 0.85 }, o2)),
      finish() {
        add(MB.block(0, G, W, 300, 'concrete'), MB.block(0, 380, W, TOP - 380, 'rock'));
        add(MB.slab(0, W, F2, gaps.concat(talls)));
        let x = 0;
        for (const [a, b] of uppers.concat(talls).sort((p, q) => p[0] - q[0])) { if (a > x) add(MB.block(x, TOP, a - x, F2 - TOP, 'concrete')); x = Math.max(x, b); }
        if (W > x) add(MB.block(x, TOP, W - x, F2 - TOP, 'concrete'));
        add(MB.block(0, TOP, 60, G - TOP, 'concrete'), MB.block(W - 60, TOP, 60, G - TOP, 'concrete'));
        return o;
      },
    };
    return B;
  }
  const meta = {
    theme: 'bunker', height: 1400, horizon: G,
    ambient: '#06080a', ambientLevel: 0.015, fog: 0.3, fogColor: '#2a2e30', weather: 'dust', reverb: 0.85, amb: 'amb_tunnel',
  };

  // ===================================================================
  //  LEVEL 1 — Quarantine Block (7200)
  //  A: isolation cells · med bay · observation gallery (up) · junction
  //  B: decontamination · lab · storage loft (up) · security checkpoint
  //  C: cold storage · records loft (up) · freight lift
  // ===================================================================
  (() => {
    const W = 7200, B = bunker(W), add = B.add;
    B.upper(1500, 2480); B.upper(3300, 4300); B.upper(5450, 6500);
    B.stairs(1600, 1); B.ladder(3350); B.stairs(3900, -1); B.stairs(5500, 1); B.ladder(6400);

    // ---- sector A: isolation cells
    add(MB.bw(60, LC, 1040, 210, 'tile_white', { dark: 0.6 }), MB.wall(450, G, 'door', { door: { metal: true, open: true } }), MB.wall(800, G, 'door', { door: { metal: true } }), MB.wall(1100, G, 'door', { door: { metal: true, open: true } }));
    add(MB.deco('bars', 90, 950, { w: 330, h: 150 }), MB.prop('bed', 120, G), MB.deco('handprints', 380, 960), MB.deco('sign', 150, 905, { text: 'ISOLATION 114', w: 130, h: 22, bg: '#3a1a14' }));
    add(MB.prop('bed', 520, G), MB.prop('gurney', 650, G), MB.deco('blood', 600, 980), MB.deco('iv', 700, G - 130), MB.deco('corpse_old', 870, G), MB.prop('cabinet', 1010, G));
    add(B.emerg(300), B.dead(620), B.emerg(950, LC + 14, { int: 0.35 }));
    add(MB.note(260, 1070, 'Cell 114 — patient board', 'SUBJECT 114 — PRIORITY CASE\nAsymptomatic carrier (suspected).\nObservation: 72h.\n\n(Under it, in marker:) POWER FAILED 0310. DOORS RELEASED ON FAILSAFE. NOBODY CAME.'));
    add(MB.pickup('battery', 980, 1090));
    // med bay + stairs to the gallery
    add(MB.bw(1124, LC, 776, 210, 'tile', { dark: 0.55 }), MB.wall(1900, G, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('gurney', 1180, G), MB.prop('locker', 1300, G, { supply: true }), MB.prop('cabinet', 1360, G), MB.deco('curtain', 1420, 950), MB.deco('redcross', 1200, 920));
    add(MB.deco('bodybag', 1480, G), MB.deco('bodybag', 1560, G), MB.pickup('medkit', 1270, 1090), MB.pickup('ammo', 1400, 1090, { ammo: '9mm' }));
    add(B.emerg(1250), B.dead(1500), B.power(1750, 'a'));
    // observation gallery (upper)
    add(MB.bw(1500, UC, 980, 210, 'concrete', { dark: 0.6 }), MB.deco('window_bg', 1920, 700, { w: 120, h: 80 }), MB.deco('window_bg', 2100, 700, { w: 120, h: 80 }));
    add(MB.prop('desk', 2000, F2), MB.prop('chair', 2090, F2), MB.prop('shelf', 2330, F2), MB.deco('board', 1960, 690), MB.pickup('battery', 2150, 850));
    add(B.emerg(2300, UC + 14, { int: 0.4 }), B.power(2050, 'a', UC));
    add(MB.note(2030, 840, 'Observation log', 'Day 2: priority cases restless. Several showing the "listening" posture — heads tilted toward the vents.\nDay 3: the dark makes them worse? Or better. They hunt by sound. When the lights flicker they freeze.\nDay 3, later: main bus tripped. Running on emergency batteries. Nobody upstairs answers the phone.'));
    // junction room
    add(MB.bw(1924, LC, 576, 210, 'concrete', { dark: 0.5 }), MB.prop('generator', 2380, G), MB.prop('cabinet', 2100, G), MB.deco('cables', 2000, LC, { w: 300, h: 50 }), MB.deco('vpipe', 2460, LC, { h: 210 }));
    add(MB.deco('sign', 2280, 905, { text: 'DOOR CIRCUIT A', w: 140, h: 22, bg: '#5a4a10' }), B.emerg(2200), B.power(2300, 'a'));
    add(MB.note(2120, 1070, 'Facility engineer — tablet', 'Main bus tripped on a ground fault. Door circuit A is dead: two blown fuses.\nSpares: med-bay supply cabinet and the observation gallery.\nBD-1 will not release until circuit A reads healthy. Fail-SECURE interlocks on a quarantine site. Somebody signed that off.'));
    B.blast(2500, 'bd1', 'restore door circuit A');

    // ---- sector B: decontamination
    add(MB.bw(2540, LC, 660, 210, 'tile_white', { dark: 0.6 }), MB.wall(3200, G, 'door', { door: { metal: true, open: true } }));
    add(MB.deco('tape', 2560, 1010, { w: 300, text: 'DECONTAMINATION' }), MB.deco('vpipe', 2700, LC, { h: 210 }), MB.deco('vpipe', 2900, LC, { h: 210 }), MB.prop('barrel', 3050, G), MB.prop('barrel_red', 3100, G));
    add(B.emerg(2800), B.dead(3000), B.power(2650, 'b'), MB.pickup('battery', 2950, 1090), MB.deco('corpse_old', 2760, G));
    // lab
    add(MB.bw(3224, LC, 976, 210, 'tile', { dark: 0.6 }), MB.wall(4200, G, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('workbench', 3450, G), MB.prop('desk', 3650, G), MB.prop('cabinet', 3800, G), MB.prop('gurney', 3880, G), MB.deco('iv', 3960, G - 130), MB.deco('shelf_bg', 3550, 940));
    add(MB.deco('graffiti', 3500, 920, { text: 'IT WAS IN THE WATER', color: '#a01a14', w: 260, h: 36 }), MB.deco('blood', 3700, 960), B.emerg(3600), B.dead(3900), B.power(3300, 'b'));
    add(MB.note(3680, 1070, 'Lab notebook (stained)', 'Samples from the Varga intake match the priority cases exactly.\nThe Authority knew before the cordon went up. That is why they kept carriers HERE, under the city — not in a hospital.\nIf anyone finds this: we were never patients. We were evidence.'));
    // storage loft (upper)
    add(MB.bw(3300, UC, 1000, 210, 'corrugated', { dark: 0.55 }), MB.prop('shelf', 3500, F2), MB.prop('crate', 3620, F2), MB.prop('locker', 3760, F2, { supply: true }), MB.prop('ammo_crate', 3880, F2));
    add(MB.pickup('battery', 3560, 850), MB.pickup('ammo', 3950, 850, { ammo: '5.56' }), B.emerg(3700, UC + 14, { int: 0.4 }), B.dead(3420, UC));
    // security checkpoint
    add(MB.bw(4224, LC, 776, 210, 'concrete', { dark: 0.45 }), MB.prop('counter', 4400, G), MB.prop('sandbags', 4600, G), MB.prop('desk', 4730, G), MB.deco('radio', 4760, G - 50));
    add(MB.deco('sign', 4300, 905, { text: 'SECURITY CHECKPOINT 2', w: 200, h: 22, bg: '#1a2a4a' }), MB.deco('board', 4700, 920), B.emerg(4500), B.emerg(4900, LC + 14, { int: 0.3 }), B.power(4700, 'b'));
    add(MB.pickup('armor', 4450, 1090), MB.pickup('battery', 4780, 1090), MB.pickup('ammo', 4650, 1090, { ammo: '12g' }));
    add(MB.note(4520, 1070, 'Checkpoint SOP card', 'BD-2 RELEASE (PLC fault mode):\n1. Turn operator key-switch to OVERRIDE.\n2. HOLD while the controller re-reads the interlocks (~10 s).\n3. The klaxon WILL sound. Do not let go.\n\nRemember: the PLC trusts the panel. Anyone at this panel can open the site.'));
    B.blast(5000, 'bd2', 'override the checkpoint PLC');

    // ---- sector C: cold storage + records loft + freight lift
    add(MB.bw(5040, LC, 960, 210, 'metal', { dark: 0.5 }), MB.wall(6000, G, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('shelf', 5100, G), MB.prop('crate', 5250, G), MB.prop('crate_small', 5300, G), MB.prop('container', 5800, G, { bg: true }), MB.deco('chains', 5400, LC, { h: 120 }));
    add(B.emerg(5300), B.dead(5700), B.power(5200, 'c'), MB.pickup('battery', 5350, 1090));
    add(MB.bw(5450, UC, 1050, 210, 'wood_dark', { dark: 0.55 }), MB.prop('shelf', 5800, F2), MB.prop('shelf', 5900, F2), MB.prop('cabinet', 6100, F2), MB.prop('cabinet', 6140, F2), MB.prop('desk', 6250, F2));
    add(MB.pickup('battery', 6000, 850), MB.pickup('ammo', 6200, 850, { ammo: '9mm' }), B.emerg(6050, UC + 14, { int: 0.4 }));
    add(MB.note(6280, 840, 'Records — transfer manifest', 'PRIORITY CASES 101–140: transfer to Site 7 (continuity) authorised under Directive 9.\nDisposition on cordon lift: "as directed".\n\nNobody wrote down what "as directed" meant. Nobody had to.'));
    add(MB.bw(6024, LC, 576, 210, 'concrete', { dark: 0.5 }), MB.prop('locker', 6100, G, { supply: true }), MB.prop('forklift', 6300, G, { bg: true }), MB.deco('blood', 6450, 960), B.emerg(6250));
    add(MB.wall(6600, G, 'arch'), MB.bw(6624, LC, 516, 210, 'hazard', { dark: 0.55 }), MB.deco('fence', 6700, 960, { w: 380, h: 140 }), MB.deco('sign', 6760, 905, { text: 'FREIGHT LIFT — LEVEL 3', w: 220, h: 22, bg: '#5a4a10' }));
    add(B.emerg(6900, LC + 14, { int: 0.6 }), MB.pickup('battery', 6700, 1090));

    // spawns / preplaced
    add(MB.spawn(1050, G, 'vent'), MB.spawn(1180, G), MB.spawn(1950, F2), MB.spawn(2450, G), MB.spawn(620, G, 'vent'));
    add(MB.spawn(2600, G), MB.spawn(3500, F2), MB.spawn(4100, G, 'vent'), MB.spawn(4950, G), MB.spawn(3700, G));
    add(MB.spawn(5100, G), MB.spawn(5900, F2), MB.spawn(6500, G, 'vent'), MB.spawn(7100, G), MB.spawn(6300, F2));
    add(MB.zombie('walker', 1500, G), MB.zombie('crawler', 2250, F2), MB.zombie('walker', 2250, G));
    add(MB.zombie('walker', 2900, G), MB.zombie('runner', 3600, G), MB.zombie('crawler', 3900, F2), MB.zombie('walker', 3550, F2), MB.zombie('riot', 4600, G), MB.zombie('walker', 4800, G));
    add(MB.zombie('walker', 5300, G), MB.zombie('crawler', 5700, G), MB.zombie('runner', 5950, F2), MB.zombie('walker', 6350, G), MB.zombie('bloater', 6800, G), MB.zombie('walker', 6150, F2));
    add(MB.player(250, G));

    MapLib.register(Object.assign({
      id: 'bunker_quarantine', name: 'Site 7: Quarantine Block', subtitle: 'Bunker — level 1',
      desc: 'Isolation cells, a dead med bay and a decontamination wing under Marrow Falls. Blast doors, failing emergency lights, and a flashlight that will not last.',
      width: W, bias: { crawler: 1.8, runner: 1.1 }, objects: B.finish(),
    }, meta));
  })();

  // ===================================================================
  //  LEVEL 2 — Barracks & Generator Hall (7600)
  //  A: freight lift · mess hall · barracks · armory (up)
  //  B: pump room · double-height generator hall · control room
  //  C: dormitories · ventilation stack (up)
  // ===================================================================
  (() => {
    const W = 7600, B = bunker(W), add = B.add;
    B.upper(1000, 2650); B.tall(3200, 4600); B.upper(6100, 7540);
    B.stairs(1000, 1); B.ladder(2500); B.stairs(6150, 1);

    // ---- sector A: lift arrival + mess
    add(MB.bw(60, LC, 540, 210, 'hazard', { dark: 0.6 }), MB.deco('fence', 80, 960, { w: 380, h: 140 }), MB.wall(600, G, 'arch'));
    add(MB.deco('sign', 150, 905, { text: 'FREIGHT LIFT — LEVEL 2', w: 220, h: 22, bg: '#5a4a10' }), B.emerg(300, LC + 14, { int: 0.55 }), MB.prop('crate', 480, G));
    add(MB.bw(624, LC, 976, 210, 'tile_white', { dark: 0.6 }), MB.wall(1600, G, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('counter', 700, G), MB.prop('desk', 900, G), MB.prop('chair', 990, G), MB.prop('desk', 1150, G), MB.prop('chair', 1240, G), MB.prop('vending', 1500, G), MB.prop('locker', 1420, G, { supply: true }));
    add(MB.deco('poster', 760, 930, { text: 'CONTINUITY IS DUTY', color: '#1a3a2a' }), MB.deco('blood', 1050, 980), MB.deco('corpse_old', 1300, G), B.emerg(850), B.dead(1200), B.power(1350, 'a'));
    add(MB.pickup('battery', 800, 1090), MB.pickup('ammo', 1100, 1090, { ammo: '9mm' }));
    add(MB.note(950, 1070, 'Mess hall whiteboard', 'GARRISON — 31 personnel\nRATIONS: 19 days\nMORALE: (rubbed out)\n\nDUTY OFFICERS CARRY BULKHEAD KEYCARDS AT ALL TIMES.\n(below:) Hollis is in the armory. Hollis does not answer. Hollis has my card.'));
    // barracks
    add(MB.bw(1624, LC, 1076, 210, 'concrete', { dark: 0.55 }));
    for (let x = 1700; x < 2500; x += 170) add(MB.prop('bed', x, G));
    add(MB.prop('locker', 2560, G), MB.prop('locker', 2600, G), MB.deco('flag', 1660, G - 160), MB.deco('handprints', 2200, 950), B.emerg(1800), B.dead(2100), B.power(2400, 'a'));
    add(MB.pickup('battery', 2050, 1090), MB.pickup('medkit', 2300, 1090));
    // armory (upper)
    add(MB.bw(1000, UC, 1650, 210, 'metal', { dark: 0.55 }), MB.wall(1700, F2, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('shelf', 1300, F2), MB.prop('crate', 1450, F2), MB.prop('ammo_crate', 1800, F2), MB.prop('ammo_crate', 1804, F2 - 34), MB.prop('locker', 1950, F2), MB.prop('locker', 1992, F2), MB.prop('desk', 2250, F2), MB.prop('chair', 2340, F2));
    add(MB.deco('sign', 1760, 665, { text: 'ARMORY — AUTHORISED ONLY', w: 220, h: 22, bg: '#3a3a3a' }), B.emerg(2000, UC + 14), B.dead(1400, UC), B.power(2200, 'a', UC));
    add(MB.pickup('ammo', 1880, 850, { ammo: '5.56' }), MB.pickup('ammo', 2100, 850, { ammo: '12g' }), MB.pickup('armor', 2150, 850), MB.pickup('battery', 1500, 850));
    add(MB.note(2300, 840, 'Duty officer\'s desk', 'Bulkhead to the generator hall takes TWO keycards. Mine is in this desk. The other is on Sergeant Pike, who went to check the barracks and did not come back.\n\nThe generator governor PLC was "patched" by a contractor last spring. It has refused to auto-start ever since. Manual start: hold the button and pray.'));
    add(MB.wall(2700, G, 'door', { door: { metal: true, open: true } }));
    add(MB.bw(2724, LC, 476, 210, 'hazard', { dark: 0.5 }), MB.deco('sign', 2780, 905, { text: 'BULKHEAD B', w: 120, h: 22, bg: '#5a4a10' }));
    B.blast(3000, 'bd1', 'swipe two duty keycards');

    // ---- sector B: generator hall (double height)
    add(MB.wall(3200, G, 'arch'));
    add(MB.bw(3200, UC, 1400, 450, 'concrete', { dark: 0.5 }), MB.plat(3200, F2, 700, 'grate'), MB.ladder(3220, F2, G - F2), MB.plat(4300, F2, 300, 'grate'), MB.ladder(4560, F2, G - F2));
    add(MB.prop('generator', 3600, G), MB.prop('generator', 3760, G), MB.prop('generator', 3920, G), MB.prop('barrel', 4100, G), MB.prop('barrel_red', 4150, G), MB.prop('propane', 4200, G));
    add(MB.deco('pipe', 3220, 700, { w: 1360 }), MB.deco('vpipe', 3500, UC, { h: 450 }), MB.deco('vpipe', 4250, UC, { h: 450 }), MB.deco('cables', 3600, UC, { w: 500, h: 70 }), MB.deco('pillar', 3900, G, { h: 450 }));
    add(MB.deco('sign', 3650, 760, { text: 'GENERATOR HALL — DIESEL BACKUP', w: 300, h: 26, bg: '#4a3a1a' }), B.emerg(3400, 900), B.emerg(4400, 900, { int: 0.35 }));
    add(B.power(3500, 'b', UC + 40, { r: 420 }), B.power(4000, 'b', UC + 40, { r: 420 }), B.power(4450, 'b', UC + 40, { r: 420 }));
    add(MB.pickup('battery', 3300, 850), MB.pickup('battery', 4450, 850), MB.pickup('ammo', 4000, 1090, { ammo: '.308' }));
    add(MB.wall(4600, G, 'door', { door: { metal: true, open: true } }));
    // control room
    add(MB.bw(4624, LC, 1376, 210, 'plaster', { dark: 0.55 }), MB.prop('desk', 4700, G), MB.prop('cabinet', 4800, G), MB.prop('locker', 4900, G, { supply: true }), MB.prop('workbench', 5050, G), MB.deco('radio', 5080, G - 50), MB.deco('board', 5200, 930));
    add(MB.deco('sign', 4700, 905, { text: 'POWER CONTROL', w: 140, h: 22, bg: '#1a2a4a' }), B.emerg(4800), B.dead(5400), B.power(5100, 'b'), MB.pickup('battery', 5500, 1090), MB.pickup('medkit', 5300, 1090));
    add(MB.note(5150, 1070, 'Power control — shift log', 'Generators 1 & 2 seized. Gen 3 will run if the governor lets it.\nThe governor HMI shows "STARTING" for ten seconds, then "FAULT". Holding the manual start overrides the fault timer.\nIt is loud. Anything in the hall will come for whoever is at the panel.'));
    B.blast(6000, 'bd2', 'restart the generator');

    // ---- sector C: dormitories + ventilation stack (upper)
    add(MB.bw(6040, LC, 1500, 210, 'concrete', { dark: 0.55 }), MB.wall(6700, G, 'door', { door: { metal: true, open: true } }));
    add(MB.prop('bed', 6450, G), MB.prop('bed', 6560, G), MB.prop('locker', 6800, G), MB.prop('cabinet', 7000, G), MB.prop('crate', 7300, G), MB.deco('corpse_old', 6900, G));
    add(B.emerg(6400), B.emerg(7100), B.dead(6900), B.power(6600, 'c'), MB.pickup('battery', 7200, 1090));
    add(MB.bw(6100, UC, 1440, 210, 'metal', { dark: 0.55 }), MB.deco('vent', 6600, 700), MB.deco('vent', 7000, 700), MB.deco('vpipe', 7300, UC, { h: 210 }), MB.deco('cables', 6800, UC, { w: 300, h: 50 }));
    add(MB.prop('crate', 6700, F2), MB.prop('locker', 6900, F2, { supply: true }), MB.deco('sign', 7250, 665, { text: 'VENT STACK — TO LEVEL 1', w: 220, h: 22, bg: '#5a4a10' }), MB.deco('arrow', 7100, 720, { text: 'EXIT' }));
    add(B.emerg(6600, UC + 14, { int: 0.4 }), B.emerg(7400, UC + 14, { int: 0.6 }), MB.pickup('battery', 6500, 850), MB.pickup('ammo', 6800, 850, { ammo: '5.56' }));

    add(MB.spawn(1500, G, 'vent'), MB.spawn(2600, G), MB.spawn(2400, F2), MB.spawn(1100, F2));
    add(MB.spawn(3300, G), MB.spawn(3400, F2), MB.spawn(4500, G, 'vent'), MB.spawn(5600, G), MB.spawn(5950, G));
    add(MB.spawn(6100, G), MB.spawn(7000, G, 'vent'), MB.spawn(7500, G), MB.spawn(7400, F2));
    add(MB.zombie('walker', 1000, G), MB.zombie('soldier', 2200, G), MB.zombie('walker', 2400, G), MB.zombie('soldier', 1600, F2), MB.zombie('walker', 2300, F2));
    add(MB.zombie('walker', 3500, G), MB.zombie('runner', 3700, F2), MB.zombie('bloater', 4200, G), MB.zombie('walker', 5000, G), MB.zombie('soldier', 5400, G));
    add(MB.zombie('walker', 6500, G), MB.zombie('crawler', 6900, G), MB.zombie('soldier', 7200, G), MB.zombie('runner', 6700, F2), MB.zombie('walker', 7100, F2));
    add(MB.player(250, G));

    MapLib.register(Object.assign({
      id: 'bunker_barracks', name: 'Site 7: Barracks', subtitle: 'Bunker — level 2',
      desc: 'The garrison level: mess hall, barracks, an armory loft and a cathedral-tall generator hall. The soldiers who guarded the site are still on duty.',
      width: W, bias: { soldier: 2.5, runner: 1.2 }, objects: B.finish(),
    }, meta));
  })();

  // ===================================================================
  //  LEVEL 3 — Surface Gate (8000)
  //  A: vent-stack landing · comms · command centre (up)
  //  B: vehicle bay · fuel store (up) · gate bulkhead
  //  C: access ramp · surface blast gate · daylight
  // ===================================================================
  (() => {
    const W = 8000, B = bunker(W), add = B.add;
    B.upper(1200, 2780); B.upper(3200, 4600); B.upper(5600, 6800);
    B.stairs(1200, 1); B.ladder(2700); B.ladder(3250); B.stairs(4300, -1); B.stairs(5650, 1);

    // ---- sector A
    add(MB.bw(60, LC, 740, 210, 'metal', { dark: 0.6 }), MB.deco('vpipe', 90, LC, { h: 210 }), MB.deco('vent', 300, 930), MB.deco('sign', 120, 905, { text: 'VENT STACK — LEVEL 1', w: 200, h: 22, bg: '#5a4a10' }), MB.wall(800, G, 'door', { door: { metal: true } }));
    add(B.emerg(400), MB.prop('crate', 600, G), MB.pickup('battery', 680, 1090));
    add(MB.bw(824, LC, 1956, 210, 'concrete', { dark: 0.55 }), MB.prop('desk', 900, G), MB.prop('cabinet', 1000, G), MB.deco('radio', 930, G - 50), MB.prop('locker', 1100, G, { supply: true }), MB.wall(1900, G, 'door', { door: { metal: true, open: true } }));
    add(MB.deco('sign', 880, 905, { text: 'COMMS', w: 80, h: 22, bg: '#1a2a4a' }), B.emerg(1050), B.dead(1600), B.power(1450, 'a'), MB.pickup('ammo', 1650, 1090, { ammo: '9mm' }));
    add(MB.prop('shelf', 2000, G), MB.prop('crate_small', 2150, G), MB.prop('barrel', 2400, G), MB.deco('corpse_old', 2250, G), B.emerg(2300), B.power(2100, 'a'), MB.pickup('battery', 2500, 1090));
    // command centre (upper)
    add(MB.bw(1200, UC, 1580, 210, 'plaster_blue', { dark: 0.6 }), MB.deco('board', 1700, 680, { w: 200 }), MB.deco('window_bg', 1950, 690, { w: 200, h: 90 }), MB.deco('clock', 2300, 680));
    add(MB.prop('desk', 1600, F2), MB.prop('desk', 1800, F2), MB.prop('chair', 1890, F2), MB.prop('desk', 2100, F2), MB.prop('cabinet', 2500, F2), MB.deco('radio', 2130, F2 - 50));
    add(MB.deco('sign', 1550, 665, { text: 'SITE 7 — CONTINUITY COMMAND', w: 260, h: 24, bg: '#1a2a4a' }), B.emerg(1500, UC + 14, { int: 0.4 }), B.dead(2000, UC), B.power(2300, 'a', UC), B.power(1700, 'a', UC));
    add(MB.pickup('armor', 1450, 850), MB.pickup('battery', 1950, 850));
    add(MB.note(2200, 840, 'SCADA terminal — sticky note', 'GATE INTERLOCK: the surface gate is on its own controller. "Air-gapped," they said, "un-hackable."\nIt is air-gapped from everything except this terminal. Bypass = hold the maintenance override while it pushes the new setpoints.\n\nPassword is on the back of the monitor. Of course it is.'));
    add(MB.note(1800, 840, 'Last order received', 'FROM: CORDON AUTHORITY\nSITE 7 TO SEAL AND MAINTAIN CONTINUITY. NO PERSONNEL OR PRIORITY CASES TO EXIT UNTIL FURTHER NOTICE.\n\n(No further notice was received.)'));
    B.blast(2800, 'bd1', 'bypass the gate interlock (command centre)');

    // ---- sector B: vehicle bay + fuel loft
    add(MB.bw(2840, LC, 2560, 210, 'corrugated', { dark: 0.55 }), MB.prop('mil_truck', 3500, G, { bg: true }), MB.prop('jersey', 3300, G), MB.prop('tires', 4100, G), MB.prop('forklift', 4600, G, { bg: true }), MB.prop('container', 4900, G, { bg: true }));
    add(MB.deco('sign', 2900, 905, { text: 'VEHICLE BAY', w: 120, h: 22, bg: '#4a3a1a' }), MB.deco('tape', 3000, 1010, { w: 260, text: 'CONTAINMENT FAILURE' }), B.emerg(3100), B.emerg(4300), B.dead(3800), B.power(3600, 'b'), B.power(4700, 'b'));
    add(MB.pickup('battery', 3000, 1090), MB.pickup('battery', 4450, 1090), MB.pickup('ammo', 3900, 1090, { ammo: '12g' }), MB.deco('blood', 4200, 960));
    add(MB.bw(3200, UC, 1400, 210, 'metal', { dark: 0.55 }), MB.prop('barrel_red', 3500, F2), MB.prop('barrel_red', 3540, F2), MB.prop('propane', 3700, F2), MB.prop('locker', 3900, F2, { supply: true }), MB.prop('shelf', 4100, F2));
    add(MB.deco('sign', 3600, 665, { text: 'FUEL STORE — NO NAKED FLAME', w: 260, h: 22, bg: '#7a1a14' }), B.emerg(3400, UC + 14, { int: 0.4 }), B.dead(4000, UC), MB.pickup('battery', 4200, 850), MB.pickup('ammo', 3800, 850, { ammo: '.308' }));
    add(MB.wall(5000, G, 'door', { door: { metal: true, open: true } }), MB.prop('workbench', 5150, G), MB.deco('sign', 5200, 905, { text: 'GATE BULKHEAD', w: 140, h: 22, bg: '#5a4a10' }), B.emerg(5250));
    add(MB.note(5100, 1070, 'Gate procedure (laminated)', 'Surface gate opening sequence: ~90 seconds. Hydraulics are LOUD.\nTwo override keys are required to arm the bulkhead: one with the motor-pool chief, one in the fuel store.\nOnce armed the ramp cannot be closed again. Make sure you mean it.'));
    B.blast(5400, 'bd2', 'arm the bulkhead with two override keys');

    // ---- sector C: access ramp to the surface gate
    add(MB.bw(5440, LC, 2260, 210, 'concrete', { dark: 0.5 }), MB.deco('rails', 5500, G, { w: 400 }), MB.deco('rails', 6300, G, { w: 400 }), MB.deco('arrow', 6000, 930, { text: 'SURFACE' }), MB.deco('arrow', 7000, 930, { text: 'SURFACE' }));
    add(MB.prop('sandbags', 6200, G), MB.prop('hesco', 6800, G, { bg: true }), MB.prop('sandbags', 7300, G), MB.prop('jersey', 7130, G), MB.prop('locker', 6500, G, { supply: true }));
    add(B.emerg(5700), B.emerg(6600), B.emerg(7400, LC + 14, { int: 0.7 }), B.power(6000, 'c'), B.power(7000, 'c'), MB.pickup('battery', 5900, 1090), MB.pickup('medkit', 6450, 1090), MB.pickup('battery', 7200, 1090));
    add(MB.bw(5600, UC, 1200, 210, 'concrete', { dark: 0.6 }), MB.prop('sandbags', 6000, F2), MB.prop('ammo_crate', 6300, F2), MB.deco('wire', 6400, 845, { w: 200 }), MB.pickup('ammo', 6350, 850, { ammo: '5.56' }), MB.pickup('battery', 6600, 850), B.emerg(6200, UC + 14, { int: 0.4 }));
    add(MB.deco('sign', 7480, 905, { text: 'SURFACE GATE', w: 140, h: 22, bg: '#7a1a14' }));
    B.blast(7700, 'gate', 'the surface gate is still cycling');
    // outside: the first grey light of morning
    add(MB.bw(7740, LC, 200, 210, 'rock', { dark: 0.3 }), MB.light(7860, 940, { r: 420, color: '#b8c4d8', int: 0.9, kind: 'bulb', clip: null }), MB.deco('tree', 7800, G - 300, { h: 300 }));

    add(MB.spawn(1850, G, 'vent'), MB.spawn(2700, G), MB.spawn(2500, F2), MB.spawn(1300, F2));
    add(MB.spawn(2900, G), MB.spawn(3700, F2), MB.spawn(4800, G, 'vent'), MB.spawn(5350, G), MB.spawn(4000, G));
    add(MB.spawn(5500, G), MB.spawn(6400, F2), MB.spawn(6900, G, 'vent'), MB.spawn(7650, G), MB.spawn(6200, G));
    add(MB.zombie('walker', 1400, G), MB.zombie('soldier', 2100, G), MB.zombie('runner', 2000, F2), MB.zombie('walker', 2500, F2));
    add(MB.zombie('soldier', 3400, G), MB.zombie('walker', 3800, G), MB.zombie('burner', 3600, F2), MB.zombie('riot', 4700, G), MB.zombie('walker', 5200, G));
    add(MB.zombie('walker', 5800, G), MB.zombie('leaper', 6300, F2), MB.zombie('soldier', 6700, G), MB.zombie('walker', 7100, G), MB.zombie('runner', 7300, G));
    add(MB.player(250, G));

    MapLib.register(Object.assign({
      id: 'bunker_gate', name: 'Site 7: Surface Gate', subtitle: 'Bunker — level 3',
      desc: 'Continuity command, a vehicle bay and the long access ramp to the surface blast gate. Ninety seconds of hydraulics between you and daylight.',
      width: W, bias: { soldier: 2, leaper: 1.5, runner: 1.3 }, objects: B.finish(),
    }, meta));
  })();
})();
