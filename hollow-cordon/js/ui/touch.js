'use strict';
// =====================================================================
//  Touch — on-screen controls for phones and tablets.
//   · left side: floating move stick. Up takes ladders and stairs, down
//     crouches and drops through floors, and pushing past the rim
//     sprints.
//   · right side: floating aim stick. It aims through the gamepad aim
//     code (with its gentle aim assist); pushed past half-way it fires,
//     and keeps semi-auto, pump and bolt guns firing while it is held.
//   · buttons: jump, use (hold it for hold objectives), reload, melee,
//     swap, steady aim, light, grenade, medkit, pause, plus shop / go /
//     tools when the mode offers them. Tapping the weapon readout also
//     swaps.
//  Everything is written into the same Input down / pressed sets that
//  keys use, as "T_<action>" codes, so gameplay code needs no changes.
//  The controls only show during gameplay with no menu open, and step
//  aside (pass touches to the canvas) while a Sandbox tool is armed.
// =====================================================================

const TOUCH_LABELS = {
  jump: 'JUMP', reload: 'RELOAD', interact: 'USE', melee: 'MELEE', fire: 'FIRE', aim: 'AIM', flashlight: 'LIGHT',
  grenade: 'GREN', medkit: 'MED', shop: 'SHOP', nextWave: 'GO', sandbox: 'TOOLS', sprint: 'SPRINT',
  up: '▲', down: '▼', moveLeft: '◀', moveRight: '▶', lastWeapon: 'SWAP',
};

const Touch = {
  using: false, built: false, el: null,
  L: null, R: null,            // active stick touches
  prev: new Set(),             // stick codes held last frame
  btnHeld: new Map(),          // pointerId -> code held by a button
  aimSrc: { rx: 0, ry: 0, lx: 0 },
  lastTouch: 0, wantFs: false, lastState: '',
  stateT: 0,

  isTouchDevice() {
    try { return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches); } catch (e) { return false; }
  },
  init() {
    const pref = () => Settings.data.touchControls || 'auto';
    const touched = () => { this.lastTouch = performance.now(); if (!this.using && pref() !== 'off') this.activate(); };
    window.addEventListener('touchstart', touched, { capture: true, passive: true });
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touched(); }, { capture: true, passive: true });
    // a real mouse takes over again (touchscreen laptops), unless touch is forced on
    window.addEventListener('mousemove', (e) => {
      if (this.using && pref() === 'auto' && performance.now() - this.lastTouch > 1500 && Math.abs(e.movementX) + Math.abs(e.movementY) > 4) this.deactivate();
    });
    // fullscreen + landscape lock need a user gesture: try on the first tap and when a game starts
    window.addEventListener('touchend', () => { if (this.using && this.wantFs) { this.wantFs = false; this.fullscreen(); } }, { capture: true, passive: true });
    if (pref() === 'on' || (pref() === 'auto' && this.isTouchDevice())) this.activate();
  },
  activate() {
    if (this.using) return;
    this.using = true; this.wantFs = true;
    document.body.classList.add('touch');
    if (!this.built) this.build();
    this.tune();
    this.applyLook();
    if (typeof App !== 'undefined' && App.canvas) App.resize();
  },
  deactivate() {
    if (!this.using) return;
    this.releaseAll();
    this.using = false;
    document.body.classList.remove('touch');
    if (this.el) this.el.classList.add('hidden');
  },
  // one-off lighter defaults the first time the game runs on a phone or tablet
  tune() {
    const D = Settings.data;
    if (D.mobileTuned || !this.isTouchDevice()) return;
    Object.assign(D, { mobileTuned: true, lighting: 1, filmGrain: false, particleLimit: Math.min(D.particleLimit, 1400), corpseLimit: Math.min(D.corpseLimit, 16), gibLimit: Math.min(D.gibLimit, 90), shellLimit: Math.min(D.shellLimit, 60), cameraZoom: Math.max(D.cameraZoom, 1.1) });
    Settings.save();
  },
  applyLook() {
    if (!this.el) return;
    this.el.style.setProperty('--to', String(clamp(Settings.data.touchOpacity === undefined ? 0.6 : Settings.data.touchOpacity, 0.15, 1)));
  },
  fullscreen() {
    if (window.Capacitor || Settings.data.touchFullscreen === false) return;
    const d = document, el = d.documentElement;
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } };
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) { lock(); return; }
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) return;
      const r = req.call(el, { navigationUI: 'hide' });
      if (r && r.then) r.then(lock).catch(() => {}); else lock();
    } catch (e) { /* not allowed here (iframe, iOS Safari) */ }
  },

  // ------------------------------------------------------------ DOM
  build() {
    this.built = true;
    const mk = (cls, txt) => { const d = document.createElement('div'); d.className = cls; if (txt) d.textContent = txt; return d; };
    const root = this.el = mk('touch-ui hidden');
    root.id = 'touch';
    const zl = mk('tz tz-left'), zr = mk('tz tz-right');
    const sl = mk('stick stick-l'), sr = mk('stick stick-r');
    sl.append(mk('knob')); sr.append(mk('knob'));
    sl.append(mk('stick-cap', 'MOVE')); sr.append(mk('stick-cap', 'AIM · FIRE'));
    this.stickEl = { L: sl, R: sr };
    root.append(zl, zr, sl, sr);
    this.zone(zl, 'L'); this.zone(zr, 'R');
    this.btns = {};
    const btn = (act, label, cls) => { const b = mk('tbtn ' + cls, label); b.dataset.act = act; this.button(b, act); root.append(b); this.btns[act] = b; return b; };
    btn('jump', 'JUMP', 'b-jump big');
    btn('interact', 'USE', 'b-use');
    btn('reload', 'RELOAD', 'b-reload');
    btn('melee', 'MELEE', 'b-melee');
    btn('swap', 'SWAP', 'b-swap');
    btn('pause', 'II', 'b-pause small');
    btn('swapHud', '', 'b-swaphud ghost');
    // a row of small utility buttons along the bottom between the sticks, and the mode's context row up top
    const row = mk('trow'), ctx = mk('tctx');
    root.append(row, ctx);
    row.append(btn('aim', 'AIM', 'b-aim small'), btn('flashlight', 'LIGHT', 'b-light small'), btn('grenade', 'GREN', 'b-gren small'), btn('medkit', 'MED', 'b-med small'));
    ctx.append(btn('shop', 'SHOP', 'b-shop wide ctx'), btn('nextWave', 'GO', 'b-go wide ctx'), btn('sandbox', 'TOOLS', 'b-tools wide ctx'));
    // stop the browser turning touches into mouse clicks, scrolls or zooms
    root.addEventListener('touchstart', (e) => { if (e.cancelable && !root.classList.contains('pass')) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(root);
  },
  zone(z, which) {
    const end = (e) => {
      const s = this[which];
      if (!s || s.id !== e.pointerId) return;
      this[which] = null;
      this.drawStick(which);
    };
    z.addEventListener('pointerdown', (e) => {
      if (this[which]) return;
      e.preventDefault();
      try { z.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      this[which] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
      this.lastTouch = performance.now();
      this.drawStick(which);
    });
    z.addEventListener('pointermove', (e) => {
      const s = this[which];
      if (!s || s.id !== e.pointerId) return;
      s.x = e.clientX; s.y = e.clientY;
      // the base follows a finger that runs far past the rim
      const R = this.radius(), dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), lim = R * (which === 'L' ? 1.6 : 1.25);
      if (d > lim) { s.ox = s.x - dx / d * lim; s.oy = s.y - dy / d * lim; }
      this.drawStick(which);
    });
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  },
  button(b, act) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      this.lastTouch = performance.now();
      b.classList.add('on');
      if (act === 'pause') { Input.pressed.add('Escape'); return; }
      if (act === 'swap' || act === 'swapHud') { Input.wheel += 1; return; }
      if (act === 'aim') { this.aimOn = !this.aimOn; b.classList.toggle('lit', this.aimOn); return; }
      const code = 'T_' + act;
      this.btnHeld.set(e.pointerId, code);
      Input.down.add(code); Input.pressed.add(code);
      if (navigator.vibrate && Settings.data.touchVibrate !== false) { try { navigator.vibrate(8); } catch (err) { /* blocked */ } }
    });
    const up = (e) => {
      b.classList.remove('on');
      const code = this.btnHeld.get(e.pointerId);
      if (!code) return;
      this.btnHeld.delete(e.pointerId);
      if ([...this.btnHeld.values()].includes(code)) return;
      Input.down.delete(code); Input.released.add(code);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  },
  radius() { return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.15, 44, 90); },
  vec(s) {
    if (!s) return { nx: 0, ny: 0, len: 0, raw: 0 };
    const R = this.radius(), dx = (s.x - s.ox) / R, dy = (s.y - s.oy) / R, raw = Math.hypot(dx, dy), len = Math.min(1, raw);
    return raw > 1e-6 ? { nx: dx / raw * len, ny: dy / raw * len, len, raw } : { nx: 0, ny: 0, len: 0, raw: 0 };
  },
  drawStick(which) {
    const el = this.stickEl && this.stickEl[which]; if (!el) return;
    const s = this[which], R = this.radius();
    el.style.setProperty('--r', R + 'px');
    if (!s) { el.classList.remove('live', 'hot'); el.style.left = ''; el.style.top = ''; el.firstChild.style.transform = ''; return; }
    const v = this.vec(s);
    el.classList.add('live');
    el.classList.toggle('hot', which === 'L' ? v.raw > 1.15 : v.len > 0.55);
    el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
    el.firstChild.style.transform = `translate(${v.nx * R}px, ${v.ny * R}px)`;
  },

  // ------------------------------------------------------------ per frame
  releaseAll() {
    for (const c of this.prev) { Input.down.delete(c); Input.released.add(c); }
    this.prev = new Set();
    for (const c of this.btnHeld.values()) { Input.down.delete(c); Input.released.add(c); }
    this.btnHeld.clear();
    this.L = this.R = null;
    if (this.btns) for (const k in this.btns) this.btns[k].classList.remove('on');
    this.drawStick('L'); this.drawStick('R');
    this.aimSrc.rx = this.aimSrc.ry = this.aimSrc.lx = 0;
  },
  update() {
    if (!this.using || !this.el) return;
    const g = typeof App !== 'undefined' ? App.game : null;
    const inGame = App.state === 'game' && !!g && !!g.player && !UI.anyOverlay();
    if (App.state !== this.lastState) { if (App.state === 'game') this.wantFs = true; this.lastState = App.state; }
    this.el.classList.toggle('hidden', !inGame);
    const pass = inGame && UI.sandboxToolActive();
    this.el.classList.toggle('pass', pass);
    if (!inGame || pass) { if (this.prev.size || this.btnHeld.size || this.L || this.R) this.releaseAll(); return; }
    const p = g.player;
    const cur = new Set();
    const L = this.vec(this.L), R = this.vec(this.R);
    if (this.L) {
      if (L.nx < -0.28) cur.add('T_moveLeft');
      if (L.nx > 0.28) cur.add('T_moveRight');
      if (L.ny < -0.62) cur.add('T_up');
      if (L.ny > 0.62) cur.add('T_down');
      if (L.raw > 1.15 && Math.abs(L.nx) > 0.5) cur.add('T_sprint');
    }
    this.aimSrc.lx = this.L ? L.nx : 0;
    this.aimSrc.rx = this.R ? R.nx : 0; this.aimSrc.ry = this.R ? R.ny : 0;
    const firing = !!this.R && R.len > 0.55;
    if (firing) cur.add('T_fire');
    if (this.aimOn && p.gun && p.gun.def.cat !== 'melee') cur.add('T_aim');
    for (const c of cur) { if (!this.prev.has(c)) Input.pressed.add(c); Input.down.add(c); }
    for (const c of this.prev) if (!cur.has(c) && ![...this.btnHeld.values()].includes(c)) { Input.down.delete(c); Input.released.add(c); }
    this.prev = cur;
    // held fire keeps semi-auto, pump and bolt guns cycling as fast as they are ready
    const gun = p.gun;
    if (firing && gun && gun.def.cat !== 'melee' && gun.def.mode !== 'auto' && gun.cool <= 0 && gun.cycle <= 0 && !gun.reloading) Input.pressed.add('T_fire');
    // contextual buttons, refreshed a few times a second
    if ((this.stateT -= 1) <= 0) { this.stateT = 6; this.refreshButtons(g, p); }
  },
  aim(game, dt) { Input.padAim(game, dt, this.aimSrc); },
  refreshButtons(g, p) {
    const m = g.mode, B = this.btns;
    const tog = (k, on, cls = 'show') => { if (B[k] && B[k].classList.contains(cls) !== !!on) B[k].classList.toggle(cls, !!on); };
    const between = m.state === 'break' || m.state === 'prep';
    tog('shop', between && !!m.shopWeapons);
    tog('nextWave', between);
    tog('sandbox', m.name === 'Sandbox');
    tog('interact', !!p.interactTarget || (m.stage && m.stage.type === 'hold'), 'lit');
    tog('reload', !!(p.gun && p.gun.def.cat !== 'melee' && p.gun.mag === 0), 'lit');
    tog('grenade', p.grenades > 0, 'has');
    tog('medkit', p.medkits > 0 && p.hp < p.maxHp, 'has');
    tog('flashlight', !!p.flashlight, 'lit');
    tog('aim', !!(p.gun && p.gun.def.cat !== 'melee'), 'has');
    tog('aim', !!this.aimOn, 'lit');
  },
};
