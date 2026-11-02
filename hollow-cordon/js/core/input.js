'use strict';
// =====================================================================
//  Input — keyboard & mouse with action bindings and remapping capture
// =====================================================================

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
      const r = canvas.getBoundingClientRect();
      this.mx = (e.clientX - r.left) * (canvas.width / r.width);
      this.my = (e.clientY - r.top) * (canvas.height / r.height);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); }, { passive: false });
    window.addEventListener('blur', () => { this.down.clear(); });
  },

  bound(action) { return (Settings.data.bindings[action] || []); },
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
