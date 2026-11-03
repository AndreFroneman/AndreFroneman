'use strict';
// =====================================================================
//  Player — survivor movement, aiming with IK arms, weapon handling
//  (fire modes, recoil, bloom, reload state machines, pump/bolt cycling,
//  shell ejection), melee swings, kick, interaction, health/armour.
// =====================================================================

const SURVIVORS = [
  {
    id: 'brandt', name: 'Ilya Brandt', role: 'Ex-army rifleman', perk: 'Reloads 20% faster. Rifles kick 15% less.',
    look: { skin: '#c49a7a', shirt: '#4b5038', shirtType: 'jacket', sleeve: 'long', pants: '#3a3a30', cargo: true, shoeType: 'boot', shoes: '#2a2018', hair: '#3a2a1a', hairStyle: 'buzz', stubble: true, backpack: true, gloves: '#2a2a22', kneepads: true, eyes: '#4a5a3a' },
    mods: { reload: 1.2, rifleKick: 0.85 }, start: 'p9',
  },
  {
    id: 'okoro', name: 'Dana Okoro', role: 'Precinct 9 patrol officer', perk: 'Pistols & revolvers deal 25% more damage and spread less.',
    look: { skin: '#6e4a34', shirt: '#2a3446', shirtType: 'uniform', sleeve: 'short', vest: 'police', pants: '#1a1e28', shoeType: 'boot', shoes: '#111', hair: '#141010', hairStyle: 'ponytail', eyes: '#2a1a10', watch: true },
    mods: { pistolDmg: 1.25, pistolSpread: 0.7 }, start: 'p9',
  },
  {
    id: 'reyes', name: 'Tomas Reyes', role: 'Varga Steelworks electrician', perk: 'Barricades & boards are 50% tougher and cheaper. Melee +20%.',
    look: { skin: '#b07a56', shirt: '#4a4a4e', shirtType: 'hoodie', sleeve: 'long', vest: 'hivis', pants: '#2a3448', shoeType: 'boot', shoes: '#4a3218', hair: '#1a1410', hairStyle: 'short', beard: true, hat: 'cap', hatColor: '#c8a020', gloves: '#6a5a3a' },
    mods: { barricade: 1.5, melee: 1.2 }, start: 'p9',
  },
  {
    id: 'hale', name: 'Wren Hale', role: 'St. Halloran trauma nurse', perk: 'Medkits heal 60% more. Slowly regenerates to 50 HP.',
    look: { skin: '#e0b89a', shirt: '#2e2a28', shirtType: 'jacket', sleeve: 'long', pants: '#3f5f6a', shoeType: 'sneaker', shoes: '#d8d8d0', hair: '#7a4a2a', hairStyle: 'ponytail', eyes: '#3a5a6a', blood: 0.34 },
    mods: { medkit: 1.6, regen: true }, start: 'p9',
  },
];

// keyframe tracks for melee (segment time 0-3) and the kick (seconds)
const MELEE_TRACKS = {
  slash: [ // one-handed blade: cock over the shoulder, diagonal cut, follow through
    [0, { arm: 0.5, blade: -0.75, torso: 0, step: 0, drop: 0, back: 1.9 }],
    [1, { arm: -2.15, blade: -2.75, torso: -0.24, step: -2, drop: 1, back: 1.2 }, 'in'],
    [1.45, { arm: -0.25, blade: -0.05, torso: 0.2, step: 9, drop: 3, back: 2.2 }],
    [2, { arm: 1.0, blade: 1.6, torso: 0.34, step: 11, drop: 4, back: 2.5 }, 'out'],
    [3, { arm: 0.5, blade: -0.75, torso: 0, step: 0, drop: 0, back: 1.9 }],
  ],
  bat: [ // two-handed: load behind the shoulder, drive through level, wrap
    [0, { arm: 0.35, blade: -1.05, torso: 0, step: 0, drop: 0 }],
    [1, { arm: -1.85, blade: -2.85, torso: -0.28, step: -3, drop: 2 }, 'in'],
    [1.45, { arm: -0.15, blade: 0.05, torso: 0.18, step: 8, drop: 3 }],
    [2, { arm: 0.85, blade: 1.85, torso: 0.3, step: 10, drop: 4 }, 'out'],
    [3, { arm: 0.35, blade: -1.05, torso: 0, step: 0, drop: 0 }],
  ],
  chop: [ // axe: overhead, bend into the chop
    [0, { arm: 0.4, blade: -1.2, torso: 0, step: 0, drop: 0 }],
    [1, { arm: -2.35, blade: -3.05, torso: -0.32, step: -3, drop: 0 }, 'in'],
    [1.5, { arm: -0.7, blade: -0.55, torso: 0.25, step: 9, drop: 4 }],
    [2, { arm: 0.95, blade: 1.35, torso: 0.55, step: 13, drop: 8 }, 'out'],
    [3, { arm: 0.4, blade: -1.2, torso: 0, step: 0, drop: 0 }],
  ],
  smash: [ // sledge: heave it right back, drop the whole body on it
    [0, { arm: 0.45, blade: -1.1, torso: 0, step: 0, drop: 1 }],
    [1, { arm: -2.5, blade: -3.15, torso: -0.36, step: -4, drop: 0 }, 'in'],
    [1.5, { arm: -0.75, blade: -0.6, torso: 0.3, step: 9, drop: 5 }],
    [2, { arm: 1.0, blade: 1.45, torso: 0.65, step: 14, drop: 10 }, 'out'],
    [3, { arm: 0.45, blade: -1.1, torso: 0, step: 0, drop: 1 }],
  ],
};
// th = thigh raise from vertical, knee = shin fold relative to thigh
const KICK_TRACK = [
  [0, { th: 0.1, knee: 0.15, torso: 0.05 }],
  [0.1, { th: 1.6, knee: 1.9, torso: -0.16 }, 'out'],
  [0.19, { th: 1.3, knee: 0.06, torso: -0.34 }],
  [0.27, { th: 1.32, knee: 0.1, torso: -0.32 }],
  [0.38, { th: 1.5, knee: 1.6, torso: -0.14 }],
  [0.5, { th: 0.1, knee: 0.15, torso: 0.05 }],
];

class Player {
  constructor(game, x, y, surv) {
    this.game = game;
    this.surv = surv || SURVIVORS[0];
    this.mods = this.surv.mods;
    this.body = new Body(this.surv.look, 1, 1, 1);
    const d = this.body.d;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hw = 11; this.standH = d.th + d.sh + d.footH + d.torso + d.neck + d.headR * 2; this.h = this.standH;
    this.face = 1;
    this.hp = 100; this.maxHp = 100; this.armor = 0;
    this.stamina = 100;
    this.dead = false;
    this.god = false;
    this.infAmmo = false;
    this.weapons = [];
    this.cur = 0; this.prev = 0;
    this.reserve = {};
    for (const k in AMMO) this.reserve[k] = 0;
    this.medkits = 1; this.grenades = 0; this.planks = 2;
    this.kick = 0; this.gunBack = 0; this.aimAng = 0; this.localAim = 0;
    this.phase = 0;
    this.crouch = 0;
    this.flashlight = true;
    this.hurtT = 0; this.invulnT = 0;
    this.swing = null; this.kickT = 0; this.kickHits = null;
    this.interactTarget = null;
    this.visibility = 1;
    this.stepAcc = 0;
    this.healT = 0;
    this.vaulting = null;
    this.onLadder = null;
    this.caps = [];
    this.bbox = [0, 0, 0, 0];
    this.mx = x + 100; this.my = y - 60;
    this.stats = { shots: 0, hits: 0 };
  }
  get gun() { return this.weapons[this.cur]; }
  give(id, ammoMags = null) {
    const def = WEAPONS[id];
    if (!def) return null;
    let g = this.weapons.find((w) => w.def.id === id);
    if (!g) { g = new GunState(def); this.weapons.push(g); this.weapons.sort((a, b) => a.def.slot - b.def.slot || a.def.price - b.def.price); }
    if (def.cat !== 'melee') this.addAmmo(def.ammo, (ammoMags === null ? def.startReserve : ammoMags) * def.mag);
    return g;
  }
  addAmmo(type, n) { this.reserve[type] = Math.min((this.reserve[type] || 0) + n, AMMO[type] ? AMMO[type].max * 2 : 999); }
  select(i) {
    if (i < 0 || i >= this.weapons.length || i === this.cur) return;
    const g = this.gun; if (g) { g.reloading = false; g.cycle = 0; }
    this.prev = this.cur; this.cur = i; this.swing = null;
    this.switchT = 0.35;
    Sfx.play('click', { vol: 0.5 });
    this.game.hud.showSlots();
  }
  selectId(id) { const i = this.weapons.findIndex((w) => w.def.id === id); if (i >= 0) this.select(i); }

  // --------------------------------------------------------------- update
  update(dt, input) {
    if (this.dead) return;
    const g = this.game, def = this.gun ? this.gun.def : null;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.switchT = Math.max(0, (this.switchT || 0) - dt);
    this.body.tint = Math.max(0, this.body.tint - dt * 5);
    if (this.mods.regen && this.hp < 50 && this.hurtT <= 0) this.hp = Math.min(50, this.hp + 1.5 * dt);
    if (this.healT > 0) { this.healT -= dt; this.hp = Math.min(this.maxHp, this.hp + this.healRate * dt); }
    // aim
    const [mx, my] = g.screenToWorld(Input.mx, Input.my);
    this.mx = mx; this.my = my;
    if (!this.vaulting && !this.onLadder) this.face = mx >= this.x ? 1 : -1;
    // ---------------- movement
    const ui = input;
    let mv = (ui.right ? 1 : 0) - (ui.left ? 1 : 0);
    if (this.vaulting) { this.updateVault(dt); return; }
    // pinned by a leaper: struggle free
    if (this.pinnedBy) {
      const z = this.pinnedBy;
      if (z.dead || z.state !== 'pin') { this.pinnedBy = null; }
      else {
        this.vx = 0; this.onLadder = null;
        if (ui.melee || ui.interact || ui.jumpPressed || ui.firePressed) { this.pinBreak = (this.pinBreak || 0) + 0.2; g.shake(2); Sfx.play('swing', { vol: 0.35, rate: 1.3 }); }
        if (this.pinBreak >= 1) { this.pinBreak = 0; z.releasePin(true); this.pinnedBy = null; }
        Phys.move(this, dt, g, false);
        this.animate(dt, 0, true, false, Object.assign({}, ui, { aim: false }));
        this.updateBBox();
        return;
      }
    }
    // ladders
    const lad = Phys.ladderAt(g, this.x, this.y, this.h);
    if (!this.onLadder && lad && (ui.up || (ui.down && this.y < lad.y + lad.h - 4)) && !ui.jumpPressed) {
      if (ui.up && this.y > lad.y + 2 || ui.down) { this.onLadder = lad; this.vx = 0; this.vy = 0; }
    }
    if (this.onLadder) {
      const L = this.onLadder;
      this.x = approach(this.x, L.x + L.w / 2, 300 * dt);
      this.vy = (ui.up ? -1 : 0) * 190 + (ui.down ? 1 : 0) * 220;
      this.vx = 0;
      this.phase += Math.abs(this.vy) * dt * 0.05;
      if (ui.jumpPressed || mv !== 0 && Math.abs(this.vy) < 1) { this.onLadder = null; this.vx = mv * 160; if (ui.jumpPressed) this.vy = -330; }
      else if (this.y <= L.y && ui.up) { this.y = L.y; this.onLadder = null; this.vy = 0; }
      else if (this.y >= L.y + L.h && ui.down) { this.onLadder = null; }
    }
    const crouching = ui.down && !this.onLadder && this.grounded;
    this.crouch = approach(this.crouch, crouching ? 1 : 0, dt * 7);
    this.h = this.standH - this.crouch * 26;
    // sprinting lowers the weapon; pulling the trigger brings it back up
    let sprint = ui.sprint && mv !== 0 && this.stamina > 2 && !crouching && mv === this.face && !(ui.fire && def && def.cat !== 'melee');
    let spd = 185;
    if (sprint) { spd = 300; this.stamina = Math.max(0, this.stamina - 20 * dt); }
    else this.stamina = Math.min(100, this.stamina + 16 * dt);
    if (mv !== 0 && mv !== this.face) spd *= 0.78; // backpedal
    if (crouching) spd = 80;
    if (ui.aim) spd *= 0.75;
    spd *= def ? def.weight : 1;
    if (this.hurtT > 0.25) spd *= 0.7;
    if (!this.onLadder) {
      const accel = this.grounded ? 2200 : 900;
      this.vx = approach(this.vx, mv * spd, accel * dt);
      if (ui.jumpPressed && this.grounded) {
        if (ui.down && this.ground && this.ground.oneway) { this.drop = 0.25; }
        else { this.vy = -590; this.grounded = false; Sfx.play('step', { vol: 0.4 }); }
      }
      if (ui.down && ui.jumpPressed === false && this.grounded && this.ground && this.ground.oneway && ui.downPressed) this.drop = 0.25;
    }
    this.drop = Math.max(0, (this.drop || 0) - dt);
    this.useStairs = ui.up || !!(this.ground && this.ground.stair && Math.abs(this.vx) > 0);
    this.onLadderFlag = !!this.onLadder;
    const e = this; e.onLadder = this.onLadder;
    Phys.move(this, dt, g, true);
    if (this.fellOut) { this.hurt(999, 1, null, true); return; }
    if (this.justLanded) { if (this.landV > 1000) { this.hurt((this.landV - 1000) * 0.12, 0, null, true); } if (this.landV > 300) Sfx.play('land', { vol: 0.45 }); }
    // footsteps are triggered by the gait's heel strikes (see animate)
    // visibility (how easily the infected spot you)
    const light = g.lightAt(this.x, this.y - 60);
    this.visibility = clamp(0.45 + light * 0.8 + (this.flashlight ? 0.35 : 0), 0.4, 1.6) * (crouching ? 0.7 : 1);
    // ---------------- actions
    if (ui.flashlight) { this.flashlight = !this.flashlight; Sfx.play('click', { vol: 0.5 }); }
    if (ui.medkit) this.useMedkit();
    // weapon switching
    if (ui.slot) this.selectSlot(ui.slot);
    if (ui.wheel) { const n = this.weapons.length; this.select(((this.cur + ui.wheel) % n + n) % n); }
    if (ui.lastWeapon) this.select(this.prev);
    // interaction
    this.findInteract();
    if (ui.interact && this.interactTarget) this.interact(this.interactTarget);
    // kick
    this.kickT = Math.max(0, this.kickT - dt);
    if (ui.melee && this.kickT <= 0 && this.stamina > 8 && !this.onLadder) { this.kickT = 0.5; this.kickHits = new Set(); this.stamina -= 8; Sfx.play('swing', { vol: 0.5, rate: 0.8 }); }
    if (this.kickT > 0.25 && this.kickT < 0.42) this.doKick();
    // weapon logic
    this.updateWeapon(dt, ui);
    this.animate(dt, mv, crouching, sprint, ui);
    this.updateBBox();
  }
  selectSlot(slot) {
    const inSlot = this.weapons.map((w, i) => [w, i]).filter(([w]) => w.def.slot === slot);
    if (!inSlot.length) return;
    const curIn = inSlot.findIndex(([, i]) => i === this.cur);
    const nxt = inSlot[(curIn + 1) % inSlot.length][1];
    this.select(nxt);
  }
  useMedkit() {
    if (this.medkits <= 0 || this.hp >= this.maxHp || this.healT > 0) return;
    this.medkits--; this.healT = 1.2; this.healRate = 50 * (this.mods.medkit || 1) / 1.2;
    Sfx.play('heal', { vol: 0.8 });
  }

  // -------------------------------------------------------------- weapons
  updateWeapon(dt, ui) {
    const g = this.gun; if (!g) return;
    const def = g.def, game = this.game;
    g.cool -= dt;
    this.kick = Math.max(0, this.kick * Math.exp(-def.recover * dt) - 0.02 * dt);
    this.gunBack = Math.max(0, this.gunBack - dt * 60);
    g.bloom = Math.max(0, g.bloom - def.bloomRec * dt);
    if (this.switchT > 0 || this.onLadder) return;
    if (def.cat === 'melee') { this.updateSwing(dt, ui, def); return; }
    // pump / bolt cycling
    if (g.cycle > 0) {
      const before = g.cycle;
      g.cycle -= dt;
      const mid = def.cycleTime * 0.55;
      if (before > mid && g.cycle <= mid) { this.ejectShell(def); Sfx.play(def.mode === 'bolt' ? 'bolt' : 'pump', { vol: 0.7 }); }
    }
    // reload
    if (ui.reload) this.startReload();
    if (g.reloading) this.updateReload(dt, ui);
    // fire
    // weapon lowered for a sprint: buffer the shot until it is back up
    this.fireBuf = Math.max(0, (this.fireBuf || 0) - dt);
    const lowered = (this.carry || 0) >= 0.35;
    if (ui.firePressed && lowered) this.fireBuf = 0.3;
    let want = def.mode === 'auto' ? ui.fire : ui.firePressed || this.fireBuf > 0;
    if (def.mode === 'burst') {
      if ((ui.firePressed || this.fireBuf > 0) && !lowered && !(g.burstLeft > 0) && g.cool <= 0 && !g.reloading) g.burstLeft = def.burst || 3;
      want = g.burstLeft > 0;
    }
    if (lowered) want = false;
    if (want && g.cool <= 0 && g.cycle <= 0) {
      if (g.reloading && def.reloadType === 'shell' && g.mag > 0) { g.reloading = false; if (def.mode === 'pump' && g.chamberEmpty) { g.cycle = def.cycleTime * 0.6; g.chamberEmpty = false; } return; }
      if (g.reloading) return;
      this.fireBuf = 0;
      if (g.mag > 0 || this.infAmmo && def.mag === 0) this.shoot(g);
      else {
        Sfx.play('dry', { vol: 0.6 }); g.cool = 0.25; g.burstLeft = 0;
        if (Settings.data.autoReload) this.startReload();
      }
    }
  }
  shoot(g) {
    const def = g.def, game = this.game;
    g.cool = 60 / def.rpm;
    if (!this.infAmmo) g.mag--;
    if (def.mode === 'pump' || def.mode === 'bolt') { g.cycle = def.cycleTime; }
    if (def.mode === 'burst') { g.burstLeft--; if (g.burstLeft <= 0) g.cool = 0.26; }
    const m = this.muzzleWorld();
    const pistol = def.cat === 'pistol';
    let spread = this.lastUi && this.lastUi.aim ? def.aimSpread : def.spread;
    if (pistol && this.mods.pistolSpread) spread *= this.mods.pistolSpread;
    spread *= 1 + Math.min(1.2, Math.abs(this.vx) / 160) * 0.7;
    if (!this.grounded) spread *= 1.8;
    spread *= 1 - this.crouch * 0.3;
    spread += g.bloom;
    let base = Math.atan2(this.my - m[1], this.mx - m[0]);
    if (dist(this.mx, this.my, m[0], m[1]) < 40) base = this.aimAng;
    const dmgMul = (pistol ? (this.mods.pistolDmg || 1) : 1);
    for (let i = 0; i < def.pellets; i++) {
      const ang = base + gauss() * spread;
      Combat.fire(game, this, m[0], m[1], ang, def, { dmgMul });
    }
    this.stats.shots++;
    // recoil
    let kick = def.kick * (1 - this.crouch * 0.25) * (this.lastUi && this.lastUi.aim ? 0.85 : 1);
    if ((def.cat === 'rifle' || def.cat === 'battle' || def.cat === 'mg') && this.mods.rifleKick) kick *= this.mods.rifleKick;
    this.kick = Math.min(0.75, this.kick + kick * rand(0.8, 1.15));
    this.gunBack = def.back;
    g.bloom = Math.min(def.bloomMax, g.bloom + def.bloom);
    game.shake(def.shake);
    game.camKick(-Math.cos(base) * def.shake * 1.6, -Math.sin(base) * def.shake * 1.6);
    // flash, light, smoke, sound
    const fa = base - this.kick * this.face;
    game.fx.muzzle(m[0], m[1], fa, def.flash);
    game.fx.light(m[0], m[1], 260 * def.flash + 80, '#ffc070', 1.6, 0.06);
    game.fx.smoke(m[0] + Math.cos(fa) * 6, m[1] + Math.sin(fa) * 6, 2, '#5a5a5a', 8 + def.flash * 6, 30);
    Sfx.play('gun_' + def.id, { vol: 1, rateVar: 0.04, force: true, verb: 1 });
    game.noise(this.x, this.y, def.noise);
    if (def.mode !== 'pump' && def.mode !== 'bolt' && def.shell && def.reloadType !== 'cyl' && def.reloadType !== 'break') this.ejectShell(def);
    if (g.mag === 0 && def.mode === 'pump') g.chamberEmpty = true;
  }
  ejectShell(def) {
    if (!def.shell) return;
    const gs = GunArt.get(def);
    const [ex, ey] = this.gunPointWorld(gs.eject[0], gs.eject[1]);
    this.game.fx.shell(ex, ey, this.face, def.shell, this.vx * 0.5);
  }
  startReload() {
    const g = this.gun; if (!g || g.def.cat === 'melee') return;
    const def = g.def;
    if (g.reloading || g.mag >= def.mag || g.cycle > 0) return;
    if (!this.infAmmo && (this.reserve[def.ammo] || 0) <= 0) return;
    g.reloading = true; g.rt = 0; g.reloadPhase = 0; g.shellT = 0;
    if (def.reloadType === 'shell') { g.shellT = -0.25; }
    else { Sfx.play(def.reloadType === 'cyl' ? 'cyl_open' : def.reloadType === 'break' ? 'break_open' : 'click', { vol: 0.6 }); }
  }
  updateReload(dt, ui) {
    const g = this.gun, def = g.def;
    const spd = this.mods.reload || 1;
    if (def.reloadType === 'shell') {
      g.shellT += dt * spd;
      if (g.shellT >= def.shellTime) {
        g.shellT = 0;
        if (g.mag < def.mag && (this.infAmmo || this.reserve[def.ammo] > 0)) {
          g.mag++; if (!this.infAmmo) this.reserve[def.ammo]--;
          Sfx.play('shell_in', { vol: 0.7 });
        }
        if (g.mag >= def.mag || (!this.infAmmo && this.reserve[def.ammo] <= 0)) {
          g.reloading = false;
          if (def.mode === 'pump' && g.chamberEmpty) { g.cycle = def.cycleTime * 0.6; g.chamberEmpty = false; Sfx.play('pump', { vol: 0.7 }); }
        }
      }
      return;
    }
    const before = g.rt;
    g.rt += dt * spd / def.reload;
    const cross = (t) => before < t && g.rt >= t;
    if (cross(0.18)) {
      if (def.reloadType === 'mag') {
        Sfx.play('mag_out', { vol: 0.7 });
        const gs = GunArt.get(def);
        if (gs.mag) { const [mx, my] = this.gunPointWorld(gs.mag.ox + gs.mag.w / 2, gs.mag.oy + gs.mag.h / 2); this.game.fx.gib('mag', mx, my, this.vx * 0.3 + rand(-30, 30), 40, { spr: { cv: gs.mag.cv, w: gs.mag.w, h: gs.mag.h }, bleed: 0, life: 30, sound: 'mag_drop', r: 3 }); }
      } else {
        // revolvers & break actions dump their empties
        const n = def.mag - g.mag;
        for (let i = 0; i < Math.min(n, 8); i++) { const [sx, sy] = this.gunPointWorld(4, -3); this.game.fx.shell(sx, sy, -this.face * 0.3, def.shell, 0); }
      }
    }
    if (cross(0.68)) Sfx.play(def.reloadType === 'mag' ? 'mag_in' : 'shell_in', { vol: 0.75 });
    if (cross(0.86)) Sfx.play(def.reloadType === 'cyl' ? 'cyl_close' : def.reloadType === 'break' ? 'door_close' : def.hold === 'pistol' ? 'slide' : 'bolt', { vol: 0.7, rate: def.reloadType === 'break' ? 2 : 1 });
    if (g.rt >= 1) {
      g.reloading = false;
      const need = def.mag - g.mag;
      const take = this.infAmmo ? need : Math.min(need, this.reserve[def.ammo]);
      g.mag += take; if (!this.infAmmo) this.reserve[def.ammo] -= take;
    }
  }
  updateSwing(dt, ui, def) {
    if (!this.swing && ui.fire && this.stamina >= def.stamina * 0.5) {
      this.swing = { t: 0, hits: new Set(), dir: this.face, prev: null, height: clamp((this.my - (this.y - 70)) / 80, -1, 1) };
      this.stamina = Math.max(0, this.stamina - def.stamina);
      Sfx.play(def.heavy ? 'swing_heavy' : 'swing', { vol: 0.7 });
    }
    const s = this.swing; if (!s) return;
    s.t += dt;
    const tot = def.windup + def.swing + def.recoverT;
    if (s.t >= def.windup && s.t <= def.windup + def.swing + 0.02) {
      const seg = this.bladeSeg(def);
      if (seg) {
        const mods = { dmgMul: this.mods.melee || 1 };
        Combat.melee(this.game, this, seg[0], seg[1], seg[2], seg[3], def, this.face, s.hits, mods);
        if (s.prev) Combat.melee(this.game, this, s.prev[2], s.prev[3], seg[2], seg[3], def, this.face, s.hits, mods);
        s.prev = seg;
      }
    }
    if (s.t >= tot) this.swing = null;
  }
  bladeSeg(def) {
    const j = this.body.j;
    const hx = this.x + j.handF.x * this.face, hy = this.y + j.handF.y;
    const a = this.meleeAngWorld;
    const L = def.reach;
    return [hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, hx + Math.cos(a) * L, hy + Math.sin(a) * L];
  }
  doKick() {
    const reach = 58, x0 = this.x, x1 = this.x + this.face * reach, y = this.y - 40;
    for (const z of this.game.zombies) {
      if (z.dead || this.kickHits.has(z)) continue;
      if ((z.x - this.x) * this.face < -5 || Math.abs(z.x - this.x) > reach + z.hw || Math.abs(z.y - this.y) > 50) continue;
      this.kickHits.add(z);
      z.takeHit(z.crawl ? 'head' : 'torso', 12, this.face, -0.2, 520, z.x, z.y - Math.min(50, z.h * 0.5), { def: { cat: 'melee', dismember: 0 }, shooter: this, kind: 'kick' });
      if (!z.dead && !z.crawl && z.state !== 'down' && z.def.mass < 1.5) { z.setState('down', rand(0.8, 1.3)); z.vx = this.face * 260; z.vy = -100; }
      Sfx.play('melee_blunt', { x: z.x, y: y, vol: 0.7 }); this.game.shake(4); this.game.hitstop(0.04);
    }
    for (const p of this.game.props) {
      if (p.dead || this.kickHits.has(p) || !p.solid) continue;
      if (!rectsOverlap(Math.min(x0, x1), y - 20, reach, 40, p.x, p.y, p.w, p.h)) continue;
      this.kickHits.add(p);
      if (p.impulse) p.impulse(this.face * 900, -150);
      if (p.isDoor && !p.open) p.damage(30, p.cx, p.cy, 'melee');
      if (p.isWindow) p.damage(30, p.cx, p.cy, 'melee', this.face);
      Sfx.play(p.mat === 'metal' ? 'metal_bash' : 'bash', { x: p.cx, y: p.cy, vol: 0.6 });
    }
  }

  // ------------------------------------------------------------ interact
  findInteract() {
    const g = this.game;
    let best = null, bd = 80;
    const px = this.x, py = this.y - 50;
    for (const p of g.props) {
      if (p.dead) continue;
      let d, act = null;
      if (p.isDoor) { d = Math.abs(p.cx - px) - p.w / 2; if (Math.abs(p.cy - py) > 80) continue; act = p.boards > 0 ? null : p.open ? 'Close door' : 'Open door'; if (!p.open && this.planks > 0 && p.boards < 3 && (this.planksFree || this.planks > 0)) act = act + '  ·  hold E: board up'; }
      else if (p.isWindow) { d = Math.abs(p.cx - px) - p.w / 2; if (py < p.y - 60 || py > p.y + p.h + 80) continue; act = p.solid ? (p.boards < 3 && this.planks > 0 ? 'Board up window' : null) : 'Vault through window'; if (!p.solid && p.boards < 3 && this.planks > 0) act += '  ·  hold E: board up'; }
      else if (p.isBarricade) { d = Math.abs(p.cx - px) - p.w / 2; if (Math.abs(p.cy - py) > 90) continue; act = p.hp < p.maxHp && this.planks > 0 ? `Repair barricade (${Math.round(Math.max(0, p.hp) / p.maxHp * 100)}%)` : null; }
      else continue;
      if (act && d < bd) { bd = d; best = { obj: p, label: act }; }
    }
    for (const n of g.notes) {
      const d = dist(n.x, n.y, px, py);
      if (d < 70 && d < bd + 30) { best = { obj: n, label: 'Read: ' + n.title, note: true }; bd = d; }
    }
    // objective items / hold points from the game mode take priority
    if (g.mode.interactables) for (const it of g.mode.interactables(px, py)) { best = it; bd = -1; }
    this.interactTarget = best;
    // hold-to-board
    if (best && Input.act('interact')) {
      this.holdE = (this.holdE || 0) + 1 / 60;
      if (this.holdE > 0.45 && (best.obj.isDoor || best.obj.isWindow)) { this.holdE = -0.6; this.board(best.obj); }
    } else this.holdE = 0;
  }
  interact(t) {
    const o = t.obj;
    if (t.mode) { if (!t.hold) this.game.mode.interact(o); return; }
    if (t.note) { this.game.showNote(o); return; }
    if (o.isDoor) { if (!o.boards) o.toggle(this.x); return; }
    if (o.isWindow) { if (!o.solid) this.startVault(o); else this.board(o); return; }
    if (o.isBarricade) { if (this.planks > 0 && o.repair(150 * (this.mods.barricade || 1))) { this.usePlank(); Sfx.play('hammer', { x: o.cx, y: o.cy }); } }
  }
  board(o) {
    if (this.planks <= 0) { this.game.hud.toast('No planks — buy them in the shop'); return; }
    if (o.addBoard()) {
      if (this.mods.barricade) o.boardHp *= this.mods.barricade;
      this.usePlank(); Sfx.play('hammer', { x: o.cx, y: o.cy }); this.game.noise(o.cx, o.cy, 500);
    }
  }
  usePlank() { if (!this.planksFree) this.planks--; }
  startVault(win) {
    const dir = win.cx > this.x ? 1 : -1;
    // find landing x on far side
    const tx = win.cx + dir * (win.w / 2 + this.hw + 6);
    this.vaulting = { x0: this.x, y0: this.y, x1: tx, top: win.y + win.h, t: 0, dir };
    this.face = dir;
    Sfx.play('step', { vol: 0.5 });
  }
  updateVault(dt) {
    const v = this.vaulting, d = this.body.d;
    v.t += dt / 0.55;
    const t = Math.min(1, v.t);
    this.x = lerp(v.x0, v.x1, smooth(t));
    this.y = t < 0.5 ? lerp(v.y0, v.top, smooth(t * 2)) : v.top;
    this.vx = 0; this.vy = 0;
    Pose.blend(this.body.pose, Pose.vault(d, t), Math.min(1, dt * 14));
    this.body.fk(false);
    this.updateBBox();
    if (t >= 1) { this.vaulting = null; this.grounded = false; }
  }

  // --------------------------------------------------------------- damage
  hurt(dmg, dir, src, explosive = false, knock = 0) {
    if (this.dead || dmg <= 0) return;
    if (this.god) { this.body.tint = 0.5; return; }
    if (this.invulnT > 0 && !explosive) return;
    let d = dmg;
    if (this.armor > 0) { const absorb = Math.min(this.armor, d * 0.6); this.armor -= absorb; d -= absorb; }
    this.hp -= d;
    this.hurtT = 0.5; this.invulnT = explosive ? 0 : 0.12;
    this.body.tint = 1;
    this.game.damageFlash(Math.min(1, d / 30));
    this.game.shake(4 + d * 0.2);
    Sfx.play('hurt', { vol: 0.8 });
    if (Settings.goreMul() > 0) this.game.fx.blood(this.x, this.y - 70, dir || rand(-1, 1), -0.3, 6, 0.7);
    if (knock) { this.vx += dir * knock; this.vy -= knock * 0.4; this.grounded = false; }
    else if (dir) this.vx += dir * 60;
    if (this.hp <= 0) this.die(dir);
  }
  die(dir) {
    this.dead = true; this.hp = 0;
    Sfx.play('player_death', { vol: 1 });
    const rd = new Ragdoll(this.game, this.body, this.x, this.y, this.face, this.vx + (dir || 0) * 160, this.vy - 120, null, {});
    this.game.addCorpse(rd);
    this.game.onPlayerDeath();
  }

  // ------------------------------------------------------------ geometry
  // gun-local point (relative to trigger hand) -> world
  gunPointWorld(gx, gy) {
    const h = this.handLocal || [0, 0], a = this.gunAngLocal || 0;
    const lx = h[0] + Math.cos(a) * gx - Math.sin(a) * gy, ly = h[1] + Math.sin(a) * gx + Math.cos(a) * gy;
    return [this.x + lx * this.face, this.y + ly];
  }
  muzzleWorld() { const gs = GunArt.get(this.gun.def); return this.gunPointWorld(gs.muzzle[0], gs.muzzle[1]); }
  getCaps() { return this.body.capsules(this.x, this.y, this.face, this.caps); }
  updateBBox() { this.bbox[0] = this.x - 20; this.bbox[1] = this.y - this.h - 6; this.bbox[2] = this.x + 20; this.bbox[3] = this.y; }

  // ------------------------------------------------------------- animate
  animate(dt, mv, crouching, sprint, ui) {
    const b = this.body, d = b.d, g = this.gun, def = g ? g.def : null;
    this.lastUi = ui;
    const s = d.s, melee = def && def.cat === 'melee';
    // low-ready carry while sprinting (guns only); raised again to fire
    this.carry = approach(this.carry || 0, sprint && !melee && !(g && g.reloading) ? 1 : 0, dt * (sprint ? 5 : 9));
    let target;
    if (this.onLadder) target = Pose.ladder(d, this.onLadder, this.y, this.vy > 0 ? 1 : -1);
    else {
      const speed = Math.abs(this.vx);
      const moving = speed > 12 && this.grounded;
      const back = mv !== 0 && mv !== this.face;
      const spec = this.crouch > 0.3 ? { stride: 54 * s, duty: 0.66, lift: 5 * s, bob: 1 * s, lean: 0.12 }
        : sprint ? { stride: 150 * s, duty: 0.36, lift: 22 * s, bob: 3.2 * s, lean: 0.3, arm: 0.95 }
        : back ? { stride: 66 * s, duty: 0.62, lift: 5 * s, bob: 1.6 * s, lean: -0.03 }
        : { stride: 92 * s, duty: 0.56, lift: 8 * s, bob: 2.2 * s, lean: 0.07 };
      this.gaitAmp = approach(this.gaitAmp || 0, moving ? 1 : 0, dt * 7);
      spec.amp = this.gaitAmp;
      spec.crouch = 17 * s * this.crouch;
      const prevStep = Math.floor((((this.phase / TAU) % 1 + 1) % 1) * 2);
      if (moving) this.phase += dt * TAU * speed / Math.max(spec.stride * spec.amp, spec.stride * 0.35) * (back ? -1 : 1);
      target = Pose.gait(d, this.phase, spec);
      if (this.crouch > 0.05) target.torso += 0.18 * this.crouch;
      if (!moving) target.py += Math.sin(this.game.time * 1.4) * 0.6 * s; // breathing
      // heel strike: footstep sound and (sprinting) noise
      const step = Math.floor((((this.phase / TAU) % 1 + 1) % 1) * 2);
      if (moving && step !== prevStep) {
        const metal = this.ground && (this.ground.mat === 'metal' || this.ground.mat === 'grate');
        Sfx.play(metal ? 'step_metal' : 'step', { vol: crouching ? 0.15 : sprint ? 0.5 : 0.3, rateVar: 0.15 });
        if (sprint) this.game.noise(this.x, this.y, 320, true);
      }
      if (!this.grounded) {
        // airborne: tuck while rising, reach for the ground while falling
        const fall = clamp(this.vy / 600, -1, 1);
        target.thF = Math.PI / 2 - 0.9 + fall * 0.5; target.shF = target.thF + 1.2 - fall * 0.7;
        target.thB = Math.PI / 2 + 0.15 + fall * 0.2; target.shB = target.thB + 1.0 - fall * 0.5;
        target.air = 0;
      }
      if (this.kickT > 0) {
        // front kick: chamber the knee, snap the leg out, retract, plant
        const K = Pose.keys(KICK_TRACK, 0.5 - this.kickT);
        target.thF = Math.PI / 2 - K.th; target.shF = target.thF + K.knee; target.torso = -Math.PI / 2 + K.torso;
        target.thB = Math.PI / 2 + 0.1; target.shB = Math.PI / 2 + 0.3; target.air = 0;
      }
    }
    this.gaitTarget = target;
    Pose.blend(b.pose, target, Math.min(1, dt * (this.onLadder ? 22 : 20)));
    // torso/head toward aim
    const sh0 = b.j.shoulder;
    const sx = this.x + sh0.x * this.face, sy = this.y + sh0.y;
    this.aimAng = Math.atan2(this.my - sy, this.mx - sx);
    let la = Math.atan2(this.my - sy, (this.mx - sx) * this.face);
    la = clamp(la, -1.35, 1.35);
    this.localAim = la;
    if (!this.onLadder) {
      const lk = lerp(la, 0.1, this.carry); // sprinting: look where you run
      b.pose.torso = target.torso + lk * 0.12 - (this.gunBack > 0 ? this.gunBack * 0.006 : 0);
      b.pose.head = -Math.PI / 2 + lk * 0.55 + (target.torso + Math.PI / 2) * 0.3;
    }
    b.fk(!this.onLadder && !this.vaulting);
    // ---- weapon & arms
    const S = b.j.shoulder;
    let gunA = la - this.kick;
    let hand;
    if (this.onLadder || this.switchT > 0.2) {
      gunA = 1.1; hand = [S.x + 4, S.y + d.ua * 0.9];
      b.pose.uaF = b.pose.uaF; // keep climb pose arms
      if (this.onLadder) { this.handLocal = [b.j.handF.x, b.j.handF.y]; this.gunAngLocal = 1.3; b.fk(false); return; }
    }
    if (def && def.cat === 'melee') { this.animateMelee(dt, def, la); return; }
    const gs = def ? GunArt.get(def) : null;
    const pistol = def && def.hold === 'pistol';
    if (this.carry > 0) gunA = lerp(gunA, pistol ? 1.25 : 0.92, smooth(this.carry)); // low ready
    // reload choreography
    let magState = 'in'; // 'in' | 'out' | 'hand'
    let backTarget = null;
    if (g && g.reloading) {
      if (def.reloadType === 'shell') {
        gunA = lerp(gunA, 0.35, 0.8);
        const t = clamp(g.shellT / def.shellTime, 0, 1);
        backTarget = t < 0.5 ? [S.x - 2, S.y + d.torso * 0.75] : null; // to belt and back
      } else {
        const r = g.rt;
        gunA = lerp(gunA, pistol ? 0.5 : 0.3, Math.min(1, Math.sin(Math.min(1, r) * Math.PI) * 1.6));
        if (r > 0.18 && r < 0.68) magState = r < 0.4 ? 'out' : 'hand';
        if (r > 0.25 && r < 0.55) backTarget = [S.x + 4, S.y + d.torso * 0.8];
        else if (r > 0.82 && r < 0.95) backTarget = 'charge';
      }
    }
    const dir = [Math.cos(gunA), Math.sin(gunA)];
    if (pistol) {
      const ext = (d.ua + d.fa) * 0.84 - this.gunBack * 0.6;
      hand = [S.x + dir[0] * ext, S.y + dir[1] * ext + 2];
    } else {
      const st = gs && gs.stock ? -gs.stock[0] : 24;
      const back = this.gunBack;
      hand = [S.x + dir[0] * (st - 4 - back) - dir[1] * 2, S.y + dir[1] * (st - 4 - back) + dir[0] * 3];
    }
    if (this.switchT > 0.2) { gunA = 1.1; hand = [S.x + 6, S.y + d.ua * 0.95]; }
    this.handLocal = hand; this.gunAngLocal = gunA;
    // front arm IK to trigger hand
    const ikF = ik2(S.x, S.y, hand[0], hand[1], d.ua, d.fa * 0.92, -1);
    b.pose.uaF = ikF[0]; b.pose.faF = ikF[1];
    // support hand
    let sup;
    const rot = (p) => [hand[0] + Math.cos(gunA) * p[0] - Math.sin(gunA) * p[1], hand[1] + Math.sin(gunA) * p[0] + Math.cos(gunA) * p[1]];
    if (pistol) sup = rot([1.5, 3.5]);
    else if (gs && gs.fore) {
      let f = gs.fore.slice();
      if (def.mode === 'pump' && g.cycle > 0) { const k = Math.sin(clamp(1 - g.cycle / def.cycleTime, 0, 1) * Math.PI); f[0] -= gs.pumpTravel * k; }
      sup = rot(f);
    } else sup = rot([12, 2]);
    if (def && def.mode === 'bolt' && g.cycle > 0 && gs) { const k = Math.sin(clamp(1 - g.cycle / def.cycleTime, 0, 1) * Math.PI); sup = rot([gs.eject[0] - 8 * k, gs.eject[1] + 2]); }
    if (backTarget === 'charge') sup = rot([gs && gs.eject ? gs.eject[0] : 6, -5]);
    else if (backTarget) sup = backTarget;
    if (magState === 'hand' && gs && gs.mag) sup = rot([gs.mag.ox + gs.mag.w * 0.5, gs.mag.oy + gs.mag.h * 0.9]);
    const ikB = ik2(S.x, S.y, sup[0], sup[1], d.ua, d.fa * 0.92, -1);
    b.pose.uaB = ikB[0]; b.pose.faB = ikB[1];
    if (pistol && this.carry > 0.5 && this.gaitTarget) { b.pose.uaB = this.gaitTarget.uaB; b.pose.faB = this.gaitTarget.faB; } // free arm pumps
    b.fk(false);
    this.magState = magState;
  }
  // Melee: keyframed swings per weapon style. Tracks run on segment time
  // (0-1 windup, 1-2 swing, 2-3 recover) so they follow each weapon's
  // timings. arm = front-arm direction from the shoulder, blade = weapon
  // angle, torso = lean, step/drop = lunge stance (px), back = free arm.
  animateMelee(dt, def, la) {
    const b = this.body, d = b.d, sc = d.s;
    const style = def.style || (def.heavy ? (def.blade ? 'chop' : 'smash') : def.blade ? 'slash' : 'bat');
    const T = MELEE_TRACKS[style], two = style !== 'slash';
    const sw = this.swing;
    let k;
    if (sw) {
      const t = sw.t, w = def.windup, s2 = def.swing;
      const st = t < w ? t / w : t < w + s2 ? 1 + (t - w) / s2 : 2 + Math.min(1, (t - w - s2) / def.recoverT);
      k = Pose.keys(T, st);
      const aimK = st > 1 && st < 2.6 ? la * 0.3 : 0; // strike height follows the aim
      k = Object.assign({}, k, { arm: k.arm + aimK, blade: k.blade + aimK });
    } else {
      k = Object.assign({}, T[0][1], { arm: T[0][1].arm + la * 0.3, blade: T[0][1].blade + la * 0.3 });
    }
    // body drives the swing: lean into it, and lunge from a planted stance
    b.pose.torso += k.torso;
    if (this.grounded && (this.gaitAmp || 0) < 0.3 && !this.onLadder) Pose.stance(d, b.pose, (3.5 + k.step) * sc, (5 + Math.max(0, k.step) * 0.3) * sc, (1 + k.drop) * sc);
    b.fk(true);
    const S = b.j.shoulder;
    const reach = (d.ua + d.fa) * (two ? 0.72 : 0.82);
    const hand = [S.x + Math.cos(k.arm) * reach, S.y + Math.sin(k.arm) * reach];
    const ik = ik2(S.x, S.y, hand[0], hand[1], d.ua, d.fa * 0.92, -1);
    b.pose.uaF = ik[0]; b.pose.faF = ik[1];
    if (two) {
      // second hand further up the haft
      const g = [hand[0] + Math.cos(k.blade) * 10 * sc, hand[1] + Math.sin(k.blade) * 10 * sc];
      const ikB = ik2(S.x, S.y, g[0], g[1], d.ua, d.fa * 0.92, -1);
      b.pose.uaB = ikB[0]; b.pose.faB = ikB[1];
    } else { b.pose.uaB = k.back; b.pose.faB = k.back - 0.6; }
    b.fk(false);
    const bladeA = k.blade;
    this.handLocal = [b.j.handF.x, b.j.handF.y]; this.gunAngLocal = bladeA;
    this.meleeAngWorld = this.face > 0 ? bladeA : Math.PI - bladeA;
  }

  draw(ctx) {
    if (this.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y - 1, 17, 3, 0, 0, TAU); ctx.fill();
    const g = this.gun;
    this.body.draw(ctx, this.x, this.y, this.face, {
      // climbing: weapon slung across the back (pistols holstered at the hip)
      back: (c) => {
        if (!g || !this.onLadder) return;
        const gs = GunArt.get(g.def), j = this.body.j, R = GunArt.RES;
        const pistol = g.def.hold === 'pistol';
        const mx = lerp(j.pelvis.x, j.neck.x, pistol ? 0.05 : 0.55), my = lerp(j.pelvis.y, j.neck.y, pistol ? 0.05 : 0.55);
        c.save(); c.translate(mx - this.body.d.torsoT * (pistol ? 0.1 : 0.42), my); c.rotate(pistol ? 1.45 : -Math.PI / 2 - 0.62);
        const w = gs.full.width / R, h = gs.full.height / R, sc = pistol ? 0.9 : 1;
        c.drawImage(gs.full, gs.body.ox * sc - w * sc * 0.42, gs.body.oy * sc, w * sc, h * sc);
        c.restore();
      },
      weapon: (c) => {
        if (!g || this.onLadder || !this.handLocal) return;
        const gs = GunArt.get(g.def);
        const h = this.handLocal, a = this.gunAngLocal;
        c.save(); c.translate(h[0], h[1]); c.rotate(a);
        const bd = gs.body;
        c.drawImage(bd.cv, bd.ox, bd.oy, bd.w, bd.h);
        if (gs.pump) {
          let off = 0;
          if (g.def.mode === 'pump' && g.cycle > 0) off = -gs.pumpTravel * Math.sin(clamp(1 - g.cycle / g.def.cycleTime, 0, 1) * Math.PI);
          const p = gs.pump; c.drawImage(p.cv, gs.pumpPos[0] + off + p.ox, gs.pumpPos[1] + p.oy, p.w, p.h);
        }
        if (gs.mag && this.magState === 'in') c.drawImage(gs.mag.cv, gs.mag.ox, gs.mag.oy, gs.mag.w, gs.mag.h);
        c.restore();
        if (gs.mag && this.magState === 'hand') {
          const hb = this.body.j.handB;
          c.save(); c.translate(hb.x, hb.y); c.rotate(a + 0.2); c.drawImage(gs.mag.cv, -gs.mag.w / 2, -gs.mag.h * 0.8, gs.mag.w, gs.mag.h); c.restore();
        }
      },
    });
  }
}
