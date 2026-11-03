'use strict';
// =====================================================================
//  App — boot, main loop, state machine (menu / game / editor)
// =====================================================================

const App = {
  canvas: null, ctx: null,
  game: null, editor: null,
  state: 'boot',
  last: 0,
  lastMode: null, lastOpts: null,
  fromEditor: false,

  init() {
    Settings.load();
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init(this.canvas);
    UI.init(document.getElementById('ui'), this.canvas);
    UI.boot(async (progress) => {
      await Sfx.init(progress);
      genWeaponSounds();
      Sfx.resume();
      Tex.warm();
      this.toMenu();
    });
    requestAnimationFrame((t) => this.loop(t));
  },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = window.innerWidth * dpr, h = window.innerHeight * dpr;
    const maxPx = 2.4e6;
    if (w * h > maxPx) { const k = Math.sqrt(maxPx / (w * h)); w *= k; h *= k; }
    this.canvas.width = Math.max(320, w | 0); this.canvas.height = Math.max(200, h | 0);
  },
  destroyGame() { if (this.game) { this.game.destroy(); this.game = null; } },
  toMenu() {
    this.destroyGame();
    this.fromEditor = false;
    if (this.editor) { this.editor.close(); this.editor = null; }
    const m = MapLib.get('hospital');
    this.game = new Game(deepClone(m), { noPlayer: true, modeFactory: (g) => new AttractMode(g), zoom: 0.85, noPreplaced: true });
    Sfx.loop('amb_drone', 0.35);
    this.state = 'menu';
    Input.gameFocus = false;
    this.canvas.className = '';
    UI.mainMenu();
  },
  start(kind, opts, mapOverride) {
    this.destroyGame();
    this.lastMode = kind; this.lastOpts = opts; this.lastMapOverride = mapOverride || null;
    if (kind === 'campaign') opts.map = CAMPAIGN[opts.chapter | 0].map;
    const map = mapOverride || MapLib.get(opts.map) || MapLib.get('hospital');
    const err = Custom.validate(map);
    if (err) { this.toMenu(); UI.notice(err); return; }
    const survivor = SURVIVORS.find((s) => s.id === opts.survivor) || SURVIVORS[0];
    UI.clear();
    this.game = new Game(deepClone(map), {
      survivor, difficulty: opts.difficulty, noPreplaced: kind === 'survival',
      modeFactory: (g) => (kind === 'survival' ? new SurvivalMode(g, opts) : kind === 'campaign' ? new CampaignMode(g, opts) : new SandboxMode(g, opts)),
    });
    this.state = 'game';
    Input.gameFocus = true;
    Input.clear();
    this.canvas.className = 'ingame';
  },
  restart() {
    if (!this.lastMode) return;
    const o = Object.assign({}, this.lastOpts);
    delete o.resume; // a restart begins a fresh run
    this.start(this.lastMode, o, this.lastMapOverride);
  },
  openEditor() {
    this.destroyGame();
    UI.clear();
    this.state = 'editor';
    Input.gameFocus = true;
    this.canvas.className = 'editor';
    Sfx.stopLoops(0.5);
    if (typeof Editor === 'undefined') { this.toMenu(); UI.notice('Map creator is not available in this build.'); return; }
    this.editor = this.editor || new Editor(this.canvas);
    this.editor.open();
  },
  playtest(map) {
    this.fromEditor = true;
    this.editor.hide();
    this.start('sandbox', { map: map.id, survivor: UI.setup.survivor, difficulty: 'normal', weapons: WEAPON_LIST.map((w) => w.id), types: Object.keys(ZTYPES), autoSpawn: false, infiniteAmmo: true, god: false, startCount: 0, playtest: true }, map);
  },
  backToEditor() {
    this.destroyGame();
    UI.clear();
    this.fromEditor = false;
    this.state = 'editor';
    this.canvas.className = 'editor';
    Sfx.stopLoops(0.5);
    this.editor.open();
  },

  loop(t) {
    const dt = Math.min(0.033, Math.max(0.0001, (t - (this.last || t)) / 1000));
    this.last = t;
    try {
      Input.pollPad(dt);
      if (Input.pad.using) {
        const overlay = UI.anyOverlay();
        if (this.state === 'game' && this.game && !overlay) Input.padAim(this.game, dt);
        if ((this.state === 'menu' || this.state === 'game') && (overlay || this.state === 'menu')) UI.padNav();
      }
      if (this.state === 'game' && this.game) {
        if (Input.keyPressed('Escape')) UI.escape();
        if (UI.note && Input.actPressed('interact')) UI.closeNote();
        else if (UI.shopOpen && Input.actPressed('shop')) UI.closeShop();
        if (!UI.anyOverlay()) this.game.update(dt);
        this.game.render(this.ctx);
      } else if (this.state === 'menu' && this.game) {
        if (Input.keyPressed('Escape') && UI.stack.length && UI.stack[UI.stack.length - 1].dataset.blocking === '1') { UI.pop(); if (!UI.stack.length) UI.mainMenu(); }
        this.game.update(dt);
        this.game.render(this.ctx);
      } else if (this.state === 'editor' && this.editor) {
        this.editor.update(dt);
        this.editor.render(this.ctx);
      } else {
        const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#050506'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    } catch (e) {
      console.error(e);
      this.errors = (this.errors || 0) + 1;
    }
    Input.endFrame();
    requestAnimationFrame((tt) => this.loop(tt));
  },
};

window.addEventListener('load', () => App.init());

// ---- installable web app: offline service worker + "Install app" button.
// Only over http(s): the desktop app and file:// launches don't need it.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* sandboxed page */ }
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); UI.installPrompt = e; UI.refreshInstall(); });
window.addEventListener('appinstalled', () => { UI.installPrompt = null; UI.refreshInstall(); });
