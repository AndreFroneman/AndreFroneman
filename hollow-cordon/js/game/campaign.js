'use strict';
// =====================================================================
//  Campaign — "The Long Way Out": seven chapters across every map with
//  briefings, objective stages (collect / reach / hold / survive /
//  waves / kill), world markers, a screen-edge objective arrow,
//  progress & loadout carried between chapters, and an ending.
//  Also: Loadout (de)serialisation shared with Survival run saves.
// =====================================================================

const Loadout = {
  capture(p) {
    return {
      weapons: p.weapons.map((w) => ({ id: w.def.id, mag: w.mag, att: Object.assign({}, w.att), owned: [...(w.owned || [])] })), cur: p.gun ? p.gun.def.id : null,
      reserve: Object.assign({}, p.reserve), hp: Math.round(p.hp), armor: Math.round(p.armor),
      medkits: p.medkits, grenades: p.grenades, planks: p.planks, battery: Math.round(p.battery === undefined ? 100 : p.battery),
    };
  },
  apply(p, L) {
    if (!L) return false;
    p.weapons = []; p.cur = 0; p.prev = 0;
    for (const w of L.weapons || []) {
      const g = p.give(w.id, 0); if (!g) continue;
      g.owned = new Set((w.owned || []).filter((id) => ATTACHMENTS[id]));
      for (const sl in w.att || {}) if (w.att[sl] && g.owned.has(w.att[sl])) g.fit(sl, w.att[sl]);
      if (g.def.mag) g.mag = clamp(w.mag | 0, 0, g.def.mag);
    }
    p.battery = L.battery === undefined ? 100 : L.battery;
    if (!p.weapons.length) { p.give('machete'); p.give(p.surv.start, 4); }
    for (const k in L.reserve || {}) p.reserve[k] = L.reserve[k];
    p.hp = clamp(L.hp || 100, 25, p.maxHp); p.armor = clamp(L.armor || 0, 0, 100);
    p.medkits = L.medkits | 0; p.grenades = L.grenades | 0; p.planks = L.planks | 0;
    const i = p.weapons.findIndex((w) => w.def.id === L.cur);
    if (i >= 0) p.cur = i;
    return true;
  },
};

const CampaignSave = {
  KEY: 'hc_campaign',
  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { return null; } },
  store(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } },
  fresh(survivor, difficulty) { const s = { survivor, difficulty, unlocked: 0, cash: 200, loadout: null, kills: 0, time: 0, completed: false, started: Date.now() }; this.store(s); return s; },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ } },
};

// ---------------------------------------------------------------------
//  Chapters. Coordinates are world positions on each built-in map
//  (y = floor surface). tier gates shop unlocks; intensity drives the
//  infected mix (composeWave) and spawn pressure.
// ---------------------------------------------------------------------
const CAMPAIGN = [
  {
    id: 'ch1', map: 'hospital', title: 'Night Shift', place: 'St. Halloran Memorial Hospital', tier: 1, intensity: 1, maxAlive: 8, rate: 0.28,
    brief: [
      'Day 14 of the cordon. You have been hiding in St. Halloran since the evacuation buses stopped coming.',
      'A civilian band on the radio says a boat is taking survivors off the Kessler waterfront at dawn. Nobody with a fever gets on it — and the clinics ran out of antivirals a week ago.',
      'Wren Hale swears the last antiviral cases are still somewhere in this building. Find them, then get out before the whole ward wakes up.',
    ],
    stages: [
      { type: 'collect', text: 'Recover the antiviral cases', item: 'case', label: 'antiviral case', at: [[1500, 860], [3200, 860], [3400, 1100]] },
      { type: 'reach', text: 'Get out through the ambulance bay', x: 220, y: 1100, r: 150 },
    ],
    debrief: 'Three cases of antiviral — a handful of doses. The ambulance is dead, its siren still crying into the rain. Kessler Avenue lies between you and the river.',
  },
  {
    id: 'ch2', map: 'streets', title: 'Kessler Avenue', place: 'Kessler Avenue, river district', tier: 2, intensity: 2, maxAlive: 10, rate: 0.32,
    brief: [
      'The avenue is a corridor of wrecks and rain. Rossi\'s Pharmacy might still have a sealed storeroom.',
      'From the roof of the Calder Apartments you can see all the way down to the boat landing. If the boat is real, you will see it from there.',
    ],
    stages: [
      { type: 'reach', text: 'Reach Rossi Pharmacy', x: 1250, y: 1100, r: 130 },
      { type: 'waves', text: 'Hold the pharmacy — the noise drew a crowd', n: 2 },
      { type: 'reach', text: 'Climb to the Calder Apartments roof', x: 3300, y: 380, r: 160 },
    ],
    debrief: 'From the roof you see it: no boat. The landing is a burning ruin ringed with military floodlights. North, a police loudspeaker is still looping — Precinct 9 is calling for survivors.',
  },
  {
    id: 'ch3', map: 'police', title: 'Precinct 9', place: 'Marrow Falls PD, Precinct 9', tier: 3, intensity: 3, maxAlive: 12, rate: 0.34,
    brief: [
      'The loudspeaker leads you to Precinct 9. The doors are chained from the inside, and whoever recorded that message never came back to switch it off.',
      'The armory may still be stocked. And police radios run on the cordon network — if the backup generator still works, you can listen in on the people who built the line.',
    ],
    stages: [
      { type: 'reach', text: 'Get to the armory', x: 3200, y: 1100, r: 110 },
      { type: 'hold', text: 'Restart the backup generator in the motor pool', x: 3890, y: 1100, r: 90, secs: 10, verb: 'restart the generator' },
      { type: 'survive', text: 'Hold out while the radio warms up', secs: 60, surge: 1.4 },
      { type: 'reach', text: 'Check the radio in the chief\'s office (upstairs)', x: 3620, y: 860, r: 120 },
    ],
    debrief: 'The radio crackles onto a military channel. A clipped voice repeats coordinates: Checkpoint Sable, south gate. "Clean civilians will be processed." Clean. You think about everyone in this city who is not.',
  },
  {
    id: 'ch4', map: 'factory', title: 'The Water', place: 'Varga Steelworks, Hall 2', tier: 5, intensity: 5, maxAlive: 14, rate: 0.36, bias: { bloater: 1.8, burner: 2.5 },
    brief: [
      'The only route south that avoids the river runs through Varga Steelworks. The workers always said the fever started here — something in river intake 3.',
      'If the control room still holds the water test results, someone outside the cordon needs to see them.',
    ],
    stages: [
      { type: 'reach', text: 'Get up to the control room', x: 3800, y: 640, r: 130 },
      { type: 'collect', text: 'Take the water test results', item: 'docs', label: 'test results', at: [[3930, 640]] },
      { type: 'kill', text: 'Kill the brute breaking into the yard', ztype: 'brute', at: [4500, 1100] },
      { type: 'reach', text: 'Escape through the goods yard', x: 5080, y: 1100, r: 150 },
    ],
    debrief: 'The results are damning: Varga knew on the 2nd and the Health Authority sealed it. The cordon was never built to stop the fever. It was built to stop the story. The old Line 4 tunnels run under the south district — the one route the soldiers do not watch.',
  },
  {
    id: 'ch5', map: 'tunnels', title: 'Line 4', place: 'Kessler Station, Line 4', tier: 6, intensity: 6, maxAlive: 14, rate: 0.38, bias: { crawler: 2.2 },
    brief: [
      'Below Kessler Station the dark is total. Your flashlight is the only light for a mile.',
      'The maintenance corridor above the platform has a generator. Get it running and the east bore\'s flood doors will cycle open.',
    ],
    stages: [
      { type: 'hold', text: 'Restart the corridor generator', x: 2130, y: 760, r: 90, secs: 14, verb: 'restart the generator' },
      { type: 'survive', text: 'Survive while the flood doors cycle', secs: 75, surge: 1.5 },
      { type: 'reach', text: 'Reach the east bore exit', x: 4900, y: 1100, r: 130 },
    ],
    debrief: 'The east bore surfaces in farmland on the edge of the cordon. On the horizon, floodlights: Checkpoint Sable. Between you and it, the Hollins farm — and a pickup truck that might still run.',
  },
  {
    id: 'ch6', map: 'farm', title: 'Hollins Farm', place: 'Hollins Farm, south fields', tier: 7, intensity: 7, maxAlive: 15, rate: 0.4, bias: { leaper: 2, crawler: 1.4 },
    brief: [
      'The Hollins pickup has keys in the ignition and an empty tank. The family stashed fuel cans around the property before they... left.',
      'Dawn is three hours away. The corn moves even when there is no wind.',
    ],
    stages: [
      { type: 'collect', text: 'Find fuel cans for the truck', item: 'fuel', label: 'fuel can', at: [[1820, 860], [3100, 840], [2560, 1100]] },
      { type: 'survive', text: 'Survive until dawn while the engine primes', secs: 90, surge: 1.5 },
    ],
    debrief: 'The engine coughs and catches. You drive south with the headlights off, the antiviral cases and the Varga files on the seat beside you, toward the white glare of Checkpoint Sable.',
  },
  {
    id: 'ch7', map: 'checkpoint', title: 'Hollow Cordon', place: 'Checkpoint Sable, south gate', tier: 9, intensity: 9, maxAlive: 18, rate: 0.45, bias: { soldier: 3, riot: 0.4 }, final: true,
    brief: [
      'Sable is overrun. The soldiers who held the line now walk it.',
      'But the command post radio still reaches the outside world — and the files in your pack prove what Marrow Falls really is. Transmit them. Then survive long enough for someone to answer.',
    ],
    stages: [
      { type: 'reach', text: 'Reach the container command post', x: 2580, y: 1100, r: 110 },
      { type: 'hold', text: 'Transmit the Varga files from the radio', x: 2560, y: 1100, r: 100, secs: 16, verb: 'transmit' },
      { type: 'survive', text: 'Hold the line until the helicopter arrives', secs: 120, surge: 1.7, boss: 'brute', bossAt: 45 },
      { type: 'reach', text: 'Get to the landing zone by the inner HESCO line', x: 4180, y: 1100, r: 150 },
    ],
    debrief: '',
  },
];

const EPILOGUE = [
  'The helicopter is not military. It belongs to a news crew that heard the transmission on an open band and flew in anyway.',
  'Three days later the Varga files are on every screen outside the line. Directive 9 is suspended on the fifth day. On the sixth, the first convoy of doctors crosses the Kessler bridge — into the city, not out of it.',
  'Nobody knows how many people in Marrow Falls are still alive to treat. But the line is open now.',
  'The cordon is hollow.',
];

// a campaign = an ordered chapter list + its own save slot; Blackout registers a second one
const CAMPAIGNS = {
  campaign: { kind: 'campaign', unit: 'Chapter', title: 'CAMPAIGN — THE LONG WAY OUT', chapters: CAMPAIGN, save: CampaignSave, epilogue: EPILOGUE, endTitle: 'THE LINE IS OPEN', endWho: 'Infected killed (whole campaign)', endTime: 'Time inside the cordon' },
};

// ---------------------------------------------------------------------
class CampaignMode extends SurvivalMode {
  constructor(game, opts = {}) {
    super(game, opts);
    this.name = 'Campaign';
    this.chIndex = opts.chapter | 0;
    this.ch = this.C.chapters[this.chIndex];
    this.save = this.C.save.load() || this.C.save.fresh(opts.survivor, opts.difficulty);
    this.wave = this.ch.tier;              // drives shop unlocks & drop tables
    this.state = 'prep'; this.prepT = 20;
    this.stageI = -1; this.stage = null;
    this.items = []; this.holdP = 0; this.surviveT = 0; this.boss = null;
    this.trickleT = 4; this.subWave = 0; this.subBreak = 0;
    this.pool = composeWave(this.ch.intensity + 2, null, this.ch.bias || game.map.bias || {});
    this.cash = this.save.cash || 200;
    this.flash = 0;
  }
  get C() { return CAMPAIGNS.campaign; }
  aliveCount() { return this.game.zombies.length; }
  start() {
    const p = this.game.player;
    if (!Loadout.apply(p, this.save.loadout)) { p.give('machete'); p.give(p.surv.start, 4); p.medkits = 1; p.planks = 3; }
    p.hp = Math.max(p.hp, 70);
    Sfx.loop(this.game.map.amb || 'amb_drone', 0.5);
    UI.briefing(this.chIndex, () => {
      this.game.hud.banner(`${this.C.unit.toUpperCase()} ${this.chIndex + 1}: ${this.ch.title.toUpperCase()}`, `[${Input.label('shop')}] supply cache   ·   [${Input.label('nextWave')}] move out now`);
    }, this.C);
  }
  // ----------------------------------------------------------- update
  update(dt) {
    const g = this.game, p = g.player;
    this.time += dt;
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.flash = Math.max(0, this.flash - dt);
    if (this.over || !p) return;
    if (this.state === 'prep') {
      if (!UI.shopOpen) this.prepT -= dt;
      if (Input.actPressed('shop')) UI.toggleShop(this);
      if (this.prepT <= 0 || (Input.actPressed('nextWave') && !UI.shopOpen)) { UI.closeShop(); this.state = 'live'; this.nextStage(); }
      return;
    }
    if (Input.actPressed('shop') && !UI.shopOpen) g.hud.toast(this.noShopMsg || 'No time to shop — keep moving');
    const st = this.stage;
    if (!st) return;
    // spawning: steady trickle, surging during holdouts
    if (st.type !== 'waves') {
      this.trickleT -= dt;
      const surge = st.type === 'survive' || st.type === 'hold' ? (st.surge || 1.3) : 1;
      const maxAlive = Math.round(this.ch.maxAlive * surge);
      if (this.trickleT <= 0 && this.aliveCount() < maxAlive) {
        this.trickleT = 1 / (this.ch.rate * surge) * rand(0.6, 1.4);
        this.spawnOne(pick(this.pool));
      }
    }
    switch (st.type) {
      case 'collect':
        if (this.items.every((it) => it.taken)) this.nextStage();
        break;
      case 'reach':
        if (dist(p.x, p.y, st.x, st.y) < st.r && Math.abs(p.y - st.y) < 90) this.nextStage();
        break;
      case 'hold': {
        const near = dist(p.x, p.y, st.x, st.y) < st.r && Math.abs(p.y - st.y) < 90;
        if (near && Input.act('interact') && !p.pinnedBy) {
          this.holdP += dt;
          if ((this.holdT = (this.holdT || 0) - dt) <= 0) { this.holdT = 0.45; Sfx.play('click', { x: st.x, y: st.y, vol: 0.5, rate: 0.7 + this.holdP / st.secs }); g.noise(st.x, st.y, 900); }
        }
        if (this.holdP >= st.secs) { Sfx.play('pickup', { vol: 0.8 }); this.nextStage(); }
        break;
      }
      case 'survive':
        this.surviveT -= dt;
        if (st.boss && !this.bossSpawned && st.secs - this.surviveT >= (st.bossAt || 30)) { this.bossSpawned = true; this.boss = this.spawnOne(st.boss); g.hud.toast('Something big is coming through the line'); Sfx.play('brute_roar', { vol: 0.9 }); }
        if (this.surviveT <= 0) this.nextStage();
        break;
      case 'waves': {
        if (this.subBreak > 0) { this.subBreak -= dt; if (this.subBreak <= 0) this.startSubWave(); break; }
        this.spawnT -= dt;
        if (this.queue.length && this.spawnT <= 0 && g.zombies.length < this.ch.maxAlive + 6) { this.spawnT = rand(0.5, 1.2); this.spawnOne(this.queue.shift()); }
        if (!this.queue.length && g.zombies.length === 0) {
          if (this.subWave >= st.n) this.nextStage();
          else { this.subBreak = 6; g.hud.banner('CLEARED', 'Reload. They are not done.'); Sfx.play('wave_clear', { vol: 0.6 }); }
        }
        break;
      }
      case 'kill':
        if (this.boss && this.boss.dead) this.nextStage();
        break;
    }
  }
  startSubWave() {
    this.subWave++;
    this.queue = composeWave(this.ch.intensity + this.subWave, null, this.ch.bias || this.game.map.bias || {});
    this.spawnT = 0.5;
    Sfx.play('wave_start', { vol: 0.8, verb: 1.3 });
    this.game.hud.banner(`WAVE ${this.subWave} / ${this.stage.n}`, this.stage.text);
    this.game.noise(this.game.player.x, this.game.player.y, 99999);
  }
  nextStage() {
    const g = this.game;
    this.stageI++;
    if (this.stageI >= this.ch.stages.length) { this.complete(); return; }
    const st = this.stage = this.ch.stages[this.stageI];
    this.holdP = 0; this.flash = 1.2;
    if (st.type === 'collect') this.items = st.at.map(([x, y]) => ({ x, y, taken: false, kind: st.item, label: st.label }));
    if (st.type === 'survive') { this.surviveT = st.secs; this.bossSpawned = false; Sfx.play('wave_start', { vol: 0.8, verb: 1.3 }); g.noise(g.player.x, g.player.y, 99999); }
    if (st.type === 'waves') { this.subWave = 0; this.subBreak = 0; this.startSubWave(); return; }
    if (st.type === 'kill') {
      const [bx, by] = st.at || [g.player.x + 900, g.player.y];
      this.boss = g.spawnZombie(st.ztype, bx, by, { hunt: true });
      this.boss.hp *= 1.2; this.boss.maxHp *= 1.2;
      Sfx.play('brute_roar', { vol: 1 });
    }
    Sfx.play('ui_click', { vol: 0.6 });
    g.hud.banner(this.stageI === 0 ? 'OBJECTIVE' : 'NEW OBJECTIVE', st.text);
  }
  // ------------------------------------------------- interaction hooks
  interactables(px, py) {
    const out = [];
    const st = this.stage;
    if (!st || this.state !== 'live') return out;
    if (st.type === 'collect') for (const it of this.items) if (!it.taken && dist(it.x, it.y - 12, px, py + 30) < 75) out.push({ obj: it, label: 'Take the ' + it.label, mode: true, d: 0 });
    if (st.type === 'hold' && dist(st.x, st.y, px, py + 50) < st.r) out.push({ obj: st, label: `Hold ${Input.label('interact')}: ${st.verb} (${Math.floor(this.holdP / st.secs * 100)}%)`, mode: true, hold: true, d: 0 });
    return out;
  }
  interact(o) {
    if (this.stage && this.stage.type === 'collect' && this.items.includes(o) && !o.taken) {
      o.taken = true;
      const n = this.items.filter((it) => it.taken).length;
      Sfx.play('pickup', { vol: 0.9 }); Sfx.play('cash', { vol: 0.4 });
      this.game.hud.toast(`${o.label[0].toUpperCase() + o.label.slice(1)} ${n} / ${this.items.length}`);
      this.game.noise(o.x, o.y, 500);
    }
  }
  // ------------------------------------------------------- outcomes
  complete() {
    if (this.over) return;
    this.over = true; this.done = true;
    const p = this.game.player;
    const s = this.save;
    s.loadout = Loadout.capture(p);
    s.cash = this.cash; s.kills = (s.kills || 0) + this.kills; s.time = (s.time || 0) + this.time;
    s.unlocked = Math.max(s.unlocked || 0, Math.min(this.C.chapters.length - 1, this.chIndex + 1));
    if (this.ch.final) s.completed = true;
    this.C.save.store(s);
    Sfx.play('wave_clear', { vol: 0.9 });
    this.game.hud.banner(this.C.unit.toUpperCase() + ' COMPLETE', this.ch.title);
    const stats = [['Kills', this.kills], ['Headshots', this.headshots], ['Limbs severed', this.dismembers], ['Time', fmtTime(this.time)], ['Cash carried', '$' + this.cash]];
    this.game.later(2.2, () => (this.ch.final ? UI.ending(s, stats, this.C) : UI.chapterComplete(this.chIndex, stats, this.C)));
  }
  onPlayerDeath() {
    if (this.over) return;
    this.over = true;
    this.game.later(2.6, () => UI.gameOver({
      title: 'YOU DIED', sub: `${this.C.unit} ${this.chIndex + 1}: ${this.ch.title}`,
      stats: [['Objective', this.stage ? this.stage.text : 'Preparing'], ['Kills', this.kills], ['Time', fmtTime(this.time)]],
      retryLabel: 'RETRY ' + this.C.unit.toUpperCase(),
    }));
  }
  objectiveText() {
    const st = this.stage;
    if (this.state === 'prep') return `Moving out in ${Math.ceil(this.prepT)}s`;
    if (!st) return '';
    switch (st.type) {
      case 'collect': return `${st.text}  (${this.items.filter((i) => i.taken).length}/${this.items.length})`;
      case 'hold': return `${st.text}  —  ${Math.floor(this.holdP / st.secs * 100)}%`;
      case 'survive': return `${st.text}  —  ${fmtTime(this.surviveT)}`;
      case 'waves': return `${st.text}  —  wave ${this.subWave}/${st.n}`;
      default: return st.text;
    }
  }
  hudInfo() {
    return {
      left: [['CASH', '$' + this.cash], ['KILLS', this.kills]],
      center: `${this.C.unit.toUpperCase()} ${this.chIndex + 1}  ·  ${this.ch.title.toUpperCase()}`,
      centerSub: this.objectiveText(),
      combo: this.combo >= 3 ? 'x' + this.combo : '',
    };
  }
  // targets for markers / arrow
  targets() {
    const st = this.stage;
    if (!st || this.state !== 'live') return [];
    if (st.type === 'collect') return this.items.filter((i) => !i.taken).map((i) => [i.x, i.y - 20]);
    if (st.type === 'reach' || st.type === 'hold') return [[st.x, st.y - 40]];
    if (st.type === 'kill' && this.boss && !this.boss.dead) return [[this.boss.x, this.boss.y - this.boss.h]];
    return [];
  }
  drawWorld(ctx) {
    const st = this.stage, g = this.game, t = g.time;
    if (!st || this.state !== 'live') return;
    ctx.save();
    if (st.type === 'collect') for (const it of this.items) if (!it.taken) drawObjectiveItem(ctx, it.kind, it.x, it.y, t);
    if (st.type === 'reach') {
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(0, st.y - 320, 0, st.y);
      gr.addColorStop(0, 'rgba(120,200,255,0)'); gr.addColorStop(1, `rgba(120,200,255,${0.22 + 0.08 * Math.sin(t * 3)})`);
      ctx.fillStyle = gr; ctx.fillRect(st.x - st.r * 0.5, st.y - 320, st.r, 320);
      ctx.strokeStyle = 'rgba(140,210,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.ellipse(st.x, st.y - 2, st.r * 0.5, 6, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (st.type === 'hold') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,210,120,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(st.x, st.y - 50, 34, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,140,0.95)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(st.x, st.y - 50, 34, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(this.holdP / st.secs, 0, 1)); ctx.stroke();
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 4); ctx.drawImage(Lighting.radial('#ffd080'), st.x - 50, st.y - 100, 100, 100);
    }
    if (st.type === 'kill' && this.boss && !this.boss.dead) {
      const b = this.boss;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 40, b.y - b.h - 30, 80, 7);
      ctx.fillStyle = '#c0301e'; ctx.fillRect(b.x - 39, b.y - b.h - 29, 78 * clamp(b.hp / b.maxHp, 0, 1), 5);
    }
    ctx.restore();
  }
  drawScreen(ctx, s) {
    const g = this.game, v = g.view, p = g.player;
    if (!p || p.dead) return;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (this.flash > 0) { ctx.save(); ctx.globalAlpha = Math.min(0.35, this.flash * 0.3); ctx.fillStyle = '#c8a060'; ctx.fillRect(0, 60 * s, cw, 3 * s); ctx.restore(); }
    for (const [tx, ty] of this.targets().slice(0, 3)) {
      const [sx, sy] = g.worldToScreen(tx, ty);
      const m = 46 * s;
      const on = sx > m && sx < cw - m && sy > m && sy < ch - m;
      const dm = Math.round(dist(p.x, p.y, tx, ty) / 40);
      ctx.save();
      ctx.font = `bold ${Math.round(12 * s)}px "Arial Narrow", Arial, sans-serif`; ctx.textAlign = 'center';
      if (on) {
        const bob = Math.sin(g.time * 4) * 4 * s;
        ctx.fillStyle = '#ffd27a';
        poly(ctx, [sx, sy - 18 * s + bob, sx - 8 * s, sy - 32 * s + bob, sx + 8 * s, sy - 32 * s + bob]); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(dm + ' m', sx + 1, sy - 37 * s + bob + 1); ctx.fillStyle = '#ffe6b0'; ctx.fillText(dm + ' m', sx, sy - 37 * s + bob);
      } else {
        const cx = cw / 2, cy = ch / 2, a = Math.atan2(sy - cy, sx - cx);
        const k = Math.min((cw / 2 - m) / Math.abs(Math.cos(a) || 1e-6), (ch / 2 - m) / Math.abs(Math.sin(a) || 1e-6));
        const ex = cx + Math.cos(a) * k, ey = cy + Math.sin(a) * k;
        ctx.translate(ex, ey); ctx.rotate(a);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 17 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd27a'; poly(ctx, [12 * s, 0, -4 * s, -8 * s, -4 * s, 8 * s]); ctx.fill();
        ctx.rotate(-a); ctx.fillStyle = '#ffe6b0'; ctx.fillText(dm + ' m', 0, 30 * s);
      }
      ctx.restore();
    }
  }
}

function drawObjectiveItem(ctx, kind, x, y, t) {
  const bob = Math.sin(t * 3 + x) * 2;
  ctx.save();
  ctx.translate(x, y - 2 + bob);
  if (kind === 'case') {
    ctx.fillStyle = '#dcdad0'; roundRect(ctx, -14, -20, 28, 20, 3); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#555'; ctx.fillRect(-5, -24, 10, 4);
    ctx.fillStyle = '#b01a14'; ctx.fillRect(-2.5, -17, 5, 14); ctx.fillRect(-7, -12.5, 14, 5);
  } else if (kind === 'fuel') {
    ctx.fillStyle = '#9a1a12'; roundRect(ctx, -11, -26, 22, 26, 3); ctx.fill(); ctx.strokeStyle = '#2a0a06'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#5a5a58'; ctx.fillRect(4, -31, 5, 6); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-9, -22, 3, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(8, -6); ctx.moveTo(8, -20); ctx.lineTo(-8, -6); ctx.stroke();
  } else if (kind === 'fuse') {
    ctx.fillStyle = '#d8d0b8'; roundRect(ctx, -5, -22, 10, 20, 2); ctx.fill(); ctx.strokeStyle = '#2a2a24'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#8a8a88'; ctx.fillRect(-6, -25, 12, 4); ctx.fillRect(-6, -4, 12, 4); ctx.fillStyle = '#b01a14'; ctx.fillRect(-5, -15, 10, 4);
  } else if (kind === 'keycard') {
    ctx.rotate(-0.2); ctx.fillStyle = '#e8e4d8'; roundRect(ctx, -11, -16, 22, 14, 2); ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#1a3a7a'; ctx.fillRect(-11, -16, 22, 4); ctx.fillStyle = '#c8a830'; ctx.fillRect(-8, -10, 5, 4); ctx.fillStyle = '#555'; ctx.fillRect(0, -10, 8, 1.5); ctx.fillRect(0, -7, 6, 1.5);
  } else if (kind === 'key') {
    ctx.fillStyle = '#c8a830'; ctx.beginPath(); ctx.arc(-6, -10, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(-6, -10, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8a830'; ctx.fillRect(-1, -11.5, 14, 3); ctx.fillRect(9, -9, 2, 4); ctx.fillRect(5, -9, 2, 3); ctx.fillStyle = '#7a1a14'; ctx.fillRect(-12, -6, 6, 6);
  } else {
    ctx.fillStyle = '#c8a860'; ctx.fillRect(-13, -16, 26, 16); ctx.fillStyle = '#e8e0c8'; ctx.fillRect(-10, -19, 20, 4);
    ctx.fillStyle = '#8a1a14'; ctx.fillRect(-13, -9, 26, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.font = 'bold 5px monospace'; ctx.fillText('VARGA', -9, -11);
  }
  ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 4 + x);
  ctx.drawImage(Lighting.radial('#ffdc90'), x - 36, y - 50 + bob, 72, 72); ctx.restore();
}
