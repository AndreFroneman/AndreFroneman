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
        this.btn('SURVIVAL', () => this.survivalSetup(), 'big'),
        this.btn('SANDBOX', () => this.sandboxSetup(), 'big'),
        this.btn('MAP CREATOR', () => App.openEditor(), 'big'),
        this.btn('SETTINGS', () => this.settings()),
        this.btn('CONTROLS', () => this.controls()),
        this.btn('ABOUT', () => this.about()),
      ),
      h('div', { class: 'footer' }, 'v1.0 · all art & audio procedurally generated · ', h('span', { class: 'dim' }, 'Esc pauses in game')));
    this.show(el, false);
  },
  back(fn) { return this.btn('BACK', fn || (() => this.mainMenu()), 'ghost'); },

  mapCards(selected, onPick, includeCustom = true) {
    const wrap = h('div', { class: 'cards maps' });
    const maps = MapLib.all().concat(includeCustom ? Custom.list() : []);
    for (const m of maps) {
      let best = 0; try { best = +localStorage.getItem('hc_best_' + m.id) || 0; } catch (e) { /* ignore */ }
      const card = h('div', { class: 'card' + (m.id === selected ? ' sel' : ''), onclick: () => { onPick(m.id); wrap.querySelectorAll('.card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); } },
        mapThumb(m, 220, 70), h('div', { class: 'card-t' }, m.name + (m.custom ? ' ✎' : '')), h('div', { class: 'card-s' }, m.subtitle || (m.custom ? 'Custom map' : '')),
        h('div', { class: 'card-d' }, m.desc || ''), best ? h('div', { class: 'card-b' }, 'Best: ' + best) : null);
      wrap.append(card);
    }
    return wrap;
  },
  survivorCards(selected, onPick) {
    const wrap = h('div', { class: 'cards survivors' });
    for (const s of SURVIVORS) {
      const card = h('div', { class: 'card' + (s.id === selected ? ' sel' : ''), onclick: () => { onPick(s.id); wrap.querySelectorAll('.card').forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); } },
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
    const el = this.screen('SURVIVAL',
      h('p', { class: 'hint' }, 'Endless waves. Earn cash for kills, headshots and dismemberment; spend it between waves on weapons, ammo, armour, medkits and planks.'),
      h('h3', {}, 'Location'), this.mapCards(S.map, (id) => { S.map = id; }),
      h('h3', {}, 'Survivor'), this.survivorCards(S.survivor, (id) => { S.survivor = id; }),
      h('h3', {}, 'Difficulty'), this.diffPicker(S.difficulty, (k) => { S.difficulty = k; }),
      h('div', { class: 'row end' }, this.back(), this.btn('START SURVIVAL', () => { this.saveSetup(); App.start('survival', { map: S.map, survivor: S.survivor, difficulty: S.difficulty }); }, 'primary')));
    this.show(el, false);
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
      h('p', { class: 'hint' }, 'Pick a map and rules, then experiment. In game press ' + keyLabel(Settings.data.bindings.sandbox[0]) + ' for live tools: spawn/remove infected and props, explosions, slow motion, AI freeze, god mode.'),
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
    const el = this.screen('CONTROLS',
      h('p', { class: 'hint' }, 'Click a binding, then press a key or mouse button. Esc cancels. Fixed: mouse aims · mouse wheel cycles weapons · Esc pauses.'),
      rows,
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
      if (top.classList.contains('gameover')) return;
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
      h('div', { class: 'row end' }, this.btn('MAIN MENU', () => App.toMenu(), 'ghost'), App.fromEditor ? this.btn('BACK TO EDITOR', () => App.backToEditor(), 'ghost') : null, this.btn('RESTART', () => App.restart(), 'primary')));
    el.classList.add('gameover');
    this.show(el, true);
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
        const locked = it.unlock && mode.wave + 1 < it.unlock;
        ammo.append(h('div', { class: 'item' + (locked ? ' locked' : '') }, h('div', { class: 'item-m' }, h('div', { class: 'item-t' }, it.label), h('div', { class: 'item-d' }, it.desc)),
          h('button', { class: 'btn tiny', disabled: locked, onclick: () => say(mode.buyItem(it), 'Bought ' + it.label) }, locked ? 'WAVE ' + it.unlock : '$' + it.price)));
      }
      body.append(weap, ammo);
    };
    render();
    const el = h('div', { class: 'screen shop' }, h('div', { class: 'panel wide' },
      h('div', { class: 'row between' }, h('h2', {}, 'SUPPLY CACHE'), cashEl),
      msg, body,
      h('div', { class: 'row end' }, this.btn('CLOSE [' + keyLabel(Settings.data.bindings.shop[0]) + ']', () => this.closeShop(), 'primary'))));
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
      h('div', { class: 'sbh' }, 'SANDBOX TOOLS', h('span', { class: 'dim' }, '  ' + keyLabel(Settings.data.bindings.sandbox[0]) + ' to close')),
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
