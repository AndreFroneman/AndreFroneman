// Headless smoke test: boots the game, plays each mode briefly, fails on any JS error.
// Usage: node tools/smoke-test.mjs [baseUrl] [screenshotDir]
//   (serve the folder first, e.g. `python3 -m http.server 8000`)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

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
const appErr = await page.evaluate(() => App.errors || 0);
await browser.close();
if (errors.length || appErr) { console.error('ERRORS:\n' + errors.join('\n') + '\nApp.errors=' + appErr); process.exit(1); }
console.log('SMOKE TEST PASSED');
