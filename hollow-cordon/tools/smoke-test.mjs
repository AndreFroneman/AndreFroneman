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
const appErr = await page.evaluate(() => App.errors || 0);
await browser.close();
if (errors.length || appErr) { console.error('ERRORS:\n' + errors.join('\n') + '\nApp.errors=' + appErr); process.exit(1); }
console.log('SMOKE TEST PASSED');
