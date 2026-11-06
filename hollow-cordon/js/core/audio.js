'use strict';
// =====================================================================
//  Sfx — procedural audio. Every sound in the game is synthesised here
//  at load time (noise/oscillator DSP + biquad filters + saturation),
//  then played back through a compressor + convolution reverb chain.
// =====================================================================

const Sfx = (() => {
  let ctx = null, sr = 44100;
  let master, sfxBus, ambBus, comp, verbIn, verbGain;
  const bank = {};
  const loops = {};
  let voices = 0;
  const MAX_VOICES = 56;
  const listener = { x: 0, y: 0 };
  let verbAmt = 0.25;
  let ready = false;

  // ------------------------------------------------ DSP helpers
  const buf = (sec) => new Float32Array(Math.max(1, Math.floor(sec * sr)));
  function biquad(b, type, f, q = 0.707) {
    f = clamp(f, 10, sr * 0.45);
    const w0 = TAU * f / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
    b0 /= a0; b1 /= a0; b2 /= a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < b.length; i++) {
      const x = b[i];
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; b[i] = y;
    }
    return b;
  }
  function noise(sec, decay, attack = 0.0005) {
    const b = buf(sec);
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const e = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
      b[i] = (Math.random() * 2 - 1) * e;
    }
    return b;
  }
  function tone(sec, f0, f1, sweep, decay, wave = 'sine', attack = 0.0008) {
    const b = buf(sec); let ph = 0;
    for (let i = 0; i < b.length; i++) {
      const t = i / sr;
      const f = f1 + (f0 - f1) * Math.exp(-t / Math.max(1e-4, sweep));
      ph += f / sr;
      let s;
      if (wave === 'sine') s = Math.sin(ph * TAU);
      else if (wave === 'saw') s = 2 * (ph % 1) - 1;
      else if (wave === 'sq') s = (ph % 1) < 0.5 ? 1 : -1;
      else s = 1 - 4 * Math.abs((ph % 1) - 0.5); // tri
      const e = t < attack ? t / attack : Math.exp(-(t - attack) / decay);
      b[i] = s * e;
    }
    return b;
  }
  function add(dst, src, g = 1, off = 0) {
    const o = Math.floor(off * sr);
    for (let i = 0; i < src.length && i + o < dst.length; i++) if (i + o >= 0) dst[i + o] += src[i] * g;
    return dst;
  }
  function clip(b, drive) { const n = Math.tanh(drive); for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * drive) / n; return b; }
  function norm(b, peak = 0.95) {
    let m = 0; for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]));
    if (m > 0) { const k = peak / m; for (let i = 0; i < b.length; i++) b[i] *= k; }
    return b;
  }
  function fadeTail(b, sec) { const n = Math.min(b.length, Math.floor(sec * sr)); for (let i = 0; i < n; i++) b[b.length - 1 - i] *= i / n; return b; }
  function gainEnv(b, fn) { for (let i = 0; i < b.length; i++) b[i] *= fn(i / sr); return b; }
  function makeLoop(b, fade) {
    // crossfade tail into head for seamless looping
    const n = Math.floor(fade * sr), L = b.length - n;
    const out = new Float32Array(L);
    for (let i = 0; i < L; i++) out[i] = b[i];
    for (let i = 0; i < n; i++) { const t = i / n; out[i] = b[i] * t + b[L + i] * (1 - t); }
    return out;
  }
  function click(sec = 0.012, f = 3000, q = 1.2) { return biquad(noise(sec, sec / 4), 'bp', f, q); }
  function store(name, data) {
    const ab = ctx.createBuffer(1, data.length, sr);
    ab.copyToChannel(data, 0);
    (bank[name] || (bank[name] = [])).push(ab);
  }

  // ------------------------------------------------ recipes
  function gunshot(p) {
    const len = p.len || 0.9;
    const out = buf(len);
    const cr = p.crack || [3000, 0.008, 1];
    add(out, biquad(noise(0.08, cr[1]), 'hp', cr[0]), cr[2]);
    const bl = p.blast || [2800, 0.06, 1];
    const blast = noise(0.6, bl[1], 0.0008); biquad(blast, 'lp', bl[0], 0.8); biquad(blast, 'lp', bl[0] * 1.4);
    add(out, blast, bl[2] * 2.2);
    const th = p.thump || [90, 0.09, 1];
    add(out, tone(0.5, th[0] * 3.2, th[0], 0.014, th[1]), th[2]);
    add(out, tone(0.5, th[0] * 1.6, th[0] * 0.55, 0.03, th[1] * 1.4), th[2] * 0.6);
    const tl = p.tail || [1200, 0.4, 0.4];
    const tail = noise(len, tl[1], 0.012); biquad(tail, 'lp', tl[0]); biquad(tail, 'lp', tl[0] * 1.2);
    add(out, tail, tl[2] * 2.4, 0.006);
    if (p.echo) { const e = noise(len, p.echo[2] || 0.18, 0.02); biquad(e, 'lp', 700); biquad(e, 'lp', 600); add(out, e, p.echo[1] * 2, p.echo[0]); }
    if (p.mech) add(out, click(0.02, 2600, 2), p.mech, 0.045 + Math.random() * 0.01);
    if (p.ring) add(out, tone(0.4, p.ring, p.ring * 0.97, 0.3, 0.12), 0.12);
    clip(out, p.drive || 2.5);
    fadeTail(out, 0.08);
    return norm(out, 0.98);
  }
  function voice(sec, o) {
    const src = buf(sec);
    let ph = 0;
    const seed = Math.random() * 100;
    for (let i = 0; i < src.length; i++) {
      const t = i / sr, u = t / sec;
      let f = o.f0 + (o.f1 - o.f0) * u;
      if (o.fmid) f = u < 0.4 ? lerp(o.f0, o.fmid, u / 0.4) : lerp(o.fmid, o.f1, (u - 0.4) / 0.6);
      f *= 1 + (o.jit || 0) * (noise1(t * 35, seed) - 0.5) + (o.vibD || 0) * Math.sin(TAU * (o.vibR || 5) * t);
      ph += f / sr;
      const saw = 2 * (ph % 1) - 1;
      const pulse = (ph % 1) < 0.18 ? 1 : -0.22;
      const n = Math.random() * 2 - 1;
      const g = (saw * 0.6 + pulse * 0.4) * (1 - (o.breath || 0.3)) + n * (o.breath || 0.3);
      const att = o.att || 0.08, rel = o.rel || 0.35;
      let e = u < att ? u / att : u > 1 - rel ? (1 - u) / rel : 1;
      e *= 1 - (o.tremD || 0) * (0.5 + 0.5 * Math.sin(TAU * (o.tremR || 7) * t + noise1(t * 3, seed) * 2));
      src[i] = g * e;
    }
    const out = buf(sec);
    for (const [f, q, g] of o.formants) add(out, biquad(Float32Array.from(src), 'bp', f, q), g);
    add(out, biquad(Float32Array.from(src), 'lp', 400), o.body || 0.3);
    clip(out, o.rasp || 2);
    fadeTail(out, 0.05);
    return norm(out, 0.9);
  }
  function flesh(heavy = 1) {
    const out = buf(0.35);
    add(out, tone(0.3, 160 * heavy, 55, 0.02, 0.06), 0.9);
    add(out, biquad(noise(0.25, 0.05 * heavy), 'bp', 700, 0.9), 1.6);
    const sq = noise(0.3, 0.09);
    gainEnv(sq, (t) => 0.5 + 0.5 * Math.sin(TAU * (40 + Math.random() * 30) * t));
    add(out, biquad(sq, 'bp', 1400, 2), 0.7, 0.01);
    clip(out, 2.5);
    return norm(out, 0.9);
  }
  function wet(len = 0.5, lp = 900) {
    const out = buf(len);
    const n = noise(len, len * 0.35, 0.002); biquad(n, 'lp', lp); add(out, n, 2.4);
    add(out, tone(len, 140, 45, 0.04, 0.12), 1.2);
    for (let k = 0; k < 8; k++) add(out, biquad(noise(0.06, 0.012), 'bp', rand(500, 1800), 3), rand(0.4, 0.9), rand(0, len * 0.6));
    clip(out, 2);
    return norm(out, 0.92);
  }
  function crack() {
    const out = buf(0.2);
    add(out, biquad(noise(0.03, 0.004), 'hp', 1500), 1.4);
    add(out, biquad(noise(0.08, 0.015), 'bp', 2200, 1.5), 1.2, 0.012);
    add(out, biquad(noise(0.06, 0.01), 'bp', 1100, 1.5), 0.8, 0.03);
    return norm(clip(out, 2), 0.85);
  }
  function metalTink(f) {
    const out = buf(0.35);
    for (const [m, g] of [[1, 0.6], [2.76, 0.4], [5.4, 0.25], [8.9, 0.12]]) add(out, tone(0.3, f * m, f * m, 1, 0.06 / Math.sqrt(m)), g);
    add(out, click(0.01, 6000, 1), 0.4);
    return norm(out, 0.6);
  }
  function explosion(size = 1) {
    const len = 2.6 * size;
    const out = buf(len);
    const n = noise(len, 0.55 * size, 0.004);
    // falling lowpass sweep approximated by two filtered layers
    add(out, biquad(biquad(Float32Array.from(n), 'lp', 2600), 'lp', 2000), 1.4);
    add(out, biquad(biquad(Float32Array.from(n), 'lp', 300), 'lp', 260), 4);
    add(out, tone(len, 90, 28, 0.15, 0.5 * size), 2.2);
    add(out, biquad(noise(0.1, 0.02), 'hp', 1200), 1.2);
    const deb = buf(len);
    for (let k = 0; k < 40; k++) add(deb, biquad(noise(0.04, 0.008), 'bp', rand(800, 3000), 2), rand(0.1, 0.4), rand(0.2, len * 0.7));
    add(out, deb, 0.6);
    clip(out, 3.5);
    fadeTail(out, 0.4);
    return norm(out, 0.99);
  }
  function whoosh(len = 0.3, f0 = 600, f1 = 1800) {
    const n = noise(len, 1, 0.001);
    const out = buf(len);
    // swept bandpass in 6 segments
    const seg = Math.floor(n.length / 6);
    for (let s = 0; s < 6; s++) {
      const piece = n.slice(s * seg, (s + 1) * seg);
      biquad(piece, 'bp', lerp(f0, f1, s / 5), 1.5);
      for (let i = 0; i < piece.length; i++) out[s * seg + i] = piece[i];
    }
    gainEnv(out, (t) => Math.sin(Math.PI * clamp(t / len, 0, 1)) ** 1.5);
    return norm(out, 0.7);
  }

  // ------------------------------------------------ bank
  const jobs = [];
  function job(fn) { jobs.push(fn); }
  function defineBank() {
    // --- mechanical
    job(() => { for (let i = 0; i < 3; i++) store('click', norm(add(click(0.02, 2800, 2), click(0.01, 5000, 1), 0.5, 0.004), 0.6)); });
    job(() => store('dry', norm(add(click(0.015, 3500, 3), click(0.02, 1500, 2), 0.6, 0.002), 0.5)));
    job(() => { const o = buf(0.25); add(o, click(0.02, 2000, 2), 1); add(o, biquad(noise(0.08, 0.03), 'bp', 1200, 1.4), 0.6, 0.02); add(o, click(0.02, 3000, 2), 0.7, 0.09); store('mag_out', norm(o, 0.6)); });
    job(() => { const o = buf(0.2); add(o, biquad(noise(0.05, 0.012), 'bp', 900, 1.2), 1.4); add(o, click(0.02, 3200, 2), 1, 0.006); store('mag_in', norm(clip(o, 2), 0.75)); });
    job(() => { const o = buf(0.3); add(o, biquad(noise(0.07, 0.025), 'bp', 1800, 1.4), 0.7); add(o, click(0.02, 2500, 2), 1.2, 0.07); add(o, biquad(noise(0.04, 0.01), 'bp', 1000, 1.2), 1, 0.075); store('slide', norm(clip(o, 2), 0.75)); });
    job(() => { const o = buf(0.42); add(o, click(0.02, 2200, 2), 1); add(o, biquad(noise(0.1, 0.04), 'bp', 1500, 1.2), 0.7, 0.03); add(o, biquad(noise(0.1, 0.04), 'bp', 1300, 1.2), 0.7, 0.2); add(o, click(0.03, 1800, 2), 1.3, 0.3); store('bolt', norm(clip(o, 2), 0.8)); });
    job(() => { const o = buf(0.45); add(o, biquad(noise(0.08, 0.03), 'bp', 1100, 1.3), 1); add(o, click(0.03, 1600, 2), 1.4, 0.07); add(o, biquad(noise(0.08, 0.03), 'bp', 1300, 1.3), 1, 0.2); add(o, click(0.03, 2000, 2), 1.6, 0.27); store('pump', norm(clip(o, 2.5), 0.85)); });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.15); add(o, biquad(noise(0.04, 0.01), 'bp', 1200, 1.5), 1); add(o, click(0.02, 2400, 2), 0.8, 0.03); store('shell_in', norm(o, 0.6)); } });
    job(() => { const o = buf(0.5); add(o, click(0.02, 2400, 2), 1); for (let k = 0; k < 6; k++) add(o, click(0.012, 3800, 3), 0.4, 0.05 + k * 0.045); store('cyl_open', norm(o, 0.6)); });
    job(() => { const o = buf(0.25); add(o, click(0.03, 1700, 2), 1.4); add(o, click(0.02, 3000, 2), 0.7, 0.04); store('cyl_close', norm(o, 0.7)); });
    job(() => { const o = buf(0.3); add(o, click(0.03, 1400, 2), 1.2); add(o, biquad(noise(0.06, 0.03), 'bp', 800, 1), 0.7, 0.05); store('break_open', norm(o, 0.7)); });
    job(() => { for (const f of [3100, 3600, 4200, 3900]) store('brass', metalTink(f)); });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.15); add(o, tone(0.1, 420, 380, 1, 0.025), 1); add(o, click(0.01, 1200, 1), 0.5); store('brass_sg', norm(o, 0.5)); } });
    job(() => { const o = buf(0.2); add(o, metalTink(2400), 0.5); add(o, biquad(noise(0.05, 0.02), 'lp', 900), 1.2); store('mag_drop', norm(o, 0.6)); });
    // --- gore
    job(() => { for (let i = 0; i < 4; i++) store('flesh', flesh(rand(0.8, 1.2))); });
    job(() => { for (let i = 0; i < 2; i++) { const o = flesh(1.1); add(o, crack(), 0.8, 0.005); store('hit_head', norm(o, 0.95)); } });
    job(() => { for (let i = 0; i < 3; i++) store('gore_burst', wet(0.7, 1100)); });
    job(() => { for (let i = 0; i < 4; i++) store('splat', wet(0.22, rand(700, 1300))); });
    job(() => { for (let i = 0; i < 3; i++) store('bone', crack()); });
    job(() => { for (let i = 0; i < 2; i++) { const o = wet(0.5, 900); add(o, crack(), 1.0, 0.01); store('dismember', norm(o, 0.95)); } });
    job(() => { const o = buf(1.2); for (let k = 0; k < 10; k++) add(o, biquad(noise(0.08, 0.03), 'bp', rand(300, 900), 2), rand(0.4, 1), k * 0.1 + rand(0, 0.05)); store('spurt', norm(o, 0.5)); });
    // --- impacts
    job(() => { for (let i = 0; i < 4; i++) { const f = rand(2200, 4200); const o = buf(0.5); add(o, tone(0.45, f * 1.4, f * 0.7, 0.12, 0.16, 'sine'), 0.6); add(o, biquad(noise(0.05, 0.008), 'hp', 2500), 1); store('ric', norm(o, 0.55)); } });
    job(() => { for (let i = 0; i < 3; i++) { const o = buf(0.3); add(o, biquad(noise(0.1, 0.02), 'lp', 3500), 1.4); for (let k = 0; k < 5; k++) add(o, click(0.01, rand(1500, 4000), 2), 0.25, rand(0.01, 0.15)); store('hit_concrete', norm(o, 0.55)); } });
    job(() => { for (let i = 0; i < 3; i++) { const o = buf(0.25); add(o, biquad(noise(0.08, 0.02), 'bp', 650, 1.2), 1.4); add(o, tone(0.15, 340, 260, 0.05, 0.04), 0.6); store('hit_wood', norm(o, 0.6)); } });
    job(() => { for (let i = 0; i < 3; i++) { const f = rand(600, 1100); const o = buf(0.6); add(o, tone(0.5, f, f, 1, 0.18), 0.5); add(o, tone(0.5, f * 2.3, f * 2.3, 1, 0.1), 0.3); add(o, biquad(noise(0.04, 0.01), 'hp', 1500), 1); store('hit_metal', norm(o, 0.6)); } });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.25); add(o, biquad(noise(0.1, 0.03), 'lp', 1800), 1.4); store('hit_dirt', norm(o, 0.45)); } });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.9); add(o, biquad(noise(0.3, 0.06), 'hp', 2500), 1.4); for (let k = 0; k < 18; k++) add(o, metalTink(rand(3000, 7000)), rand(0.2, 0.6), rand(0.02, 0.6)); store('glass', norm(clip(o, 1.5), 0.85)); } });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.6); add(o, crack(), 1.2); add(o, biquad(noise(0.4, 0.12), 'bp', 900, 0.8), 1.3, 0.02); add(o, tone(0.3, 200, 90, 0.05, 0.1), 0.8); store('wood_break', norm(clip(o, 2), 0.85)); } });
    job(() => { store('explosion', explosion(1)); store('explosion', explosion(1.1)); });
    job(() => store('explosion_small', explosion(0.6)));
    job(() => { const o = buf(1.6); add(o, biquad(noise(1.5, 0.5, 0.05), 'hp', 1500), 0.6); add(o, biquad(noise(1.5, 0.6, 0.02), 'lp', 600), 1.5); store('fire_whoosh', norm(o, 0.7)); });
    job(() => { const o = buf(1.2); add(o, biquad(noise(1.2, 0.35, 0.01), 'hp', 2500), 1); store('hiss', norm(o, 0.5)); });
    // --- doors, wood, metal
    job(() => { const o = buf(0.7); const cr = voice(0.45, { f0: 420, f1: 300, jit: 0.4, breath: 0.1, rasp: 1.5, formants: [[900, 6, 1], [1800, 6, 0.5]], att: 0.2, rel: 0.4 }); add(o, cr, 0.25); add(o, biquad(noise(0.08, 0.03), 'lp', 600), 1.4, 0.4); add(o, tone(0.2, 120, 70, 0.04, 0.06), 0.8, 0.4); store('door_open', norm(o, 0.7)); });
    job(() => { const o = buf(0.4); add(o, biquad(noise(0.1, 0.04), 'lp', 500), 1.6); add(o, tone(0.25, 110, 60, 0.04, 0.08), 1); add(o, click(0.02, 2000, 2), 0.5, 0.01); store('door_close', norm(clip(o, 2), 0.8)); });
    job(() => { for (let i = 0; i < 3; i++) { const o = buf(0.5); add(o, biquad(noise(0.2, 0.06), 'lp', 450), 2); add(o, tone(0.3, 90, 50, 0.04, 0.12), 1.4); add(o, biquad(noise(0.15, 0.04), 'bp', 900, 1), 0.6, 0.01); store('bash', norm(clip(o, 3), 0.9)); } });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.6); add(o, tone(0.5, 380, 360, 1, 0.2), 0.5); add(o, tone(0.5, 920, 900, 1, 0.12), 0.3); add(o, biquad(noise(0.15, 0.05), 'lp', 1200), 1.4); store('metal_bash', norm(clip(o, 2), 0.9)); } });
    job(() => { const o = buf(1.0); for (let k = 0; k < 3; k++) { add(o, biquad(noise(0.06, 0.015), 'bp', 1400, 1.5), 1.2, k * 0.26); add(o, tone(0.12, 500, 380, 0.03, 0.03), 0.6, k * 0.26); } store('hammer', norm(clip(o, 2), 0.8)); });
    // --- player/foley
    job(() => { for (let i = 0; i < 4; i++) { const o = buf(0.15); add(o, tone(0.12, 120, 60, 0.02, 0.025), 1); add(o, biquad(noise(0.06, 0.012), 'bp', rand(700, 1300), 1), 0.7); store('step', norm(o, 0.45)); } });
    job(() => { for (let i = 0; i < 3; i++) { const o = buf(0.15); add(o, metalTink(rand(500, 800)), 0.5); add(o, tone(0.12, 140, 70, 0.02, 0.025), 1); store('step_metal', norm(o, 0.5)); } });
    job(() => { const o = buf(0.25); add(o, tone(0.2, 150, 55, 0.03, 0.07), 1.2); add(o, biquad(noise(0.1, 0.03), 'lp', 900), 1); store('land', norm(o, 0.6)); });
    job(() => { store('swing', whoosh(0.26, 500, 2200)); store('swing', whoosh(0.32, 400, 1600)); store('swing_heavy', whoosh(0.45, 250, 900)); });
    job(() => { for (let i = 0; i < 3; i++) { const o = flesh(1.3); add(o, crack(), 0.6, 0.01); store('melee_blunt', norm(o, 0.95)); } });
    job(() => { for (let i = 0; i < 3; i++) { const o = wet(0.35, 1600); add(o, biquad(noise(0.05, 0.01), 'hp', 3000), 0.8); store('melee_blade', norm(o, 0.95)); } });
    job(() => { for (let i = 0; i < 3; i++) store('hurt', voice(rand(0.22, 0.32), { f0: rand(150, 175), f1: rand(105, 125), jit: 0.08, breath: 0.3, rasp: 2, formants: [[640, 5, 1], [1190, 6, 0.6], [2390, 7, 0.2]], att: 0.05, rel: 0.5 })); });
    job(() => store('player_death', voice(1.1, { f0: 165, fmid: 190, f1: 80, jit: 0.1, breath: 0.4, rasp: 2.5, formants: [[700, 5, 1], [1100, 6, 0.6]], att: 0.05, rel: 0.6 })));
    job(() => { const o = buf(0.9); add(o, tone(0.2, 60, 45, 0.05, 0.06), 1.4); add(o, tone(0.2, 55, 42, 0.05, 0.06), 1.0, 0.22); store('heartbeat', norm(o, 0.8)); });
    job(() => { const o = buf(0.35); add(o, tone(0.2, 900, 1300, 0.05, 0.08, 'tri'), 0.4); add(o, click(0.015, 2500, 2), 0.8); store('pickup', norm(o, 0.5)); });
    job(() => { const o = buf(0.5); for (let k = 0; k < 4; k++) add(o, metalTink(rand(2500, 4500)), 0.5, k * 0.04 + rand(0, 0.02)); store('cash', norm(o, 0.55)); });
    job(() => { const o = buf(0.6); add(o, tone(0.5, 1320, 1320, 1, 0.15, 'tri'), 0.4); add(o, tone(0.5, 1760, 1760, 1, 0.2, 'tri'), 0.35, 0.08); add(o, click(0.02, 2000, 2), 0.7); store('buy', norm(o, 0.5)); });
    job(() => { store('ui_click', norm(add(click(0.02, 2200, 2), tone(0.05, 700, 600, 1, 0.015), 0.4), 0.4)); store('ui_hover', norm(click(0.012, 4000, 3), 0.15)); });
    job(() => { const o = buf(1.0); add(o, biquad(noise(0.9, 0.25, 0.05), 'bp', 2500, 0.8), 0.6); add(o, click(0.02, 1500, 2), 0.6, 0.6); store('heal', norm(o, 0.5)); });
    job(() => { const o = buf(0.3); add(o, metalTink(1800), 0.6); add(o, click(0.02, 3000, 2), 0.8, 0.05); store('pin', norm(o, 0.6)); });
    job(() => { for (let i = 0; i < 2; i++) { const o = buf(0.2); add(o, metalTink(rand(900, 1300)), 0.5); add(o, tone(0.12, 160, 80, 0.02, 0.03), 0.8); store('bounce', norm(o, 0.5)); } });
    // --- zombies
    job(() => { for (let i = 0; i < 6; i++) store('z_groan', voice(rand(1.1, 1.9), { f0: rand(75, 98), f1: rand(55, 70), jit: 0.35, vibD: 0.03, vibR: rand(3, 6), breath: rand(0.3, 0.45), rasp: rand(2.5, 4), formants: [[rand(520, 640), 6, 1], [rand(800, 950), 7, 0.6], [2400, 8, 0.15]], tremD: 0.45, tremR: rand(5, 9), att: 0.15, rel: 0.4 })); });
    job(() => { for (let i = 0; i < 4; i++) store('z_growl', voice(rand(0.5, 0.8), { f0: rand(95, 120), f1: rand(70, 85), jit: 0.5, breath: 0.45, rasp: 4.5, formants: [[650, 5, 1], [1050, 6, 0.7], [2600, 8, 0.2]], tremD: 0.6, tremR: 14, att: 0.05, rel: 0.4 })); });
    job(() => { for (let i = 0; i < 4; i++) store('z_attack', voice(rand(0.35, 0.5), { f0: rand(180, 230), f1: rand(110, 140), jit: 0.4, breath: 0.5, rasp: 5, formants: [[780, 5, 1], [1250, 6, 0.8], [2700, 7, 0.3]], att: 0.03, rel: 0.5 })); });
    job(() => { for (let i = 0; i < 4; i++) store('z_death', voice(rand(0.7, 1.1), { f0: rand(120, 150), f1: rand(45, 60), jit: 0.4, breath: 0.4, rasp: 3.5, formants: [[600, 5, 1], [900, 6, 0.6]], tremD: 0.5, tremR: 11, att: 0.03, rel: 0.6 })); });
    job(() => { for (let i = 0; i < 3; i++) store('z_scream', voice(rand(0.7, 1.0), { f0: rand(280, 330), fmid: rand(360, 420), f1: rand(200, 240), jit: 0.3, breath: 0.55, rasp: 6, formants: [[850, 5, 1], [1300, 6, 0.8], [2900, 7, 0.4]], att: 0.05, rel: 0.4 })); });
    job(() => { for (let i = 0; i < 2; i++) { const o = voice(1.8, { f0: 62, fmid: 75, f1: 44, jit: 0.4, breath: 0.4, rasp: 7, formants: [[420, 5, 1], [760, 6, 0.7], [2200, 8, 0.15]], tremD: 0.5, tremR: 9, att: 0.1, rel: 0.4, body: 0.8 }); add(o, tone(1.8, 48, 38, 0.5, 0.6), 0.4); store('brute_roar', norm(o, 0.95)); } });
    job(() => store('shriek', voice(1.7, { f0: 700, fmid: 1050, f1: 620, jit: 0.25, vibD: 0.05, vibR: 12, breath: 0.6, rasp: 6, formants: [[1100, 4, 1], [2500, 5, 0.8], [3600, 6, 0.5]], tremD: 0.35, tremR: 17, att: 0.08, rel: 0.4 })));
    job(() => { for (let i = 0; i < 2; i++) { const o = voice(1.2, { f0: 70, f1: 60, jit: 0.6, breath: 0.6, rasp: 3, formants: [[350, 4, 1], [700, 5, 0.6]], tremD: 0.8, tremR: 22, att: 0.1, rel: 0.4 }); store('gurgle', o); } });
    job(() => { for (let i = 0; i < 2; i++) store('z_hiss', voice(0.7, { f0: 200, f1: 170, jit: 0.2, breath: 0.85, rasp: 3, formants: [[2500, 3, 1], [4200, 4, 0.6]], att: 0.1, rel: 0.4 })); });
    // --- stingers
    job(() => { const o = buf(3); add(o, tone(3, 55, 41, 1.5, 1.2, 'saw'), 0.5); add(o, tone(3, 110, 82, 1.5, 0.9, 'saw'), 0.25); biquad(o, 'lp', 500); add(o, biquad(noise(2.5, 0.8, 0.3), 'bp', 1800, 2), 0.4); add(o, tone(1, 60, 30, 0.1, 0.3), 1.2); clip(o, 2); fadeTail(o, 0.5); store('wave_start', norm(o, 0.85)); });
    job(() => { const o = buf(2.2); add(o, tone(2, 220, 220, 1, 0.8, 'tri'), 0.3); add(o, tone(2, 330, 330, 1, 0.8, 'tri'), 0.25, 0.15); add(o, tone(2, 440, 440, 1, 0.8, 'tri'), 0.2, 0.3); biquad(o, 'lp', 1800); fadeTail(o, 0.5); store('wave_clear', norm(o, 0.6)); });
    // --- ambience loops (seamless)
    job(() => { const n = noise(9, 1e9, 0.0001); biquad(n, 'lp', 380); biquad(n, 'lp', 420); gainEnv(n, (t) => 0.55 + 0.3 * Math.sin(TAU * t / 4.5) + 0.15 * Math.sin(TAU * t / 1.7)); const g = noise(9, 1e9); biquad(g, 'bp', 900, 3); gainEnv(g, (t) => Math.max(0, Math.sin(TAU * t / 3))); add(n, g, 0.3); store('amb_wind', norm(makeLoop(n, 1), 0.8)); });
    job(() => { const o = buf(9); add(o, tone(9, 55, 55, 1, 1e9, 'saw'), 0.3); add(o, tone(9, 55.35, 55.35, 1, 1e9, 'saw'), 0.3); add(o, tone(9, 82.6, 82.6, 1, 1e9, 'saw'), 0.15); biquad(o, 'lp', 240); biquad(o, 'lp', 300); gainEnv(o, (t) => 0.7 + 0.3 * Math.sin(TAU * t / 9)); const air = noise(9, 1e9); biquad(air, 'lp', 900); add(o, air, 0.08); store('amb_drone', norm(makeLoop(o, 1), 0.7)); });
    job(() => { const o = buf(7); add(o, tone(7, 50, 50, 1, 1e9), 0.4); add(o, tone(7, 100, 100, 1, 1e9), 0.25); add(o, tone(7, 150, 150, 1, 1e9), 0.1); const air = noise(7, 1e9); biquad(air, 'lp', 700); add(o, air, 0.25); store('amb_room', norm(makeLoop(o, 1), 0.5)); });
    job(() => { const n = noise(8, 1e9); biquad(n, 'hp', 900); biquad(n, 'lp', 7000); const o = buf(8); add(o, n, 0.5); for (let k = 0; k < 220; k++) add(o, click(0.01, rand(2000, 6000), 2), rand(0.1, 0.5), rand(0, 7.9)); const low = noise(8, 1e9); biquad(low, 'lp', 300); add(o, low, 0.4); store('amb_rain', norm(makeLoop(o, 1), 0.7)); });
    job(() => { const o = buf(10); const r = noise(10, 1e9); biquad(r, 'lp', 110); biquad(r, 'lp', 120); add(o, r, 1.2); for (let k = 0; k < 14; k++) add(o, tone(0.12, rand(1100, 1600), rand(600, 900), 0.03, 0.04), rand(0.2, 0.5), rand(0, 9.5)); for (let k = 0; k < 2; k++) add(o, metalTink(rand(200, 320)), 0.3, rand(1, 8)); store('amb_tunnel', norm(makeLoop(o, 1), 0.7)); });
    job(() => { const o = buf(10); add(o, tone(10, 60, 60, 1, 1e9, 'saw'), 0.12); add(o, tone(10, 120, 120, 1, 1e9), 0.12); biquad(o, 'lp', 500); const air = noise(10, 1e9); biquad(air, 'lp', 500); add(o, air, 0.35); for (let k = 0; k < 6; k++) add(o, metalTink(rand(160, 260)), rand(0.3, 0.6), rand(0.5, 9)); for (let k = 0; k < 3; k++) { const h = noise(0.8, 0.3, 0.05); biquad(h, 'hp', 3000); add(o, h, 0.15, rand(0, 9)); } store('amb_factory', norm(makeLoop(o, 1), 0.7)); });
    job(() => { const o = buf(4); for (const [f, g] of [[100, 0.4], [200, 0.25], [300, 0.15], [400, 0.08], [1000, 0.03]]) add(o, tone(4, f, f, 1, 1e9, 'sq'), g); biquad(o, 'lp', 1800); store('buzz', norm(makeLoop(o, 0.5), 0.4)); });
    job(() => { const o = buf(8); for (let k = 0; k < 9; k++) { const c = noise(0.5, 0.15, 0.02); biquad(c, 'bp', rand(300, 700), 3); add(o, c, rand(0.2, 0.5), rand(0, 7.5)); } const crick = buf(8); for (let k = 0; k < 60; k++) add(crick, tone(0.04, 4200, 4200, 1, 0.01), 0.15, (k % 3) * 0.06 + Math.floor(k / 3) * 0.4); add(o, crick, 1); const w = noise(8, 1e9); biquad(w, 'lp', 300); add(o, w, 0.5); store('amb_night', norm(makeLoop(o, 1), 0.6)); });
    job(() => { const o = buf(6); for (let k = 0; k < 20; k++) add(o, tone(0.25, 2200, 1800, 0.1, 0.08), 0.1, rand(0, 5.5)); const rumble = noise(6, 1e9); biquad(rumble, 'lp', 160); add(o, rumble, 0.6); store('amb_fire', norm(makeLoop(o, 0.8), 0.4)); });
  }

  // ------------------------------------------------ public API
  async function init(onProgress) {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { ready = false; return; }
    ctx = new AC();
    sr = ctx.sampleRate;
    master = ctx.createGain();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.18;
    sfxBus = ctx.createGain(); ambBus = ctx.createGain();
    verbIn = ctx.createGain(); verbGain = ctx.createGain();
    const conv = ctx.createConvolver();
    // generated impulse response: stereo decaying noise
    const irLen = Math.floor(sr * 2.4), ir = ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2);
      biquad(d, 'lp', 3200);
    }
    conv.buffer = ir;
    verbIn.connect(conv); conv.connect(verbGain); verbGain.connect(comp);
    sfxBus.connect(comp); ambBus.connect(master); comp.connect(master); master.connect(ctx.destination);
    applyVolumes();
    defineBank();
    for (let i = 0; i < jobs.length; i++) {
      jobs[i]();
      if (i % 4 === 3) { if (onProgress) onProgress(i / jobs.length); await new Promise((r) => setTimeout(r, 0)); }
    }
    jobs.length = 0;
    ready = true;
  }
  function genGun(key, params) {
    if (!ctx || bank[key]) return;
    store(key, gunshot(params));
    store(key, gunshot(params));
  }
  function resume() { if (ctx && ctx.state !== 'running') ctx.resume(); }
  function applyVolumes() {
    if (!ctx) return;
    const s = Settings.data;
    master.gain.value = s.masterVolume;
    sfxBus.gain.value = s.sfxVolume;
    ambBus.gain.value = s.ambienceVolume;
    verbGain.gain.value = 1;
  }
  function setListener(x, y) { listener.x = x; listener.y = y; }
  function setReverb(a) { verbAmt = a; }
  function play(name, o = {}) {
    if (!ready || !bank[name]) return null;
    if (voices >= MAX_VOICES && !o.force) return null;
    let vol = o.vol === undefined ? 1 : o.vol;
    let pan = o.pan || 0;
    if (o.x !== undefined) {
      const dx = o.x - listener.x, dy = (o.y === undefined ? listener.y : o.y) - listener.y;
      const d = Math.hypot(dx, dy), range = o.range || 1800;
      vol *= Math.pow(Math.max(0, 1 - d / range), 1.5);
      if (vol < 0.008) return null;
      pan = clamp(dx / 1000, -0.85, 0.85);
    }
    const arr = bank[name];
    const src = ctx.createBufferSource();
    src.buffer = arr[(Math.random() * arr.length) | 0];
    const rv = o.rateVar === undefined ? 0.06 : o.rateVar;
    src.playbackRate.value = (o.rate || 1) * (1 + rv * (Math.random() * 2 - 1));
    const g = ctx.createGain(); g.gain.value = vol;
    const pn = ctx.createStereoPanner(); pn.pan.value = pan;
    src.connect(g); g.connect(pn); pn.connect(sfxBus);
    let send = null;
    const vs = (o.verb === undefined ? 1 : o.verb) * verbAmt;
    if (vs > 0.01) { send = ctx.createGain(); send.gain.value = vs; pn.connect(send); send.connect(verbIn); }
    voices++;
    src.onended = () => { voices--; src.disconnect(); g.disconnect(); pn.disconnect(); if (send) send.disconnect(); };
    src.start();
    return { src, gain: g };
  }
  function loop(name, vol, fade = 1.5) {
    if (!ready || !bank[name]) return;
    let L = loops[name];
    if (!L) {
      if (vol <= 0.001) return;
      const src = ctx.createBufferSource(); src.buffer = bank[name][0]; src.loop = true;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(g); g.connect(ambBus); src.start();
      L = loops[name] = { src, g, vol: 0 };
    }
    if (Math.abs(L.vol - vol) < 0.005) return;
    L.vol = vol;
    const t = ctx.currentTime;
    L.g.gain.cancelScheduledValues(t);
    L.g.gain.setValueAtTime(L.g.gain.value, t);
    L.g.gain.linearRampToValueAtTime(vol, t + fade);
  }
  function stopLoops(fade = 1) { for (const k in loops) loop(k, 0, fade); }
  return {
    init, genGun, resume, applyVolumes, setListener, setReverb, play, loop, stopLoops,
    get ready() { return ready; }, get ctx() { return ctx; }, listener,
  };
})();
