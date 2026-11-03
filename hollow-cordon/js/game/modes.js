'use strict';
// =====================================================================
//  Game modes — Survival (waves, economy, shop, score), Sandbox
//  (configurable spawning, god mode, infinite ammo, live tools) and
//  Attract (menu backdrop).
// =====================================================================

const SHOP_ITEMS = [
  { id: 'medkit', label: 'Medkit', desc: 'Heals 50 HP over a second (H).', price: 150, buy: (p) => { if (p.medkits >= 5) return false; p.medkits++; return true; } },
  { id: 'armor', label: 'Kevlar vest (+50)', desc: 'Absorbs 60% of incoming damage until depleted.', price: 300, buy: (p) => { if (p.armor >= 100) return false; p.armor = Math.min(100, p.armor + 50); return true; } },
  { id: 'planks', label: 'Planks ×3', desc: 'Board up doors/windows, repair barricades (E).', price: 90, buy: (p) => { if (p.planks >= 15) return false; p.planks += 3; return true; } },
  { id: 'grenade', label: 'Frag grenade', desc: 'Fused 2.4s, huge blast radius (G).', price: 120, unlock: 2, buy: (p) => { if (p.grenades >= 6) return false; p.grenades++; return true; } },
];

// wave composition: enemy roster grows in variety and behaviour, not just numbers
function composeWave(n, allowed, bias = {}) {
  const ok = (t) => !allowed || allowed.includes(t);
  const list = [];
  const total = Math.round(7 + n * 3.2 + Math.pow(n, 1.35));
  const pool = [['walker', 1]];
  if (n >= 2) pool.push(['crawler', 0.18 + n * 0.01]);
  if (n >= 3) pool.push(['runner', 0.22 + n * 0.02]);
  for (const t of WAVE_SPECIALS) if (n >= t.from && ok(t.type) && ZTYPES[t.type]) pool.push([t.type, t.w + (n - t.from) * (t.grow || 0.01)]);
  const valid = pool.filter(([t]) => ok(t) && ZTYPES[t]).map(([t, w]) => [t, w * (bias[t] || 1)]);
  if (!valid.length) valid.push([allowed && allowed[0] || 'walker', 1]);
  const sum = valid.reduce((a, [, w]) => a + w, 0);
  for (let i = 0; i < total; i++) {
    let r = Math.random() * sum;
    for (const [t, w] of valid) { r -= w; if (r <= 0) { list.push(t); break; } }
  }
  // signature set-pieces
  if (n >= 4 && n % 3 === 1 && ok('runner')) for (let i = 0; i < 4 + n / 2; i++) list.push('runner'); // runner pack
  for (const t of WAVE_SPECIALS) if (t.boss && n >= t.from && (n - t.from) % t.boss === 0 && ok(t.type) && ZTYPES[t.type]) list.push(t.type);
  return list;
}
// populated in milestone 2 with special infected
const WAVE_SPECIALS = [
  { type: 'riot', from: 4, w: 0.1, grow: 0.01 },
  { type: 'bloater', from: 5, w: 0.07, grow: 0.005 },
  { type: 'brute', from: 6, w: 0, grow: 0.004, boss: 3 },
  { type: 'shrieker', from: 6, w: 0.03, grow: 0.004 },
  { type: 'leaper', from: 7, w: 0.06, grow: 0.008 },
  { type: 'soldier', from: 8, w: 0.07, grow: 0.01 },
  { type: 'burner', from: 5, w: 0.05, grow: 0.006 },
];

class SurvivalMode {
  constructor(game, opts = {}) {
    this.game = game; this.opts = opts;
    this.name = 'Survival';
    this.wave = 0; this.state = 'break'; this.breakT = 18;
    this.cash = 250; this.score = 0; this.kills = 0; this.headshots = 0; this.dismembers = 0;
    this.queue = []; this.spawnT = 0; this.combo = 0; this.comboT = 0;
    this.time = 0; this.over = false;
  }
  start() {
    const p = this.game.player;
    const R = this.opts.resume;
    if (R && Loadout.apply(p, R.loadout)) {
      Object.assign(this, { wave: R.wave, cash: R.cash, score: R.score, kills: R.kills, headshots: R.headshots, dismembers: R.dismembers, time: R.time });
      this.breakT = 20;
      this.game.hud.banner('RUN RESUMED', `Wave ${this.wave + 1} in 20s — ${Input.label('shop')} to shop`);
      Sfx.loop(this.game.map.amb || 'amb_drone', 0.5);
      return;
    }
    p.give('machete'); p.give(p.surv.start, 4);
    p.medkits = 1; p.planks = 3;
    this.game.hud.banner('SURVIVE', 'Wave 1 in ' + Math.ceil(this.breakT) + 's — press ' + Input.label('nextWave') + ' to start now, ' + Input.label('shop') + ' to shop');
    Sfx.loop(this.game.map.amb || 'amb_drone', 0.5);
  }
  addCash(n) { this.cash += n; }
  update(dt) {
    const g = this.game;
    this.time += dt;
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    if (this.over) return;
    if (this.state === 'break') {
      if (!UI.shopOpen) this.breakT -= dt;
      if (this.breakT <= 0 || (Input.actPressed('nextWave') && !UI.shopOpen)) this.startWave();
      if (Input.actPressed('shop')) UI.toggleShop(this);
    } else {
      this.spawnT -= dt;
      const alive = g.zombies.length;
      const maxAlive = Math.min(10 + this.wave * 2, 38);
      if (this.queue.length && this.spawnT <= 0 && alive < maxAlive) {
        this.spawnT = Math.max(0.3, 1.7 - this.wave * 0.09) * rand(0.6, 1.3);
        const burst = this.wave >= 5 ? randi(1, 3) : 1;
        for (let i = 0; i < burst && this.queue.length; i++) this.spawnOne(this.queue.shift());
      }
      if (!this.queue.length && alive === 0) this.endWave();
      if (Input.actPressed('shop')) g.hud.toast('The shop opens between waves');
    }
  }
  pickSpawn(type) {
    const g = this.game, p = g.player, v = g.view;
    let cands = g.spawns.filter((s) => (type === 'crawler' || s.kind !== 'vent') && Math.abs(s.x - p.x) > 420);
    if (!cands.length) cands = g.spawns.slice();
    if (!cands.length) return { x: p.x + (chance(0.5) ? -900 : 900), y: p.y };
    const off = cands.filter((s) => s.x < v.x - 40 || s.x > v.x + v.w + 40 || s.y < v.y || s.y > v.y + v.h);
    const pool = off.length ? off : cands;
    // later waves pressure from both flanks
    if (this.wave >= 5 && chance(0.5)) { const side = chance(0.5) ? -1 : 1; const s2 = pool.filter((s) => Math.sign(s.x - p.x) === side); if (s2.length) return pick(s2); }
    return pick(pool);
  }
  spawnOne(type) {
    const s = this.pickSpawn(type);
    const z = this.game.spawnZombie(type, s.x + rand(-20, 20), s.y, { hunt: true });
    z.face = Math.sign(this.game.player.x - z.x) || 1;
    // later waves: tougher, faster, more aggressive
    const w = this.wave;
    if (w > 5) { const k = 1 + (w - 5) * 0.05; z.hp *= k; z.maxHp *= k; z.headHp *= Math.sqrt(k); }
    z.speed *= Math.min(1.35, 1 + w * 0.012);
    return z;
  }
  onShriek(sh) {
    // the scream drags in reinforcements from the nearest entrances
    const g = this.game;
    const sp = g.spawns.slice().sort((a, b) => Math.abs(a.x - sh.x) - Math.abs(b.x - sh.x)).slice(0, 3);
    const n = Math.min(5, 2 + Math.floor(this.wave / 4));
    for (let i = 0; i < n && sp.length; i++) { const s = sp[i % sp.length]; const z = g.spawnZombie(chance(0.6) ? 'walker' : 'runner', s.x + rand(-20, 20), s.y, { hunt: true }); z.buffT = 6; }
    g.hud.toast('A shriek echoes — more are coming!');
  }
  startWave() {
    this.wave++;
    this.state = 'wave';
    this.queue = composeWave(this.wave, this.opts.allowed, this.game.map.bias || {});
    this.total = this.queue.length;
    this.spawnT = 1;
    UI.closeShop();
    Sfx.play('wave_start', { vol: 0.9, verb: 1.5 });
    this.game.hud.banner('WAVE ' + this.wave, this.waveFlavor());
    this.game.noise(this.game.player.x, this.game.player.y, 99999);
  }
  waveFlavor() {
    const w = this.wave;
    if (w === 1) return 'They followed the sirens here.';
    if (w === 3) return 'Runners. Listen for the screaming.';
    if (w === 2) return 'Something is crawling in the dark.';
    if (w % 3 === 1 && w >= 4) return 'A pack is coming — fast.';
    if (w >= 5) return 'They are coming from both sides.';
    return 'Hold the line.';
  }
  endWave() {
    this.state = 'break';
    this.breakT = 25;
    const bonus = 100 + this.wave * 30;
    this.cash += bonus;
    this.score += this.wave * 100;
    Sfx.play('wave_clear', { vol: 0.8 });
    this.game.hud.banner('WAVE ' + this.wave + ' SURVIVED', `+$${bonus}  ·  ${Input.label('shop')}: shop  ·  ${Input.label('nextWave')}: next wave`);
    const p = this.game.player; if (p && !p.dead) p.hp = Math.min(p.maxHp, p.hp + 15);
    this.saveRun();
  }
  // persist the run at every wave break so it can be continued from the menu
  saveRun() {
    if (this.name !== 'Survival') return;
    const g = this.game, p = g.player;
    if (!p || p.dead) return;
    const run = {
      map: g.map.id, mapName: g.map.name, survivor: p.surv.id, survivorName: p.surv.name, difficulty: this.opts.difficulty || 'normal',
      wave: this.wave, cash: this.cash, score: Math.round(this.score), kills: this.kills, headshots: this.headshots, dismembers: this.dismembers, time: this.time,
      loadout: Loadout.capture(p), saved: Date.now(),
    };
    try { localStorage.setItem('hc_run', JSON.stringify(run)); } catch (e) { /* storage blocked */ }
  }
  static loadRun() { try { return JSON.parse(localStorage.getItem('hc_run') || 'null'); } catch (e) { return null; } }
  static clearRun() { try { localStorage.removeItem('hc_run'); } catch (e) { /* ignore */ } }
  onKill(z, info) {
    if (this.over) return;
    this.kills++;
    this.combo++; this.comboT = 2.5;
    let cash = z.def.cash, score = z.def.score;
    const g = this.game;
    if (info.headshot) { this.headshots++; cash = Math.round(cash * 1.5); score = Math.round(score * 1.5); g.fx.text(z.x, z.y - z.h - 20, 'HEADSHOT', '#e8c870', 13); }
    if (info.cause === 'gib') { cash += 10; g.fx.text(z.x, z.y - z.h - 20, 'OBLITERATED', '#e89070', 13); }
    if (this.combo >= 3) score = Math.round(score * (1 + this.combo * 0.1));
    this.cash += cash; this.score += score * Math.max(1, this.wave * 0.5);
    // drops
    const r = Math.random();
    const p = g.player;
    if (r < 0.2) {
      const guns = p.weapons.filter((w) => w.def.cat !== 'melee');
      if (guns.length) { const d = pick(guns).def; g.pickups.push(new Pickup(g, z.x, z.y - 40, 'ammo', { ammo: d.ammo, amount: Math.max(2, Math.round(AMMO[d.ammo].box * 0.5)) })); }
    } else if (r < 0.28) g.pickups.push(new Pickup(g, z.x, z.y - 40, 'cash', { amount: randi(15, 45) }));
    else if (r < 0.305) g.pickups.push(new Pickup(g, z.x, z.y - 40, 'medkit'));
    else if (r < 0.33) g.pickups.push(new Pickup(g, z.x, z.y - 40, 'planks', { amount: 2 }));
    else if (r < 0.345 && this.wave >= 3) g.pickups.push(new Pickup(g, z.x, z.y - 40, 'grenade'));
  }
  onDismember() { this.dismembers++; this.cash += 3; this.score += 5; }
  onPlayerDeath() {
    if (this.over) return;
    this.over = true;
    SurvivalMode.clearRun();
    const key = 'hc_best_' + this.game.map.id;
    let best = 0; try { best = +localStorage.getItem(key) || 0; } catch (e) { /* ignore */ }
    const record = Math.round(this.score) > best;
    if (record) try { localStorage.setItem(key, Math.round(this.score)); } catch (e) { /* ignore */ }
    this.game.later(2.6, () => UI.gameOver({
      title: 'YOU DIED', sub: `${this.game.map.name} — wave ${this.wave}`,
      stats: [['Score', Math.round(this.score) + (record ? '  (NEW BEST)' : '')], ['Best', Math.max(best, Math.round(this.score))], ['Waves survived', Math.max(0, this.wave - 1)], ['Kills', this.kills], ['Headshots', this.headshots], ['Limbs severed', this.dismembers], ['Time', fmtTime(this.time)]],
    }));
  }
  hudInfo() {
    return {
      left: [['SCORE', Math.round(this.score)], ['CASH', '$' + this.cash]],
      center: this.state === 'break' ? `WAVE ${this.wave + 1} IN ${Math.ceil(this.breakT)}s` : `WAVE ${this.wave}  ·  ${this.game.zombies.length + this.queue.length} INFECTED`,
      centerSub: this.state === 'break' ? `[${Input.label('shop')}] shop   [${Input.label('nextWave')}] start now` : '',
      combo: this.combo >= 3 ? 'x' + this.combo : '',
    };
  }
  // shop catalogue
  shopWeapons() { return WEAPON_LIST.filter((w) => w.price > 0 || w.cat === 'melee'); }
  buyWeapon(def) {
    const p = this.game.player;
    if (p.weapons.find((w) => w.def.id === def.id)) return 'Owned';
    if (this.wave + 1 < def.unlock) return 'Locked';
    if (this.cash < def.price) return 'Not enough cash';
    this.cash -= def.price; p.give(def.id, 2); Sfx.play('buy'); return true;
  }
  buyAmmo(type) {
    const p = this.game.player, a = AMMO[type];
    if (this.cash < a.price) return 'Not enough cash';
    if (p.reserve[type] >= a.max) return 'Full';
    this.cash -= a.price; p.addAmmo(type, a.box); Sfx.play('buy'); return true;
  }
  buyItem(it) {
    const p = this.game.player;
    if (this.cash < it.price) return 'Not enough cash';
    if (it.unlock && this.wave + 1 < it.unlock) return 'Locked';
    if (!it.buy(p)) return 'Full';
    this.cash -= it.price; Sfx.play('buy'); return true;
  }
}

class SandboxMode {
  constructor(game, opts = {}) {
    this.game = game; this.opts = opts; this.name = 'Sandbox';
    this.spawnT = 2; this.kills = 0;
    this.auto = !!opts.autoSpawn;
  }
  start() {
    const g = this.game, p = g.player, o = this.opts;
    if (p) {
      const ids = o.weapons && o.weapons.length ? o.weapons : WEAPON_LIST.map((w) => w.id);
      for (const id of ids) p.give(id, 6);
      if (!p.weapons.length) p.give('p9');
      p.infAmmo = !!o.infiniteAmmo; p.god = !!o.god;
      p.medkits = 5; p.grenades = o.infiniteAmmo ? 6 : 3; p.planks = 99; p.planksFree = true;
      const firstGun = p.weapons.findIndex((w) => w.def.cat !== 'melee');
      if (firstGun >= 0) p.cur = firstGun;
    }
    for (let i = 0; i < (o.startCount || 0); i++) this.spawnRandom();
    Sfx.loop(g.map.amb || 'amb_drone', 0.5);
    g.hud.banner('SANDBOX', `${Input.label('sandbox')}: tools panel  ·  spawn, remove, slow-mo, god mode`);
  }
  types() { return this.opts.types && this.opts.types.length ? this.opts.types : Object.keys(ZTYPES); }
  spawnRandom() {
    const g = this.game;
    const s = g.spawns.length ? pick(g.spawns) : { x: rand(100, g.world.w - 100), y: g.world.h - 300 };
    return g.spawnZombie(pick(this.types()), s.x + rand(-20, 20), s.y, { hunt: !!this.opts.hunt });
  }
  update(dt) {
    const g = this.game, p = g.player;
    if (p && p.infAmmo) { for (const w of p.weapons) if (w.def.cat !== 'melee') p.reserve[w.def.ammo] = Math.max(p.reserve[w.def.ammo], w.def.mag * 3); p.grenades = Math.max(p.grenades, 3); }
    if (this.auto) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && g.zombies.length < (this.opts.maxAlive || 20)) { this.spawnT = 1 / (this.opts.rate || 0.5); this.spawnRandom(); }
    }
    if (Input.actPressed('sandbox')) UI.toggleSandboxPanel(this);
    if (p && p.dead && !this.respawning) { this.respawning = true; g.later(2.5, () => { this.respawning = false; UI.gameOver({ title: 'YOU DIED', sub: 'Sandbox', stats: [['Kills', this.kills]] }); }); }
  }
  onKill() { this.kills++; }
  onShriek(sh) {
    const g = this.game;
    if (!g.spawns.length) return;
    for (let i = 0; i < 2; i++) { const s = pick(g.spawns); g.spawnZombie(pick(this.types().filter((t) => t !== 'brute' && t !== 'shrieker').concat(['walker'])), s.x, s.y, { hunt: true }); }
  }
  hudInfo() {
    const p = this.game.player;
    const flags = [];
    if (p && p.god) flags.push('GOD'); if (p && p.infAmmo) flags.push('∞ AMMO'); if (this.game.timeScale < 1) flags.push('SLOW-MO'); if (this.game.aiFrozen) flags.push('AI FROZEN'); if (this.auto) flags.push('AUTO-SPAWN');
    return { left: [['KILLS', this.kills], ['INFECTED', this.game.zombies.length]], center: 'SANDBOX', centerSub: flags.join('  ·  ') + `   [${Input.label('sandbox')}] tools` };
  }
  // tool application (from sandbox panel)
  applyTool(tool, wx, wy) {
    const g = this.game;
    if (!tool) return;
    const gy = g.world.groundBelow(wx, wy - 2, 3000);
    if (tool.startsWith('z:')) { const z = g.spawnZombie(tool.slice(2), wx, Math.min(gy, g.world.h - 10), { hunt: !!this.opts.hunt }); z.face = g.player ? Math.sign(g.player.x - wx) || 1 : 1; Sfx.play('z_growl', { x: wx, y: wy, vol: 0.6 }); }
    else if (tool.startsWith('p:')) {
      const def = PROP_DEFS[tool.slice(2)];
      if (def) { g.props.push(new Prop(g, def, wx - def.w / 2, gy - def.h - 1, { kind: tool.slice(2) })); }
    } else if (tool === 'remove') {
      for (let i = g.zombies.length - 1; i >= 0; i--) { const z = g.zombies[i], b = z.bbox; if (wx > b[0] && wx < b[2] && wy > b[1] && wy < b[3]) { g.zombies.splice(i, 1); return; } }
      for (let i = g.corpses.length - 1; i >= 0; i--) { const b = g.corpses[i].bbox; if (wx > b[0] && wx < b[2] && wy > b[1] && wy < b[3]) { g.corpses.splice(i, 1); return; } }
      for (let i = g.props.length - 1; i >= 0; i--) { const p = g.props[i]; if (wx > p.x && wx < p.x + p.w && wy > p.y && wy < p.y + p.h) { g.props.splice(i, 1); return; } }
    } else if (tool === 'explode') Combat.explode(g, wx, wy, 200, 260, null);
    else if (tool === 'fire') g.addFire(wx, gy, 8);
  }
}

class AttractMode {
  constructor(game) { this.game = game; this.t = 0; }
  start() {
    const g = this.game;
    const types = ['walker', 'walker', 'runner', 'crawler', 'riot', 'bloater', 'leaper'];
    for (let i = 0; i < 9; i++) { const x = rand(200, g.world.w - 200); g.spawnZombie(pick(types), x, g.world.groundBelow(x, (g.map.horizon || g.world.h - 300) - 300, 3000)); }
  }
  update(dt) {
    this.t += dt;
    if (this.t > 2.5) { this.t = 0; if (chance(0.3)) Sfx.play('z_groan', { vol: 0.25 }); }
  }
}
