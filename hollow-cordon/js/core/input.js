'use strict';
// =====================================================================
//  Input — keyboard & mouse with action bindings and remapping capture
// =====================================================================

// Fixed gamepad layout (standard mapping), merged with the remappable
// keyboard/mouse bindings.
const PAD_BINDINGS = {
  moveLeft: ['PadLX-'], moveRight: ['PadLX+'], up: ['PadLY-'], down: ['PadLY+'],
  jump: ['Pad0'], melee: ['Pad1'], reload: ['Pad2'], interact: ['Pad3'],
  aim: ['Pad6'], fire: ['Pad7'], sprint: ['Pad10'], lastWeapon: ['Pad11'],
  flashlight: ['Pad12'], nextWave: ['Pad13'], medkit: ['Pad14'], grenade: ['Pad15'],
  shop: ['Pad8'], sandbox: ['Pad8'],
};
const PAD_LABELS = {
  Pad0: 'A', Pad1: 'B', Pad2: 'X', Pad3: 'Y', Pad4: 'LB', Pad5: 'RB', Pad6: 'LT', Pad7: 'RT', Pad8: 'View', Pad9: 'Menu',
  Pad10: 'L3', Pad11: 'R3', Pad12: 'D↑', Pad13: 'D↓', Pad14: 'D←', Pad15: 'D→',
  'PadLX-': 'LS←', 'PadLX+': 'LS→', 'PadLY-': 'LS↑', 'PadLY+': 'LS↓',
};

const Input = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  mx: 0, my: 0,          // mouse position in canvas pixels
  wheel: 0,
  capture: null,         // function(code) when remapping
  gameFocus: false,      // true while gameplay owns the keyboard
  canvas: null,

  init(canvas) {
    this.canvas = canvas;
    const block = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);
    window.addEventListener('keydown', (e) => {
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture; this.capture = null; cb(e.code);
        return;
      }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (this.gameFocus && (block.has(e.code) || e.code.startsWith('Digit'))) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.pressed.add(e.code); }
    });
    window.addEventListener('keyup', (e) => {
      if (this.down.has(e.code)) this.released.add(e.code);
      this.down.delete(e.code);
    });
    const mouseCode = (b) => 'Mouse' + b;
    canvas.addEventListener('mousedown', (e) => {
      if (this.capture) { e.preventDefault(); const cb = this.capture; this.capture = null; cb(mouseCode(e.button)); return; }
      this.down.add(mouseCode(e.button)); this.pressed.add(mouseCode(e.button));
      if (e.button === 1) e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      const c = mouseCode(e.button);
      if (this.down.has(c)) this.released.add(c);
      this.down.delete(c);
    });
    window.addEventListener('mousemove', (e) => {
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.pad.using = false;
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) * (canvas.width / r.width);
      this.my = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    window.addEventListener('blur', () => { this.down.clear(); });
  },

  // ---------------------------------------------------------- gamepad
  // Standard-mapping pads appear as extra input codes in the same down /
  // pressed sets as keys: Pad0..Pad16 for buttons, PadLX-/PadLX+/PadLY-/
  // PadLY+ for the left stick. The right stick drives the aim point.
  pad: { connected: false, using: false, id: '', rx: 0, ry: 0, lx: 0, ly: 0 },
  padPrev: new Set(),
  padAimDir: [1, 0], padAimLen: 200,
  navDir: null, navT: 0, navOut: null,
  // getGamepads() throws where the Gamepad API is blocked (e.g. a sandboxed or
  // embedded page); treat that as "no pads" instead of killing the frame.
  gamepads() {
    if (this.padBlocked || !navigator.getGamepads) return [];
    try { return navigator.getGamepads() || []; } catch (e) { this.padBlocked = true; return []; }
  },
  pollPad(dt) {
    this.navOut = null;
    const pads = this.gamepads();
    let gp = null;
    for (const p of pads || []) if (p && p.connected) { gp = p; break; }
    this.pad.connected = !!gp;
    const cur = new Set();
    if (gp) {
      this.pad.id = gp.id;
      gp.buttons.forEach((b, i) => { if (b && (b.pressed || b.value > (i === 6 || i === 7 ? 0.35 : 0.5))) cur.add('Pad' + i); });
      const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < 0.18 ? 0 : v; };
      this.pad.lx = ax(0); this.pad.ly = ax(1); this.pad.rx = ax(2); this.pad.ry = ax(3);
      if (this.pad.lx < -0.4) cur.add('PadLX-'); if (this.pad.lx > 0.4) cur.add('PadLX+');
      if (this.pad.ly < -0.55) cur.add('PadLY-'); if (this.pad.ly > 0.55) cur.add('PadLY+');
      if (cur.size || Math.hypot(this.pad.rx, this.pad.ry) > 0.3) this.pad.using = true;
    }
    for (const c of cur) {
      if (!this.padPrev.has(c)) {
        this.pressed.add(c);
        if (c === 'Pad9') this.pressed.add('Escape');          // Start / Menu = pause
        if (c === 'Pad4') this.wheel -= 1;                     // LB / RB cycle weapons
        if (c === 'Pad5') this.wheel += 1;
      }
      this.down.add(c);
    }
    for (const c of this.padPrev) if (!cur.has(c)) { this.released.add(c); this.down.delete(c); }
    this.padPrev = cur;
    // menu navigation direction (d-pad or left stick) with key-repeat
    const d = cur.has('Pad12') || cur.has('PadLY-') ? 'up' : cur.has('Pad13') || cur.has('PadLY+') ? 'down' : cur.has('Pad14') || cur.has('PadLX-') ? 'left' : cur.has('Pad15') || cur.has('PadLX+') ? 'right' : null;
    if (d !== this.navDir) { this.navDir = d; this.navT = 0.38; this.navOut = d; }
    else if (d) { this.navT -= dt; if (this.navT <= 0) { this.navT = 0.11; this.navOut = d; } }
  },
  // right stick → aim point around the player (world space), written into mx/my
  // (src: the stick values to aim with — the pad, or the touch sticks)
  padAim(game, dt, src = this.pad) {
    const p = game.player;
    if (!p || p.dead) return;
    const { rx, ry, lx } = src;
    const m = Math.hypot(rx, ry);
    const aimHeld = this.act('aim');
    let want = 170;
    if (m > 0.25) {
      let ang = Math.atan2(ry, rx);
      // gentle aim magnetism toward the nearest infected in a narrow cone
      const ox = p.x, oy = p.y - 95;
      let best = null, bd = 0.14;
      for (const z of game.zombies) {
        if (z.dead) continue;
        const zx = z.x, zy = z.y - z.h * 0.62, dd = Math.hypot(zx - ox, zy - oy);
        if (dd > 900 || dd < 30) continue;
        let da = Math.atan2(zy - oy, zx - ox) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < bd) { bd = Math.abs(da); best = da; }
      }
      if (best !== null) ang += best * 0.45;
      this.padAimDir = [Math.cos(ang), Math.sin(ang)];
      want = 140 + Math.min(1, (m - 0.25) / 0.7) * 300;
    } else if (Math.abs(lx) > 0.4 && Math.sign(lx) !== Math.sign(this.padAimDir[0])) {
      this.padAimDir = [Math.sign(lx), 0];           // no aim input: face where you walk
    }
    if (aimHeld) want += 260;
    this.padAimLen += (want - this.padAimLen) * Math.min(1, dt * 10);
    const wx = p.x + this.padAimDir[0] * this.padAimLen, wy = p.y - 95 + this.padAimDir[1] * this.padAimLen;
    const [sx, sy] = game.worldToScreen(wx, wy);
    this.mx = sx; this.my = sy;
  },
  rumble(strength, ms = 120) {
    if (!this.pad.using) return;
    for (const gp of this.gamepads()) {
      const a = gp && gp.connected && gp.vibrationActuator;
      if (a && a.playEffect) { try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: clamp(strength, 0, 1), weakMagnitude: clamp(strength * 1.3, 0, 1) }); } catch (e) { /* unsupported */ } return; }
    }
  },
  // prompt label for an action: pad glyph while the pad is in use, button name on touch
  label(action) {
    if (this.pad.using && PAD_BINDINGS[action]) return PAD_LABELS[PAD_BINDINGS[action][0]] || PAD_BINDINGS[action][0];
    if (typeof Touch !== 'undefined' && Touch.using && TOUCH_LABELS[action]) return TOUCH_LABELS[action];
    return keyLabel((Settings.data.bindings[action] || [])[0]);
  },

  // keyboard/mouse bindings + the fixed pad layout + the on-screen touch control ("T_<action>")
  bound(action) { const b = Settings.data.bindings[action] || []; const pb = PAD_BINDINGS[action]; return (pb ? b.concat(pb) : b).concat('T_' + action); },
  act(action) { for (const c of this.bound(action)) if (this.down.has(c)) return true; return false; },
  actPressed(action) { for (const c of this.bound(action)) if (this.pressed.has(c)) return true; return false; },
  actReleased(action) { for (const c of this.bound(action)) if (this.released.has(c)) return true; return false; },
  keyPressed(code) { return this.pressed.has(code); },
  keyDown(code) { return this.down.has(code); },
  consume(code) { this.pressed.delete(code); },
  consumeAction(action) { for (const c of this.bound(action)) this.pressed.delete(c); },
  endFrame() { this.pressed.clear(); this.released.clear(); this.wheel = 0; },
  clear() { this.down.clear(); this.pressed.clear(); this.released.clear(); this.wheel = 0; },
};
