// Headless smoke test: boots the game, plays each mode briefly, fails on any JS error.
// Usage: node tools/smoke-test.mjs [baseUrl] [screenshotDir]
//   (serve the folder first, e.g. `python3 -m http.server 8000`)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const base = process.argv[2] || 'http://localhost:8000/';
const shots = process.argv[3] || null;
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());
const snap = async (name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

// virtual standard-mapping gamepad (only active once a test sets window._pad)
await page.addInitScript(() => {
  window._pad = null;
  const real = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : () => [];
  navigator.getGamepads = () => (window._pad ? [window._pad] : real());
});
await page.goto(base);
await sleep(500);
await page.mouse.click(640, 360);
await page.waitForFunction(() => typeof App !== 'undefined' && App.state === 'menu', null, { timeout: 60000 });
await sleep(1500);
await snap('01-menu');

const scenario = process.argv[4] || 'all';
async function survival(map) {
  await page.evaluate((m) => App.start('survival', { map: m, survivor: 'brandt', difficulty: 'normal' }), map);
  await sleep(800);
  await snap(`02-${map}-start`);
  // start the wave and spawn a few infected close by
  await page.keyboard.press('KeyN');
  await sleep(300);
  await page.evaluate(() => {
    const g = App.game, p = g.player;
    p.give('kolba', 4); p.give('parish', 4); p.selectId('kolba');
    for (let i = 0; i < 5; i++) g.spawnZombie(i % 3 === 0 ? 'runner' : i % 3 === 1 ? 'walker' : 'crawler', p.x + 260 + i * 40, p.y, { hunt: true });
  });
  await page.mouse.move(900, 330);
  await page.mouse.down();
  await sleep(1400);
  await page.mouse.up();
  await snap(`03-${map}-firing`);
  await page.keyboard.press('Digit4');
  await sleep(300);
  for (let i = 0; i < 4; i++) { await page.mouse.click(880, 360); await sleep(650); }
  await page.keyboard.down('KeyD'); await sleep(700); await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyR');
  await sleep(1200);
  await snap(`04-${map}-after`);
  const st = await page.evaluate(() => ({ z: App.game.zombies.length, c: App.game.corpses.length, gibs: App.game.fx.gibs.length, parts: App.game.fx.parts.length, hp: App.game.player.hp, kills: App.game.mode.kills, err: App.errors || 0 }));
  console.log(map, JSON.stringify(st));
}
if (scenario === 'all' || scenario === 'survival') {
  const maps = await page.evaluate(() => MapLib.order.slice());
  for (const m of maps) await survival(m);
}
if (scenario === 'all' || scenario === 'sandbox') {
  await page.evaluate(() => App.start('sandbox', { map: 'hospital', survivor: 'okoro', difficulty: 'normal', weapons: WEAPON_LIST.map((w) => w.id), types: Object.keys(ZTYPES), autoSpawn: true, rate: 2, maxAlive: 20, startCount: 10, infiniteAmmo: true, god: true }));
  await sleep(500);
  await page.keyboard.press('Tab');
  await sleep(300);
  await page.evaluate(() => { const g = App.game; Combat.explode(g, g.player.x + 200, g.player.y - 20, 200, 300, null); });
  await page.mouse.move(800, 380); await page.mouse.down(); await sleep(1500); await page.mouse.up();
  await sleep(500);
  await snap('05-sandbox');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await sleep(300);
  await snap('06-pause');
}
if (scenario === 'all' || scenario === 'ui') {
  // menu -> survival setup -> start
  await page.evaluate(() => App.toMenu());
  await sleep(300);
  await page.click('text=SURVIVAL');
  await page.click('.survivors .card >> nth=2');
  await page.click('text=START SURVIVAL');
  await sleep(500);
  // shop: open during the break, buy something, close
  await page.keyboard.press('KeyB');
  await sleep(300);
  const before = await page.evaluate(() => App.game.mode.cash);
  await page.click('.shop .item:has-text("Medkit") button');
  const after = await page.evaluate(() => App.game.mode.cash);
  if (!(after < before)) throw new Error('shop purchase failed');
  await snap('07-shop');
  await page.keyboard.press('KeyB');
  await sleep(200);
  // remap reload to KeyT via pause -> controls
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.click('.pause button:has-text("CONTROLS")');
  await page.click('.bind:has-text("Reload") .key >> nth=0');
  await page.keyboard.press('KeyT');
  const rebound = await page.evaluate(() => Settings.data.bindings.reload[0]);
  if (rebound !== 'KeyT') throw new Error('remap failed: ' + rebound);
  await page.evaluate(() => { Settings.resetBindings(); });
  await page.click('button:has-text("DONE")');
  await page.click('button:has-text("RESUME")');
  // death -> game over -> restart
  await page.evaluate(() => App.game.player.hurt(9999, 1, null, true));
  await sleep(3200);
  await snap('08-gameover');
  await page.click('.gameover button:has-text("RESTART")');
  await sleep(500);
  const alive = await page.evaluate(() => App.state === 'game' && App.game.player && !App.game.player.dead);
  if (!alive) throw new Error('restart failed');
  // editor -> playtest -> back
  await page.evaluate(() => App.toMenu());
  await page.click('text=MAP CREATOR');
  await sleep(500);
  await page.click('.ed-tabs button:has-text("Props")');
  await page.click('.ed-item:has-text("Wooden crate")');
  await page.mouse.click(700, 450);
  await page.keyboard.press('Escape');
  await page.click('button:has-text("Playtest")');
  await sleep(800);
  const pt = await page.evaluate(() => App.state === 'game' && App.fromEditor);
  if (!pt) throw new Error('playtest failed');
  await page.keyboard.press('Escape');
  await page.click('button:has-text("BACK TO EDITOR")');
  await sleep(300);
  if (await page.evaluate(() => App.state) !== 'editor') throw new Error('back to editor failed');
  await snap('09-editor');
  console.log('UI flows OK');
}
if (scenario === 'all' || scenario === 'campaign') {
  // full campaign: menu -> new campaign -> every chapter's objectives (driven) -> ending
  await page.evaluate(() => { CampaignSave.clear(); App.toMenu(); });
  await sleep(300);
  await page.click('.menu button:has-text("CAMPAIGN")');
  await page.click('button:has-text("BEGIN CAMPAIGN")');
  for (let ch = 0; ch < 7; ch++) {
    await page.waitForSelector('.brief button:has-text("BEGIN")', { timeout: 8000 });
    if (ch === 0) await snap('10-briefing');
    await page.click('.brief button:has-text("BEGIN")');
    await sleep(300);
    await page.evaluate(() => { App.game.player.god = true; });
    await page.keyboard.press('KeyN');
    await sleep(300);
    const title = await page.evaluate(() => App.game.mode.ch.title);
    for (let guard = 0; guard < 40; guard++) {
      const st = await page.evaluate(() => { const m = App.game.mode; return m.over ? null : m.stage && { type: m.stage.type, i: m.stageI }; });
      if (!st) break;
      if (st.type === 'collect') {
        const n = await page.evaluate(() => App.game.mode.items.length);
        for (let k = 0; k < n; k++) {
          await page.evaluate((k) => { const g = App.game, it = g.mode.items[k]; g.player.x = it.x; g.player.y = it.y; g.player.vx = g.player.vy = 0; for (const z of g.zombies.slice()) z.die({ cause: 'test' }); }, k);
          await sleep(250);
          await page.keyboard.press('KeyE');
          await sleep(150);
          const taken = await page.evaluate((k) => App.game.mode.items[k].taken, k);
          if (!taken) throw new Error(`${title}: could not pick up objective item ${k}`);
          if (ch === 0 && k === 0) await snap('11-collect');
        }
      } else if (st.type === 'reach') {
        await page.evaluate(() => { const g = App.game, s = g.mode.stage; g.player.x = s.x; g.player.y = s.y; g.player.vx = g.player.vy = 0; });
        await sleep(400);
      } else if (st.type === 'hold') {
        await page.evaluate(() => { const g = App.game, s = g.mode.stage; g.player.x = s.x; g.player.y = s.y; g.player.vx = g.player.vy = 0; for (const z of g.zombies.slice()) z.die({ cause: 'test' }); });
        await sleep(250);
        await page.keyboard.down('KeyE');
        await sleep(600);
        const prog = await page.evaluate(() => App.game.mode.holdP);
        if (!(prog > 0.2)) throw new Error(`${title}: hold objective did not progress (${prog})`);
        await page.evaluate(() => { const m = App.game.mode; m.holdP = m.stage.secs - 0.2; });
        await sleep(500);
        await page.keyboard.up('KeyE');
      } else if (st.type === 'survive') {
        await page.evaluate(() => { App.game.mode.surviveT = 0.6; });
        await sleep(900);
        if (ch === 6) { const b = await page.evaluate(() => !!App.game.mode.bossSpawned); if (!b) throw new Error('final holdout boss did not spawn'); }
      } else if (st.type === 'waves' || st.type === 'kill') {
        await page.evaluate(() => { const g = App.game, m = g.mode; m.queue = []; m.subBreak = Math.min(m.subBreak, 0.05); for (const z of g.zombies.slice()) z.die({ cause: 'test' }); });
        await sleep(300);
      }
      const after = await page.evaluate(() => App.game.mode.stageI);
      if (after === st.i && st.type !== 'waves') throw new Error(`${title}: stage ${st.i} (${st.type}) did not advance`);
    }
    await sleep(2600);
    if (ch < 6) {
      await page.waitForSelector('.gameover button:has-text("CHAPTER")', { timeout: 5000 });
      if (ch === 0) await snap('12-chapter-complete');
      const sv = await page.evaluate(() => CampaignSave.load());
      if (sv.unlocked !== ch + 1 || !sv.loadout) throw new Error('campaign save not updated after chapter ' + (ch + 1));
      await page.click('.gameover button:has-text("CHAPTER")');
    } else {
      await page.waitForSelector('.ending', { timeout: 5000 });
      await snap('13-ending');
      if (!(await page.evaluate(() => CampaignSave.load().completed))) throw new Error('campaign not marked completed');
    }
    console.log('chapter', ch + 1, title, 'OK');
  }
  // carried loadout survives into a retry: die in chapter 2, retry
  await page.evaluate(() => App.start('campaign', { chapter: 1, survivor: 'brandt', difficulty: 'normal' }));
  await page.click('.brief button:has-text("BEGIN")');
  await page.evaluate(() => App.game.player.hurt(9999, 1, null, true));
  await page.waitForSelector('.gameover button:has-text("RETRY CHAPTER")', { timeout: 6000 });
  await page.click('.gameover button:has-text("RETRY CHAPTER")');
  await page.waitForSelector('.brief', { timeout: 4000 });
  console.log('campaign OK');

  // survival continue-run: finish a wave, return to menu, continue
  await page.evaluate(() => { SurvivalMode.clearRun(); App.start('survival', { map: 'police', survivor: 'okoro', difficulty: 'hard' }); });
  await sleep(300);
  await page.evaluate(() => { const m = App.game.mode; m.startWave(); m.queue = []; for (const z of App.game.zombies.slice()) z.die({ cause: 'test' }); });
  await sleep(600);
  const saved = await page.evaluate(() => SurvivalMode.loadRun());
  if (!saved || saved.wave !== 1 || saved.map !== 'police') throw new Error('survival run not saved: ' + JSON.stringify(saved));
  await page.evaluate(() => App.toMenu());
  await page.click('.menu button:has-text("SURVIVAL")');
  await page.click('.continue button:has-text("CONTINUE")');
  await sleep(500);
  const res = await page.evaluate(() => ({ w: App.game.mode.wave, d: App.game.diff && App.game.diff.label, map: App.game.map.id }));
  if (res.w !== 1 || res.map !== 'police') throw new Error('continue run failed: ' + JSON.stringify(res));
  console.log('continue run OK', JSON.stringify(res));
}
if (scenario === 'all' || scenario === 'gamepad') {
  await page.evaluate(() => { CampaignSave.clear(); App.toMenu(); window._pad = { id: 'Virtual pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; });
  const btn = async (i, ms = 90) => { await page.evaluate((i) => { window._pad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(ms); await page.evaluate((i) => { window._pad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(90); };
  const axes = (a) => page.evaluate((a) => { window._pad.axes = a; }, a);
  // menu: first press focuses the primary/first control, A activates CAMPAIGN
  await btn(13); await sleep(100);
  const f0 = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
  if (f0 !== 'CAMPAIGN') throw new Error('pad focus did not land on CAMPAIGN: ' + f0);
  await btn(13);
  const f1 = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
  if (f1 !== 'BLACKOUT') throw new Error('d-pad down did not move focus: ' + f1);
  await btn(12);
  await btn(0); await sleep(200);
  if (!(await page.evaluate(() => !!document.querySelector('.panel h2') && document.querySelector('.panel h2').textContent.startsWith('CAMPAIGN')))) throw new Error('A did not open campaign menu');
  await btn(1); await sleep(200);
  if (!(await page.evaluate(() => !!document.querySelector('.screen.main')))) throw new Error('B did not go back');
  // gameplay: sandbox, aim with right stick, move with left stick, fire with RT, jump with A, pause with Menu
  await page.evaluate(() => App.start('sandbox', { map: 'checkpoint', survivor: 'brandt', difficulty: 'normal', weapons: ['kolba', 'machete'], types: ['walker'], autoSpawn: false, infiniteAmmo: false, god: true, startCount: 0 }));
  await sleep(400);
  await page.evaluate(() => { const p = App.game.player; p.give('kolba', 2); p.selectId('kolba'); });
  await axes([0, 0, -1, -0.15]); await sleep(300);
  const aim = await page.evaluate(() => { const g = App.game, [wx] = g.screenToWorld(Input.mx, Input.my); return { using: Input.pad.using, left: wx < g.player.x, face: g.player.face }; });
  if (!aim.using || !aim.left || aim.face !== -1) throw new Error('right stick aim failed: ' + JSON.stringify(aim));
  const x0 = await page.evaluate(() => App.game.player.x);
  await axes([0.9, 0, 1, 0]); await sleep(600); await axes([0, 0, 1, 0]);
  const x1 = await page.evaluate(() => App.game.player.x);
  if (!(x1 > x0 + 40)) throw new Error('left stick move failed ' + x0 + ' -> ' + x1);
  const m0 = await page.evaluate(() => App.game.player.gun.mag);
  await btn(7, 400);
  const m1 = await page.evaluate(() => App.game.player.gun.mag);
  if (!(m1 < m0)) throw new Error('RT did not fire');
  await btn(2); // reload
  await btn(5); await sleep(100);
  const w = await page.evaluate(() => App.game.player.gun.def.id);
  await btn(0); await sleep(120);
  const air = await page.evaluate(() => !App.game.player.grounded || App.game.player.vy < 0);
  await snap('14-gamepad');
  await btn(9); await sleep(150);
  if (!(await page.evaluate(() => !!UI.pauseEl))) throw new Error('Menu button did not pause');
  const lbl = await page.evaluate(() => Input.label('interact'));
  await btn(1); await sleep(150);
  if (await page.evaluate(() => !!UI.pauseEl)) throw new Error('B did not resume');
  console.log('gamepad OK', JSON.stringify({ moved: Math.round(x1 - x0), fired: m0 - m1, switchedTo: w, jumped: air, prompt: lbl }));
  await page.evaluate(() => { window._pad = null; Input.pad.using = false; });
}
if (scenario === 'all' || scenario === 'blackout') {
  // Blackout: menu -> new escape -> three bunker levels driven through their objectives -> ending
  await page.evaluate(() => { BlackoutSave.clear(); App.toMenu(); });
  await sleep(300);
  await page.click('.menu button:has-text("BLACKOUT")');
  await page.click('button:has-text("BEGIN ESCAPE")');
  for (let lv = 0; lv < 3; lv++) {
    await page.waitForSelector('.brief button:has-text("BEGIN")', { timeout: 8000 });
    if (lv === 0) await snap('20-blackout-briefing');
    await page.click('.brief button:has-text("BEGIN")');
    await sleep(300);
    const s0 = await page.evaluate(() => {
      const g = App.game, m = g.mode, p = g.player;
      p.god = true;
      return { dark: m.blackout && g.ambient.level < 0.05, sealed: g.props.filter((q) => q.blast).every((q) => q.solid), lockers: m.lockers.length, gun: p.gun.def.cat, light: p.flashlight, title: m.ch.title };
    });
    if (!s0.dark || !s0.sealed || s0.lockers < 2 || s0.gun === 'melee' || !s0.light) throw new Error('blackout level start wrong: ' + JSON.stringify(s0));
    if (lv === 0) {
      // supply locker opens the shop with batteries for sale; battery drains while the light is on
      const lk = await page.evaluate(() => {
        const g = App.game, m = g.mode, p = g.player, k = m.lockers[0];
        p.x = k.prop.x + k.prop.w / 2; p.y = k.prop.y + k.prop.h; p.vx = p.vy = 0;
        return true;
      });
      await sleep(250);
      await page.keyboard.press('KeyE');
      await sleep(250);
      const shop = await page.evaluate(() => ({ open: UI.shopOpen, bat: [...document.querySelectorAll('.shop .item-t')].some((e) => /Battery/.test(e.textContent)), bench: !!document.querySelector('.shop .bench') }));
      if (!shop.open || !shop.bat || !shop.bench) throw new Error('supply locker shop wrong: ' + JSON.stringify(shop));
      await snap('21-blackout-locker');
      await page.evaluate(() => UI.closeShop());
      await page.keyboard.press('KeyN');
      const b0 = await page.evaluate(() => App.game.player.battery);
      await sleep(1500);
      const b1 = await page.evaluate(() => App.game.player.battery);
      if (!(b1 < b0 - 0.5)) throw new Error(`battery did not drain (${b0} -> ${b1})`);
      await snap('22-blackout-dark');
    } else await page.keyboard.press('KeyN');
    await sleep(300);
    for (let guard = 0; guard < 40; guard++) {
      const st = await page.evaluate(() => { const m = App.game.mode; return m.over ? null : m.stage && { type: m.stage.type, i: m.stageI, unlock: m.stage.unlock || null }; });
      if (!st) break;
      if (st.type === 'collect') {
        const n = await page.evaluate(() => App.game.mode.items.length);
        for (let k = 0; k < n; k++) {
          await page.evaluate((k) => { const g = App.game, it = g.mode.items[k]; g.player.x = it.x; g.player.y = it.y; g.player.vx = g.player.vy = 0; for (const z of g.zombies.slice()) z.die({ cause: 'test' }); }, k);
          await sleep(250);
          await page.keyboard.press('KeyE');
          await sleep(150);
          if (!(await page.evaluate((k) => App.game.mode.items[k].taken, k))) throw new Error(`${s0.title}: could not pick up objective item ${k}`);
        }
      } else if (st.type === 'reach') {
        await page.evaluate(() => { const g = App.game, s = g.mode.stage; g.player.x = s.x; g.player.y = s.y; g.player.vx = g.player.vy = 0; });
        await sleep(400);
      } else if (st.type === 'hold') {
        await page.evaluate(() => { const g = App.game, s = g.mode.stage; g.player.x = s.x; g.player.y = s.y; g.player.vx = g.player.vy = 0; for (const z of g.zombies.slice()) z.die({ cause: 'test' }); });
        await sleep(250);
        await page.keyboard.down('KeyE');
        await sleep(600);
        if (!(await page.evaluate(() => App.game.mode.holdP > 0.2))) throw new Error(`${s0.title}: hold objective did not progress`);
        await page.evaluate(() => { const m = App.game.mode; m.holdP = m.stage.secs - 0.2; });
        await sleep(500);
        await page.keyboard.up('KeyE');
      } else if (st.type === 'survive') {
        await page.evaluate(() => { App.game.mode.surviveT = 0.6; });
        await sleep(900);
      } else if (st.type === 'kill') {
        await page.evaluate(() => { for (const z of App.game.zombies.slice()) z.die({ cause: 'test' }); });
        await sleep(300);
      }
      const after = await page.evaluate(() => App.game.mode.stageI);
      if (after === st.i) throw new Error(`${s0.title}: stage ${st.i} (${st.type}) did not advance`);
      if (st.unlock) {
        await sleep(2600);
        const open = await page.evaluate((id) => { const d = App.game.props.find((q) => q.blast && q.id === id); return d && !d.solid; }, st.unlock);
        if (!open) throw new Error(`${s0.title}: blast door ${st.unlock} did not open`);
      }
    }
    await sleep(2600);
    if (lv < 2) {
      await page.waitForSelector('.gameover button:has-text("LEVEL")', { timeout: 5000 });
      const sv = await page.evaluate(() => BlackoutSave.load());
      if (sv.unlocked !== lv + 1 || !sv.loadout || sv.loadout.battery === undefined) throw new Error('blackout save not updated after level ' + (lv + 1));
      await page.click('.gameover button:has-text("LEVEL")');
    } else {
      await page.waitForSelector('.ending', { timeout: 5000 });
      await snap('23-blackout-ending');
      if (!(await page.evaluate(() => BlackoutSave.load().completed))) throw new Error('blackout not marked completed');
    }
    console.log('blackout level', lv + 1, s0.title, 'OK');
  }
  // outside Blackout the bunker maps play open and powered
  const sv = await page.evaluate(() => { App.start('survival', { map: 'bunker_gate', survivor: 'brandt', difficulty: 'normal' }); const g = App.game; return g.props.filter((q) => q.blast).every((q) => !q.solid) && g.lights.filter((l) => l.group).every((l) => l.on); });
  if (!sv) throw new Error('bunker map in survival should have open blast doors and power');
  console.log('blackout OK');
}
if (scenario === 'all' || scenario === 'attachments') {
  // workbench: buy + fit attachments, stats change through the effective def, they survive a save round-trip
  const r = await page.evaluate(() => {
    App.start('survival', { map: 'police', survivor: 'brandt', difficulty: 'normal' });
    const g = App.game, m = g.mode, p = g.player;
    m.cash = 99999;
    const gun = p.give('halberd', 4); p.selectId('halberd');
    const base = { noise: gun.def.noise, spread: gun.def.spread, mag: gun.def.mag, kick: gun.def.kick };
    const slots = slotsFor(gun.base);
    const bought = ['suppressor', 'laser', 'reddot', 'extmag', 'grip'].map((id) => m.buyAttachment(gun, id));
    const eff = { noise: gun.def.noise, spread: gun.def.spread, mag: gun.def.mag, kick: gun.def.kick, laser: !!gun.def.laser, optic: !!gun.def.optic, supp: !!gun.def.suppressed, snd: gun.def.sndKey };
    const L = Loadout.capture(p);
    p.weapons = []; Loadout.apply(p, L);
    const back = p.weapons.find((w) => w.def.id === 'halberd');
    const integral = ['wraith', 'lantern', 'nightjar'].map((id) => { const w = p.give(id, 1); return id + ':' + (w.def.suppressed ? 'S' : '') + (w.def.light ? 'L' : ''); });
    return { slots, bought, base, eff, restored: back && Object.values(back.att).filter(Boolean).length, integral };
  });
  if (r.bought.some((b) => b !== true)) throw new Error('attachment purchase failed: ' + JSON.stringify(r.bought));
  if (!(r.eff.noise < r.base.noise && r.eff.spread < r.base.spread && r.eff.mag > r.base.mag && r.eff.kick < r.base.kick && r.eff.laser && r.eff.optic && r.eff.supp)) throw new Error('attachment stats wrong: ' + JSON.stringify(r));
  if (r.restored !== 5) throw new Error('attachments lost in save round-trip: ' + r.restored);
  if (r.integral.join() !== 'wraith:S,lantern:L,nightjar:S') throw new Error('integral attachments wrong: ' + r.integral);
  await page.mouse.move(980, 380); await page.mouse.down(); await sleep(500); await page.mouse.up();
  await snap('24-attachments');
  console.log('attachments OK', JSON.stringify({ slots: r.slots, eff: r.eff }));
}
if (scenario === 'all' || scenario === 'windows') {
  // regression: climbing through a window must never teleport — the path is continuous and lands on a floor
  let tested = 0, refused = 0;
  for (const map of ['hospital', 'streets', 'police', 'farm']) {
    const n = await page.evaluate((map) => { App.start('sandbox', { map, survivor: 'brandt', difficulty: 'normal', weapons: ['p9'], types: ['walker'], autoSpawn: false, infiniteAmmo: true, god: true, startCount: 0 }); App.game.zombies.length = 0; App.game.aiFrozen = true; return App.game.props.filter((q) => q.isWindow).length; }, map);
    for (let wi = 0; wi < n; wi++) for (const side of [-1, 1]) {
      await page.evaluate(([wi, side]) => {
        const g = App.game, p = g.player, w = g.props.filter((q) => q.isWindow)[wi];
        w.glass = 0; w.boards = 0; w.boardHp = 0;
        p.x = w.cx + side * (w.w / 2 + 24); p.y = w.y + w.h - 2; p.vx = 0; p.vy = 0; p.vaulting = null; p.onLadder = null;
        window._w = w; window._side = side;
      }, [wi, side]);
      await sleep(450);
      const label = await page.evaluate(() => App.game.player.interactTarget && App.game.player.interactTarget.label);
      if (!label || !label.startsWith('Climb')) { refused++; continue; }
      await page.keyboard.press('KeyE');
      const path = [];
      for (let i = 0; i < 14; i++) { await sleep(80); path.push(await page.evaluate(() => [App.game.player.x, App.game.player.y, App.game.player.grounded])); }
      const r = await page.evaluate(() => ({ cx: window._w.cx, side: window._side }));
      let maxStep = 0; for (let i = 1; i < path.length; i++) maxStep = Math.max(maxStep, Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1]));
      const end = path[path.length - 1];
      if (Math.sign(end[0] - r.cx) !== -r.side || maxStep > 60 || !end[2]) throw new Error(`${map} window ${wi} side ${side}: bad climb ${JSON.stringify(path.map((q) => q.map((v) => (typeof v === 'number' ? Math.round(v) : v))))}`);
      tested++;
    }
  }
  if (tested < 6) throw new Error('too few window climbs tested: ' + tested);
  console.log('windows OK', JSON.stringify({ climbed: tested, noLandingRefused: refused }));
}
if (scenario === 'all' || scenario === 'touch') {
  // phone: a landscape Pixel 7 with real multi-touch (two thumbs at once via CDP touch events)
  const ctx = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const mp = await ctx.newPage();
  mp.on('pageerror', (e) => errors.push('touch pageerror: ' + e.message + '\n' + (e.stack || '')));
  mp.on('console', (m) => { if (m.type() === 'error') errors.push('touch console: ' + m.text()); });
  const cdp = await ctx.newCDPSession(mp);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const vp = mp.viewportSize();
  await mp.goto(base);
  await sleep(500);
  await mp.touchscreen.tap(vp.width / 2, vp.height / 2);
  await mp.waitForFunction(() => typeof App !== 'undefined' && App.state === 'menu', null, { timeout: 60000 });
  await sleep(500);
  const t0 = await mp.evaluate(() => ({ using: Touch.using, tuned: Settings.data.mobileTuned, px: App.canvas.width * App.canvas.height }));
  if (!t0.using || !t0.tuned || t0.px > 1.3e6) throw new Error('touch mode not active on a phone: ' + JSON.stringify(t0));
  if (shots) await mp.screenshot({ path: `${shots}/30-touch-menu.png` });
  await mp.tap('.menu button:has-text("SURVIVAL")');
  await mp.tap('button:has-text("START SURVIVAL")');
  await sleep(800);
  await mp.evaluate(() => { const g = App.game, p = g.player; g.zombies.length = 0; p.god = true; p.selectId('p9'); p.x = 2000; p.y = 1100; });
  if (!(await mp.evaluate(() => !document.getElementById('touch').classList.contains('hidden')))) throw new Error('touch controls hidden in game');
  // left thumb moves, right thumb aims and fires (held: the semi-auto pistol keeps firing)
  const lx = vp.width * 0.18, ly = vp.height * 0.7, rx = vp.width * 0.68, ry = vp.height * 0.55;
  const x0 = await mp.evaluate(() => App.game.player.x);
  await touch('touchStart', [[lx, ly, 1]]);
  for (let i = 1; i <= 4; i++) { await touch('touchMove', [[lx + i * 10, ly, 1]]); await sleep(16); }
  await sleep(300);
  const mag0 = await mp.evaluate(() => App.game.player.gun.mag);
  await touch('touchStart', [[lx + 40, ly, 1], [rx, ry, 2]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[lx + 40, ly, 1], [rx + i * 12, ry, 2]]); await sleep(16); }
  await sleep(900);
  const mid = await mp.evaluate(() => ({ x: App.game.player.x, mag: App.game.player.gun.mag, right: Input.act('moveRight'), fire: Input.act('fire'), mouse: Input.down.has('Mouse0') }));
  if (shots) await mp.screenshot({ path: `${shots}/31-touch-twin-stick.png` });
  await touch('touchEnd', []);
  await sleep(150);
  const rel = await mp.evaluate(() => ({ fire: Input.act('fire'), right: Input.act('moveRight') }));
  if (!(mid.x > x0 + 20) || !mid.right) throw new Error('touch move failed: ' + JSON.stringify({ x0, mid }));
  if (!(mid.mag <= mag0 - 3) || !mid.fire || mid.mouse) throw new Error('touch aim/fire failed: ' + JSON.stringify({ mag0, mid }));
  if (rel.fire || rel.right) throw new Error('touch input stuck after release: ' + JSON.stringify(rel));
  const tapEl = async (sel) => { const b = await mp.locator(sel).boundingBox(); await touch('touchStart', [[b.x + b.width / 2, b.y + b.height / 2, 9]]); await sleep(60); await touch('touchEnd', []); await sleep(120); };
  await tapEl('.b-jump');
  const air = await mp.evaluate(() => !App.game.player.grounded);
  await sleep(900);
  await mp.evaluate(() => App.game.player.give('parish', 2));
  const w0 = await mp.evaluate(() => App.game.player.gun.def.id);
  await tapEl('.b-swap'); await sleep(300);
  const w1 = await mp.evaluate(() => App.game.player.gun.def.id);
  const door = await mp.evaluate(() => { const g = App.game, p = g.player, d = g.props.find((q) => q.isDoor && !q.blast && !q.open); p.x = d.cx - 30; p.y = d.y + d.h; p.vx = 0; return d.id; });
  await sleep(300);
  const label = await mp.evaluate(() => App.game.player.interactTarget && App.game.player.interactTarget.label);
  await tapEl('.b-use');
  const opened = await mp.evaluate((id) => App.game.props.find((q) => q.id === id).open, door);
  await tapEl('.b-pause');
  const paused = await mp.evaluate(() => !!UI.pauseEl && document.getElementById('touch').classList.contains('hidden'));
  await mp.tap('.pause button:has-text("RESUME")');
  await sleep(200);
  if (!air || w1 === w0 || !opened || !paused || !/USE/.test(label || '')) throw new Error('touch buttons failed: ' + JSON.stringify({ air, w0, w1, opened, paused, label }));
  // Blackout on a phone: light button toggles the flashlight, prompts read the touch button names
  await mp.evaluate(() => { BlackoutSave.clear(); BlackoutSave.fresh('brandt', 'normal'); App.start('blackout', { chapter: 0, survivor: 'brandt', difficulty: 'normal' }); UI.pop(); Input.clear(); App.game.mode.prepT = 0; });
  await sleep(500);
  const l0 = await mp.evaluate(() => App.game.player.flashlight);
  await tapEl('.b-light');
  const l1 = await mp.evaluate(() => App.game.player.flashlight);
  if (l0 === l1) throw new Error('LIGHT button did not toggle the flashlight');
  if (shots) await mp.screenshot({ path: `${shots}/32-touch-blackout.png` });
  // portrait asks for landscape
  await mp.evaluate(() => document.fullscreenElement && document.exitFullscreen()).catch(() => {});
  await sleep(300);
  await mp.setViewportSize({ width: vp.height, height: vp.width });
  await sleep(300);
  const rot = await mp.evaluate(() => getComputedStyle(document.getElementById('rotate')).display);
  if (rot !== 'flex') throw new Error('portrait rotate prompt not shown: ' + rot);
  const appErrT = await mp.evaluate(() => App.errors || 0);
  if (appErrT) errors.push('touch App.errors=' + appErrT);
  await ctx.close();
  console.log('touch OK', JSON.stringify({ moved: Math.round(mid.x - x0), fired: mag0 - mid.mag, jumped: air, swapped: [w0, w1], door: opened, label }));
}
const appErr = await page.evaluate(() => App.errors || 0);
await browser.close();
if (errors.length || appErr) { console.error('ERRORS:\n' + errors.join('\n') + '\nApp.errors=' + appErr); process.exit(1); }
console.log('SMOKE TEST PASSED');
