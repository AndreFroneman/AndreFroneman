'use strict';
// =====================================================================
//  Combat — hitscan ballistics with material penetration, impacts,
//  explosions with line-of-sight falloff, and melee sweeps.
// =====================================================================

const BONE_COST = { head: 18, torso: 28, uaF: 9, uaB: 9, faF: 8, faB: 8, thF: 12, thB: 12, shF: 10, shB: 10 };
const IMPACT_SND = { concrete: 'hit_concrete', wood: 'hit_wood', metal: 'ric', dirt: 'hit_dirt', glass: 'glass' };

const Combat = {
  hits: [],
  caps: [],
  tmpB: [],

  fire(game, shooter, ox, oy, ang, def, mods = {}) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const maxD = def.maxRange || 2600;
    const hits = this.hits; hits.length = 0;
    const world = game.world;
    // world blocks (one-way wooden/metal platforms included)
    for (const h of world.rayBlocks(ox, oy, dx, dy, maxD, this.tmpB, true)) hits.push({ t: h.t0, t1: h.t1, k: 0, b: h.b });
    // props, doors, windows
    for (const p of game.props) {
      if (p.dead) continue;
      const glassOnly = p.isWindow && p.glass && !p.boards;
      if (!p.blocksBullets() && !glassOnly && !(p.isBarricade && p.hp > 0)) continue;
      const r = rayAABB(ox, oy, dx, dy, p.x, p.y, p.x + p.w, p.y + p.h);
      if (r && r[0] < maxD && r[1] > 0.5) hits.push({ t: r[0], t1: r[1], k: 1, p });
    }
    // living infected
    for (const z of game.zombies) {
      if (z.dead || z === shooter) continue;
      const bb = z.bbox;
      const r = rayAABB(ox, oy, dx, dy, bb[0], bb[1], bb[2], bb[3]);
      if (!r || r[0] > maxD) continue;
      let best = Infinity, bone = null;
      for (const c of z.getCaps()) {
        const t = rayCapsule(ox, oy, dx, dy, c.ax, c.ay, c.bx, c.by, c.r);
        if (t >= 0 && t < best) { best = t; bone = c.bone; }
      }
      if (bone) hits.push({ t: best, k: 2, z, bone });
    }
    // corpses & severed parts
    for (const rd of game.corpses) {
      const bb = rd.bbox;
      const r = rayAABB(ox, oy, dx, dy, bb[0], bb[1], bb[2], bb[3]);
      if (!r || r[0] > maxD) continue;
      let best = Infinity, bone = null;
      for (const c of rd.capsules(this.caps)) {
        const t = rayCapsule(ox, oy, dx, dy, c.ax, c.ay, c.bx, c.by, c.r);
        if (t >= 0 && t < best) { best = t; bone = c.bone; }
      }
      if (bone) hits.push({ t: best, k: 3, rd, bone });
    }
    // the player (only for hostile fire)
    if (mods.hitPlayer && game.player && !game.player.dead) {
      const pl = game.player, bb = pl.bbox;
      const r = rayAABB(ox, oy, dx, dy, bb[0], bb[1], bb[2], bb[3]);
      if (r) hits.push({ t: r[0], k: 4 });
    }
    hits.sort((a, b) => a.t - b.t);

    let power = def.pen * (mods.penMul || 1);
    const pen0 = power;
    let endT = maxD;
    const baseDmg = def.dmg * (mods.dmgMul || 1);
    let stopped = false;
    for (const h of hits) {
      if (h.t > maxD) break;
      const hx = ox + dx * h.t, hy = oy + dy * h.t;
      const dRange = h.t;
      let f = 1;
      if (dRange > def.range) f = Math.max(def.falloff, 1 - (dRange - def.range) / def.range * (1 - def.falloff));
      const pf = Math.sqrt(Math.max(0.15, power / pen0));
      if (h.k === 2) {
        if (h.z.dead) continue;
        h.z.takeHit(h.bone, baseDmg * f * pf, dx, dy, def.force * f * pf, hx, hy, { def, shooter, kind: 'bullet', pellets: def.pellets });
        power -= (BONE_COST[h.bone] || 12) * (h.z.armorCost ? h.z.armorCost(h.bone) : 1);
      } else if (h.k === 3) {
        h.rd.damage(h.bone, baseDmg * f * pf, dx, dy, def.force * f * pf, hx, hy);
        power -= 10;
      } else if (h.k === 4) {
        game.player.hurt(baseDmg * f, dx, null);
        power -= 30;
      } else if (h.k === 1) {
        const p = h.p;
        if (p.isWindow && p.glass && !p.boards) { p.damage(baseDmg, hx, hy, 'bullet', Math.sign(dx)); power -= 2; continue; }
        const res = p.isBarricade ? 1.2 : p.isDoor ? (p.mat === 'metal' ? 6 : 1.4) : (p.def ? p.def.res : 2);
        const thick = Math.max(2, Math.min(h.t1 - h.t, p.isDoor || p.isWindow ? p.w : 999));
        this.impact(game, hx, hy, -dx, -dy, p.mat === 'glass' ? 'wood' : p.mat, true, false);
        p.damage(baseDmg * f * pf, hx, hy, 'bullet', Math.sign(dx));
        if (p.impulse) p.impulse(dx * def.force * 0.6, dy * def.force * 0.6 - 30);
        const cost = thick * res;
        if (cost >= power) { endT = h.t; stopped = true; break; }
        power -= cost;
        this.impact(game, ox + dx * h.t1, oy + dy * h.t1, dx, dy, p.mat, false, true);
      } else {
        const b = h.b;
        if (b.oneway && (b.mat === 'grate')) continue;
        const res = b.mdef.res;
        const thick = Math.max(1, h.t1 - h.t);
        const n = aabbHitNormal(hx, hy, b.x, b.y, b.x + b.w, b.y + b.h);
        this.impact(game, hx, hy, n[0], n[1], b.mdef.phys, true, true);
        const cost = thick * res;
        if (cost >= power) { endT = h.t; stopped = true; break; }
        power -= cost;
        this.impact(game, ox + dx * h.t1, oy + dy * h.t1, dx, dy, b.mdef.phys, false, true);
      }
      if (power <= 0) { endT = h.t; stopped = true; break; }
    }
    if (!mods.noTracer) game.fx.tracer(ox + dx * 8, oy + dy * 8, ox + dx * endT, oy + dy * endT, def.cat === 'sniper' ? 1.6 : 1);
    return stopped;
  },

  impact(game, x, y, nx, ny, mat, sound = true, decal = true) {
    const fx = game.fx;
    if (decal) Decal.hole(game.world, x, y, mat);
    if (mat === 'metal') { fx.sparks(x, y, nx, ny, randi(4, 9)); fx.light(x, y, 50, '#ffcc88', 0.7, 0.06); }
    else if (mat === 'glass') fx.glass(x, y, nx * 100, 3);
    else fx.debris(x, y, nx, ny, mat, randi(3, 6));
    if (sound) Sfx.play(IMPACT_SND[mat] || 'hit_concrete', { x, y, vol: 0.45, range: 1200 });
  },

  explode(game, x, y, r, dmg, src, opts = {}) {
    const fx = game.fx, world = game.world;
    Sfx.play(r > 120 ? 'explosion' : 'explosion_small', { x, y, vol: 1, range: 4000, verb: 1.5, force: true });
    fx.light(x, y, r * 2.6, '#ffaa55', 2.4, 0.45);
    fx.light(x, y, r * 1.2, '#fff0c0', 2, 0.12);
    game.shake(Math.max(0, 26 * (1 - dist(x, y, game.player ? game.player.x : x, game.player ? game.player.y : y) / 1600)));
    for (let i = 0; i < 26; i++) { const a = rand(0, TAU), sp = rand(100, 700); fx.add(P.FIRE, x + rand(-10, 10), y + rand(-10, 10), Math.cos(a) * sp * 0.4, Math.sin(a) * sp * 0.4 - 80, rand(0.3, 0.8), rand(18, 40)); }
    for (let i = 0; i < 22; i++) { const a = rand(-Math.PI, 0), sp = rand(200, 900); fx.add(P.SPARK, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 1), rand(1, 2)); }
    for (let i = 0; i < 18; i++) fx.add(P.EMBER, x + rand(-30, 30), y + rand(-30, 30), rand(-200, 200), rand(-300, -50), rand(1, 3), 1);
    fx.smoke(x, y - 10, 22, '#2a2826', 60, 70);
    fx.debris(x, y, 0, -1, 'concrete', 16);
    const gy = world.groundBelow(x, y - 4, r);
    Decal.scorch(world, x, gy, r * 0.6);
    if (!opts.noFire) for (let i = 0; i < 4; i++) { const fxp = x + rand(-r * 0.4, r * 0.4); game.addFire(fxp, world.groundBelow(fxp, y - 10, r), rand(4, 9)); }
    game.noise(x, y, 2600);
    // zombies
    for (const z of game.zombies) {
      if (z.dead) continue;
      const zx = z.x, zy = z.y - z.h * 0.5;
      const d = dist(x, y, zx, zy);
      if (d > r) continue;
      if (!world.lineOfSight(x, y - 4, zx, zy)) continue;
      const k = 1 - d / r;
      const ang = Math.atan2(zy - y - 30, zx - x);
      z.blast(dmg * (0.3 + 0.7 * k), Math.cos(ang), Math.sin(ang), 1100 * k + 200, x, y, k, opts);
    }
    const pl = game.player;
    if (pl && !pl.dead) {
      const d = dist(x, y, pl.x, pl.y - 50);
      if (d < r && world.lineOfSight(x, y - 4, pl.x, pl.y - 50)) {
        const k = 1 - d / r;
        pl.hurt(dmg * 0.45 * k * (opts.selfMul === undefined ? 1 : opts.selfMul), Math.sign(pl.x - x), null, true);
        pl.vx += Math.sign(pl.x - x) * 500 * k; pl.vy -= 350 * k;
      }
    }
    for (const rd of game.corpses) {
      const bb = rd.bbox, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      const d = dist(x, y, cx, cy);
      if (d > r * 1.2) continue;
      const k = 1 - d / (r * 1.2);
      const a = Math.atan2(cy - y - 20, cx - x);
      rd.impulse(cx, cy, Math.cos(a) * 1600 * k, Math.sin(a) * 1600 * k - 500 * k, 200);
      if (k > 0.5 && Settings.data.dismemberment && Settings.goreMul() > 0) {
        for (const id of ['uaF', 'uaB', 'thF', 'thB']) if (rd.bp[id] && chance(0.5 * k)) rd.sever(id, false);
        if (!rd.body.gutted && chance(k)) { rd.body.gutted = true; Gore.gut(game, cx, cy, Math.cos(a), Math.sin(a), null); }
      }
    }
    for (const g of fx.gibs) {
      const d = dist(x, y, g.x, g.y);
      if (d > r) continue;
      const k = 1 - d / r, a = Math.atan2(g.y - y - 20, g.x - x);
      g.vx += Math.cos(a) * 800 * k; g.vy += Math.sin(a) * 800 * k - 200 * k; g.rest = false;
    }
    for (const p of game.props) {
      if (p.dead || p === src) continue;
      const d = dist(x, y, p.cx, p.cy);
      if (d > r + Math.max(p.w, p.h) / 2) continue;
      const k = clamp(1 - (d - Math.max(p.w, p.h) / 2) / r, 0, 1);
      if (p.isWindow) { p.shatter(Math.sign(p.cx - x) * 300); if (k > 0.5) p.damage(dmg * k, p.cx, p.cy, 'blast'); continue; }
      if (p.def && p.def.explosive) { game.later(rand(0.08, 0.22), () => p.destroy()); continue; }
      p.damage(dmg * k * 1.2, p.cx, p.cy, 'blast');
      if (p.impulse) { const a = Math.atan2(p.cy - y - 30, p.cx - x); p.impulse(Math.cos(a) * 1200 * k, Math.sin(a) * 1200 * k - 400 * k); }
    }
  },

  // bloater burst: caustic bile that burns flesh (infected included)
  bile(game, x, y, r, dmg, src) {
    const fx = game.fx, world = game.world;
    Sfx.play('gore_burst', { x, y, vol: 1 }); Sfx.play('explosion_small', { x, y, vol: 0.35, rate: 1.4 }); Sfx.play('hiss', { x, y, vol: 0.6 });
    fx.bile(x, y, 60);
    fx.light(x, y, r * 1.6, '#a8d040', 1.3, 0.5);
    const gy = world.groundBelow(x, y, 400);
    for (let i = 0; i < 5; i++) Decal.bile(world, x + rand(-r * 0.6, r * 0.6), gy, rand(10, 26));
    game.noise(x, y, 900);
    game.shake(6);
    for (const z of game.zombies) {
      if (z.dead || z === src) continue;
      const d = dist(x, y, z.x, z.y - z.h * 0.5);
      if (d > r || !world.lineOfSight(x, y, z.x, z.y - z.h * 0.5)) continue;
      z.blast(dmg * (1 - d / r * 0.6), Math.sign(z.x - x) || 1, -0.3, 120, x, y, 0.2, { bile: true });
    }
    const p = game.player;
    if (p && !p.dead) {
      const d = dist(x, y, p.x, p.y - 50);
      if (d < r && world.lineOfSight(x, y, p.x, p.y - 50)) { p.hurt(dmg * (1 - d / r * 0.6), Math.sign(p.x - x), src, true); game.hud.toast('Caustic bile!'); }
    }
    for (const rd of game.corpses) { const b = rd.bbox; const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; if (dist(x, y, cx, cy) < r) rd.impulse(cx, cy, Math.sign(cx - x) * 500, -300, 120); }
  },

  // melee sweep: blade segment (ax,ay)-(bx,by); hitSet prevents double hits per swing
  melee(game, attacker, ax, ay, bx, by, def, dirx, hitSet, mods = {}) {
    let any = false;
    for (const z of game.zombies) {
      if (z.dead || hitSet.has(z)) continue;
      const bb = z.bbox;
      if (Math.max(ax, bx) < bb[0] - 10 || Math.min(ax, bx) > bb[2] + 10 || Math.max(ay, by) < bb[1] - 10 || Math.min(ay, by) > bb[3] + 10) continue;
      let best = Infinity, bone = null;
      for (const c of z.getCaps()) {
        const d2 = segSegDist2(ax, ay, bx, by, c.ax, c.ay, c.bx, c.by);
        const rr = c.r + 4;
        if (d2 < rr * rr && d2 < best) { best = d2; bone = c.bone; }
      }
      if (!bone) continue;
      hitSet.add(z); any = true;
      const hx = bx, hy = (ay + by) / 2;
      z.takeHit(bone, def.dmg * (mods.dmgMul || 1), dirx, -0.2, def.force, hx, hy, { def, shooter: attacker, kind: 'melee' });
      Sfx.play(def.blade ? 'melee_blade' : 'melee_blunt', { x: hx, y: hy, vol: 0.9 });
      game.shake(def.heavy ? 6 : 3);
      game.hitstop(def.heavy ? 0.06 : 0.035);
    }
    for (const rd of game.corpses) {
      if (hitSet.has(rd)) continue;
      const bb = rd.bbox;
      if (Math.max(ax, bx) < bb[0] || Math.min(ax, bx) > bb[2] || Math.max(ay, by) < bb[1] || Math.min(ay, by) > bb[3]) continue;
      for (const c of rd.capsules(this.caps)) {
        const d2 = segSegDist2(ax, ay, bx, by, c.ax, c.ay, c.bx, c.by);
        if (d2 < (c.r + 3) ** 2) { hitSet.add(rd); rd.damage(c.bone, def.dmg * 1.5, dirx, -0.3, def.force, bx, by); Sfx.play('melee_blade', { x: bx, y: by, vol: 0.6 }); break; }
      }
    }
    for (const p of game.props) {
      if (p.dead || hitSet.has(p) || !(p.solid || p.isWindow)) continue;
      if (segSegDist2(ax, ay, bx, by, clamp(bx, p.x, p.x + p.w), clamp(by, p.y, p.y + p.h), clamp(bx, p.x, p.x + p.w), clamp(by, p.y, p.y + p.h)) > 16) continue;
      hitSet.add(p); any = true;
      if (p.isWindow) { p.damage(50, bx, by, 'melee', dirx); }
      else { p.damage(def.dmg * 0.5, bx, by, 'melee'); if (p.impulse) p.impulse(dirx * 260, -40); Sfx.play(p.mat === 'metal' ? 'metal_bash' : 'bash', { x: bx, y: by, vol: 0.6 }); }
    }
    return any;
  },
};
