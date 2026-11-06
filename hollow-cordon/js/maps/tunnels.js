'use strict';
// =====================================================================
//  MAP — Line 4 Tunnels (underground)
//  Kessler Station platform, a maintenance corridor above it, long
//  pitch-dark track tunnels and a derailed subway car. Bring a light.
// =====================================================================

(() => {
  const G = 1100, PLAT = 980, CORR = 760, CEIL = 600;
  const o = [];
  const add = (...a) => { for (const x of a) Array.isArray(x) ? o.push(...x) : o.push(x); };

  add(MB.block(0, G, 5000, 300, 'rock'), MB.block(0, 380, 5000, 220, 'rock'));
  // station platform with steps at both ends
  add(MB.block(1200, PLAT, 1800, 120, 'tile_white'), MB.stairs(970, G, 230, 120, 1, 'concrete', true), MB.stairs(3000, G, 230, 120, -1, 'concrete', true));
  // maintenance corridor above the platform
  add(MB.slab(1500, 2700, CORR, [[1515, 1560], [2640, 2685]]), MB.plat(1515, CORR, 45, 'metal', 8), MB.plat(2640, CORR, 45, 'metal', 8));
  add(MB.ladder(1523, CORR, PLAT - CORR), MB.ladder(2648, CORR, PLAT - CORR));
  // back walls
  add(MB.bw(0, CEIL, 1200, 500, 'rock', { dark: 0.55 }), MB.bw(3000, CEIL, 2000, 500, 'rock', { dark: 0.55 }));
  add(MB.bw(1200, CORR + 30, 1800, PLAT - CORR - 30, 'tile_white'), MB.bw(1200, CEIL, 300, 160, 'tile_white'), MB.bw(2700, CEIL, 300, 160, 'tile_white'), MB.bw(1500, CEIL, 1200, 160, 'concrete', { dark: 0.5 }));
  // rails
  for (let x = 0; x < 5000; x += 400) if (x + 400 <= 1200 || x >= 3000) add(MB.deco('rails', x, G, { w: 400 }));

  // ---- station dressing
  add(MB.deco('sign', 1620, 820, { text: 'KESSLER STATION', w: 300, h: 34, bg: '#1a3a6a' }), MB.deco('sign', 2350, 830, { text: 'LINE 4 · HARBOR', w: 170, h: 24, bg: '#7a5a14' }));
  add(MB.deco('poster', 1350, 860, { text: 'EVACUATION POINT B', color: '#1a4a7a' }), MB.deco('graffiti', 1900, 880, { text: 'EVAC CANCELLED', color: '#c8302a', w: 230, h: 40 }), MB.deco('clock', 2780, 830));
  add(MB.deco('pillar', 1450, PLAT, { h: 190 }), MB.deco('pillar', 2050, PLAT, { h: 190 }), MB.deco('pillar', 2650, PLAT, { h: 190 }));
  add(MB.deco('tape', 1200, 960, { w: 1800, h: 12, text: 'MIND THE GAP' }), MB.deco('corpse_old', 1700, PLAT), MB.deco('bodybag', 2250, PLAT), MB.deco('bodybag', 2350, PLAT), MB.deco('handprints', 2900, 860));
  add(MB.prop('chair', 1600, PLAT), MB.prop('chair', 1626, PLAT), MB.prop('chair', 2480, PLAT), MB.prop('vending', 2900, PLAT), MB.prop('crate_small', 1260, PLAT));
  add(MB.fluoro(1400, CORR + 30, { flicker: 0.4 }), MB.fluoro(1850, CORR + 30, { int: 0 }), MB.fluoro(2300, CORR + 30, { flicker: 0.95 }), MB.fluoro(2750, CORR + 30, { flicker: 0.2 }));
  add(MB.pickup('ammo', 2000, 960, { ammo: '9mm' }), MB.pickup('medkit', 2600, 960));
  add(MB.note(2150, 950, 'Transit announcement (printed)', 'ATTENTION: Line 4 services to Harbor are SUSPENDED by order of the Cordon Authority.\n\nEvacuation Point B has been relocated. Do not wait on the platform. Do not enter the tunnels.\n\n(scrawled:) WE WAITED 3 DAYS. THE TRAIN NEVER CAME. THEN THE TUNNEL STARTED BREATHING.'));
  // corridor
  add(MB.bulb(1900, CEIL, { r: 220, flicker: 0.5 }), MB.bulb(2400, CEIL, { r: 220 }), MB.prop('cabinet', 1700, CORR), MB.prop('generator', 2100, CORR), MB.prop('crate', 2500, CORR), MB.deco('cables', 1600, CEIL, { w: 400, h: 50 }));
  add(MB.pickup('ammo', 2250, 740, { ammo: '5.56' }), MB.pickup('armor', 2560, 740));
  add(MB.note(2000, 730, 'Maintenance log', 'Pumps 2 and 3 failed. Water is rising in the east bore.\n\nThere are people down there. Or were. They walk the rails toward the station like they are waiting for a train.\n\nI have locked myself in. The generator has fuel for one more night.'));

  // ---- west tunnel
  add(MB.prop('crate', 300, G), MB.prop('barrel', 360, G), MB.prop('barrel_red', 900, G), MB.deco('cables', 200, CEIL, { w: 500, h: 60 }), MB.deco('vpipe', 700, CEIL, { h: 500 }));
  add(MB.light(450, 640, { r: 300, color: '#ff2a1e', kind: 'emergency', flicker: 1, clip: null }), MB.light(1000, 640, { r: 260, color: '#ffcf8a', flicker: 0.6, clip: null }));
  add(MB.deco('graffiti', 300, 800, { text: 'FOLLOW THE RAILS', color: '#c8c8c0', w: 230, h: 34 }));

  // ---- east tunnel with derailed car
  add(MB.prop('train', 3400, G, { h: 124 }), MB.prop('crate', 3250, G), MB.prop('crate_small', 4100, G), MB.prop('barrel_red', 4400, G), MB.prop('barrel', 4440, G));
  add(MB.light(3660, 880, { r: 280, color: '#9ab8ff', int: 0.6, flicker: 0.8, clip: null }), MB.light(4300, 640, { r: 300, color: '#ff2a1e', kind: 'emergency', flicker: 1, clip: null }), MB.light(4800, 640, { r: 260, color: '#ff2a1e', kind: 'emergency', flicker: 1, clip: null }));
  add(MB.deco('corpse_old', 4000, G), MB.deco('blood', 3200, 900), MB.deco('chains', 4600, CEIL, { h: 200 }));

  add(MB.spawn(40, G), MB.spawn(600, G, 'vent'), MB.spawn(4960, G), MB.spawn(4400, G, 'vent'), MB.spawn(3320, G), MB.spawn(880, G));
  add(MB.player(2000, PLAT));
  add(MB.zombie('crawler', 3700, G), MB.zombie('walker', 4200, G), MB.zombie('walker', 500, G));

  MapLib.register({
    id: 'tunnels', name: 'Line 4 Tunnels', subtitle: 'Underground tunnels',
    desc: 'The evacuation that never came. A dead station, a maintenance corridor and long black tunnels toward a derailed train. Your flashlight is the only light.',
    theme: 'tunnels', width: 5000, height: 1400, horizon: G,
    ambient: '#0b0d12', ambientLevel: 0.05, fog: 0.35, fogColor: '#3a4040', weather: 'dust', reverb: 0.75, amb: 'amb_tunnel', bias: { crawler: 2, runner: 1.2 },
    objects: o,
  });
})();
