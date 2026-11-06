'use strict';
// =====================================================================
//  Game — a running session on one map: builds the world from map data,
//  owns entities, camera, timing, and renders the full frame.
// =====================================================================

const DIFFICULTY = {
  easy: { label: 'Easy', hpMul: 0.8, speedMul: 0.9, dmgMul: 0.6, sight: 0.85 },
  normal: { label: 'Normal', hpMul: 1, speedMul: 1, dmgMul: 1, sight: 1 },
  hard: { label: 'Hard', hpMul: 1.2, speedMul: 1.08, dmgMul: 1.35, sight: 1.15 },
  nightmare: { label: 'Nightmare', hpMul: 1.45, speedMul: 1.15, dmgMul: 1.8, sight: 1.3 },
};

class Pickup {
  constructor(game, x, y, kind, o = {}) {
    this.game = game; this.x = x; this.y = y; this.vx = o.vx || rand(-60, 60); this.vy = o.vy || -rand(150, 280);
    this.kind = kind; this.amount = o.amount || 1; this.ammo = o.ammo; this.weapon = o.weapon;
    this.life = o.life || 40; this.hw = 7; this.h = 10; this.grounded = false; this.bob = rand(0, TAU);
  }
  update(dt) {
    this.life -= dt; this.bob += dt * 3;
    if (!this.grounded) { const w = this.game.world; this.vy += 1500 * dt; this.x += this.vx * dt; const ny = this.y + this.vy * dt; const b = w.solidAt(this.x, ny, true) || this.game.solidPropAt(this.x, ny); if (b && this.y <= b.y + 2) { this.y = b.y; this.grounded = true; this.vx = 0; } else this.y = ny; if (this.y > w.h) this.life = 0; }
    const p = this.game.player;
    if (p && !p.dead && Math.abs(p.x - this.x) < 24 && this.y > p.y - p.h && this.y < p.y + 10) this.collect(p);
  }
  collect(p) {
    const g = this.game;
    switch (this.kind) {
      case 'ammo': p.addAmmo(this.ammo, this.amount); g.fx.text(this.x, this.y - 30, `+${this.amount} ${AMMO[this.ammo].name}`, '#d8c890', 12); Sfx.play('pickup'); break;
      case 'cash': if (g.mode.addCash) g.mode.addCash(this.amount); g.fx.text(this.x, this.y - 30, `+$${this.amount}`, '#9ad870', 13); Sfx.play('cash'); break;
      case 'medkit': p.medkits++; g.fx.text(this.x, this.y - 30, '+1 Medkit', '#e8a0a0', 12); Sfx.play('pickup'); break;
      case 'planks': p.planks += this.amount; g.fx.text(this.x, this.y - 30, `+${this.amount} Planks`, '#c8a070', 12); Sfx.play('pickup'); break;
      case 'grenade': p.grenades = Math.min(6, p.grenades + this.amount); g.fx.text(this.x, this.y - 30, '+1 Grenade', '#c8c890', 12); Sfx.play('pin'); break;
      case 'armor': p.armor = Math.min(100, p.armor + 50); g.fx.text(this.x, this.y - 30, '+50 Armor', '#90b0d8', 12); Sfx.play('pickup'); break;
      case 'weapon': p.give(this.weapon, 2); g.fx.text(this.x, this.y - 30, WEAPONS[this.weapon].name, '#e8d8a0', 13); Sfx.play('pickup'); break;
      case 'battery': p.battery = Math.min(100, (p.battery || 0) + 40); g.fx.text(this.x, this.y - 30, '+40% Battery', '#d8e890', 12); Sfx.play('click', { vol: 0.7 }); Sfx.play('pickup', { vol: 0.6 }); break;
    }
    this.life = 0;
  }
  draw(ctx) {
    const y = this.y - 2 + (this.grounded ? Math.sin(this.bob) * 1 : 0);
    if (this.life < 5 && Math.sin(this.life * 12) < 0) return;
    ctx.save(); ctx.translate(this.x, y);
    switch (this.kind) {
      case 'ammo': ctx.fillStyle = '#4a4a30'; ctx.fillRect(-9, -11, 18, 11); ctx.fillStyle = '#c8b060'; ctx.fillRect(-9, -11, 18, 3); ctx.fillStyle = '#1a1a10'; ctx.font = 'bold 5px monospace'; ctx.fillText('AMMO', -7, -3); break;
      case 'cash': ctx.fillStyle = '#4a6a3a'; ctx.fillRect(-8, -6, 16, 6); ctx.fillStyle = '#8aa870'; ctx.fillRect(-8, -6, 16, 1.5); ctx.fillStyle = '#c8b860'; ctx.fillRect(-2, -6, 3, 6); break;
      case 'medkit': ctx.fillStyle = '#e0dcd0'; ctx.fillRect(-9, -12, 18, 12); ctx.fillStyle = '#b01a14'; ctx.fillRect(-2, -10, 4, 8); ctx.fillRect(-6, -8, 12, 4); break;
      case 'planks': ctx.fillStyle = '#7a5a34'; ctx.fillRect(-14, -5, 28, 3); ctx.fillRect(-12, -9, 26, 3); break;
      case 'grenade': ctx.fillStyle = '#3a4a2a'; ctx.beginPath(); ctx.ellipse(0, -6, 5, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#888'; ctx.fillRect(-1, -14, 3, 3); break;
      case 'armor': ctx.fillStyle = '#2a3446'; ctx.fillRect(-9, -14, 18, 14); ctx.fillStyle = '#1a2030'; ctx.fillRect(-6, -10, 12, 6); break;
      case 'weapon': { const gs = GunArt.get(WEAPONS[this.weapon]); ctx.drawImage(gs.full, -gs.body.w / 2, -gs.body.h, gs.body.w, gs.body.h); break; }
      case 'battery': ctx.fillStyle = '#1c1c1c'; roundRect(ctx, -4, -13, 8, 13, 1.2); ctx.fill(); ctx.fillStyle = '#c8a830'; ctx.fillRect(-4, -13, 8, 4); ctx.fillStyle = '#888'; ctx.fillRect(-1.5, -15, 3, 2); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-3, -12, 1, 11); break;
    }
    ctx.restore();
    // glint
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.bob * 2);
    ctx.drawImage(Lighting.radial('#ffe0a0'), this.x - 16, y - 22, 32, 32); ctx.restore();
  }
}

class Game {
  constructor(map, opts = {}) {
    this.map = map;
    this.opts = opts;
    this.theme = map.theme || 'hospital';
    this.diff = DIFFICULTY[opts.difficulty || 'normal'];
    this.world = new World(map);
    this.fx = new FX(this);
    this.zombies = []; this.corpses = []; this.props = []; this.pickups = []; this.fires = []; this.grenades = [];
    this.lights = []; this.notes = []; this.spawns = []; this.timers = [];
    this.noises = []; this.noiseId = 0;
    this.time = 0; this.frame = 0;
    this.tmpBlocks = [];
    this.cam = { x: 0, y: 0, shake: 0, kx: 0, ky: 0, zoom: 1 };
    this.view = { x: 0, y: 0, w: 1280, h: 720, scale: 1 };
    this.timeScale = 1; this.hitstopT = 0;
    this.dmgFlash = 0;
    this.aiFrozen = false;
    const T = THEMES[this.theme] || THEMES.streets;
    this.ambient = { color: map.ambient || '#1a1e26', level: map.ambientLevel === undefined ? 0.18 : map.ambientLevel };
    this.reverb = map.reverb === undefined ? 0.3 : map.reverb;
    this.build(map);
    this.hud = new HUD(this);
    this.player = null;
    if (!opts.noPlayer) {
      const ps = this.playerSpawn || { x: 200, y: this.world.h - 200 };
      this.player = new Player(this, ps.x, ps.y, opts.survivor);
      this.cam.x = ps.x; this.cam.y = ps.y - 100;
    } else { this.cam.x = this.world.w / 2; this.cam.y = (map.horizon || this.world.h - 300) - 160; }
    this.mode = opts.modeFactory ? opts.modeFactory(this) : new NullMode(this);
    // outside Blackout the bunker maps play with their blast doors open and the power on
    if (!this.mode.blackout) {
      for (const pr of this.props) if (pr.blast) { pr.locked = false; pr.open = true; pr.anim = 1; }
      for (const L of this.lights) if (L.group) L.on = true;
    }
    if (this.mode.start) this.mode.start();
    Sfx.setReverb(this.reverb);
  }

  // ------------------------------------------------------------- building
  build(map) {
    const w = this.world;
    for (const o of map.objects) this.addObject(o, true);
    w.buildGrid();
    // auto-clip room lights to their back wall
    for (const L of this.lights) {
      if (L.clip !== 'auto') continue;
      L.clip = null;
      for (const bw of w.backwalls) if (L.x >= bw.x && L.x <= bw.x + bw.w && L.y >= bw.y && L.y <= bw.y + bw.h) { L.clip = { x: bw.x - 4, y: bw.y - 4, w: bw.w + 8, h: bw.h + 8 }; break; }
    }
  }
  addObject(o, initial = false) {
    const w = this.world;
    switch (o.type) {
      case 'block': w.addBlock({ x: o.x, y: o.y, w: o.w, h: o.h, mat: o.mat }); break;
      case 'platform': w.addBlock({ x: o.x, y: o.y, w: o.w, h: o.h || 10, mat: o.mat || 'metal', oneway: true }); break;
      case 'stairs': {
        const n = Math.max(2, Math.round(o.h / 14)), sh = o.h / n, sw = o.w / n;
        for (let i = 0; i < n; i++) {
          const sx = o.dir > 0 ? o.x + i * sw : o.x + o.w - (i + 1) * sw;
          w.addBlock({ x: sx, y: o.y - (i + 1) * sh, w: sw + 0.5, h: 6, mat: o.mat || 'concrete', oneway: true, stair: true, auto: !!o.solid });
        }
        w.links.push({ kind: 'stairs', bx: o.dir > 0 ? o.x - 12 : o.x + o.w + 12, tx: o.dir > 0 ? o.x + o.w + 14 : o.x - 14, bottom: o.y, top: o.y - o.h });
        w.stairs.push(o);
        break;
      }
      case 'ladder': {
        const L = { x: o.x, y: o.y, w: o.w || 28, h: o.h };
        w.ladders.push(L);
        w.links.push({ kind: 'ladder', bx: L.x + L.w / 2, tx: L.x + L.w / 2, bottom: L.y + L.h, top: L.y });
        break;
      }
      case 'backwall': w.backwalls.push({ x: o.x, y: o.y, w: o.w, h: o.h, mat: o.mat || 'concrete', dark: o.dark, wainscot: o.wainscot }); break;
      case 'decor': w.decor.push(o); break;
      case 'door': this.props.push(new Door(this, o.x, o.y, o)); break;
      case 'window': this.props.push(new Win(this, o.x, o.y, o)); break;
      case 'barricade': this.props.push(new Barricade(this, o.x, o.y, o)); break;
      case 'prop': {
        const def = PROP_DEFS[o.kind];
        if (def) { const p = new Prop(this, def, o.x, o.y, o); this.props.push(p); if (def.siren) this.lights.push({ x: o.x + p.w * 0.4, y: o.y - 2, r: 170, color: '#3050ff', int: 0.8, kind: 'emergency', flicker: 1, seed: Math.random() * 99, on: true, siren: true, halo: true }); }
        break;
      }
      case 'light': this.lights.push({ x: o.x, y: o.y, r: o.r || 300, color: o.color || '#ffe0b0', int: o.int === undefined ? 1 : o.int, kind: o.kind || 'bulb', flicker: o.flicker || 0, clip: o.clip === undefined ? 'auto' : o.clip, shaft: o.shaft || 0, seed: Math.random() * 100, on: !o.off, halo: o.halo, group: o.group }); break;
      case 'fire': this.fires.push({ x: o.x, y: o.y, life: Infinity, max: Infinity, perm: true, harmless: !!o.harmless }); this.lights.push({ x: o.x, y: o.y - 30, r: o.r || 340, color: '#ff8a30', int: 1.1, kind: 'fire', flicker: 1, clip: null, seed: Math.random() * 100, on: true }); break;
      case 'pickup': this.later(0, () => this.pickups.push(new Pickup(this, o.x, o.y, o.kind || 'ammo', { ammo: o.ammo || '9mm', amount: o.amount || (o.kind === 'ammo' ? AMMO[o.ammo || '9mm'].box : 1), weapon: o.weapon || 'p9', life: Infinity, vx: 0, vy: 0 }))); break;
      case 'note': this.notes.push({ x: o.x, y: o.y, title: o.title || 'Note', text: o.text || '' }); break;
      case 'spawn': this.spawns.push({ x: o.x, y: o.y, kind: o.kind || 'edge' }); break;
      case 'player': this.playerSpawn = { x: o.x, y: o.y }; break;
      case 'zombie': if (!initial || !this.opts.noPreplaced) this.later(0, () => this.spawnZombie(o.kind || 'walker', o.x, o.y, { hunt: false })); break;
    }
  }

  // ------------------------------------------------------------- services
  noise(x, y, r, quiet = false) { this.noises.push({ x, y, r, id: ++this.noiseId, life: quiet ? 0.3 : 0.6 }); }
  shake(a) { this.cam.shake = Math.min(30, this.cam.shake + a * Settings.data.screenShake); if (a >= 2 && this.player && !this.noPlayer) Input.rumble(Math.min(1, a / 14), 60 + Math.min(240, a * 14)); }
  camKick(x, y) { this.cam.kx += x * Settings.data.screenShake; this.cam.ky += y * Settings.data.screenShake; }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  damageFlash(a) { this.dmgFlash = Math.min(1, this.dmgFlash + a); }
  later(t, fn) { this.timers.push({ t, fn }); }
  addFire(x, y, life) { if (this.fires.length > 40) { const i = this.fires.findIndex((f) => !f.perm); if (i >= 0) this.fires.splice(i, 1); } this.fires.push({ x, y, life, max: life }); }
  lightAt(x, y) { return Lighting.levelAt(this, x, y); }
  solidPropAt(x, y) {
    for (const p of this.props) if (p.solid && !p.dead && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p;
    return null;
  }
  solidPropsNear(x, y, r) {
    const out = this._spn || (this._spn = []); out.length = 0;
    for (const p of this.props) if (p.solid && !p.dead && x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h) out.push(p);
    return out;
  }
  blockedByDoor(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    for (const p of this.props) {
      if (!(p.isDoor || p.isWindow) || !p.solid) continue;
      if (p.isWindow && !p.boards) continue;
      const r = rayAABB(ax, ay, dx, dy, p.x, p.y, p.x + p.w, p.y + p.h);
      if (r && r[0] <= 1) return true;
    }
    return false;
  }
  neckSource(body) {
    for (const z of this.zombies) if (z.body === body) { const j = body.j; return [z.x + j.neck.x * z.face, z.y + j.neck.y, -Math.PI / 2]; }
    return null;
  }
  screenToWorld(sx, sy) { const v = this.view; return [v.x + sx / v.scale, v.y + sy / v.scale]; }
  worldToScreen(x, y) { const v = this.view; return [(x - v.x) * v.scale, (y - v.y) * v.scale]; }

  spawnZombie(type, x, y, o = {}) {
    if (!ZTYPES[type]) type = 'walker';
    const z = new Zombie(this, type, x, y, o);
    this.zombies.push(z);
    return z;
  }
  addCorpse(rd, piece = false) {
    rd.piece = piece;
    this.corpses.push(rd);
    const lim = Settings.data.corpseLimit;
    let full = 0, pieces = 0;
    for (const c of this.corpses) { if (c.fading) continue; if (c.piece) pieces++; else full++; }
    if (full > lim || pieces > lim * 2) {
      for (const c of this.corpses) { if (!c.fading && c.piece === (pieces > lim * 2)) { c.fading = true; break; } }
    }
  }
  onZombieDeath(z, info) { if (this.mode.onKill) this.mode.onKill(z, info); }
  onDismember(z, bone) { if (this.mode.onDismember) this.mode.onDismember(z, bone); }
  onPlayerDeath() { if (this.mode.onPlayerDeath) this.mode.onPlayerDeath(); }
  showNote(n) { UI.showNote(n); }

  // --------------------------------------------------------------- update
  readInput() {
    const p = this.player;
    const lad = p ? Phys.ladderAt(this, p.x, p.y, p.h) : null;
    let slot = 0;
    for (let i = 1; i <= 8; i++) if (Input.actPressed('slot' + i)) slot = i;
    const toolActive = UI.sandboxToolActive();
    return {
      left: Input.act('moveLeft'), right: Input.act('moveRight'), up: Input.act('up'), down: Input.act('down'),
      downPressed: Input.actPressed('down'),
      jumpPressed: Input.actPressed('jump'),
      sprint: Input.act('sprint'),
      fire: !toolActive && Input.act('fire'), firePressed: !toolActive && Input.actPressed('fire'), aim: Input.act('aim'),
      reload: Input.actPressed('reload'), interact: Input.actPressed('interact'), melee: Input.actPressed('melee'),
      flashlight: Input.actPressed('flashlight'), medkit: Input.actPressed('medkit'), lastWeapon: Input.actPressed('lastWeapon'),
      grenade: Input.actPressed('grenade'),
      slot, wheel: Input.wheel,
    };
  }
  update(rawDt) {
    let dt = rawDt * this.timeScale;
    if (this.hitstopT > 0) { this.hitstopT -= rawDt; dt *= 0.08; }
    this.time += dt; this.frame++;
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    for (let i = this.noises.length - 1; i >= 0; i--) if ((this.noises[i].life -= dt) <= 0) this.noises.splice(i, 1);
    const p = this.player;
    if (p && !p.dead) {
      const ui = this.readInput();
      p.update(dt, ui);
      if (ui.grenade) this.throwGrenade();
    }
    for (const z of this.zombies) z.update(dt);
    for (let i = this.zombies.length - 1; i >= 0; i--) if (this.zombies[i].dead) this.zombies.splice(i, 1);
    for (const pr of this.props) pr.update(dt);
    for (let i = this.props.length - 1; i >= 0; i--) { const pr = this.props[i]; if (pr.dead && !pr.isDoor && !pr.isWindow && !pr.isBarricade) this.props.splice(i, 1); }
    // corpses (substep for stability)
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      if (c.fading) { c.fade -= rawDt * 0.8; if (c.fade <= 0) { this.corpses.splice(i, 1); continue; } }
      c.update(dt);
      if (c.dead) this.corpses.splice(i, 1);
    }
    for (const pk of this.pickups) pk.update(dt);
    this.pickups = this.pickups.filter((pk) => pk.life > 0);
    for (const g of this.grenades) g.update(dt);
    this.grenades = this.grenades.filter((g) => !g.done);
    for (const f of this.fires) {
      f.life -= dt;
      if (Math.random() < (f.perm ? 0.9 : 0.7)) this.fx.fire(f.x + rand(-14, 14), f.y - 4, f.perm ? 2 : 1, f.perm ? 22 : 16);
      if (Math.random() < 0.1) this.fx.smoke(f.x, f.y - 20, 1, '#2a2a2a', 26, 50);
      if (f.harmless) continue;
      for (const z of this.zombies) if (!z.dead && Math.abs(z.x - f.x) < 26 && Math.abs(z.y - f.y) < 30) z.burnT = Math.max(z.burnT, 2.5);
      if (p && !p.dead && Math.abs(p.x - f.x) < 22 && Math.abs(p.y - f.y) < 30) p.hurt(14 * dt, Math.sign(p.x - f.x), null, true);
    }
    this.fires = this.fires.filter((f) => f.life > 0);
    let nearFire = 0;
    const lx = p ? p.x : this.cam.x;
    for (const f of this.fires) nearFire += Math.max(0, 1 - Math.abs(f.x - lx) / 900);
    if (nearFire > 0) Sfx.loop('amb_fire', Math.min(0.6, nearFire * 0.3));
    else Sfx.loop('amb_fire', 0);
    this.fx.update(dt);
    // siren lights alternate colour
    for (const L of this.lights) if (L.siren) L.color = Math.sin(this.time * 6 + L.seed) > 0 ? '#ff2a2a' : '#2a4aff';
    this.mode.update(dt);
    this.updateCamera(rawDt);
    this.dmgFlash = Math.max(0, this.dmgFlash - rawDt * 1.5);
    this.hud.update(rawDt);
    if (p) Sfx.setListener(p.x, p.y - 60); else Sfx.setListener(this.cam.x, this.cam.y);
  }
  throwGrenade() {
    const p = this.player;
    if (!p || p.grenades <= 0 || p.dead) return;
    p.grenades--;
    const sx = p.x + p.face * 10, sy = p.y - 90;
    const dx = p.mx - sx, dy = p.my - sy;
    const d = Math.hypot(dx, dy) || 1;
    const pow = clamp(d * 1.4, 300, 820);
    this.grenades.push(new Grenade(this, sx, sy, dx / d * pow + p.vx * 0.5, dy / d * pow - 140));
    Sfx.play('pin', { vol: 0.7 }); Sfx.play('swing', { vol: 0.5 });
  }
  updateCamera(dt) {
    const c = this.cam, p = this.player;
    const canvas = UI.canvas;
    const zoom = Settings.data.cameraZoom * (this.opts.zoom || 1) * (c.zoomK || 1);
    const visH = 800 / zoom;
    const scale = canvas.height / visH;
    let tx, ty;
    if (p && !p.dead) {
      const scoped = p.gun && p.gun.def.scope && Input.act('aim');
      c.zoomK = lerp(c.zoomK || 1, scoped ? 0.78 : 1, Math.min(1, dt * 5));
      const look = Input.act('aim') ? (scoped ? 0.9 : 0.55) : 0.28;
      tx = p.x + clamp(p.mx - p.x, -1100, 1100) * look;
      ty = p.y - 175 + clamp(p.my - (p.y - 80), -400, 400) * look * 0.8;
    } else if (p && p.dead) {
      const rd = this.corpses[this.corpses.length - 1];
      tx = rd && rd.pts.pelvis ? rd.pts.pelvis.x : c.x; ty = rd && rd.pts.pelvis ? rd.pts.pelvis.y - 80 : c.y;
    } else {
      // attract mode: slow pan
      tx = this.world.w / 2 + Math.sin(this.time * 0.05) * (this.world.w / 2 - 700);
      ty = (this.map.horizon || this.world.h - 300) - 200;
    }
    c.x = lerp(c.x, tx, Math.min(1, dt * 6));
    c.y = lerp(c.y, ty, Math.min(1, dt * 5));
    c.shake = Math.max(0, c.shake - dt * 40);
    c.kx *= Math.exp(-dt * 14); c.ky *= Math.exp(-dt * 14);
    const v = this.view;
    v.scale = scale; v.w = canvas.width / scale; v.h = canvas.height / scale;
    let vx = c.x - v.w / 2, vy = c.y - v.h / 2;
    vx = clamp(vx, 0, Math.max(0, this.world.w - v.w));
    vy = clamp(vy, -200, Math.max(-200, this.world.h - v.h));
    const sh = c.shake;
    v.x = vx + (sh ? rand(-sh, sh) * 0.5 : 0) + c.kx;
    v.y = vy + (sh ? rand(-sh, sh) * 0.5 : 0) + c.ky;
  }

  // ---------------------------------------------------------------- render
  render(ctx) {
    const v = this.view;
    Scene.background(this, ctx, v);
    ctx.save();
    ctx.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale);
    Scene.backwalls(this, ctx, v);
    Scene.decor(this, ctx, v, 0);
    this.world.decals.draw(ctx, v.x, v.y, v.x + v.w, v.y + v.h);
    Scene.stairs(this, ctx, v);
    Scene.ladders(this, ctx, v);
    for (const pr of this.props) if (pr.isDoor && pr.open) pr.draw(ctx, this.time);
    Scene.blocks(this, ctx, v);
    for (const pr of this.props) if (!(pr.isDoor && pr.open)) pr.draw(ctx, this.time);
    this.drawNotes(ctx);
    for (const pk of this.pickups) pk.draw(ctx);
    for (const c of this.corpses) c.draw(ctx);
    this.fx.drawGibs(ctx);
    this.fx.drawShells(ctx);
    for (const g of this.grenades) g.draw(ctx);
    for (const z of this.zombies) if (z.bbox[2] > v.x - 50 && z.bbox[0] < v.x + v.w + 50) z.draw(ctx);
    if (this.player) this.player.draw(ctx);
    this.fx.drawParticles(ctx);
    Scene.decor(this, ctx, v, 1);
    ctx.restore();
    Scene.fog(this, ctx, v);
    Lighting.render(this, ctx, v);
    ctx.save();
    ctx.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale);
    Lighting.glows(this, ctx, v);
    ctx.globalCompositeOperation = 'lighter';
    this.fx.drawAdditive(ctx);
    if (this.player && !this.player.dead) this.player.drawPostLight(ctx);
    ctx.globalCompositeOperation = 'source-over';
    this.fx.drawTexts(ctx);
    if (this.mode.drawWorld) this.mode.drawWorld(ctx);
    ctx.restore();
    Scene.weather(this, ctx, v, 1 / 60);
    Scene.post(this, ctx, this.dmgFlash);
    this.hud.draw(ctx);
  }
  drawNotes(ctx) {
    for (const n of this.notes) {
      ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(-0.08);
      ctx.fillStyle = '#d8d0b4'; ctx.fillRect(-9, -12, 18, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 5; i++) ctx.fillRect(-6, -8 + i * 3.6, 12, 0.8);
      ctx.fillStyle = '#7a1a14'; ctx.fillRect(-1.5, -14, 3, 3);
      ctx.restore();
      const p = this.player;
      if (p && dist(p.x, p.y - 50, n.x, n.y) < 160) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 4); ctx.drawImage(Lighting.radial('#ffe8b0'), n.x - 24, n.y - 24, 48, 48); ctx.restore(); }
    }
  }
  destroy() { Sfx.stopLoops(0.8); }
}

// ------------------------------------------------------------- grenades
class Grenade {
  constructor(game, x, y, vx, vy) { this.game = game; this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.t = 2.4; this.rot = 0; this.done = false; this.bounces = 0; }
  update(dt) {
    const w = this.game.world;
    this.t -= dt;
    if (this.t <= 0) { this.done = true; Combat.explode(this.game, this.x, this.y - 4, 210, 300, null); return; }
    this.vy += 1500 * dt; this.rot += this.vx * dt * 0.05;
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    let b = w.solidAt(nx, ny, this.vy > 0) || this.game.solidPropAt(nx, ny);
    if (b && b.oneway && this.y > b.y) b = null;
    if (b) {
      if (this.y <= b.y + 1) { this.vy *= -0.4; this.vx *= 0.6; this.y = b.y - 0.5; }
      else { this.vx *= -0.45; }
      if (this.bounces++ < 4 && Math.abs(this.vy) + Math.abs(this.vx) > 80) Sfx.play('bounce', { x: this.x, y: this.y, vol: 0.5 });
      for (const z of this.game.zombies) if (!z.dead && Math.abs(z.x - this.x) < 20 && Math.abs(z.y - z.h / 2 - this.y) < z.h / 2) { this.vx *= -0.3; }
    } else { this.x = nx; this.y = ny; }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.fillStyle = '#3a4a2a'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 5.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = '#777'; ctx.fillRect(-1.5, -8, 3, 3);
    ctx.restore();
    if (Math.sin(this.t * (this.t < 0.8 ? 40 : 14)) > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(Lighting.radial('#ff4020'), this.x - 8, this.y - 8, 16, 16); ctx.restore(); }
  }
}

class NullMode { constructor(game) { this.game = game; } update() {} }
