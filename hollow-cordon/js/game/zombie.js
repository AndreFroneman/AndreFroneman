'use strict';
// =====================================================================
//  Zombies — infected types, looks, perception, navigation, obstacle
//  handling (bash / vault / climb), attacks, location-based damage,
//  live dismemberment and death into ragdolls.
// =====================================================================

const ZTYPES = {
  walker: {
    name: 'Walker', desc: 'Slow, relentless, dangerous in numbers.',
    scale: [0.94, 1.06], build: [0.95, 1.12], hp: 100, headHp: 40, armHp: 50, legHp: 60, speed: [30, 50], dmg: 14, wind: 0.45, rec: 0.7,
    reach: 50, sight: 520, hear: 1, stagger: 110, knock: 380, bash: 24, score: 10, cash: 12, gait: 'shamble', mass: 1, outfit: null, groan: 'z_groan',
  },
  runner: {
    name: 'Runner', desc: 'Freshly turned. Sprints, lunges, screams.',
    scale: [0.92, 1.0], build: [0.85, 0.98], hp: 70, headHp: 30, armHp: 40, legHp: 45, speed: [170, 215], dmg: 9, wind: 0.22, rec: 0.38,
    reach: 46, sight: 700, hear: 1.3, stagger: 90, knock: 300, bash: 16, score: 15, cash: 18, gait: 'sprint', mass: 0.9, lunge: true, alert: 'z_scream', groan: 'z_growl',
  },
  crawler: {
    name: 'Crawler', desc: 'Legless torso dragging itself through the dark. Low and hard to hit.',
    scale: [0.94, 1.02], build: [0.9, 1.05], hp: 55, headHp: 28, armHp: 40, legHp: 40, speed: [48, 70], dmg: 10, wind: 0.35, rec: 0.6,
    reach: 40, sight: 450, hear: 1.1, stagger: 999, knock: 9999, bash: 12, score: 12, cash: 14, gait: 'crawl', mass: 0.6, legless: true, decay: 0.8, groan: 'z_groan',
  },
};

const ZLOOK = {
  skins: ['#8a957a', '#7f8b73', '#959683', '#8a8e84', '#7c8470', '#9c927e', '#8f9a88', '#868a78'],
  hair: ['#1a1410', '#3a2a1a', '#5a4a3a', '#7a7a70', '#2a2a2a', '#8a6a40', '#4a3a30'],
  styles: ['short', 'balding', 'long', 'buzz', 'wild', 'bald', 'ponytail', 'short'],
};
const OUTFITS = {
  civ: () => pick([
    () => ({ shirtType: 'tee', sleeve: 'short', shirt: pick(['#5a6a7a', '#7a3a2a', '#3a4a3a', '#8a8070', '#4a3a5a', '#2a2a2e', '#6a5a2a']), pants: pick(['#2a3448', '#3a3a3a', '#4a4030']), shoeType: 'sneaker', shoes: pick(['#d0ccc0', '#2a2a2a']) }),
    () => ({ shirtType: 'shirt', sleeve: pick(['long', 'rolled']), shirt: pick(['#8a8a80', '#5a6a8a', '#7a6a5a', '#a09080']), pants: '#2a2a30', shoeType: 'shoe', shoes: '#1a1410' }),
    () => ({ shirtType: 'hoodie', sleeve: 'long', shirt: pick(['#3a3a40', '#5a2a2a', '#2a3a4a', '#4a4a3a']), pants: '#2a3448', shoeType: 'sneaker', shoes: '#2a2a2a' }),
    () => ({ shirtType: 'jacket', sleeve: 'long', shirt: pick(['#4a3a2a', '#2a2a2a', '#3a4a3a']), pants: '#3a3a32', shoeType: 'boot', shoes: '#2a2018', cargo: true }),
    () => ({ shirtType: 'tank', sleeve: 'none', shirt: '#c8c4b0', pants: '#3a4a5a', pantsType: 'shorts', shoeType: 'sneaker', shoes: '#e0e0e0' }),
  ])(),
  patient: () => { const c = pick(['#9ab0c0', '#a8b8a8', '#b0b8c8']); return { shirtType: 'gown', shirt: c, sleeve: 'short', pantsType: 'bare', pants: c, shoeType: 'bare' }; },
  doctor: () => ({ shirtType: 'coat', coat: true, shirt: '#d4d4cc', sleeve: 'long', pants: '#3a3a40', shoeType: 'shoe', shoes: '#1a1a1a' }),
  nurse: () => { const c = pick(['#4f7f80', '#4a6a9a', '#5f7f55']); return { shirtType: 'scrubs', shirt: c, sleeve: 'short', pants: c, shoeType: 'sneaker', shoes: '#d8d8d0', hat: chance(0.4) ? 'surgical' : null }; },
  cop: () => ({ shirtType: 'uniform', shirt: '#2a3446', sleeve: pick(['short', 'long']), vest: 'police', pants: '#1a1e28', shoeType: 'boot', shoes: '#111', hat: chance(0.3) ? 'cap' : null, hatColor: '#1a2030' }),
  worker: () => ({ shirtType: pick(['hoodie', 'tee', 'jacket']), shirt: pick(['#4a4a4a', '#5a4a3a', '#3a3a4a']), sleeve: 'long', vest: chance(0.7) ? 'hivis' : null, pants: '#2a3448', shoeType: 'boot', shoes: '#3a2a18', hat: chance(0.4) ? 'cap' : null, hatColor: '#c8a020' }),
  farmer: () => ({ shirtType: 'shirt', sleeve: 'rolled', shirt: pick(['#7a2a2a', '#3a4a6a', '#6a5a3a']), pants: '#3a4a5a', shoeType: 'boot', shoes: '#3a2a18', hat: chance(0.4) ? 'cap' : null, hatColor: '#5a4a2a' }),
  soldier: () => ({ shirtType: 'uniform', shirt: '#4b4f38', camo: ['#3a3c2a', '#5d5a3c', '#2f3022'], sleeve: 'long', vest: 'military', pants: '#4b4f38', shoeType: 'boot', shoes: '#2a2218', helmet: chance(0.7) ? 'mil' : null, kneepads: true, gloves: '#2a2a20' }),
};
const THEME_OUTFITS = {
  hospital: [['patient', 0.38], ['doctor', 0.14], ['nurse', 0.2], ['civ', 0.28]],
  streets: [['civ', 0.85], ['cop', 0.08], ['worker', 0.07]],
  police: [['cop', 0.45], ['civ', 0.55]],
  factory: [['worker', 0.6], ['civ', 0.4]],
  farm: [['farmer', 0.6], ['civ', 0.4]],
  tunnels: [['civ', 0.7], ['worker', 0.3]],
  checkpoint: [['soldier', 0.4], ['civ', 0.6]],
};
function weighted(list) { let r = Math.random(); for (const [k, w] of list) { r -= w; if (r <= 0) return k; } return list[0][0]; }

function makeZombieLook(type, theme) {
  const def = ZTYPES[type];
  const L = {
    zombie: true, skin: pick(ZLOOK.skins), decay: def.decay || rand(0.15, 1), blood: rand(0.3, 1),
    hair: pick(ZLOOK.hair), hairStyle: pick(ZLOOK.styles), eyeGlow: pick(['#cdbf8a', '#d8d0b0', '#b8c0a0', '#d0c890']), jawOpen: +rand(1.4, 3.4).toFixed(1),
  };
  const outfitKey = def.outfit || weighted(THEME_OUTFITS[theme] || THEME_OUTFITS.streets);
  Object.assign(L, OUTFITS[outfitKey]());
  if (def.lookMod) def.lookMod(L);
  // quantise to keep the sprite cache small
  L.decay = Math.round(L.decay * 4) / 4; L.blood = Math.round(L.blood * 3) / 3;
  return L;
}

const LIMB_OF = { uaF: 'armF', faF: 'armF', uaB: 'armB', faB: 'armB', thF: 'legF', shF: 'legF', thB: 'legB', shB: 'legB' };
const BONE_MUL = { head: 3, torso: 1, uaF: 0.8, uaB: 0.8, faF: 0.6, faB: 0.6, thF: 0.8, thB: 0.8, shF: 0.65, shB: 0.65 };

class Zombie {
  constructor(game, type, x, y, o = {}) {
    this.game = game;
    this.type = type;
    const def = this.def = ZTYPES[type];
    const D = game.diff;
    this.s = rand(def.scale[0], def.scale[1]);
    this.look = o.look || makeZombieLook(type, game.theme);
    this.body = new Body(this.look, this.s, rand(def.build[0], def.build[1]), def.limbScale || 1);
    const d = this.body.d;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.face = o.face || (chance(0.5) ? 1 : -1);
    this.hw = 11 * this.s * (def.wide || 1);
    this.standH = d.th + d.sh + d.footH + d.torso + d.neck + d.headR * 2;
    this.h = this.standH;
    this.hp = this.maxHp = def.hp * D.hpMul;
    this.headHp = this.headMax = def.headHp * D.hpMul;
    this.limb = { armF: def.armHp, armB: def.armHp, legF: def.legHp, legB: def.legHp };
    this.limbMax = { armF: def.armHp, armB: def.armHp, legF: def.legHp, legB: def.legHp };
    this.speed = rand(def.speed[0], def.speed[1]) * D.speedMul;
    this.state = 'idle';
    this.stateT = 0;
    this.phase = rand(0, TAU);
    this.aware = o.hunt ? 1 : 0;
    this.hunt = !!o.hunt;
    this.tx = x; this.ty = y;
    this.thinkT = rand(0, 0.2);
    this.groanT = rand(1, 7);
    this.attackT = 0; this.atkPhase = 0;
    this.cool = 0;
    this.crawl = !!def.legless;
    this.buffT = 0;
    this.burnT = 0;
    this.caps = []; this.capsFrame = -1;
    this.bbox = [0, 0, 0, 0];
    this.wanderX = x; this.wanderT = rand(1, 4);
    this.stuckT = 0;
    this.id = uid();
    if (def.legless) {
      if (chance(0.5)) { this.body.missing.thF = true; this.body.missing.thB = true; }
      else { this.body.missing.shF = true; this.body.missing.shB = chance(0.5); if (!this.body.missing.shB) this.body.missing.thB = true; }
      this.limb.legF = this.limb.legB = 0;
    }
    if (def.init) def.init(this);
    this.updateHeight();
    this.body.pose = this.crawl ? Pose.crawl(d, this.phase) : Pose.walk(d, this.phase);
    this.body.fk(!this.crawl);
    this.updateBBox();
  }

  updateHeight() { this.h = this.crawl || this.state === 'down' ? 40 * this.s : this.state === 'vault' ? 70 * this.s : this.standH; }
  armFactor() {
    let k = 1;
    for (const a of ['armF', 'armB']) { const st = this.body.limbState(a); if (st === 'gone') k -= 0.4; else if (st === 'partial') k -= 0.28; else if (this.limb[a] < this.limbMax[a] * 0.5) k -= 0.12; }
    return Math.max(0.35, k);
  }
  biteOnly() { return this.body.limbState('armF') !== 'ok' && this.body.limbState('armB') !== 'ok'; }
  legCrippled(which) { return this.limb[which] < this.limbMax[which] * 0.5; }

  getCaps() {
    if (this.capsFrame !== this.game.frame) { this.body.capsules(this.x, this.y, this.face, this.caps); this.capsFrame = this.game.frame; }
    return this.caps;
  }
  updateBBox() {
    const j = this.body.j;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of JOINTS) { const X = this.x + j[n].x * this.face, Y = this.y + j[n].y; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    const m = this.body.d.headR + 4;
    this.bbox[0] = x0 - m; this.bbox[1] = y0 - m; this.bbox[2] = x1 + m; this.bbox[3] = y1 + m;
  }
  setState(s, t = 0) { this.state = s; this.stateT = t; this.updateHeight(); }

  // --------------------------------------------------------------- think
  perceive() {
    const g = this.game, p = g.player, def = this.def;
    const ex = this.x + this.face * 6, ey = this.y - this.h * 0.85;
    let sees = false;
    if (p && !p.dead) {
      const px = p.x, py = p.y - p.h * 0.6;
      const d = dist(ex, ey, px, py);
      let sight = def.sight * g.diff.sight * p.visibility;
      if ((px - this.x) * this.face < 0 && this.aware < 0.5) sight *= 0.45;
      if (d < 70 || (d < sight && g.world.lineOfSight(ex, ey, px, py) && !g.blockedByDoor(ex, ey, px, py))) sees = true;
      if (sees) {
        if (this.aware < 0.5 && !this.alerted) { this.alerted = true; Sfx.play(def.alert || 'z_growl', { x: this.x, y: this.y, vol: 0.8 }); }
        this.aware = 1; this.tx = px; this.ty = p.y; this.lastSeen = 0;
        if (this.state === 'idle' || this.state === 'wander') this.setState('chase');
      } else if (this.hunt) { this.tx = p.x; this.ty = p.y; this.aware = 1; if (this.state === 'idle' || this.state === 'wander') this.setState('chase'); }
    }
    if (!sees) for (const n of g.noises) {
      if (n.id <= (this.heard || 0)) continue;
      if (dist(this.x, this.y, n.x, n.y) < n.r * def.hear) {
        this.heard = n.id; this.tx = n.x; this.ty = n.y; this.aware = Math.max(this.aware, 0.75);
        if (this.state === 'idle' || this.state === 'wander') this.setState('chase');
      }
    }
    this.sees = sees;
  }
  navGoal(tx, ty) {
    // returns x to walk toward; may start ladder climbs
    if (this.navLink) {
      const { L, up, t0 } = this.navLink;
      const endY = up ? L.top : L.bottom, endX = up ? L.tx : L.bx;
      if ((Math.abs(this.y - endY) < 18 && Math.abs(this.x - endX) < 40) || this.game.time - t0 > 12) this.navLink = null;
      else return endX;
    }
    const dy = ty - this.y;
    if (Math.abs(dy) < 80 || this.crawl && Math.abs(dy) < 120) return tx;
    const up = dy < 0;
    let best = null, bestScore = Infinity;
    for (const L of this.game.world.links) {
      const fromY = up ? L.bottom : L.top, toY = up ? L.top : L.bottom;
      const fromX = up ? L.bx : L.tx, toX = up ? L.tx : L.bx;
      if (Math.abs(fromY - this.y) > 70) continue;
      if (up ? toY > this.y - 60 : toY < this.y + 60) continue;
      if (L.kind === 'ladder' && this.crawl) continue;
      const sc = Math.abs(fromX - this.x) + Math.abs(toX - tx) * 0.6;
      if (sc < bestScore) { bestScore = sc; best = L; }
    }
    if (!best) return tx;
    const fromX = up ? best.bx : best.tx;
    if (best.kind === 'ladder' && Math.abs(this.x - fromX) < 10 && this.state !== 'climb') {
      this.ladder = best; this.climbDir = up ? -1 : 1; this.x = fromX; this.setState('climb');
    }
    if (best.kind === 'stairs' && Math.abs(this.x - fromX) < 30) { this.navLink = { L: best, up, t0: this.game.time }; return up ? best.tx : best.bx; }
    return fromX;
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (this.dead) return;
    const g = this.game, def = this.def, d = this.body.d;
    this.body.tint = Math.max(0, this.body.tint - dt * 6);
    this.cool -= dt; this.stateT -= dt; this.buffT -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(0.15, 0.3); this.perceive(); }
    if (this.burnT > 0) {
      this.burnT -= dt; this.hp -= 14 * dt;
      if (Math.random() < 0.6) g.fx.fire(this.x + rand(-10, 10), this.y - rand(10, this.h), 1, 12);
      if (this.hp <= 0) { this.die({ cause: 'fire', dx: 0, dy: -1, force: 60, burn: 4 }); return; }
    }
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groanT = rand(3, 9); if (!this.body.headGone) Sfx.play(this.aware > 0.5 ? (def.groan || 'z_groan') : 'z_groan', { x: this.x, y: this.y, vol: 0.55, rate: 1.05 / this.s, rateVar: 0.1 }); }
    const p = g.player;
    let move = 0;
    const spdMul = (this.buffT > 0 ? 1.45 : 1) * (g.aiFrozen ? 0 : 1);
    if (g.aiFrozen) { this.vx = 0; }
    switch (this.state) {
      case 'down': {
        this.vx *= 0.9;
        if (this.stateT <= 0) { if (this.crawl) this.setState('chase'); else this.setState('getup', 0.8); }
        break;
      }
      case 'getup': if (this.stateT <= 0) this.setState('chase'); this.vx = 0; break;
      case 'stagger': this.vx *= 0.85; if (this.stateT <= 0) this.setState('chase'); break;
      case 'vault': this.updateVault(dt); return;
      case 'climb': this.updateClimb(dt); return;
      case 'attack': case 'bash': this.updateAttack(dt); break;
      default: {
        if (this.aware > 0.3) {
          const gx = this.navGoal(this.tx, this.ty);
          if (this.state === 'climb') return;
          const dx = gx - this.x;
          if (Math.abs(dx) > 6) { move = Math.sign(dx); this.face = move; }
          else if (!this.sees && !this.hunt && Math.abs(this.ty - this.y) < 80) { this.aware *= 0.5; if (this.aware < 0.3) this.setState('wander'); }
          if (p && !p.dead && this.sees) this.face = Math.sign(p.x - this.x) || this.face;
          // attack the player
          if (p && !p.dead && this.cool <= 0 && !g.aiFrozen) {
            const reach = def.reach * this.s * (this.biteOnly() ? 0.75 : 1);
            const ddx = p.x - this.x;
            if (Math.abs(ddx) < reach + p.hw && p.y > this.y - this.h - 20 && p.y - p.h < this.y + 10 && Math.sign(ddx) === this.face) {
              this.setState('attack'); this.atkT = 0; this.atkTarget = p; this.atkHit = false;
              Sfx.play('z_attack', { x: this.x, y: this.y, vol: 0.6, rate: 1 / this.s });
              move = 0;
            } else if (def.lunge && !this.crawl && this.grounded && Math.abs(ddx) < 170 && Math.abs(ddx) > 70 && Math.abs(p.y - this.y) < 30 && chance(0.03)) {
              this.vx = this.face * 420; this.vy = -260; this.grounded = false; this.lunging = 0.4;
            }
          }
        } else {
          // wander / idle
          this.wanderT -= dt;
          if (this.wanderT <= 0) { this.wanderT = rand(2, 6); this.wanderX = chance(0.4) ? this.x : clamp(this.x + rand(-300, 300), 40, g.world.w - 40); }
          const dx = this.wanderX - this.x;
          if (Math.abs(dx) > 10) { move = Math.sign(dx) * 0.45; this.face = Math.sign(dx); }
        }
      }
    }
    // locomotion
    let spd = this.speed * spdMul;
    if (this.crawl) spd = Math.min(spd, this.def.gait === 'crawl' ? spd : 60);
    else {
      if (this.legCrippled('legF') || this.legCrippled('legB')) spd *= 0.6;
    }
    if (this.lunging > 0) this.lunging -= dt;
    else if (this.grounded || this.crawl) {
      const target = move * spd;
      this.vx = approach(this.vx, target, (this.def.gait === 'sprint' ? 900 : 500) * dt);
    }
    // stairs & dropping through one-way floors toward the target
    this.useStairs = this.aware > 0.3 && this.ty < this.y - 60;
    this.dropT = (this.dropT || 0) - dt;
    if (this.aware > 0.3 && this.ty > this.y + 80 && this.grounded && this.ground && this.ground.oneway) this.dropT = 0.3;
    this.drop = this.dropT > 0;
    Phys.move(this, dt, g, false);
    if (this.fellOut) { this.dead = true; this.removed = true; return; }
    if (this.justLanded && this.landV > 500) Sfx.play('land', { x: this.x, y: this.y, vol: 0.4 });
    // obstacles
    if (this.blocker && move !== 0 && this.aware > 0.3 && this.state === 'chase') this.handleBlocked(this.blocker, move);
    else this.stuckT = Math.max(0, this.stuckT - dt);
    // walking into another movable prop pushes it
    // separation from other zombies (soft)
    if (this.state === 'chase' && (this.game.frame + (this.id.charCodeAt(0) | 0)) % 3 === 0) {
      for (const o of g.zombies) {
        if (o === this || o.dead) continue;
        const ddx = this.x - o.x;
        if (Math.abs(ddx) < 10 && Math.abs(this.y - o.y) < 20) { this.x += (ddx >= 0 ? 1 : -1) * 0.6; }
      }
    }
    this.animate(dt, move, spd);
  }

  windowAhead(dir) {
    for (const p of this.game.props) {
      if (!p.isWindow || p.dead) continue;
      const near = dir > 0 ? p.x - (this.x + this.hw) : (this.x - this.hw) - (p.x + p.w);
      if (near < -p.w || near > 46) continue;
      const bottom = p.y + p.h;
      if (bottom < this.y - 75 || bottom > this.y + 12) continue;
      return p;
    }
    return null;
  }
  handleBlocked(b, dir) {
    const g = this.game;
    const win = this.windowAhead(dir);
    if (win) {
      if (win.solid) { this.setState('bash'); this.atkT = 0; this.atkTarget = win; this.atkHit = false; }
      else {
        const destX = win.cx + dir * (win.w / 2 + 16 + this.hw + 4);
        this.vault = { x0: this.x, y0: this.y, x1: destX, y1: win.y + win.h, t: 0, dur: (this.def.gait === 'sprint' ? 0.55 : 1.0) * (this.crawl ? 1.3 : 1) };
        this.setState('vault');
      }
      return;
    }
    // destructible barriers: smash through
    if (b.isProp && (b.isDoor || b.isWindow || b.isBarricade || (b.def && b.hp < 1e8 && b.mat === 'wood' && b.h > 60 * this.s))) {
      this.setState('bash'); this.atkT = 0; this.atkTarget = b; this.atkHit = false; return;
    }
    const top = b.y;
    const rise = this.y - top;
    const s = this.s;
    const maxRise = this.crawl ? 34 : 135 * s;
    if (rise > 0 && rise <= maxRise) {
      // a door or barricade standing on top of the obstacle?
      const sx0 = dir > 0 ? b.x - 4 : b.x + b.w - 40, sx1 = dir > 0 ? b.x + 40 : b.x + b.w + 4;
      for (const p of g.props) {
        if (!p.isDoor && !p.isBarricade) continue;
        if (p.x + p.w < sx0 || p.x > sx1 || p.y + p.h < top - 6 || p.y > top + 100) continue;
        if (p.solid) { this.setState('bash'); this.atkT = 0; this.atkTarget = p; this.atkHit = false; return; }
      }
      const narrow = b.w <= 72 && rise <= 64 * s;
      let destX, destY;
      if (narrow) { destX = dir > 0 ? b.x + b.w + this.hw + 3 : b.x - this.hw - 3; destY = top; }
      else { destX = this.x + dir * (this.hw + 16); destY = top; }
      const headroom = Phys.free(g, destX, destY - 0.5, this.hw, narrow ? 50 : (this.crawl ? 40 * s : this.standH * 0.92));
      if (headroom) {
        if (b.isProp && b.def && b.def.movable && chance(0.3)) b.push(dir * 60);
        const k = 0.55 + rise / 95;
        this.vault = { x0: this.x, y0: this.y, x1: destX, y1: destY, t: 0, dur: (this.def.gait === 'sprint' ? 0.45 : 0.85) * k * (this.crawl ? 1.3 : 1) };
        this.setState('vault');
        this.stuckT = 0;
        return;
      }
    }
    this.stuckT += 1 / 60;
    if (b.isProp && b.def && b.def.movable && this.stuckT < 1.2) { b.push(dir * 40); return; }
    // furniture in the way that can't be climbed: tear it apart
    if (b.isProp && b.hp !== undefined && b.hp < 1e8 && this.stuckT > 0.8) { this.setState('bash'); this.atkT = 0; this.atkTarget = b; this.atkHit = false; return; }
    // too tall — jumpers try to jump
    if (this.def.gait === 'sprint' && this.grounded && rise < 100) { this.vy = -620; this.grounded = false; }
  }
  updateVault(dt) {
    const v = this.vault, d = this.body.d;
    v.t += dt / v.dur;
    const t = Math.min(1, v.t);
    if (t < 0.55) { const k = smooth(t / 0.55); this.y = lerp(v.y0, v.y1 - 2, k); this.x = lerp(v.x0, lerp(v.x0, v.x1, 0.35), k); }
    else { const k = smooth((t - 0.55) / 0.45); this.x = lerp(lerp(v.x0, v.x1, 0.35), v.x1, k); this.y = v.y1 - 2; }
    const pose = this.crawl ? Pose.crawl(d, this.phase) : Pose.vault(d, t);
    Pose.blend(this.body.pose, pose, Math.min(1, dt * 12));
    this.body.fk(false);
    // align feet so that the body sits on the obstacle
    this.updateBBox();
    if (t >= 1) { this.vy = 0; this.grounded = false; this.setState('chase'); }
  }
  updateClimb(dt) {
    const L = this.ladder, d = this.body.d;
    this.vx = 0; this.vy = this.climbDir * 70 * Math.min(1.6, this.speed / 50 + 0.6);
    this.y += this.vy * dt;
    this.phase += dt * 6;
    this.body.pose = Pose.climb(d, this.phase);
    this.body.fk(false);
    this.updateBBox();
    const endY = this.climbDir < 0 ? L.top : L.bottom;
    if ((this.climbDir < 0 && this.y <= endY) || (this.climbDir > 0 && this.y >= endY)) {
      this.y = endY; this.vy = 0; this.ladder = null;
      this.x += (this.tx > this.x ? 1 : -1) * 4;
      this.setState('chase');
      this.cool = 0.5;
    }
  }
  updateAttack(dt) {
    const def = this.def, g = this.game;
    this.vx *= 0.8;
    this.atkT += dt;
    const wind = def.wind * (this.buffT > 0 ? 0.7 : 1), strikeEnd = wind + 0.12, total = wind + 0.12 + def.rec;
    const T = this.atkTarget;
    if (!this.atkHit && this.atkT >= wind) {
      this.atkHit = true;
      if (this.state === 'attack' && T && !T.dead) {
        const reach = def.reach * this.s * (this.biteOnly() ? 0.75 : 1) + 12;
        if (Math.abs(T.x - this.x) < reach + T.hw && T.y > this.y - this.h - 25 && T.y - T.h < this.y + 15) {
          const dmg = def.dmg * this.armFactor() * (this.biteOnly() ? 0.6 : 1) * g.diff.dmgMul * (this.buffT > 0 ? 1.3 : 1);
          T.hurt(dmg, this.face, this, false, def.knockback);
          Sfx.play(this.biteOnly() ? 'flesh' : 'melee_blunt', { x: T.x, y: T.y - 60, vol: 0.6 });
        }
      } else if (this.state === 'bash' && T && T.solid) {
        const dmg = def.bash * this.armFactor() * g.diff.dmgMul;
        T.damage(dmg, T.cx, T.cy, 'zombie', this.face);
        Sfx.play(T.mat === 'metal' ? 'metal_bash' : 'bash', { x: T.cx, y: T.cy, vol: 0.55 });
        g.fx.debris(T.cx - this.face * T.w / 2, this.y - this.h * 0.6, -this.face, -0.3, T.mat === 'metal' ? 'metal' : 'wood', 3);
        g.noise(T.cx, T.cy, 450);
      }
    }
    if (this.atkT >= total) {
      this.cool = rand(0.05, 0.25);
      if (this.state === 'bash' && T && T.solid && Math.abs((T.cx || T.x) - this.x) < 90) { this.atkT = 0; this.atkHit = false; }
      else this.setState('chase');
    }
  }

  // ------------------------------------------------------------- animate
  animate(dt, move, spd) {
    const d = this.body.d, def = this.def;
    const speedNow = Math.abs(this.vx);
    let target;
    if (this.state === 'down') { target = Pose.lying(d); Pose.blend(this.body.pose, target, Math.min(1, dt * 10)); this.body.fk(false); this.updateBBox(); return; }
    if (this.crawl) {
      this.phase += dt * (speedNow / (8 * this.s) + 0.5);
      target = Pose.crawl(d, this.phase, 0.4 + Math.min(1, speedNow / 40));
      if (this.state === 'attack' || this.state === 'bash') { const k = this.atkT < def.wind ? this.atkT / def.wind : 1 - (this.atkT - def.wind) / def.rec; target.uaF = 0.2 - k * 0.9; target.faF = 0.4 - k * 0.6; target.head = -0.9; }
      Pose.blend(this.body.pose, target, Math.min(1, dt * 14));
      this.body.fk(false);
      this.updateBBox();
      return;
    }
    const gait = def.gait;
    const stride = gait === 'sprint' ? 34 : gait === 'stomp' ? 30 : 20;
    this.phase += dt * (speedNow / (stride * this.s)) * (gait === 'sprint' ? 3.3 : 2.6) + (speedNow < 5 ? 0 : 0);
    const limpF = this.legCrippled('legF'), limpB = this.legCrippled('legB');
    if (gait === 'sprint') {
      target = Pose.walk(d, this.phase, { amp: 0.85, knee: 1.25, lean: 0.38, bob: 4, limpF, limpB });
      const s = Math.sin(this.phase);
      target.uaF = Math.PI / 2 - 0.9 * s; target.faF = target.uaF - 1.3; target.uaB = Math.PI / 2 + 0.9 * s; target.faB = target.uaB - 1.3;
      if (speedNow < 20) target = Pose.walk(d, this.phase, { amp: 0.1, lean: 0.25 });
    } else {
      const amp = speedNow < 4 ? 0.05 : 0.42;
      target = Pose.walk(d, this.phase, { amp, knee: 0.6, lean: 0.2, bob: 1.8, limpF, limpB, headTilt: Math.sin(this.phase * 0.5) * 0.15 });
      const s = Math.sin(this.phase * 1.0 + 0.6);
      // reaching arms
      target.uaF = 0.15 + 0.12 * s; target.faF = 0.05 + 0.15 * s;
      target.uaB = 0.4 - 0.1 * s; target.faB = 0.25 - 0.1 * s;
      if (limpF) { target.thF += 0.2; target.shF += 0.25; }
    }
    if (this.state === 'attack' || this.state === 'bash') {
      const w = def.wind, t = this.atkT;
      const k = t < w ? smooth(t / w) : t < w + 0.12 ? 1 - (t - w) / 0.12 : 0;
      const strike = t >= w && t < w + 0.25;
      target.torso = -Math.PI / 2 + (strike ? 0.45 : 0.05 - k * 0.15);
      if (this.biteOnly()) { target.head = strike ? -0.3 : -Math.PI / 2 - 0.2; target.torso = -Math.PI / 2 + (strike ? 0.6 : -0.1); }
      else if (this.state === 'bash') {
        const alt = Math.sin(t * 12);
        target.uaF = -0.9 + (strike ? 1.4 : -k * 0.6) + alt * 0.1; target.faF = target.uaF - 0.3;
        target.uaB = -0.6 + (strike ? 1.2 : -k * 0.5); target.faB = target.uaB - 0.2;
      } else {
        target.uaF = strike ? 0.35 : -1.3 * k + 0.2; target.faF = strike ? 0.25 : -1.7 * k + 0.1;
        target.uaB = strike ? 0.5 : -1.0 * k + 0.4; target.faB = strike ? 0.4 : -1.3 * k + 0.3;
      }
    }
    if (this.state === 'stagger') { target.torso = -Math.PI / 2 - 0.35; target.head = -Math.PI / 2 - 0.5; target.uaF = 1.8; target.faF = 2.2; target.uaB = -0.4; target.faB = 0.2; }
    if (this.state === 'getup') { const k = 1 - Math.max(0, this.stateT) / 0.8; Pose.blend(this.body.pose, target, k * k); this.body.fk(true); this.updateBBox(); return; }
    if (!this.grounded && !this.lunging) { target.thF = 0.9; target.shF = 1.9; target.thB = 1.5; target.shB = 2.2; }
    Pose.blend(this.body.pose, target, Math.min(1, dt * (this.state === 'attack' ? 22 : 14)));
    this.body.fk(true);
    this.updateBBox();
  }

  // ---------------------------------------------------------------- damage
  takeHit(bone, dmg, dx, dy, force, hx, hy, o = {}) {
    if (this.dead) return;
    const g = this.game, fx = g.fx, def = o.def || {};
    if (this.state === 'idle' || this.state === 'wander') this.setState('chase');
    this.aware = 1;
    if (o.shooter && o.shooter.x !== undefined) { this.tx = o.shooter.x; this.ty = o.shooter.y; }
    if (this.def.armor) { const r = this.def.armor(this, bone, dmg, o); if (r !== undefined) dmg = r; }
    let mul = BONE_MUL[bone] || 1;
    if (bone === 'head' && def.cat === 'sniper') mul = 4;
    const real = dmg * mul;
    this.body.tint = 1;
    this.lastHit = { bone, def, dx, dy, force, hx, hy, kind: o.kind };
    // blood + wound
    const g2 = Settings.goreMul();
    if (g2 > 0) {
      fx.blood(hx, hy, -dx, -dy - 0.2, (bone === 'head' ? 5 : 3) * Math.min(2, real / 30 + 0.5), 0.7);
      fx.blood(hx, hy, dx, dy - 0.1, (bone === 'head' ? 8 : 5) * Math.min(2.2, real / 25 + 0.5), 1.1);
      if (bone !== 'head') this.body.addWound(bone, rand(0.25, 0.85), rand(-0.6, 0.6), rand(1.3, 2.4) * (def.cat === 'shotgun' ? 0.8 : 1));
      else this.body.addWound('head', rand(0.2, 0.8), rand(-0.5, 0.5), rand(1.2, 2));
    }
    Sfx.play(bone === 'head' ? 'hit_head' : 'flesh', { x: hx, y: hy, vol: o.pellets > 1 ? 0.35 : 0.75 });
    // knockback / reaction
    this.vx += dx * force * 0.18 / this.def.mass;
    if (bone === 'head') {
      this.headHp -= real;
      if (this.headHp <= 0) {
        const close = o.shooter ? dist(o.shooter.x, o.shooter.y, this.x, this.y) : 999;
        const burst = Settings.data.dismemberment && (real * (def.gib || 1) > this.headMax * 1.7 || def.cat === 'sniper' || (def.cat === 'shotgun' && close < 260) || -this.headHp > this.headMax * 0.9 || o.kind === 'melee' && def.heavy);
        if (burst) Gore.headBurst(g, this.body, hx, hy, dx, dy, null);
        else if (g2 > 0) { fx.blood(hx, hy, dx, dy, 12, 1.2); if (chance(0.4)) fx.gib('eye', hx, hy, dx * 200, -200); }
        this.die({ cause: 'head', dx, dy, force, hx, hy, headshot: true, def, kind: o.kind });
        return;
      }
      if (real > 15) this.setState('stagger', 0.25);
    } else if (bone === 'torso') {
      this.hp -= real;
    } else {
      const limb = LIMB_OF[bone];
      this.limb[limb] -= real;
      this.hp -= real * 0.3;
      const canSever = Settings.data.dismemberment && g2 > 0;
      if (canSever && this.limb[limb] <= 0 && !this.body.boneMissing(bone)) {
        const sev = real * (def.dismember || 1);
        if (sev > 22 || this.limb[limb] < -this.limbMax[limb] * 0.4 || (o.kind === 'melee' && def.blade)) this.severLive(bone, dx, dy, force);
      }
    }
    if (this.hp <= 0) { this.die({ cause: 'body', dx, dy, force, hx, hy, def, kind: o.kind }); return; }
    // big hits knock down, medium stagger
    const f = force * (o.pellets > 1 ? 1.4 : 1);
    if (!this.crawl && f > this.def.knock * this.def.mass && this.state !== 'down' && this.grounded) {
      this.setState('down', rand(1.0, 1.8)); this.vx = dx * 220; this.vy = -120;
    } else if (f > this.def.stagger && this.state !== 'down' && this.state !== 'vault' && this.state !== 'climb') this.setState('stagger', 0.18 + Math.min(0.4, f / 1000));
  }
  severLive(bone, dx, dy, force) {
    const g = this.game, b = this.body;
    // the piece: the bone and (if attached) its child
    const pieceBones = [bone];
    const ch = BONE_CHILD[bone];
    if (ch && !b.missing[ch]) pieceBones.push(ch);
    const clone = b.clone();
    b.missing[bone] = true;
    const rd = new Ragdoll(g, clone, this.x, this.y, this.face, this.vx + dx * force * 0.6 + rand(-60, 60), this.vy + dy * force * 0.3 - rand(150, 300), pieceBones, { piece: true, bleed: 0 });
    g.addCorpse(rd, true);
    const A = BONE_BY_ID[bone].a;
    const sx = this.x + b.j[A].x * this.face, sy = this.y + b.j[A].y;
    Sfx.play('dismember', { x: sx, y: sy });
    g.fx.blood(sx, sy, dx, dy - 0.3, 14, 1.1);
    g.fx.gib('bone', sx, sy, dx * 150 + rand(-80, 80), -rand(100, 250));
    if (chance(0.5)) g.fx.gib('flesh', sx, sy, dx * 180, -rand(100, 260));
    // stump spurts while alive
    g.fx.emit(() => {
      if (this.dead) return null;
      const P = this.body.j[A], O = this.body.j.pelvis;
      const x = this.x + P.x * this.face, y = this.y + P.y;
      const a = Math.atan2(P.y - (O.y - 20), (P.x - O.x) * this.face);
      return [x, y, a, this.vx * 0.5, 0];
    }, 26, 3.5);
    g.onDismember(this, bone);
    const limb = LIMB_OF[bone];
    if (limb === 'legF' || limb === 'legB') {
      if (!this.crawl) { this.crawl = true; this.setState('down', 0.8); this.vy = -100; }
      this.updateHeight();
    }
  }
  blast(dmg, dx, dy, force, ex, ey, k, opts = {}) {
    if (this.dead) return;
    const g = this.game;
    this.aware = 1;
    if (opts.fire) this.burnT = 4;
    if (opts.bile) { this.hp -= dmg; this.body.tint = 1; if (this.hp <= 0) this.die({ cause: 'body', dx, dy, force: force * 0.3, hx: this.x, hy: this.y - 50 }); return; }
    const total = dmg;
    if (Settings.data.dismemberment && Settings.goreMul() > 0 && k > 0.72 && total > this.hp * 1.6) {
      this.die({ cause: 'gib', dx, dy, force });
      return;
    }
    this.hp -= total;
    if (Settings.data.dismemberment && Settings.goreMul() > 0) {
      for (const bone of ['faF', 'faB', 'shF', 'shB', 'uaF', 'uaB', 'thF', 'thB']) {
        if (this.body.boneMissing(bone)) continue;
        if (chance(k * 0.35)) { if (this.hp > 0) this.severLive(bone, dx, dy, force * 0.4); else this.pendingSever = (this.pendingSever || []).concat(bone); }
      }
    }
    if (this.hp <= 0) { this.die({ cause: 'blast', dx, dy, force, hx: this.x, hy: this.y - this.h * 0.5 }); return; }
    if (!this.crawl) { this.setState('down', rand(1.2, 2)); }
    this.vx = dx * force * 0.4; this.vy = -force * 0.35; this.grounded = false;
  }
  die(info) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    this.state = 'dead';
    g.onZombieDeath(this, info);
    const dx = info.dx || 0, dy = info.dy || 0, force = info.force || 100;
    if (info.cause === 'gib') {
      Gore.explodeBody(g, this.body, this.x, this.y, this.face, dx * force, dy * force);
      // legs sometimes survive the blast as a grim keepsake
      if (chance(0.5) && !this.body.boneMissing('thF')) {
        const rd = new Ragdoll(g, this.body.clone(), this.x, this.y, this.face, dx * force * 0.5, -force * 0.5, ['thF', 'shF'], { piece: true, bleed: 0 });
        g.addCorpse(rd, true);
      }
      return;
    }
    if (!this.body.headGone && info.cause !== 'head') Sfx.play('z_death', { x: this.x, y: this.y, vol: 0.7, rate: 1 / this.s });
    const k = info.cause === 'blast' ? 1 : 0.55;
    const rd = new Ragdoll(g, this.body, this.x, this.y, this.face, this.vx * 0.6 + dx * force * k, this.vy * 0.6 + dy * force * k - (info.cause === 'blast' ? force * 0.4 : 40), null, { burn: info.burn || 0 });
    if (info.hx !== undefined) rd.impulse(info.hx, info.hy, dx * force * 3, dy * force * 3 - 60, 40);
    if (this.pendingSever) for (const b of this.pendingSever) if (rd.bp[b]) rd.sever(b, false);
    if (info.cause === 'blast' && Settings.goreMul() > 0 && chance(0.6)) { this.body.gutted = true; Gore.gut(g, this.x, this.y - this.h * 0.5, dx, dy, () => { const p = rd.pts.pelvis; return p ? [p.x, p.y] : null; }); }
    g.addCorpse(rd);
  }

  draw(ctx) {
    if (this.dead) return;
    // soft contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(this.x, this.y - 1, this.crawl ? 30 * this.s : 16 * this.s, 3, 0, 0, TAU); ctx.fill();
    this.body.draw(ctx, this.x, this.y, this.face, null);
    if (this.def.drawExtra) this.def.drawExtra(this, ctx);
  }
}
