'use strict';
// =====================================================================
//  Settings & key bindings (persisted in localStorage)
// =====================================================================

const ACTIONS = [
  // id, label, default bindings, remappable
  ['moveLeft', 'Move left', ['KeyA', 'ArrowLeft']],
  ['moveRight', 'Move right', ['KeyD', 'ArrowRight']],
  ['jump', 'Jump', ['Space']],
  ['up', 'Climb ladder / take stairs up', ['KeyW', 'ArrowUp']],
  ['down', 'Crouch / climb down (S+Space: drop through)', ['KeyS', 'ArrowDown']],
  ['sprint', 'Sprint', ['ShiftLeft', 'ShiftRight']],
  ['fire', 'Attack / fire', ['Mouse0']],
  ['aim', 'Steady aim (look further)', ['Mouse2']],
  ['reload', 'Reload', ['KeyR']],
  ['interact', 'Interact / use / barricade', ['KeyE']],
  ['melee', 'Quick melee', ['KeyV']],
  ['grenade', 'Throw grenade', ['KeyG']],
  ['flashlight', 'Toggle flashlight', ['KeyF']],
  ['medkit', 'Use medkit', ['KeyH']],
  ['lastWeapon', 'Previous weapon', ['KeyQ']],
  ['shop', 'Open shop (Survival)', ['KeyB']],
  ['nextWave', 'Start next wave now', ['KeyN']],
  ['sandbox', 'Sandbox tools panel', ['Tab']],
  ['slot1', 'Slot 1 — Melee', ['Digit1']],
  ['slot2', 'Slot 2 — Pistols & revolvers', ['Digit2']],
  ['slot3', 'Slot 3 — SMGs', ['Digit3']],
  ['slot4', 'Slot 4 — Shotguns', ['Digit4']],
  ['slot5', 'Slot 5 — Assault rifles', ['Digit5']],
  ['slot6', 'Slot 6 — Battle rifles / DMR', ['Digit6']],
  ['slot7', 'Slot 7 — Sniper rifles', ['Digit7']],
  ['slot8', 'Slot 8 — Machine guns', ['Digit8']],
];

const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.55,
  goreLevel: 3,          // 0 none, 1 low, 2 medium, 3 high, 4 extreme
  bloodPersist: true,    // stains stay on surfaces
  dismemberment: true,
  corpseLimit: 30,
  particleLimit: 2500,
  gibLimit: 160,
  shellLimit: 140,
  screenShake: 1.0,
  lighting: 2,           // 1 low, 2 high
  fog: true,
  filmGrain: true,
  cameraZoom: 1.0,
  showFps: false,
  autoReload: true,
  touchControls: 'auto', // auto (on phones/tablets) | on | off
  touchOpacity: 0.6,
  touchVibrate: true,
  touchFullscreen: true,
  mobileTuned: false,    // lighter defaults applied once on the first touch device run
  bindings: null,        // filled from ACTIONS
};

const GORE_LABELS = ['Off (no blood)', 'Low', 'Medium', 'High', 'Extreme'];

const Settings = {
  data: null,
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('hc_settings') || '{}'); } catch (e) { saved = {}; }
    this.data = Object.assign({}, DEFAULT_SETTINGS, saved);
    const b = {};
    for (const [id, , def] of ACTIONS) b[id] = (saved.bindings && Array.isArray(saved.bindings[id])) ? saved.bindings[id].slice(0, 2) : def.slice();
    this.data.bindings = b;
  },
  save() {
    try { localStorage.setItem('hc_settings', JSON.stringify(this.data)); } catch (e) { /* storage blocked */ }
  },
  resetBindings() {
    for (const [id, , def] of ACTIONS) this.data.bindings[id] = def.slice();
    this.save();
  },
  resetAll() {
    try { localStorage.removeItem('hc_settings'); } catch (e) { /* ignore */ }
    this.load();
  },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; this.save(); },
  // gore multiplier used to scale particle counts
  goreMul() { return [0, 0.35, 0.65, 1, 1.6][this.data.goreLevel] || 0; },
};

function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse4', Mouse4: 'Mouse5', Space: 'Space',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Tab: 'Tab', Escape: 'Esc', Enter: 'Enter',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    CapsLock: 'Caps', Backspace: 'Bksp',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}
