'use strict';
// =====================================================================
//  UI — DOM menus & overlays: boot, main menu, mode setup, settings,
//  key remapping, pause, shop, sandbox tool panel, notes, game over.
// =====================================================================

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const UI = {
  root: null, canvas: null,
  stack: [],
  shopOpen: false,
  panel: null, panelMode: null, tool: null,
  setup: { map: 'hospital', survivor: 'brandt', difficulty: 'normal' },
  sandboxCfg: null,

  init(root, canvas) {
    this.root = root; this.canvas = canvas;
    try { Object.assign(this.setup, JSON.parse(localStorage.getItem('hc_setup') || '{}')); } catch (e) { /* ignore */ }
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.panel && this.tool && App.game && App.game.mode.applyTool) {
        const [wx, wy] = App.game.screenToWorld(Input.mx, Input.my);
        App.game.mode.applyTool(this.tool, wx, wy);
        Input.consume('Mouse0');
      }
      if (e.button === 2 && this.tool) { this.setTool(null); }
    });
    document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('button,.card')) Sfx.play('ui_hover', { vol: 0.5 }); });
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button,.card')) Sfx.play('ui_click', { vol: 0.6 }); });
  },
  saveSetup() { try { localStorage.setItem('hc_setup', JSON.stringify(this.setup)); } catch (e) { /* ignore */ } },
  clear() { this.root.innerHTML = ''; this.stack = []; this.shopOpen = false; this.panel = null; this.tool = null; this.note = null; },
  show(el, blocking = true) { el.dataset.blocking = blocking ? '1' : ''; this.root.appendChild(el); this.stack.push(el); return el; },
  pop() { const el = this.stack.pop(); if (el) el.remove(); },
  anyOverlay() { return this.stack.some((e) => e.dataset.blocking === '1'); },
  sandboxToolActive() { return !!(this.panel && this.tool); },
  screen(title, ...content) {
    return h('div', { class: 'screen' }, h('div', { class: 'panel' }, title ? h('h2', {}, title) : null, ...content));
  },
  btn(label, fn, cls = '') { return h('button', { class: 'btn ' + cls, onclick: fn }, label); },
  // in-page replacements for confirm()/alert(), which sandboxed pages silently ignore
  ask(msg, onYes, yes = 'YES', no = 'CANCEL') {
    const el = h('div', { class: 'screen ask' }, h('div', { class: 'panel narrow' }, h('p', {}, msg),
      h('div', { class: 'row end' }, this.btn(no, () => close(), 'ghost'), this.btn(yes, () => { close(); onYes(); }, 'primary'))));
    const close = () => { const i = this.stack.indexOf(el); if (i >= 0) this.stack.splice(i, 1); el.remove(); };
    this.show(el, true);
  },
  notice(msg) { this.ask(msg, () => {}, 'OK', 'CLOSE'); },

  // ------------------------------------------------------------ gamepad menu navigation
  // D-pad / left stick moves focus spatially between the controls of the
  // top-most screen, A activates, B goes back, left/right adjusts sliders
  // and cycles dropdowns.
  padNav() {
    const top = this.stack[this.stack.length - 1];
    if (!top || Input.capture) return;
    const items = [...top.querySelectorAll('button, .card[tabindex="0"], input, select')].filter((e) => e.offsetParent !== null && !e.disabled);
    if (!items.length) return;
    let cur = items.includes(document.activeElement) ? document.activeElement : null;
    const focus = (el) => {
      if (!el) return;
      for (const o of this.root.querySelectorAll('.padfocus')) o.classList.remove('padfocus');
      el.classList.add('padfocus'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      Sfx.play('ui_hover', { vol: 0.5 });
    };
    const dir = Input.navOut;
    const A = Input.keyPressed('Pad0'), B = Input.keyPressed('Pad1');
    if (!cur && (dir || A)) { focus(items.find((e) => e.classList.contains('primary')) || items[0]); Input.consume('Pad0'); return; }
    if (!cur) { if (B) this.padBack(); return; }
    if (!cur.classList.contains('padfocus')) cur.classList.add('padfocus');
    if (dir) {
      const horiz = dir === 'left' || dir === 'right', s = dir === 'left' ? -1 : 1;
      if (horiz && cur.type === 'range') { const st = +cur.step || 1; cur.value = clamp(+cur.value + s * st * Math.max(1, Math.round((cur.max - cur.min) / st / 20)), +cur.min, +cur.max); cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true })); return; }
      if (horiz && cur.tagName === 'SELECT') { cur.selectedIndex = (cur.selectedIndex + s + cur.options.length) % cur.options.length; cur.dispatchEvent(new Event('change', { bubbles: true })); return; }
      const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let best = null, bs = Infinity;
      for (const e of items) {
        if (e === cur) continue;
        const q = e.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
        const main = dir === 'down' ? dy : dir === 'up' ? -dy : dir === 'right' ? dx : -dx;
        const side = dir === 'down' || dir === 'up' ? Math.abs(dx) : Math.abs(dy);
        if (main < 6) continue;
        const sc = main + side * 2.2;
        if (sc < bs) { bs = sc; best = e; }
      }
      focus(best);
    }
    if (A) {
      Input.consume('Pad0');
      if (cur.tagName === 'SELECT') { cur.selectedIndex = (cur.selectedIndex + 1) % cur.options.length; cur.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (cur.type !== 'range') cur.click();
    }
    if (B) this.padBack();
  },
  padBack() {
    Input.consume('Pad1');
    if (App.state === 'game') { this.escape(); return; }
    const top = this.stack[this.stack.length - 1];
    const back = top && [...top.querySelectorAll('button')].find((b) => /^(BACK|DONE|CLOSE)$/.test(b.textContent.trim()));
    if (back) back.click();
  },

  // ------------------------------------------------------------ boot
  boot(onStart) {
    this.clear();
    const prog = h('div', { class: 'progress' }, h('div', { class: 'bar' }));
    const msg = h('div', { class: 'boot-msg' }, 'Click anywhere to enter the cordon');
    const el = h('div', { class: 'screen boot' }, h('div', { class: 'logo' }, h('div', { class: 'logo-main' }, 'HOLLOW CORDON'), h('div', { class: 'logo-sub' }, 'Marrow Falls is sealed. You are inside.')), msg, prog,
      h('div', { class: 'warn' }, 'Contains extreme graphic violence and gore (adjustable in Settings). Headphones recommended.'));
    this.show(el);
    const go = async () => {
      el.removeEventListener('click', go);
      msg.textContent = 'Synthesising audio…';
      prog.style.visibility = 'visible';
      await onStart((f) => { prog.firstChild.style.width = Math.round(f * 100) + '%'; });
    };
    el.addEventListener('click', go);
  },

  // ------------------------------------------------------------ main menu
  mainMenu() {
    this.clear();
    const el = h('div', { class: 'screen main' },
      h('div', { class: 'logo' }, h('div', { class: 'logo-main' }, 'HOLLOW CORDON'), h('div', { class: 'logo-sub' }, 'Marrow Falls is sealed. You are inside.')),
      h('div', { class: 'menu' },
        this.btn('CAMPAIGN', () => this.campaignMenu(), 'big'),
        this.btn('BLACKOUT', () => this.campaignMenu(CAMPAIGNS.blackout), 'big blackout'),
        this.btn('SURVIVAL', () => this.survivalSetup(), 'big'),
        this.btn('SANDBOX', () => this.sandboxSetup(), 'big'),
        this.btn('MAP CREATOR', () => App.openEditor(), 'big'),
        this.btn('SETTINGS', () => this.settings()),
        this.btn('CONTROLS', () => this.controls()),
        this.btn('ABOUT', () => this.about()),
      ),
      h('div', { class: 'install-slot' }),
      h('div', { class: 'footer' }, 'v2.0 · all art & audio procedurally generated · ', h('span', { class: 'dim' }, 'Esc pauses in game · gamepad supported')));
    this.show(el, false);
    this.refreshInstall();
  },
  // "Install app" appears when the browser reports the game is installable
  refreshInstall() {
    const slot = this.root && this.root.querySelector('.install-slot');
    if (!slot) return;
    slot.innerHTML = '';
    if (!this.installPrompt) return;
    slot.append(this.btn('⤓ INSTALL APP', async () => {
      const ev = this.installPrompt; if (!ev) return;
      this.installPrompt = null;
      try { ev.prompt(); await ev.userChoice; } catch (e) { /* dismissed */ }
      this.refreshInstall();
    }, 'ghost install'));
  },
  back(fn) { return this.btn('BACK', fn || (() => this.mainMenu()), 'ghost'); },

  mapCards(selected, onPick, includeCustom = true) {
    const wrap = h('div', { class: 'cards maps' });
    const maps = MapLib.all().concat(includeCustom ? Custom.list() : []);
    for (const m of maps) {
      let best = 0; try { best = +localStorage.getItem('hc_best_' + m.id) || 0; } catch (e) { /* ignore */ }
      const card = h('div', { class: 'card' + (m.id === selected ? ' sel' : ''), tabindex: 0, onclick: () => { onPick(m.id); wrap.querySelectorAll('.card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); } },
        mapThumb(m, 220, 70), h('div', { class: 'card-t' }, m.name + (m.custom ? ' ✎' : '')), h('div', { class: 'card-s' }, m.subtitle || (m.custom ? 'Custom map' : '')),
        h('div', { class: 'card-d' }, m.desc || ''), best ? h('div', { class: 'card-b' }, 'Best: ' + best) : null);
      wrap.append(card);
    }
    return wrap;
  },
  survivorCards(selected, onPick) {
    const wrap = h('div', { class: 'cards survivors' });
    for (const s of SURVIVORS) {
      const card = h('div', { class: 'card' + (s.id === selected ? ' sel' : ''), tabindex: 0, onclick: () => { onPick(s.id); wrap.querySelectorAll('.card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); } },
        portrait(s.look, 90, 130), h('div', { class: 'card-t' }, s.name), h('div', { class: 'card-s' }, s.role), h('div', { class: 'card-d' }, s.perk));
      wrap.append(card);
    }
    return wrap;
  },
  diffPicker(cur, onPick) {
    const wrap = h('div', { class: 'seg' });
    for (const k in DIFFICULTY) {
      const b = h('button', { class: 'segb' + (k === cur ? ' sel' : ''), onclick: () => { onPick(k); wrap.querySelectorAll('.segb').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); } }, DIFFICULTY[k].label);
      wrap.append(b);
    }
    return wrap;
  },
  survivalSetup() {
    this.clear();
    const S = this.setup;
    const run = SurvivalMode.loadRun();
    const runOk = run && MapLib.get(run.map);
    const cont = runOk ? h('div', { class: 'continue' },
      h('div', {}, h('div', { class: 'card-t' }, 'Continue run'), h('div', { class: 'card-d' }, `${run.mapName} · next wave ${run.wave + 1} · $${run.cash} · score ${run.score} · ${run.survivorName} · ${(DIFFICULTY[run.difficulty] || DIFFICULTY.normal).label}`)),
      h('div', { class: 'row' },
        this.btn('Discard', () => { SurvivalMode.clearRun(); this.survivalSetup(); }, 'ghost'),
        this.btn('CONTINUE', () => App.start('survival', { map: run.map, survivor: run.survivor, difficulty: run.difficulty, resume: run }), 'primary'))) : null;
    const el = this.screen('SURVIVAL',
      cont,
      h('p', { class: 'hint' }, 'Endless waves. Earn cash for kills, headshots and dismemberment; spend it between waves on weapons, ammo, armour, medkits and planks. Your run is saved at every wave break.'),
      h('h3', {}, 'Location'), this.mapCards(S.map, (id) => { S.map = id; }),
      h('h3', {}, 'Survivor'), this.survivorCards(S.survivor, (id) => { S.survivor = id; }),
      h('h3', {}, 'Difficulty'), this.diffPicker(S.difficulty, (k) => { S.difficulty = k; }),
      h('div', { class: 'row end' }, this.back(), this.btn('START SURVIVAL', () => { this.saveSetup(); App.start('survival', { map: S.map, survivor: S.survivor, difficulty: S.difficulty }); }, 'primary')));
    this.show(el, false);
  },
  // ------------------------------------------------------------ campaign
  // shared by the story Campaign and Blackout (C = CAMPAIGNS[kind])
  campaignMenu(C = CAMPAIGNS.campaign) {
    this.clear();
    const save = C.save.load();
    const S = this.setup;
    const unit = C.unit, noun = C.noun || 'campaign';
    const go = (i) => App.start(C.kind, { chapter: i, survivor: save.survivor, difficulty: save.difficulty });
    let chapters = null;
    if (save) {
      chapters = h('div', { class: 'chapters' });
      C.chapters.forEach((c, i) => {
        const open = i <= save.unlocked;
        const done = i < save.unlocked || (c.final && save.completed);
        chapters.append(h('div', { class: 'card chapter' + (open ? '' : ' locked'), tabindex: open ? 0 : -1, onclick: () => { if (open) go(i); } },
          mapThumb(MapLib.get(c.map), 220, 60),
          h('div', { class: 'card-s' }, unit + ' ' + (i + 1) + (done ? '  ✓' : '')),
          h('div', { class: 'card-t' }, open ? c.title : '— locked —'),
          h('div', { class: 'card-d' }, open ? c.place : '')));
      });
    }
    const startNew = () => {
      const go0 = () => { this.saveSetup(); C.save.fresh(S.survivor, S.difficulty); App.start(C.kind, { chapter: 0, survivor: S.survivor, difficulty: S.difficulty }); };
      if (save) this.ask(`Start a new ${noun}? Your current ${noun} progress will be replaced.`, go0, 'START NEW');
      else go0();
    };
    const surv = save ? SURVIVORS.find((x) => x.id === save.survivor) : null;
    const el = this.screen(C.title,
      h('p', { class: 'hint' }, C.hint || 'Seven chapters across Marrow Falls, from St. Halloran Hospital to the gates of Checkpoint Sable. Weapons, supplies and cash carry over between chapters. If you die, the chapter restarts with the gear you brought into it.'),
      save ? h('div', { class: 'continue' },
        h('div', {},
          h('div', { class: 'card-t' }, save.completed ? `${noun[0].toUpperCase() + noun.slice(1)} complete — replay any ${unit.toLowerCase()}` : `Continue: ${unit} ${save.unlocked + 1} — ${C.chapters[save.unlocked].title}`),
          h('div', { class: 'card-d' }, `${surv ? surv.name : ''} · ${(DIFFICULTY[save.difficulty] || DIFFICULTY.normal).label} · $${save.cash} · ${save.kills || 0} kills · ${fmtTime(save.time || 0)}`)),
        save.completed ? null : this.btn('CONTINUE', () => go(save.unlocked), 'primary')) : null,
      save ? h('h3', {}, unit + 's') : null, chapters,
      h('h3', {}, save ? `New ${noun} — survivor` : 'Survivor'), this.survivorCards(S.survivor, (id) => { S.survivor = id; }),
      h('h3', {}, 'Difficulty'), this.diffPicker(S.difficulty, (k) => { S.difficulty = k; }),
      h('div', { class: 'row end' }, this.back(), this.btn(save ? 'NEW ' + noun.toUpperCase() : 'BEGIN ' + noun.toUpperCase(), startNew, save ? '' : 'primary')));
    if (C.kind === 'blackout') el.classList.add('blackout');
    this.show(el, false);
  },
  briefing(i, onBegin, C = CAMPAIGNS.campaign) {
    const c = C.chapters[i];
    const el = h('div', { class: 'screen brief' + (C.kind === 'blackout' ? ' blackout' : '') }, h('div', { class: 'panel narrow' },
      h('div', { class: 'card-s' }, `${C.unit.toUpperCase()} ${i + 1} OF ${C.chapters.length}`),
      h('h2', {}, c.title.toUpperCase()),
      h('div', { class: 'sub' }, c.place),
      ...c.brief.map((p) => h('p', {}, p)),
      h('h3', {}, 'Objectives'),
      h('ol', { class: 'objectives' }, ...c.stages.map((st) => h('li', {}, st.text))),
      h('p', { class: 'hint' }, C.briefHint ? C.briefHint() : `You get a short moment to prepare: [${Input.label('shop')}] opens the supply cache, [${Input.label('nextWave')}] moves out immediately. Objective markers show on screen; [${Input.label('interact')}] picks up items and works machinery.`),
      h('div', { class: 'row end' }, this.btn('QUIT', () => App.toMenu(), 'ghost'), this.btn('BEGIN', () => { this.pop(); Input.clear(); if (onBegin) onBegin(); }, 'primary'))));
    this.show(el, true);
    Sfx.play('wave_start', { vol: 0.5 });
  },
  chapterComplete(i, stats, C = CAMPAIGNS.campaign) {
    const c = C.chapters[i], n = C.chapters[i + 1], U = C.unit.toUpperCase();
    const el = this.screen(U + ' COMPLETE',
      h('div', { class: 'sub' }, `${C.unit} ${i + 1}: ${c.title}`),
      h('p', { class: 'debrief' }, c.debrief),
      h('table', { class: 'stats' }, ...stats.map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, String(v))))),
      h('div', { class: 'row end' },
        this.btn('MAIN MENU', () => App.toMenu(), 'ghost'),
        n ? this.btn(`${U} ${i + 2}: ${n.title.toUpperCase()}`, () => { const s = C.save.load() || {}; App.start(C.kind, { chapter: i + 1, survivor: s.survivor, difficulty: s.difficulty }); }, 'primary') : null));
    el.classList.add('gameover');
    el.firstChild.classList.add('narrow');
    this.show(el, true);
  },
  ending(save, stats, C = CAMPAIGNS.campaign) {
    const surv = SURVIVORS.find((x) => x.id === save.survivor);
    const row = (k, v) => h('tr', {}, h('td', {}, k), h('td', {}, String(v)));
    const E = C.epilogue;
    const el = h('div', { class: 'screen ending' }, h('div', { class: 'panel narrow' },
      h('div', { class: 'card-s' }, 'EPILOGUE'),
      h('h2', {}, C.endTitle),
      ...E.map((p, k) => h('p', { class: k === E.length - 1 ? 'last' : '' }, p)),
      h('table', { class: 'stats' },
        row('Survivor', surv ? surv.name : ''),
        row('Difficulty', (DIFFICULTY[save.difficulty] || DIFFICULTY.normal).label),
        row(C.endWho, save.kills || 0),
        row(C.endTime, fmtTime(save.time || 0))),
      h('div', { class: 'credits' }, 'HOLLOW CORDON', h('br'), 'Design, code, art and audio generated in-engine', h('br'), 'Thank you for playing.'),
      h('div', { class: 'row end' }, this.btn('MAIN MENU', () => App.toMenu(), 'primary'))));
    el.classList.add('gameover');
    this.show(el, true);
    Sfx.play('wave_clear', { vol: 0.8 });
  },
  sandboxSetup() {
    this.clear();
    const S = this.setup;
    const C = this.sandboxCfg || (this.sandboxCfg = { weapons: WEAPON_LIST.map((w) => w.id), types: Object.keys(ZTYPES), autoSpawn: true, rate: 0.6, maxAlive: 14, startCount: 6, infiniteAmmo: true, god: false, hunt: false });
    C.weapons = C.weapons.filter((id) => WEAPONS[id]); C.types = C.types.filter((t) => ZTYPES[t]);
    const checks = (items, sel, label) => {
      const wrap = h('div', { class: 'checks' });
      for (const [id, name] of items) {
        const cb = h('input', { type: 'checkbox' }); cb.checked = sel.includes(id);
        cb.addEventListener('change', () => { if (cb.checked) { if (!sel.includes(id)) sel.push(id); } else sel.splice(sel.indexOf(id), 1); });
        wrap.append(h('label', { class: 'chk' }, cb, name));
      }
      return h('div', {}, h('div', { class: 'row' }, h('span', { class: 'lbl' }, label), this.btn('All', () => { wrap.querySelectorAll('input').forEach((i) => { i.checked = true; i.dispatchEvent(new Event('change')); }); }, 'tiny'), this.btn('None', () => { wrap.querySelectorAll('input').forEach((i) => { i.checked = false; i.dispatchEvent(new Event('change')); }); }, 'tiny')), wrap);
    };
    const el = this.screen('SANDBOX',
      h('p', { class: 'hint' }, 'Pick a map and rules, then experiment. In game press ' + Input.label('sandbox') + ' for live tools: spawn/remove infected and props, explosions, slow motion, AI freeze, god mode.'),
      h('h3', {}, 'Map'), this.mapCards(S.map, (id) => { S.map = id; }),
      h('div', { class: 'cols' },
        h('div', {}, h('h3', {}, 'Weapons'), checks(WEAPON_LIST.map((w) => [w.id, w.name]), C.weapons, 'Loadout')),
        h('div', {}, h('h3', {}, 'Infected'), checks(Object.entries(ZTYPES).map(([k, v]) => [k, v.name]), C.types, 'Allowed types'),
          h('h3', {}, 'Rules'),
          toggle('Auto-spawn infected', C.autoSpawn, (v) => { C.autoSpawn = v; }),
          slider('Spawn rate (per sec)', C.rate, 0.1, 3, 0.1, (v) => { C.rate = v; }),
          slider('Max alive', C.maxAlive, 1, 60, 1, (v) => { C.maxAlive = v; }),
          slider('Initial infected', C.startCount, 0, 40, 1, (v) => { C.startCount = v; }),
          toggle('Infinite ammunition', C.infiniteAmmo, (v) => { C.infiniteAmmo = v; }),
          toggle('Player invulnerable (god mode)', C.god, (v) => { C.god = v; }),
          toggle('Infected always know where you are', C.hunt, (v) => { C.hunt = v; }),
          h('h3', {}, 'Difficulty'), this.diffPicker(S.difficulty, (k) => { S.difficulty = k; }),
          h('h3', {}, 'Survivor'), select(SURVIVORS.map((s) => [s.id, s.name]), S.survivor, (v) => { S.survivor = v; }))),
      h('div', { class: 'row end' }, this.back(), this.btn('START SANDBOX', () => { this.saveSetup(); App.start('sandbox', Object.assign({ map: S.map, survivor: S.survivor, difficulty: S.difficulty }, C)); }, 'primary')));
    this.show(el, false);
  },

  // ------------------------------------------------------------ settings
  settings(onBack) {
    const D = Settings.data;
    const set = (k) => (v) => { Settings.set(k, v); Sfx.applyVolumes(); };
    const el = this.screen('SETTINGS',
      h('div', { class: 'cols' },
        h('div', {},
          h('h3', {}, 'Audio'),
          slider('Master volume', D.masterVolume, 0, 1, 0.05, set('masterVolume')),
          slider('Effects volume', D.sfxVolume, 0, 1, 0.05, set('sfxVolume')),
          slider('Ambience volume', D.ambienceVolume, 0, 1, 0.05, set('ambienceVolume')),
          h('h3', {}, 'Gore & performance'),
          select(GORE_LABELS.map((l, i) => [i, l]), D.goreLevel, (v) => Settings.set('goreLevel', +v), 'Gore level'),
          toggle('Dismemberment & head bursts', D.dismemberment, set('dismemberment')),
          toggle('Persistent blood stains', D.bloodPersist, set('bloodPersist')),
          slider('Corpse limit', D.corpseLimit, 0, 100, 1, set('corpseLimit')),
          slider('Particle limit', D.particleLimit, 300, 6000, 100, set('particleLimit')),
          slider('Gib limit', D.gibLimit, 20, 400, 10, set('gibLimit')),
          slider('Shell casing limit', D.shellLimit, 0, 400, 10, set('shellLimit'))),
        h('div', {},
          h('h3', {}, 'Video'),
          select([[1, 'Low (faster)'], [2, 'High']], D.lighting, (v) => Settings.set('lighting', +v), 'Lighting quality'),
          toggle('Fog & light shafts', D.fog, set('fog')),
          toggle('Film grain', D.filmGrain, set('filmGrain')),
          slider('Screen shake', D.screenShake, 0, 2, 0.1, set('screenShake')),
          slider('Camera zoom', D.cameraZoom, 0.75, 1.35, 0.05, set('cameraZoom')),
          toggle('Show FPS', D.showFps, set('showFps')),
          h('h3', {}, 'Gameplay'),
          toggle('Auto-reload on empty', D.autoReload, set('autoReload')),
          h('div', { class: 'row' }, this.btn('Reset all settings', () => { Settings.resetAll(); Sfx.applyVolumes(); this.pop(); this.settings(onBack); }, 'ghost')))),
      h('div', { class: 'row end' }, this.btn('DONE', () => { this.pop(); if (onBack) onBack(); else this.mainMenu(); }, 'primary')));
    if (!onBack) this.clear();
    this.show(el, true);
  },
  controls(onBack) {
    const rows = h('div', { class: 'binds' });
    const render = () => {
      rows.innerHTML = '';
      for (const [id, label] of ACTIONS) {
        const b = Settings.data.bindings[id];
        const cell = (i) => h('button', { class: 'key', onclick: (e) => {
          const t = e.currentTarget; t.textContent = 'press…'; t.classList.add('wait');
          const finish = (code) => {
            document.removeEventListener('mousedown', mouseCap, true);
            if (code !== 'Escape') {
              // remove duplicates from other actions
              for (const [oid] of ACTIONS) { const ob = Settings.data.bindings[oid]; const k = ob.indexOf(code); if (k >= 0 && !(oid === id && k === i)) ob.splice(k, 1); }
              b[i] = code;
            }
            Settings.save(); render();
          };
          const mouseCap = (ev) => { if (!Input.capture) return; ev.preventDefault(); ev.stopPropagation(); Input.capture = null; finish('Mouse' + ev.button); };
          setTimeout(() => document.addEventListener('mousedown', mouseCap, true), 50);
          Input.capture = finish;
        } }, keyLabel(b[i]));
        rows.append(h('div', { class: 'bind' }, h('span', {}, label), cell(0), cell(1)));
      }
    };
    render();
    const padRows = [
      ['Move / climb / crouch', 'Left stick'], ['Aim (gentle aim assist)', 'Right stick'], ['Fire / attack', 'RT'], ['Steady aim, look further', 'LT'],
      ['Jump (↓ + A: drop through)', 'A'], ['Quick melee / break free', 'B'], ['Reload', 'X'], ['Interact / use / barricade', 'Y'],
      ['Previous / next weapon', 'LB / RB'], ['Last weapon', 'R3'], ['Sprint', 'L3'], ['Flashlight', 'D-pad ↑'], ['Start next wave', 'D-pad ↓'],
      ['Medkit', 'D-pad ←'], ['Grenade', 'D-pad →'], ['Shop / sandbox tools', 'View'], ['Pause', 'Menu'], ['Menus', 'D-pad / stick · A select · B back'],
    ];
    const pad = h('div', { class: 'binds pad' }, ...padRows.map(([a, b]) => h('div', { class: 'bind' }, h('span', {}, a), h('span', { class: 'padkey' }, b))));
    const el = this.screen('CONTROLS',
      h('p', { class: 'hint' }, 'Click a binding, then press a key or mouse button. Esc cancels. Fixed: mouse aims · mouse wheel cycles weapons · Esc pauses.'),
      rows,
      h('h3', {}, 'Gamepad ' + (Input.pad.connected ? '— connected: ' + Input.pad.id.slice(0, 48) : '— connect any standard controller and press a button')),
      pad,
      h('div', { class: 'row end' }, this.btn('Reset to defaults', () => { Settings.resetBindings(); render(); }, 'ghost'), this.btn('DONE', () => { this.pop(); if (onBack) onBack(); else this.mainMenu(); }, 'primary')));
    if (!onBack) this.clear();
    this.show(el, true);
  },
  about() {
    this.clear();
    const el = this.screen('ABOUT',
      h('p', {}, 'HOLLOW CORDON is a 2D side-view survival shooter set inside the quarantine line around Marrow Falls after the outbreak of the Pale Fever.'),
      h('p', {}, 'Built with plain JavaScript, HTML5 Canvas and the Web Audio API. Every texture, character, weapon, prop and sound effect is generated procedurally at runtime — there are no external asset files.'),
      h('p', { class: 'dim' }, 'Inspired by the gritty atmosphere and weighty physics of classic side-view zombie shooters. All names, characters, maps and assets are original.'),
      h('div', { class: 'row end' }, this.back()));
    this.show(el, false);
  },

  // ------------------------------------------------------------ in-game overlays
  pause() {
    if (this.anyOverlay()) return;
    const el = this.screen('PAUSED',
      h('div', { class: 'menu' },
        this.btn('RESUME', () => this.resume(), 'big'),
        this.btn('RESTART', () => App.restart()),
        this.btn('SETTINGS', () => { el.style.display = 'none'; this.settings(() => { el.style.display = ''; }); }),
        this.btn('CONTROLS', () => { el.style.display = 'none'; this.controls(() => { el.style.display = ''; }); }),
        App.fromEditor ? this.btn('BACK TO EDITOR', () => App.backToEditor()) : null,
        this.btn('QUIT TO MENU', () => App.toMenu(), 'ghost')));
    el.classList.add('pause');
    this.show(el, true);
    this.pauseEl = el;
  },
  resume() { while (this.stack.length && this.stack[this.stack.length - 1] !== this.panel) { const top = this.stack[this.stack.length - 1]; if (top.dataset.blocking !== '1') break; this.pop(); } this.pauseEl = null; this.note = null; this.shopOpen = false; Input.clear(); },
  escape() {
    // close the top-most overlay, or pause
    if (Input.capture) return;
    if (this.note) { this.closeNote(); return; }
    if (this.shopOpen) { this.closeShop(); return; }
    if (this.anyOverlay()) {
      const top = this.stack[this.stack.length - 1];
      if (top === this.pauseEl) { this.resume(); return; }
      if (top.classList.contains('gameover') || top.classList.contains('brief')) return;
      this.pop(); if (this.pauseEl) this.pauseEl.style.display = '';
      return;
    }
    if (this.panel) { this.toggleSandboxPanel(); return; }
    this.pause();
  },
  showNote(n) {
    if (this.note) return;
    const el = h('div', { class: 'screen notebg', onclick: () => this.closeNote() }, h('div', { class: 'note' }, h('div', { class: 'note-t' }, n.title), h('div', { class: 'note-b' }, n.text), h('div', { class: 'note-f' }, 'click or press Esc / E to close')));
    this.note = el; this.show(el, true);
    Sfx.play('ui_click');
  },
  closeNote() { if (!this.note) return; const i = this.stack.indexOf(this.note); if (i >= 0) this.stack.splice(i, 1); this.note.remove(); this.note = null; Input.clear(); },
  gameOver(o) {
    const el = this.screen(o.title,
      h('div', { class: 'sub' }, o.sub || ''),
      h('table', { class: 'stats' }, ...(o.stats || []).map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, String(v))))),
      h('div', { class: 'row end' }, this.btn('MAIN MENU', () => App.toMenu(), 'ghost'), App.fromEditor ? this.btn('BACK TO EDITOR', () => App.backToEditor(), 'ghost') : null, this.btn(o.retryLabel || 'RESTART', () => App.restart(), 'primary')));
    el.classList.add('gameover');
    this.show(el, true);
  },

  openBench(mode) {
    if (this.anyOverlay()) return;
    const p = mode.game.player, body = h('div', { class: 'shop-body one' }), msg = h('div', { class: 'shop-msg' });
    const say = (r, ok) => { msg.textContent = r === true ? ok : r; msg.className = 'shop-msg ' + (r === true ? 'ok' : 'bad'); render(); };
    const render = () => { body.innerHTML = ''; body.append(this.workbenchCol(mode, p, say, true)); };
    render();
    const el = h('div', { class: 'screen shop' }, h('div', { class: 'panel narrow' }, h('h2', {}, 'WORKBENCH'), h('p', { class: 'hint' }, 'Sandbox: every attachment is free.'), msg, body,
      h('div', { class: 'row end' }, this.btn('CLOSE', () => { const i = this.stack.indexOf(el); if (i >= 0) this.stack.splice(i, 1); el.remove(); this.shopOpen = false; Input.clear(); }, 'primary'))));
    this.shopEl = el; this.shopOpen = true; this.show(el, true);
  },
  // ------------------------------------------------------------ workbench
  // Fit attachments to any carried firearm: buy once per gun, then swap freely.
  workbenchCol(mode, p, say, free) {
    const col = h('div', { class: 'shop-col bench' }, h('h3', {}, 'Workbench — attachments'));
    const guns = p.weapons.filter((w) => w.def.cat !== 'melee' && (slotsFor(w.base).length || (w.base.integral || []).length));
    if (!guns.length) { col.append(h('div', { class: 'dim' }, 'Carry a firearm that takes attachments.')); return col; }
    let g = guns.find((w) => w.base.id === this.benchGun) || (p.gun && guns.includes(p.gun) ? p.gun : guns[0]);
    this.benchGun = g.base.id;
    const pick = h('div', { class: 'bench-guns' });
    for (const w of guns) pick.append(h('button', { class: 'btn tiny' + (w === g ? ' sel' : ''), onclick: () => { this.benchGun = w.base.id; say(true, ''); } }, w.base.name));
    col.append(pick);
    const icon = GunArt.get(g.base).icon, ic = h('canvas', { width: icon.width, height: icon.height, class: 'gicon big' }); ic.getContext('2d').drawImage(icon, 0, 0);
    col.append(h('div', { class: 'bench-head' }, ic, h('div', {}, h('div', { class: 'item-t' }, g.base.name), h('div', { class: 'item-d' }, (g.base.integral || []).length ? 'Built in: ' + g.base.integral.map((k) => ATTACHMENTS[k].name.toLowerCase()).join(', ') : ''))));
    for (const sl of slotsFor(g.base)) {
      col.append(h('div', { class: 'cat' }, SLOT_LABEL[sl] + (g.att[sl] ? ' — ' + ATTACHMENTS[g.att[sl]].name : ' — empty')));
      for (const id of Object.keys(ATTACHMENTS).filter((k) => ATTACHMENTS[k].slot === sl)) {
        const a = ATTACHMENTS[id], fitted = g.att[sl] === id, owned = free || g.owned.has(id);
        const btn = fitted ? this.btn('REMOVE', () => { g.fit(sl, null); Sfx.play('click'); say(true, a.name + ' removed'); }, 'tiny ghost')
          : owned ? this.btn('FIT', () => { g.owned.add(id); g.fit(sl, id); Sfx.play('mag_in', { vol: 0.6 }); say(true, a.name + ' fitted to the ' + g.base.name); }, 'tiny')
          : this.btn('$' + a.price, () => say(mode.buyAttachment(g, id), a.name + ' fitted to the ' + g.base.name), 'tiny');
        col.append(h('div', { class: 'item' + (fitted ? ' owned' : '') }, h('div', { class: 'item-m' }, h('div', { class: 'item-t' }, a.name), h('div', { class: 'item-d' }, a.desc)), btn));
      }
    }
    return col;
  },

  // ------------------------------------------------------------ shop
  toggleShop(mode) { if (this.shopOpen) this.closeShop(); else this.openShop(mode); },
  closeShop() { if (!this.shopOpen) return; const el = this.shopEl; const i = this.stack.indexOf(el); if (i >= 0) this.stack.splice(i, 1); el.remove(); this.shopOpen = false; Input.clear(); },
  openShop(mode) {
    if (this.anyOverlay()) return;
    const p = mode.game.player;
    const cashEl = h('span', { class: 'cash' });
    const body = h('div', { class: 'shop-body' });
    const msg = h('div', { class: 'shop-msg' });
    const say = (r, ok) => { msg.textContent = r === true ? ok : r; msg.className = 'shop-msg ' + (r === true ? 'ok' : 'bad'); render(); };
    const statBar = (label, v) => h('div', { class: 'sb' }, h('span', {}, label), h('div', { class: 'sbar' }, h('div', { style: { width: Math.round(clamp(v, 0, 1) * 100) + '%' } })));
    const render = () => {
      cashEl.textContent = '$' + mode.cash;
      body.innerHTML = '';
      const weap = h('div', { class: 'shop-col' }, h('h3', {}, 'Weapons'));
      for (const cat of Object.keys(CAT_LABEL)) {
        const list = mode.shopWeapons().filter((w) => w.cat === cat);
        if (!list.length) continue;
        weap.append(h('div', { class: 'cat' }, CAT_LABEL[cat] + '  [' + list[0].slot + ']'));
        for (const w of list) {
          const owned = p.weapons.some((x) => x.def.id === w.id);
          const locked = mode.wave + 1 < w.unlock;
          const icon = GunArt.get(w).icon; const ic = h('canvas', { width: icon.width, height: icon.height, class: 'gicon' }); ic.getContext('2d').drawImage(icon, 0, 0);
          const dps = w.cat === 'melee' ? w.dmg / (w.windup + w.swing + w.recoverT) : w.dmg * w.pellets * w.rpm / 60;
          weap.append(h('div', { class: 'item' + (owned ? ' owned' : '') + (locked ? ' locked' : '') },
            ic, h('div', { class: 'item-m' }, h('div', { class: 'item-t' }, w.name), h('div', { class: 'item-d' }, w.desc),
              h('div', { class: 'stats-mini' }, statBar('DMG', w.dmg * w.pellets / 160), statBar('DPS', dps / 900), w.cat !== 'melee' ? statBar('ACC', 1 - w.spread / 0.09) : statBar('REACH', w.reach / 90), w.cat !== 'melee' ? statBar('MAG', w.mag / 100) : null)),
            h('button', { class: 'btn tiny', disabled: owned || locked, onclick: () => say(mode.buyWeapon(w), 'Bought ' + w.name) }, owned ? 'OWNED' : locked ? 'WAVE ' + w.unlock : '$' + w.price)));
        }
      }
      const ammo = h('div', { class: 'shop-col' }, h('h3', {}, 'Ammunition'));
      const types = [...new Set(p.weapons.filter((w) => w.def.cat !== 'melee').map((w) => w.def.ammo))];
      if (!types.length) ammo.append(h('div', { class: 'dim' }, 'Buy a firearm first.'));
      for (const t of types) {
        const a = AMMO[t];
        ammo.append(h('div', { class: 'item' }, h('div', { class: 'item-m' }, h('div', { class: 'item-t' }, a.name + ' ×' + a.box), h('div', { class: 'item-d' }, 'Carried: ' + (p.reserve[t] || 0) + ' / ' + a.max)),
          h('button', { class: 'btn tiny', onclick: () => say(mode.buyAmmo(t), 'Bought ' + a.name) }, '$' + a.price)));
      }
      ammo.append(h('h3', {}, 'Equipment'));
      for (const it of SHOP_ITEMS) {
        if (it.blackout && !mode.blackout) continue;
        const locked = it.unlock && mode.wave + 1 < it.unlock;
        ammo.append(h('div', { class: 'item' + (locked ? ' locked' : '') }, h('div', { class: 'item-m' }, h('div', { class: 'item-t' }, it.label), h('div', { class: 'item-d' }, it.desc)),
          h('button', { class: 'btn tiny', disabled: locked, onclick: () => say(mode.buyItem(it), 'Bought ' + it.label) }, locked ? 'WAVE ' + it.unlock : '$' + it.price)));
      }
      body.append(weap, ammo, this.workbenchCol(mode, p, say, false));
    };
    render();
    const el = h('div', { class: 'screen shop' }, h('div', { class: 'panel wide' },
      h('div', { class: 'row between' }, h('h2', {}, 'SUPPLY CACHE'), cashEl),
      msg, body,
      h('div', { class: 'row end' }, this.btn('CLOSE [' + Input.label('shop') + ']', () => this.closeShop(), 'primary'))));
    this.shopEl = el; this.shopOpen = true;
    this.show(el, true);
  },

  // ------------------------------------------------------------ sandbox panel
  setTool(t) {
    this.tool = t;
    if (this.panel) this.panel.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
    this.canvas.classList.toggle('tool', !!t);
  },
  toggleSandboxPanel(mode) {
    if (this.panel) { const i = this.stack.indexOf(this.panel); if (i >= 0) this.stack.splice(i, 1); this.panel.remove(); this.panel = null; this.setTool(null); this.canvas.classList.remove('cursor'); return; }
    mode = mode || App.game.mode;
    const g = mode.game;
    const toolBtn = (id, label) => h('button', { class: 'btn tiny', 'data-tool': id, onclick: () => this.setTool(this.tool === id ? null : id) }, label);
    const act = (label, fn) => h('button', { class: 'btn tiny', onclick: fn }, label);
    const tog = (label, get, set) => { const b = h('button', { class: 'btn tiny' + (get() ? ' on' : '') }, label); b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); }); return b; };
    const p = g.player;
    const el = h('div', { class: 'sbpanel' },
      h('div', { class: 'sbh' }, 'SANDBOX TOOLS', h('span', { class: 'dim' }, '  ' + Input.label('sandbox') + ' to close')),
      h('div', { class: 'hint' }, 'Select a tool, then left-click in the world. Right-click clears the tool.'),
      h('div', { class: 'sbs' }, 'Spawn infected'), h('div', { class: 'grid' }, ...Object.entries(ZTYPES).map(([k, v]) => toolBtn('z:' + k, v.name))),
      h('div', { class: 'sbs' }, 'Spawn props'), h('div', { class: 'grid' }, ...Object.entries(PROP_DEFS).filter(([, d]) => d.w < 260).map(([k, d]) => toolBtn('p:' + k, d.label))),
      h('div', { class: 'sbs' }, 'World tools'), h('div', { class: 'grid' }, toolBtn('remove', 'Remove (click)'), toolBtn('explode', 'Explosion'), toolBtn('fire', 'Fire')),
      h('div', { class: 'sbs' }, 'Actions'),
      h('div', { class: 'grid' },
        act('Spawn horde ×10', () => { for (let i = 0; i < 10; i++) mode.spawnRandom(); }),
        act('Kill all', () => { for (const z of g.zombies.slice()) z.die({ cause: 'body', dx: 0, dy: -1, force: 50 }); }),
        act('Remove all infected', () => { g.zombies.length = 0; }),
        act('Clear corpses', () => { g.corpses.length = 0; }),
        act('Clear blood & gibs', () => { g.fx.clearBlood(); }),
        act('Refill / heal', () => { if (p) { p.hp = p.maxHp; for (const w of p.weapons) { if (w.def.cat !== 'melee') { w.mag = w.def.mag; p.reserve[w.def.ammo] = AMMO[w.def.ammo].max; } } p.medkits = 5; p.grenades = 6; } }),
        act('Give all weapons', () => { if (p) for (const w of WEAPON_LIST) p.give(w.id, 4); }),
        act('Weapon workbench', () => this.openBench(mode)),
        tog('God mode', () => p && p.god, (v) => { if (p) p.god = v; }),
        tog('Infinite ammo', () => p && p.infAmmo, (v) => { if (p) p.infAmmo = v; }),
        tog('Slow motion', () => g.timeScale < 1, (v) => { g.timeScale = v ? 0.3 : 1; }),
        tog('Freeze AI', () => g.aiFrozen, (v) => { g.aiFrozen = v; }),
        tog('Auto-spawn', () => mode.auto, (v) => { mode.auto = v; }),
        tog('Infected hunt you', () => !!mode.opts.hunt, (v) => { mode.opts.hunt = v; for (const z of g.zombies) z.hunt = v; })));
    this.panel = el;
    this.show(el, false);
    this.canvas.classList.add('cursor');
  },
};

// ---------------------------------------------------------------- widgets
function slider(label, val, min, max, step, onChange) {
  const out = h('span', { class: 'val' }, fmtVal(val, step));
  const inp = h('input', { type: 'range', min, max, step, value: val });
  inp.addEventListener('input', () => { out.textContent = fmtVal(+inp.value, step); onChange(+inp.value); });
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), inp, out);
}
function fmtVal(v, step) { return step >= 1 ? String(Math.round(v)) : step >= 0.1 ? v.toFixed(1) : v.toFixed(2); }
function toggle(label, val, onChange) {
  const cb = h('input', { type: 'checkbox' }); cb.checked = !!val;
  cb.addEventListener('change', () => onChange(cb.checked));
  return h('label', { class: 'field chk' }, cb, h('span', { class: 'lbl' }, label));
}
function select(opts, val, onChange, label) {
  const sel = h('select', {});
  for (const [v, l] of opts) { const o = h('option', { value: v }, l); if (String(v) === String(val)) o.selected = true; sel.append(o); }
  sel.addEventListener('change', () => onChange(sel.value));
  return label ? h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), sel) : sel;
}
function portrait(look, w, h2) {
  const cv = h('canvas', { width: w * 2, height: h2 * 2, class: 'portrait' });
  const c = cv.getContext('2d');
  const b = new Body(look, 1, 1, 1);
  b.pose = Body.standPose(b.d); b.pose.uaF = 1.75; b.pose.faF = 1.2; b.pose.uaB = 1.4; b.pose.faB = 1.5; b.pose.thF = 1.45; b.pose.thB = 1.68; b.pose.head = -1.45;
  b.fk(true);
  const g = c.createLinearGradient(0, 0, 0, cv.height); g.addColorStop(0, '#1a1c22'); g.addColorStop(1, '#0a0b0e');
  c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height);
  c.save(); c.scale(2.4, 2.4); b.draw(c, w / 2.4 + 2, h2 / 2.4 * 2 - 6, 1, null); c.restore();
  return cv;
}
function mapThumb(m, w, h2) {
  const cv = h('canvas', { width: w * 2, height: h2 * 2, class: 'thumb' });
  const c = cv.getContext('2d');
  const sc = Math.min(cv.width / m.width, cv.height / (m.height * 0.75));
  const oy = cv.height - m.height * sc;
  c.fillStyle = '#0c0d10'; c.fillRect(0, 0, cv.width, cv.height);
  c.save(); c.translate(0, oy + 20); c.scale(sc, sc);
  for (const o of m.objects) {
    if (o.type === 'backwall') { c.fillStyle = '#2a2e34'; c.fillRect(o.x, o.y, o.w, o.h); }
  }
  for (const o of m.objects) {
    if (o.type === 'block' || o.type === 'platform') { c.fillStyle = o.type === 'platform' ? '#6a6458' : '#8a8478'; c.fillRect(o.x, o.y, o.w, o.h || 10); }
    if (o.type === 'light') { c.fillStyle = 'rgba(255,200,120,0.6)'; c.beginPath(); c.arc(o.x, o.y, 22, 0, TAU); c.fill(); }
    if (o.type === 'prop' && PROP_DEFS[o.kind]) { c.fillStyle = '#4a4438'; const d = PROP_DEFS[o.kind]; c.fillRect(o.x, o.y, d.w, d.h); }
  }
  c.restore();
  return cv;
}
