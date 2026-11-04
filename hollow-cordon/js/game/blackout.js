'use strict';
// =====================================================================
//  BLACKOUT — fight your way out of Continuity Site 7 in the dark.
//  Three long bunker levels (maps/bunker.js) built on the campaign's
//  objective stages, with:
//   · a weak, battery-limited flashlight (player.flashlightSpec) — the
//     muzzle flash is often the brightest light you have
//   · battery pickups and drops, and batteries in the supply lockers
//   · green-lit supply lockers that open the shop + weapon workbench
//   · sealed blast doors that release when a stage is done, and power
//     groups that bring dead fluorescents back on
//   · spawns limited to the sealed sector you are in
// =====================================================================

const BlackoutSave = Object.assign(Object.create(CampaignSave), { KEY: 'hc_blackout' });

const BLACKOUT = [
  {
    id: 'b1', map: 'bunker_quarantine', title: 'Quarantine Block', place: 'Continuity Site 7 — Level 3, isolation wing', tier: 2, intensity: 2, maxAlive: 8, rate: 0.2, bias: { crawler: 2, runner: 1.2 },
    brief: [
      'Continuity Site 7 was dug under Marrow Falls to keep a government alive through a nuclear war. When the fever came, the Cordon Authority used it to hold "priority cases". You were one of them.',
      'Three days ago the main power failed. The cell doors released on their failsafe. You woke up in the dark.',
      'Your flashlight is a cheap one and the battery is already low. Every shot you fire lights the corridor for a heartbeat — sometimes that is the only way to see what is coming.',
    ],
    stages: [
      { type: 'collect', text: 'Find two fuses for door circuit A', item: 'fuse', label: 'fuse', at: [[1360, 1100], [2350, 860]] },
      { type: 'hold', text: 'Seat the fuses and reset door circuit A', x: 2400, y: 1100, r: 90, secs: 8, verb: 'reset the door circuit', power: 'a', unlock: 'bd1' },
      { type: 'reach', text: 'Get to Security Checkpoint 2', x: 4500, y: 1100, r: 140 },
      { type: 'hold', text: 'Override the checkpoint PLC — the klaxon will sound', x: 4870, y: 1100, r: 90, secs: 12, surge: 1.7, verb: 'hold the override key', power: 'b', unlock: 'bd2' },
      { type: 'reach', text: 'Reach the freight lift', x: 6900, y: 1100, r: 150, power: 'c' },
      { type: 'survive', text: 'Hold out until the freight lift arrives', secs: 50, surge: 1.5 },
    ],
    debrief: 'The lift groans up one level and stops. Garrison level. The doors open on a mess hall full of overturned tables and a smell you will never forget.',
  },
  {
    id: 'b2', map: 'bunker_barracks', title: 'Barracks', place: 'Continuity Site 7 — Level 2, garrison', tier: 4, intensity: 4, maxAlive: 10, rate: 0.24, bias: { soldier: 2.5, runner: 1.2 },
    brief: [
      'Thirty-one soldiers guarded Site 7. Most of them are still here, still in uniform, still walking their rounds in the dark.',
      'The bulkhead to the generator hall needs two duty officers\' keycards. If you can start the diesel backup, the next blast door will release — and some of the lights will come back.',
    ],
    stages: [
      { type: 'reach', text: 'Get up to the armory', x: 1950, y: 860, r: 140 },
      { type: 'collect', text: 'Recover the two duty officers\' keycards', item: 'keycard', label: 'keycard', at: [[2280, 860], [2050, 1100]] },
      { type: 'hold', text: 'Swipe both keycards at Bulkhead B', x: 2900, y: 1100, r: 90, secs: 5, verb: 'cycle the bulkhead', power: 'a', unlock: 'bd1' },
      { type: 'kill', text: 'Kill the brute loose in the generator hall', ztype: 'brute', at: [4100, 1100] },
      { type: 'hold', text: 'Restart generator 3 — hold the manual start', x: 3990, y: 1100, r: 100, secs: 14, surge: 1.7, verb: 'hold the manual start', power: 'b', unlock: 'bd2' },
      { type: 'reach', text: 'Climb the ventilation stack to Level 1', x: 7400, y: 860, r: 140 },
    ],
    debrief: 'The vent stack opens into the top level of the site: command. Somewhere above it, behind forty tonnes of steel, is the surface — and it is morning.',
  },
  {
    id: 'b3', map: 'bunker_gate', title: 'Surface Gate', place: 'Continuity Site 7 — Level 1, command & surface access', tier: 6, intensity: 6, maxAlive: 12, rate: 0.27, bias: { soldier: 2, leaper: 1.5, runner: 1.3 }, final: true,
    brief: [
      'The surface gate runs on its own "air-gapped" controller. The only thing it still listens to is the SCADA terminal in continuity command.',
      'Bypass the interlock, find the two override keys to arm the gate bulkhead, then hold the ramp for the ninety seconds it takes the hydraulics to open forty tonnes of steel. They will hear it. All of them.',
    ],
    stages: [
      { type: 'reach', text: 'Reach continuity command (upper level)', x: 1900, y: 860, r: 140 },
      { type: 'hold', text: 'Bypass the gate interlock at the SCADA terminal', x: 2200, y: 860, r: 90, secs: 14, surge: 1.6, verb: 'push the override setpoints', power: 'a', unlock: 'bd1' },
      { type: 'collect', text: 'Recover the two gate override keys', item: 'key', label: 'override key', at: [[4150, 860], [4700, 1100]] },
      { type: 'hold', text: 'Arm the gate bulkhead with both keys', x: 5250, y: 1100, r: 90, secs: 6, verb: 'turn both keys', power: 'b', unlock: 'bd2' },
      { type: 'reach', text: 'Reach the surface gate controls', x: 7450, y: 1100, r: 140 },
      { type: 'survive', text: 'Hold the ramp while the surface gate grinds open', secs: 90, surge: 1.7, boss: 'brute', bossAt: 40, power: 'c', unlock: 'gate' },
      { type: 'reach', text: 'Get out — run for daylight', x: 7860, y: 1100, r: 100 },
    ],
    debrief: '',
  },
];

const BLACKOUT_EPILOGUE = [
  'The gate opens on a grey morning, rain on the concrete apron, and the first daylight you have seen in a week.',
  'Behind you the ramp is full of shapes that will not follow you into the light. Not yet.',
  'Marrow Falls is still inside the cordon. But you are out of the dark — and you know exactly what the Authority buried down there.',
  'You walk toward the city.',
];

CAMPAIGNS.blackout = {
  kind: 'blackout', unit: 'Level', noun: 'escape', title: 'BLACKOUT — CONTINUITY SITE 7', chapters: BLACKOUT, save: BlackoutSave, epilogue: BLACKOUT_EPILOGUE,
  endTitle: 'DAYLIGHT', endWho: 'Infected killed in the dark', endTime: 'Time underground',
  hint: 'Three long bunker levels under Marrow Falls, almost without light. Your flashlight is weak and its battery drains: pick up spare batteries, fit a weapon light, or fire and look while the muzzle flash lights the corridor. Green-lit supply lockers sell guns, attachments and batteries. Blast doors open as you complete objectives. Gear carries between levels; dying restarts the level with what you brought in.',
  briefHint: () => `[${Input.label('flashlight')}] toggles your flashlight — it drains the battery. Green-lit lockers are supply points: [${Input.label('interact')}] to open. Suppressors keep you quiet; lights, lasers and optics are fitted at the workbench. [${Input.label('shop')}] opens the supply cache before you move out.`,
};

SHOP_ITEMS.push({ id: 'battery', label: 'Battery pack (+40%)', desc: 'Recharges your flashlight / weapon light.', price: 70, blackout: true, buy: (p) => { if (p.battery >= 100) return false; p.battery = Math.min(100, p.battery + 40); return true; } });

class BlackoutMode extends CampaignMode {
  constructor(game, opts = {}) {
    super(game, opts);
    this.name = 'Blackout';
    this.blackout = true;
    this.prepT = 15;
    this.lockers = [];
    this.noShopMsg = 'Find a supply locker (green light)';
  }
  get C() { return CAMPAIGNS.blackout; }
  start() {
    const g = this.game, p = g.player;
    super.start();
    p.battery = Math.max(p.battery === undefined ? 100 : p.battery, 45);
    p.flashlight = true;
    if (p.gun && p.gun.def.cat === 'melee') { const w = p.weapons.find((x) => x.def.cat !== 'melee'); if (w) p.selectId(w.def.id); }
    for (const o of g.map.objects) {
      if (o.type !== 'prop' || !o.supply) continue;
      const pr = g.props.find((q) => q.kind === o.kind && Math.abs(q.x - o.x) < 1 && Math.abs(q.y - o.y) < 1);
      if (!pr) continue;
      const L = { x: pr.x + pr.w / 2, y: pr.y - 4, r: 120, color: '#40ff80', int: 0.5, kind: 'bulb', flicker: 0, clip: null, seed: Math.random() * 99, on: true };
      g.lights.push(L);
      this.lockers.push({ isLocker: true, prop: pr, light: L });
    }
  }
  update(dt) {
    super.update(dt);
    for (const k of this.lockers) { k.light.x = k.prop.x + k.prop.w / 2; k.light.y = k.prop.y - 4; }
  }
  // blast doors and power come back when the stage that controls them is done
  nextStage() {
    if (this.stage) this.stageDone(this.stage);
    super.nextStage();
  }
  stageDone(st) {
    const g = this.game;
    if (st.power) {
      let n = 0;
      for (const L of g.lights) {
        if (L.group !== st.power || L.on) continue;
        n++;
        const f0 = L.flicker;
        g.later(rand(0.1, 1.2), () => { L.on = true; L.flicker = 1; Sfx.play('click', { x: L.x, y: L.y, vol: 0.5, rate: 0.6 }); });
        g.later(rand(2, 3.2), () => { L.flicker = f0; });
      }
      if (n) g.hud.toast('Power restored to this section');
    }
    if (st.unlock) {
      for (const pr of g.props) if (pr.blast && pr.id === st.unlock) pr.release();
      g.later(0.6, () => g.hud.toast(st.unlock === 'gate' ? 'THE SURFACE GATE IS OPEN' : 'Blast door released'));
    }
  }
  // spawns stay inside the sealed sector the survivor is in
  sector() {
    const p = this.game.player; let lo = -1e9, hi = 1e9;
    for (const pr of this.game.props) if (pr.blast && pr.solid) { if (pr.cx < p.x) lo = Math.max(lo, pr.cx); else hi = Math.min(hi, pr.cx); }
    return [lo, hi];
  }
  aliveCount() { const [lo, hi] = this.sector(); return this.game.zombies.filter((z) => !z.dead && z.x > lo && z.x < hi).length; }
  pickSpawn(type) {
    const g = this.game, p = g.player, [lo, hi] = this.sector();
    const ok = (s) => s.x > lo && s.x < hi && (type === 'crawler' || s.kind !== 'vent');
    let c = g.spawns.filter((s) => ok(s) && dist(s.x, s.y, p.x, p.y) > 520);
    if (!c.length) c = g.spawns.filter((s) => ok(s) && dist(s.x, s.y, p.x, p.y) > 300);
    if (!c.length) return super.pickSpawn(type);
    return pick(c);
  }
  onKill(z, info) {
    super.onKill(z, info);
    if (!this.over && Math.random() < 0.11) this.game.pickups.push(new Pickup(this.game, z.x, z.y - 40, 'battery'));
  }
  interactables(px, py) {
    const out = super.interactables(px, py);
    for (const k of this.lockers) if (!k.prop.dead && dist(k.prop.x + k.prop.w / 2, k.prop.y + k.prop.h - 30, px, py + 30) < 70) out.unshift({ obj: k, label: 'Open supply locker', mode: true, d: 0 });
    return out;
  }
  interact(o) {
    if (o && o.isLocker) { Sfx.play('door_open', { x: o.prop.x, y: o.prop.y, vol: 0.5, rate: 1.5 }); UI.openShop(this); return; }
    super.interact(o);
  }
  drawWorld(ctx) {
    super.drawWorld(ctx);
    const t = this.game.time;
    ctx.save();
    for (const k of this.lockers) {
      const pr = k.prop; if (pr.dead) continue;
      const x = pr.x + pr.w / 2, y = pr.y;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2.5 + x);
      ctx.drawImage(Lighting.radial('#40ff80'), x - 14, y - 2, 28, 28);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#7dffa0'; ctx.font = 'bold 8px "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SUPPLY', x, y + 22);
    }
    ctx.restore();
  }
}
