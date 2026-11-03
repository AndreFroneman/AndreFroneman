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
// ---------------------------------------------------------------------
//  Special infected
// ---------------------------------------------------------------------
function zArmor(z, bone, dmg, o, hx, hy, dx, dy) {
  const def = o.def || {}, pen = def.pen || 10, g = z.game;
  if (bone === 'head' && z.helmetHp > 0) {
    if (pen >= 120 || (o.kind === 'melee' && def.heavy)) { z.popHelmet(dx, dy); return dmg; }
    z.helmetHp -= dmg;
    g.fx.sparks(hx, hy, -dx, -dy, 7); Sfx.play('ric', { x: hx, y: hy, vol: 0.6 });
    z._armored = true;
    if (z.helmetHp <= 0) z.popHelmet(dx, dy);
    return dmg * (pen > 40 ? 0.3 : 0.06);
  }
  if (bone === 'torso' && z.vestHp > 0) {
    z.vestHp -= dmg;
    g.fx.sparks(hx, hy, -dx, -dy, 3, 'rgba(200,200,200,0.8)'); Sfx.play('hit_metal', { x: hx, y: hy, vol: 0.4 });
    z._armored = true;
    return dmg * (pen > 60 ? 0.6 : 0.28);
  }
  return undefined;
}
OUTFITS.riot = () => ({ shirtType: 'uniform', shirt: '#1a1e26', sleeve: 'long', armor: true, pants: '#14161c', shoeType: 'boot', shoes: '#0e0e0e', helmet: 'riot', gloves: '#121212', kneepads: true });
OUTFITS.soldierFull = () => Object.assign(OUTFITS.soldier(), { helmet: 'mil' });
OUTFITS.brute = () => ({ shirtType: 'tank', shirt: '#5a5048', sleeve: 'none', pants: pick(['#2a2a2a', '#3a3428', '#2a3040']), shoeType: 'bare' });
OUTFITS.hazmat = () => ({ shirtType: 'jacket', shirt: '#b8a028', sleeve: 'long', pants: '#a89020', shoeType: 'boot', shoes: '#1a1a14', hat: 'hazmat', hazmat: true, gloves: '#222222' });
OUTFITS.bloater = () => ({ shirtType: 'tank', shirt: pick(['#8a8470', '#6a6a5a']), sleeve: 'none', pants: pick(['#3a3a40', '#4a4030']), pantsType: 'pants', shoeType: 'shoe', shoes: '#1a1410' });

Object.assign(ZTYPES, {
  riot: {
    name: 'Riot Officer', desc: 'Visored helmet and body armour shrug off rounds until shot away. Aim for the legs — or bring penetration.',
    scale: [0.98, 1.06], build: [1.05, 1.15], hp: 150, headHp: 50, armHp: 55, legHp: 70, speed: [34, 50], dmg: 18, wind: 0.5, rec: 0.7,
    reach: 52, sight: 520, hear: 1, stagger: 180, knock: 520, bash: 28, score: 25, cash: 35, gait: 'shamble', mass: 1.2, outfit: 'riot', groan: 'z_groan',
    init(z) { z.helmetHp = 140; z.vestHp = 220; }, armor: zArmor,
  },
  soldier: {
    name: 'Fallen Soldier', desc: 'Cordon troops who turned at their posts. Helmeted, plated and still moving at a jog.',
    scale: [0.98, 1.05], build: [1.0, 1.1], hp: 160, headHp: 55, armHp: 60, legHp: 75, speed: [85, 115], dmg: 20, wind: 0.35, rec: 0.5,
    reach: 50, sight: 650, hear: 1.2, stagger: 170, knock: 480, bash: 26, score: 30, cash: 40, gait: 'jog', mass: 1.15, outfit: 'soldierFull', groan: 'z_growl',
    init(z) { z.helmetHp = 90; z.vestHp = 180; }, armor: zArmor,
  },
  brute: {
    name: 'Brute', desc: 'A swollen mass of muscle and tumour. Charges, smashes barricades in a few blows and shrugs off small arms.',
    scale: [1.32, 1.42], build: [1.45, 1.6], limbScale: 1.04, hp: 720, headHp: 230, armHp: 260, legHp: 320, speed: [55, 68], dmg: 36, wind: 0.65, rec: 0.9,
    reach: 66, sight: 600, hear: 1, stagger: 800, knock: 2600, bash: 95, score: 120, cash: 130, gait: 'stomp', mass: 3.2, wide: 1.4, outfit: 'brute', alert: 'brute_roar', groan: 'z_growl',
    knockback: 520, decay: 1,
    lookMod(L) { L.skin = pick(['#8a7a70', '#7d7468', '#86786a']); L.shirt = shade(L.skin, -0.25); L.hairStyle = 'bald'; L.jawOpen = 3.6; L.blood = 1; },
    behave(z, dt, move) {
      const p = z.game.player;
      z.chargeCd = (z.chargeCd || rand(2, 4)) - dt;
      if (z.chargeT > 0) {
        z.chargeT -= dt;
        if (p && !p.dead && !z.chargeHit && Math.abs(p.x - z.x) < z.def.reach * z.s + 10 && p.y > z.y - z.h && p.y - p.h < z.y + 10) {
          z.chargeHit = true; z.chargeT = 0.15;
          p.hurt(z.def.dmg * 1.3 * z.game.diff.dmgMul, z.face, z, false, 700);
          z.game.shake(14); Sfx.play('melee_blunt', { x: p.x, y: p.y - 60 });
        }
        return z.face;
      }
      if (p && !p.dead && z.sees && z.grounded && z.chargeCd <= 0 && Math.abs(p.x - z.x) > 170 && Math.abs(p.x - z.x) < 480 && Math.abs(p.y - z.y) < 40) {
        z.chargeT = 1.2; z.chargeCd = rand(6, 9); z.chargeHit = false; z.face = Math.sign(p.x - z.x);
        Sfx.play('brute_roar', { x: z.x, y: z.y, vol: 1 });
        return z.face;
      }
      return move;
    },
  },
  bloater: {
    name: 'Bloater', desc: 'Gas-bloated host that bursts into caustic bile when killed. Kill it at range — never next to you.',
    scale: [1.05, 1.15], build: [1.25, 1.35], hp: 110, headHp: 45, armHp: 45, legHp: 60, speed: [26, 40], dmg: 12, wind: 0.6, rec: 0.8,
    reach: 50, sight: 480, hear: 1, stagger: 220, knock: 900, bash: 18, score: 30, cash: 40, gait: 'waddle', mass: 1.6, outfit: 'bloater', groan: 'gurgle', alert: 'gurgle',
    lookMod(L) { L.skin = pick(['#7f8a5a', '#8a8a5e', '#7a865c']); L.fat = true; L.decay = 0.75; },
    onDeath(z) { Combat.bile(z.game, z.x, z.y - z.h * 0.5, 175, 60, z); return 'gib'; },
    drawExtra(z, ctx) {
      const j = z.body.j, t = z.game.time;
      for (let i = 0; i < 4; i++) {
        const k = 0.25 + i * 0.17;
        const x = z.x + lerp(j.pelvis.x, j.neck.x, k) * z.face + z.face * z.body.d.torsoT * (0.42 + (i % 2) * 0.08), y = z.y + lerp(j.pelvis.y, j.neck.y, k) + (i % 2 ? -3 : 3);
        const r = 3.2 + Math.sin(t * 3 + i) * 0.6;
        ctx.fillStyle = '#6a7a2a'; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8d050'; ctx.beginPath(); ctx.arc(x - 0.6, y - 0.6, r * 0.55, 0, TAU); ctx.fill();
      }
      if (Math.random() < 0.04) z.game.fx.add(P.BILE, z.x + z.face * 10, z.y - z.h * 0.45, rand(-20, 20), 20, 1, 1.5);
    },
  },
  shrieker: {
    name: 'Shrieker', desc: 'Hangs back and screams — summoning more infected and driving those nearby into a frenzy. Kill it first.',
    scale: [0.92, 1.0], build: [0.72, 0.8], limbScale: 1.08, hp: 85, headHp: 30, armHp: 35, legHp: 45, speed: [75, 95], dmg: 8, wind: 0.4, rec: 0.6,
    reach: 44, sight: 760, hear: 1.4, stagger: 90, knock: 300, bash: 10, score: 40, cash: 55, gait: 'shamble', mass: 0.8, groan: 'z_hiss', alert: 'z_scream',
    lookMod(L) { L.skin = pick(['#a8aa98', '#9ea294']); L.hairStyle = 'long'; L.hair = pick(['#1a1410', '#3a2a1a', '#6a6a60']); L.jawOpen = 4.6; L.eyeGlow = '#f0e8c8'; L.shirtType = 'gown'; L.shirt = '#8a8a80'; L.pantsType = 'bare'; L.shoeType = 'bare'; },
    init(z) { z.screamCd = rand(2.5, 5); },
    behave(z, dt, move) {
      const p = z.game.player;
      z.screamCd -= dt;
      if (!p || p.dead) return move;
      const dx = p.x - z.x, d = Math.abs(dx), same = Math.abs(p.y - z.y) < 80;
      if (z.sees && z.screamCd <= 0 && d < 850) { z.setState('scream', 1.7); z.screamed = false; z.screamCd = rand(12, 16); z.face = Math.sign(dx) || z.face; return 0; }
      if (same && z.sees) { if (d < 300) return -Math.sign(dx); if (d < 470) return 0; }
      return move;
    },
    drawExtra(z, ctx) {
      if (!(z.ringT > 0)) return;
      const j = z.body.j, x = z.x + j.head.x * z.face, y = z.y + j.head.y;
      const k = 1 - z.ringT / 0.9;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) { const r = 20 + (k + i * 0.2) * 260; ctx.strokeStyle = `rgba(255,230,200,${Math.max(0, 0.35 - k * 0.35 - i * 0.08)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
      ctx.restore();
    },
  },
  leaper: {
    name: 'Leaper', desc: 'Long-limbed hunter that stalks low and pounces from several metres away.',
    scale: [0.98, 1.04], build: [0.78, 0.85], limbScale: 1.15, hp: 95, headHp: 34, armHp: 40, legHp: 50, speed: [120, 150], dmg: 15, wind: 0.25, rec: 0.45,
    reach: 48, sight: 720, hear: 1.3, stagger: 120, knock: 360, bash: 16, score: 35, cash: 45, gait: 'prowl', mass: 0.9, alert: 'z_hiss', groan: 'z_hiss', jumper: true,
    pins: true,
    lookMod(L) { L.shirtType = 'hoodie'; L.sleeve = 'long'; L.shirt = pick(['#1e2024', '#2a2420', '#22262a']); L.decay = 1; L.eyeGlow = '#e05030'; L.hairStyle = 'wild'; L.jawOpen = 3.8; },
    init(z) { z.pounceCd = rand(1, 2.5); },
    behave(z, dt, move) {
      const p = z.game.player;
      z.pounceCd -= dt;
      if (!p || p.dead || !z.grounded) return move;
      const dx = p.x - z.x, d = Math.abs(dx);
      if (z.sees && z.pounceCd <= 0 && d > 110 && d < 360 && p.y > z.y - 170 && p.y < z.y + 40) {
        z.face = Math.sign(dx) || 1;
        z.vx = z.face * clamp(d * 2.0, 380, 700); z.vy = -430 - Math.max(0, z.y - p.y) * 2.4; z.grounded = false;
        z.setState('pounce'); z.pounceHit = false; z.pounceCd = rand(2.5, 4);
        Sfx.play('z_scream', { x: z.x, y: z.y, vol: 0.8, rate: 1.2 });
        return z.face;
      }
      return move;
    },
  },
});

ZTYPES.burner = {
  name: 'Burner', desc: 'Varga furnace crew in scorched hazmat gear with a fuel tank on the back. Puncture the tank and it goes up — and keeps coming while it burns, leaving fire behind it.',
  scale: [0.98, 1.06], build: [1.05, 1.15], hp: 130, headHp: 45, armHp: 50, legHp: 60, speed: [34, 48], dmg: 16, wind: 0.5, rec: 0.7,
  reach: 50, sight: 520, hear: 1, stagger: 160, knock: 520, bash: 26, score: 30, cash: 40, gait: 'shamble', mass: 1.2, outfit: 'hazmat', groan: 'z_groan', burnRush: true,
  init(z) { z.tankHp = 45; },
  armor(z, bone, dmg, o, hx, hy) {
    if (bone === 'torso' && !(z.burnT > 0)) { z.tankHp -= dmg; if (z.tankHp <= 0) z.ignite(); else { z.game.fx.sparks(hx, hy, -z.face, -0.3, 3); Sfx.play('hit_metal', { x: hx, y: hy, vol: 0.4 }); } }
    return undefined;
  },
  behave(z, dt, move) {
    if (z.burnT > 0) {
      z.trailT = (z.trailT || 0) - dt;
      if (z.trailT <= 0 && z.grounded) { z.trailT = 0.55; z.game.addFire(z.x, z.y, 2.6); }
    }
    return move;
  },
  onDeath(z) {
    if (z.tankBlown) return;
    z.tankBlown = true;
    z.game.later(0.05, () => Combat.explode(z.game, z.x, z.y - 46, 130, 80, null, {}));
  },
  drawExtra(z, ctx) {
    if (z.tankBlown) return;
    const j = z.body.j;
    const x = z.x + lerp(j.pelvis.x, j.neck.x, 0.6) * z.face - z.face * z.body.d.torsoT * 0.62, y = z.y + lerp(j.pelvis.y, j.neck.y, 0.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate((z.body.pose.torso + Math.PI / 2) * z.face);
    ctx.fillStyle = z.tankHp < 20 ? '#7a2a14' : '#8a2a18'; roundRect(ctx, -6, -18, 12, 32, 5); ctx.fill();
    ctx.strokeStyle = '#1a0a06'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-4, -15, 2, 26);
    ctx.fillStyle = '#3a3a38'; ctx.fillRect(-3, -22, 6, 5);
    ctx.restore();
  },
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

  armorCost(bone) { return bone === 'head' && this.helmetHp > 0 ? 4 : bone === 'torso' && this.vestHp > 0 ? 2.5 : 1; }
  popHelmet(dx, dy) {
    if (!this.look.helmet) return;
    this.helmetHp = 0;
    const j = this.body.j, hx = this.x + j.head.x * this.face, hy = this.y + j.head.y;
    this.game.fx.gib(this.look.helmet === 'riot' ? 'helmet' : 'milhelmet', hx, hy, dx * 260 + rand(-60, 60), -rand(220, 380), { r: 7, bleed: 0, sound: 'hit_metal', life: 40 });
    Sfx.play('metal_bash', { x: hx, y: hy, vol: 0.7 });
    this.look = Object.assign({}, this.look, { helmet: null, hairStyle: 'buzz' });
    this.body.look = this.look; this.body.spr = BodyArt.get(this.look, this.body.d);
  }
  ignite() {
    if (this.burnT > 0 || this.dead) return;
    this.burnT = 12;
    Sfx.play('fire_whoosh', { x: this.x, y: this.y, vol: 0.9 });
    Sfx.play('z_scream', { x: this.x, y: this.y, vol: 0.7, rate: 0.8 });
    this.game.fx.light(this.x, this.y - 60, 260, '#ff9040', 1.4, 0.4);
    this.aware = 1; this.hunt = true;
  }
  canJumpGaps() { const g = this.def.gait; return !this.crawl && (g === 'sprint' || g === 'prowl' || g === 'jog' || !!this.def.jumper); }
  pinPlayer(p) {
    p.pinnedBy = this; p.pinBreak = 0;
    this.setState('pin', 4.5); this.pinTick = 0.3;
    this.face = Math.sign(p.x - this.x) || this.face;
    p.hurt(this.def.dmg * this.game.diff.dmgMul, this.face, this, false, 0);
    Sfx.play('z_scream', { x: this.x, y: this.y, vol: 0.9, rate: 1.15 });
    this.game.shake(8);
  }
  releasePin(thrown) {
    const p = this.game.player;
    if (p && p.pinnedBy === this) p.pinnedBy = null;
    if (thrown) {
      this.setState('down', 1.4); this.vx = -this.face * 340; this.vy = -220; this.grounded = false; this.hp -= 18; this.body.tint = 1;
      Sfx.play('melee_blunt', { x: this.x, y: this.y - 60, vol: 0.8 }); this.game.shake(5);
      if (this.hp <= 0) this.die({ cause: 'body', dx: -this.face, dy: -0.3, force: 200 });
    } else { this.setState('chase'); this.cool = 1; this.vx = -this.face * 160; }
  }
  updatePin(dt) {
    const g = this.game, p = g.player, d = this.body.d;
    if (!p || p.dead || p.pinnedBy !== this || this.stateT <= 0) { this.releasePin(false); return; }
    this.x = p.x - this.face * 16; this.y = p.y; this.vx = 0; this.vy = 0;
    this.pinTick -= dt;
    if (this.pinTick <= 0) {
      this.pinTick = 0.45;
      p.hurt(5 * g.diff.dmgMul, this.face, this);
      Sfx.play('flesh', { x: p.x, y: p.y - 60, vol: 0.6 });
      if (Settings.goreMul() > 0) g.fx.blood(p.x, p.y - 60, -this.face, -0.4, 4, 0.6);
    }
    const t = g.time * 14;
    const target = Pose.walk(d, this.phase, { amp: 0.05, lean: 0.7, crouch: 1 });
    Pose.crouchLegs(target, d, 0.8);
    target.uaF = 0.1 + Math.sin(t) * 0.7; target.faF = target.uaF + 0.3; target.uaB = 0.2 + Math.sin(t + 2) * 0.7; target.faB = target.uaB + 0.3; target.head = -0.2;
    Pose.blend(this.body.pose, target, Math.min(1, dt * 18));
    this.body.fk(true);
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
  // can we walk from x0 to x1 at floor height y? (door & window openings count as passable)
  levelClear(x0, x1, y) {
    const w = this.game.world, d = Math.abs(x1 - x0);
    if (d < 2) return true;
    const dir = Math.sign(x1 - x0);
    const walls = w.rayDist(x0, y - 60, dir, 0, d) >= d - 1 || w.rayDist(x0, y - 100, dir, 0, d) >= d - 1 || w.rayDist(x0, y - 125, dir, 0, d) >= d - 1;
    if (!walls) return false;
    // continuous floor (gaps wider than ~2 columns mean a drop)
    let miss = 0;
    for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += dir * 16) {
      if (w.floorAt(x, y)) miss = 0; else if (++miss > (this.canJumpGaps() ? 9 : 2)) return false;
    }
    return true;
  }
  // Dijkstra over stair/ladder endpoints; returns the first link to take
  planRoute(tx, ty) {
    const links = this.game.world.links;
    if (!links.length) return null;
    const ends = [];
    const recent = this.game.time - (this.lastLadderT || -99) < 4 ? this.lastLadder : null;
    for (const L of links) {
      if (L.kind === 'ladder' && this.crawl) continue;
      if (L === recent) continue;
      ends.push({ L, up: true, x: L.bx, y: L.bottom, ox: L.tx, oy: L.top });
      ends.push({ L, up: false, x: L.tx, y: L.top, ox: L.bx, oy: L.bottom });
    }
    const n = ends.length;
    const dist = new Array(n).fill(Infinity), first = new Array(n).fill(null), done = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      const e = ends[i];
      const onProp = this.ground && this.ground.isProp && e.y > this.y && e.y - this.y < 150;
      if ((Math.abs(e.y - this.y) < 70 && this.levelClear(this.x, e.x, this.y)) || (onProp && this.levelClear(this.x, e.x, e.y))) { dist[i] = Math.abs(e.x - this.x) + Math.abs(e.ox - e.x) + Math.abs(e.oy - e.y); first[i] = e; }
    }
    let best = Infinity, bestFirst = null;
    for (let iter = 0; iter < n; iter++) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      const e = ends[u];
      // from the far end of this link: can we reach the target?
      if (Math.abs(ty - e.oy) < 80 && this.levelClear(e.ox, tx, e.oy)) {
        const c = dist[u] + Math.abs(tx - e.ox);
        if (c < best) { best = c; bestFirst = first[u]; }
      }
      for (let v = 0; v < n; v++) {
        if (done[v] || ends[v].L === e.L) continue;
        const f = ends[v];
        if (Math.abs(f.y - e.oy) > 70 || !this.levelClear(e.ox, f.x, e.oy)) continue;
        const c = dist[u] + Math.abs(f.x - e.ox) + Math.abs(f.ox - f.x) + Math.abs(f.oy - f.y);
        if (c < dist[v]) { dist[v] = c; first[v] = first[u]; }
      }
    }
    return bestFirst;
  }
  navGoal(tx, ty) {
    // returns x to walk toward; may start ladder climbs / stair traversals
    if (this.navLink) {
      const { L, up, t0 } = this.navLink;
      const endY = up ? L.top : L.bottom, endX = up ? L.tx : L.bx;
      if ((Math.abs(this.y - endY) < 3 && Math.abs(this.x - endX) < 44 && this.grounded) || this.game.time - t0 > 14) this.navLink = null;
      else return endX;
    }
    const dy = ty - this.y;
    if (Math.abs(dy) < 80 && this.levelClear(this.x, tx, this.y)) { this.plan = null; return tx; }
    // up on a vehicle/crate and the target is on the floor it stands on: just step off toward it
    const gp = this.ground;
    if (dy > 40 && gp && gp.isProp && Math.abs(ty - (gp.y + gp.h)) < 80 && this.levelClear(this.x, tx, gp.y + gp.h)) { this.plan = null; return tx; }
    // re-plan a few times a second
    if (!this.plan || this.game.time - this.planT > 0.6) { this.plan = this.planRoute(tx, ty); this.planT = this.game.time; }
    const e = this.plan;
    if (!e) return tx;
    const fromX = e.x;
    if (e.L.kind === 'ladder' && Math.abs(this.x - fromX) < 10 && this.state !== 'climb') {
      this.ladder = e.L; this.climbDir = e.up ? -1 : 1; this.x = fromX; this.plan = null; this.setState('climb');
    }
    // already standing part-way along the stair/ramp the plan wants? continue from here
    const L = e.L, onSpan = L.kind === 'stairs' && this.ground && this.ground.stair && this.x > Math.min(L.bx, L.tx) - 10 && this.x < Math.max(L.bx, L.tx) + 10 && this.y <= L.bottom + 2 && this.y >= L.top - 2;
    if (L.kind === 'stairs' && (Math.abs(this.x - fromX) < 30 || onSpan)) { this.navLink = { L, up: e.up, t0: this.game.time }; this.plan = null; return e.ox; }
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
      this.burnT -= dt; this.hp -= 10 * dt;
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
      case 'pin': this.updatePin(dt); return;
      case 'scream': {
        this.vx *= 0.85;
        if (p && !p.dead) this.face = Math.sign(p.x - this.x) || this.face;
        if (!this.screamed && this.stateT < 1.3) this.doScream();
        if (this.stateT <= 0) this.setState('chase');
        break;
      }
      case 'pounce': {
        if (p && !p.dead && !this.pounceHit && Math.abs(p.x - this.x) < 40 && p.y > this.y - this.h - 10 && p.y - p.h < this.y + 10) {
          this.pounceHit = true; this.vx *= 0.2;
          if (def.pins && !p.pinnedBy && !p.onLadder && !p.vaulting) { this.pinPlayer(p); break; }
          p.hurt(def.dmg * 1.6 * g.diff.dmgMul, this.face, this, false, 380);
          Sfx.play('flesh', { x: p.x, y: p.y - 60 }); g.shake(8);
        }
        if (this.grounded && this.stateT < -0.15) { this.setState('chase'); this.cool = 0.3; }
        break;
      }
      case 'climb': this.updateClimb(dt); return;
      case 'attack': case 'bash': this.updateAttack(dt); break;
      default: {
        if (this.aware > 0.3) {
          const gx = this.navGoal(this.tx, this.ty);
          if (this.state === 'climb') return;
          const dx = gx - this.x;
          if (Math.abs(dx) > 6) { move = Math.sign(dx); this.face = move; }
          else if (this.ty > this.y + 60 && this.grounded) move = this.face;
          else if (!this.sees && !this.hunt && Math.abs(this.ty - this.y) < 80) { this.aware *= 0.5; if (this.aware < 0.3) this.setState('wander'); }
          if (p && !p.dead && this.sees) this.face = Math.sign(p.x - this.x) || this.face;
          // attack the player
          if (p && !p.dead && this.cool <= 0 && !g.aiFrozen) {
            const reach = def.reach * this.s * (this.biteOnly() ? 0.75 : 1);
            const ddx = p.x - this.x;
            if (Math.abs(ddx) < reach + p.hw && Math.abs(p.y - this.y) < 60 && Math.sign(ddx) === this.face) {
              this.setState('attack'); this.atkT = 0; this.atkTarget = p; this.atkHit = false;
              Sfx.play('z_attack', { x: this.x, y: this.y, vol: 0.6, rate: 1 / this.s });
              move = 0;
            } else if (def.lunge && !this.crawl && this.grounded && Math.abs(ddx) < 170 && Math.abs(ddx) > 70 && Math.abs(p.y - this.y) < 30 && chance(0.03)) {
              this.vx = this.face * 420; this.vy = -260; this.grounded = false; this.lunging = 0.4;
            }
          }
          if (def.behave && !g.aiFrozen) move = def.behave(this, dt, move);
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
    let spd = this.speed * spdMul * (this.chargeT > 0 ? 4.5 : 1) * (def.burnRush && this.burnT > 0 ? 1.9 : 1);
    if (this.state === 'pounce') move = 0;
    if (this.crawl) spd = Math.min(spd, this.def.gait === 'crawl' ? spd : 60);
    else {
      if (this.legCrippled('legF') || this.legCrippled('legB')) spd *= 0.6;
    }
    if (this.lunging > 0) this.lunging -= dt;
    else if (this.state === 'pounce') { /* ballistic */ }
    else if (this.grounded || this.crawl) {
      const target = move * spd;
      this.vx = approach(this.vx, target, (this.def.gait === 'sprint' ? 900 : 500) * dt);
    }
    // stairs & dropping through one-way floors toward the target
    this.useStairs = this.aware > 0.3 && (this.navLink ? this.navLink.up : !this.plan && this.ty < this.y - 60);
    this.dropT = (this.dropT || 0) - dt;
    if (this.aware > 0.3 && this.grounded && this.ground && this.ground.oneway) {
      if (this.navLink && !this.navLink.up && !this.ground.stair) this.dropT = 0.3;
      else if (this.ty > this.y + 80 && !this.navLink && !this.plan) this.dropT = 0.3;
    }
    this.drop = this.dropT > 0;
    if (move !== 0 && this.grounded && !(this.lunging > 0) && this.state === 'chase' && this.aware > 0.3 && this.canJumpGaps() && !g.aiFrozen && this.ty <= this.y + 50 && !(this.navLink && !this.navLink.up)) {
      const w = g.world, ax = this.x + move * (this.hw + 6);
      if (!w.floorAt(ax, this.y)) {
        for (let dd = 16; dd <= 150; dd += 16) if (w.floorAt(ax + move * dd, this.y)) { this.vy = -420 - dd * 1.3; this.vx = move * Math.max(this.speed * spdMul, 240); this.grounded = false; this.lunging = 0.6; break; }
      }
    }
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
    for (const p of g.props) {
      if (!(p.isDoor || p.isBarricade) || !p.solid) continue;
      const near = dir > 0 ? p.x - (this.x + this.hw) : (this.x - this.hw) - (p.x + p.w);
      if (near < -p.w || near > 26) continue;
      if (p.y > this.y - 8 || p.y + p.h < this.y - this.h) continue;
      this.setState('bash'); this.atkT = 0; this.atkTarget = p; this.atkHit = false; return;
    }
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
    const maxRise = this.crawl ? 34 : 140 * Math.max(1, s);
    if (rise > 0 && rise <= maxRise) {
      // a door or barricade standing on top of the obstacle?
      const sx0 = dir > 0 ? b.x - 4 : b.x + b.w - 40, sx1 = dir > 0 ? b.x + 40 : b.x + b.w + 4;
      for (const p of g.props) {
        if (!p.isDoor && !p.isBarricade) continue;
        if (p.x + p.w < sx0 || p.x > sx1 || p.y + p.h < top - 6 || p.y > top + 100) continue;
        if (p.solid) { this.setState('bash'); this.atkT = 0; this.atkTarget = p; this.atkHit = false; return; }
      }
      const narrow = (b.w <= 72 && rise <= 64 * s) || (b.isProp && b.w <= 112 && rise <= 72 * s);
      const opts = [];
      if (narrow) opts.push([dir > 0 ? b.x + b.w + this.hw + 3 : b.x - this.hw - 3, top, 50]);
      opts.push([this.x + dir * (this.hw + 16), top, this.crawl ? 40 * s : this.standH * 0.92]);
      let destX = 0, destY = 0, headroom = false;
      for (const [ox, oy, hh] of opts) if (Phys.free(g, ox, oy - 0.5, this.hw, hh)) { destX = ox; destY = oy; headroom = true; break; }
      if (headroom) {
        if (b.isProp && b.def && b.def.movable && chance(0.3)) b.push(dir * 60);
        const k = 0.55 + rise / 95;
        this.vault = { x0: this.x, y0: this.y, x1: destX, y1: destY, t: 0, dur: (this.def.gait === 'sprint' ? 0.45 : 0.85) * k * (this.crawl ? 1.3 : 1) };
        this.setState('vault');
        this.stuckT = 0;
        return;
      }
    }
    // up on furniture under a lintel / low ceiling: climb down ahead, or wreck what we stand on
    const gp = this.ground;
    if (gp && gp.isProp && !b.isProp && this.grounded) {
      const fy = gp.y + gp.h, fx = this.x + dir * (this.hw + 8);
      if (fy > this.y + 10 && Phys.free(g, fx, fy - 0.5, this.hw, this.standH * 0.75)) {
        this.vault = { x0: this.x, y0: this.y, x1: fx, y1: fy, t: 0, dur: 0.5 }; this.setState('vault'); this.stuckT = 0; return;
      }
      if (gp.hp !== undefined && gp.hp < 1e8 && !(gp.def && gp.def.explosive) && this.stuckT > 0.5) { this.setState('bash'); this.atkT = 0; this.atkTarget = gp; this.atkHit = false; return; }
    }
    this.stuckT += 1 / 60;
    if (b.isProp && b.def && b.def.movable && this.stuckT < 1.2) { b.push(dir * 40); return; }
    // furniture in the way that can't be climbed: tear it apart
    if (b.isProp && b.hp !== undefined && b.hp < 1e8 && !(b.def && b.def.explosive) && this.stuckT > 0.8) { this.setState('bash'); this.atkT = 0; this.atkTarget = b; this.atkHit = false; return; }
    // too tall — jumpers try to jump
    if ((this.def.gait === 'sprint' || this.def.jumper) && this.grounded && rise < (this.def.jumper ? 170 : 100)) { this.vy = this.def.jumper ? -780 : -620; this.grounded = false; }
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
      this.y = endY; this.vy = 0; this.lastLadder = L; this.lastLadderT = this.game.time; this.ladder = null; this.plan = null;
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

  doScream() {
    this.screamed = true; this.ringT = 0.9;
    const g = this.game;
    Sfx.play('shriek', { x: this.x, y: this.y, vol: 1.2, range: 4000, force: true });
    g.noise(this.x, this.y, 3000);
    g.shake(5);
    for (const z of g.zombies) if (!z.dead && z !== this && dist(z.x, z.y, this.x, this.y) < 950) { z.buffT = 7; z.aware = 1; z.hunt = true; if (z.state === 'idle' || z.state === 'wander') z.setState('chase'); }
    if (g.mode.onShriek) g.mode.onShriek(this);
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
    const stride = gait === 'sprint' ? 34 : gait === 'stomp' ? 30 : gait === 'jog' ? 26 : gait === 'prowl' ? 30 : 20;
    this.phase += dt * (speedNow / (stride * this.s)) * (gait === 'sprint' || gait === 'prowl' ? 3.3 : 2.6);
    this.ringT = (this.ringT || 0) - dt;
    const limpF = this.legCrippled('legF'), limpB = this.legCrippled('legB');
    if (gait === 'jog') {
      target = Pose.walk(d, this.phase, { amp: 0.62, knee: 0.95, lean: 0.24, bob: 3, limpF, limpB });
      const s2 = Math.sin(this.phase);
      target.uaF = 0.3 + 0.25 * s2; target.faF = 0.1 + 0.2 * s2; target.uaB = 0.6 - 0.25 * s2; target.faB = 0.35;
      if (speedNow < 10) target = Pose.walk(d, this.phase, { amp: 0.05, lean: 0.15 });
    } else if (gait === 'stomp') {
      const amp = speedNow < 4 ? 0.04 : this.chargeT > 0 ? 0.7 : 0.38;
      target = Pose.walk(d, this.phase, { amp, knee: 0.55, lean: this.chargeT > 0 ? 0.45 : 0.16, bob: 4.5, limpF, limpB });
      const s2 = Math.sin(this.phase);
      target.uaF = Math.PI / 2 - 0.55 + 0.35 * s2; target.faF = target.uaF - 0.45; target.uaB = Math.PI / 2 - 0.35 - 0.35 * s2; target.faB = target.uaB - 0.4;
      const sgn = Math.sign(Math.sin(this.phase));
      if (speedNow > 10 && sgn !== this.lastStep) { this.lastStep = sgn; Sfx.play('land', { x: this.x, y: this.y, vol: 0.5, rate: 0.7 }); const p = this.game.player; if (p && dist(p.x, p.y, this.x, this.y) < 500) this.game.shake(1.5); }
    } else if (gait === 'waddle') {
      target = Pose.walk(d, this.phase, { amp: speedNow < 4 ? 0.04 : 0.26, knee: 0.4, lean: -0.08, bob: 2.6, limpF, limpB });
      target.uaF = 1.05 + 0.1 * Math.sin(this.phase); target.faF = 0.9; target.uaB = 1.25; target.faB = 1.0;
    } else if (gait === 'prowl') {
      const amp = speedNow < 4 ? 0.05 : 0.7;
      target = Pose.walk(d, this.phase, { amp, knee: 1.2, lean: 0.85, bob: 3, crouch: 1, limpF, limpB });
      const s2 = Math.sin(this.phase);
      target.uaF = 1.0 + 0.55 * s2; target.faF = target.uaF + 0.25; target.uaB = 1.0 - 0.55 * s2; target.faB = target.uaB + 0.25;
      target.head = -0.35;
      if (this.state === 'pounce') { target.uaF = -0.2; target.faF = -0.1; target.uaB = 0; target.faB = 0.1; target.torso = -0.5; target.head = -0.2; }
    } else if (gait === 'sprint') {
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
    if (this.state === 'scream') { const k = Math.min(1, (1.7 - this.stateT) * 3); target.torso = -Math.PI / 2 - 0.35 * k; target.head = -Math.PI / 2 - 0.9 * k; target.uaF = -0.9 * k + 0.6; target.faF = -1.4 * k + 0.5; target.uaB = -0.6 * k + 0.8; target.faB = -1.2 * k + 0.6; }
    if (this.state === 'stagger') { target.torso = -Math.PI / 2 - 0.35; target.head = -Math.PI / 2 - 0.5; target.uaF = 1.8; target.faF = 2.2; target.uaB = -0.4; target.faB = 0.2; }
    if (this.state === 'getup') { const k = 1 - Math.max(0, this.stateT) / 0.8; Pose.blend(this.body.pose, target, k * k); this.body.fk(true); this.updateBBox(); return; }
    if (!this.grounded && !(this.lunging > 0) && this.state !== 'pounce') { target.thF = 0.9; target.shF = 1.9; target.thB = 1.5; target.shB = 2.2; }
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
    this._armored = false;
    if (this.def.armor) { const r = this.def.armor(this, bone, dmg, o, hx, hy, dx, dy); if (r !== undefined) dmg = r; }
    let mul = BONE_MUL[bone] || 1;
    if (bone === 'head' && def.cat === 'sniper') mul = 4;
    const real = dmg * mul;
    this.body.tint = 1;
    this.lastHit = { bone, def, dx, dy, force, hx, hy, kind: o.kind };
    // blood + wound
    const g2 = this._armored ? 0 : Settings.goreMul();
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
        if (o.kind === 'melee' && def.blade && Settings.data.dismemberment && g2 > 0) this.severLive('head', dx, dy, force);
        else if (burst) Gore.headBurst(g, this.body, hx, hy, dx, dy, null);
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
    if (this.type === 'burner' && !opts.bile) this.ignite();
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
    if (this.def.onDeath) { const r = this.def.onDeath(this, info); if (r === 'gib') info.cause = 'gib'; }
    g.onZombieDeath(this, info);
    const dx = info.dx || 0, dy = info.dy || 0, force = info.force || 100;
    if (info.cause === 'gib' && (Settings.goreMul() > 0 || this.def.onDeath)) {
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
    if (this.body.missing.head && rd.pts.neck && Settings.goreMul() > 0) { const nk = rd.pts.neck, pv = rd.pts.pelvis || nk; g.fx.emit(() => [nk.x, nk.y, Math.atan2(nk.y - pv.y, nk.x - pv.x)], 45, 3, { power: 1.1 }); }
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
    if (this.buffT > 0 && !this.body.headGone) {
      const j = this.body.j;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(this.game.time * 12);
      ctx.drawImage(Lighting.radial('#ff3010'), this.x + j.head.x * this.face - 10, this.y + j.head.y - 10, 20, 20); ctx.restore();
    }
  }
}
