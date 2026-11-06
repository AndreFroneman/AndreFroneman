'use strict';
// =====================================================================
//  Actor — shared character controller (AABB vs world/props, step-up
//  for stairs, one-way platforms, ladders) and procedural pose library.
// =====================================================================

const GRAV = 1800;
const STEP_H = 17;

const Phys = {
  tmp: [],
  // e: {x,y (feet), vx, vy, hw, h, grounded, drop, onLadder}
  move(e, dt, game, pushProps = false) {
    const w = game.world, tmp = this.tmp;
    e.blocker = null;
    e.blockSide = 0;
    // ---------------- horizontal
    if (e.vx !== 0) {
      let nx = e.x + e.vx * dt;
      const dir = Math.sign(e.vx);
      const top = e.y - e.h + 2, bot = e.y - 0.5;
      for (const b of w.query(Math.min(e.x, nx) - e.hw, top, Math.max(e.x, nx) + e.hw, bot, tmp)) {
        if (nx + e.hw <= b.x || nx - e.hw >= b.x + b.w) continue;
        if (b.oneway) {
          if (b.stair && (e.useStairs || b.auto) && e.grounded && !e.drop && b.y >= e.y - STEP_H && b.y < e.y - 0.5 && this.free(game, nx, b.y - 0.5, e.hw, e.h)) e.y = b.y;
          continue;
        }
        // step up small ledges (stairs)
        if (e.grounded && !e.onLadder && b.y >= e.y - STEP_H && b.y < e.y && this.free(game, nx, b.y - 0.5, e.hw, e.h)) { e.y = b.y; continue; }
        if (dir > 0) nx = Math.min(nx, b.x - e.hw); else nx = Math.max(nx, b.x + b.w + e.hw);
        e.blocker = b; e.blockSide = dir;
      }
      for (const p of game.props) {
        if (!p.solid || p.dead) continue;
        if (top >= p.y + p.h || bot <= p.y) continue;
        if (nx + e.hw <= p.x || nx - e.hw >= p.x + p.w) continue;
        const wasLeft = e.x + e.hw <= p.x + 2, wasRight = e.x - e.hw >= p.x + p.w - 2;
        if (!wasLeft && !wasRight) continue; // already overlapping (spawned inside) — ignore
        if (e.grounded && !e.onLadder && p.y >= e.y - STEP_H && p.y < e.y && this.free(game, nx, p.y - 0.5, e.hw, e.h)) { e.y = p.y; continue; }
        if (pushProps && p.def && p.def.movable && e.grounded) {
          const k = p.push(e.vx * 0.9);
          e.vx *= 0.35 + 0.4 * k;
        }
        if (dir > 0 && wasLeft) nx = Math.min(nx, p.x - e.hw);
        else if (dir < 0 && wasRight) nx = Math.max(nx, p.x + p.w + e.hw);
        e.blocker = p; e.blockSide = dir;
      }
      if (e.blocker) e.vx = 0;
      e.x = clamp(nx, e.hw + 2, w.w - e.hw - 2);
    }
    // ---------------- vertical
    if (!e.onLadder) e.vy = Math.min(e.vy + GRAV * dt, 1600);
    let ny = e.y + e.vy * dt;
    const wasGrounded = e.grounded;
    e.grounded = false;
    e.ground = null;
    if (e.vy >= 0) {
      for (const b of w.query(e.x - e.hw + 1, e.y - 2, e.x + e.hw - 1, ny + 1, tmp)) {
        if (b.oneway && (e.drop || e.onLadder || e.y > b.y + 1.5)) continue;
        if (e.y <= b.y + 1.5 && ny >= b.y) { ny = b.y; e.grounded = true; e.ground = b; }
      }
      for (const p of game.props) {
        if (!p.solid || p.dead) continue;
        if (e.x + e.hw - 1 <= p.x || e.x - e.hw + 1 >= p.x + p.w) continue;
        if (e.y <= p.y + 1.5 && ny >= p.y) { ny = p.y; e.grounded = true; e.ground = p; }
      }
      if (e.grounded) { e.landV = e.vy; e.vy = 0; }
    } else {
      for (const b of w.query(e.x - e.hw + 1, ny - e.h, e.x + e.hw - 1, e.y - e.h + 1, tmp)) {
        if (b.oneway) continue;
        if (b.y + b.h <= e.y - e.h + 1.5) { ny = Math.max(ny, b.y + b.h + e.h); e.vy = 0; }
      }
      if (!e.onLadder) for (const p of game.props) {
        if (!p.solid || p.dead || p.isWindow) continue;
        if (e.x + e.hw - 1 <= p.x || e.x - e.hw + 1 >= p.x + p.w) continue;
        if (p.y + p.h <= e.y - e.h + 1.5 && ny - e.h < p.y + p.h) { ny = p.y + p.h + e.h; e.vy = 0; }
      }
    }
    e.y = ny;
    e.justLanded = e.grounded && !wasGrounded;
    if (e.y > w.h + 400) e.fellOut = true;
  },
  free(game, x, y, hw, h) {
    const tmp = this.tmp2 || (this.tmp2 = []);
    for (const b of game.world.query(x - hw + 1, y - h + 1, x + hw - 1, y - 1, tmp)) if (!b.oneway) return false;
    for (const p of game.props) if (p.solid && !p.dead && rectsOverlap(x - hw + 1, y - h + 1, hw * 2 - 2, h - 2, p.x, p.y, p.w, p.h)) return false;
    return true;
  },
  ladderAt(game, x, y, h) {
    for (const L of game.world.ladders) if (Math.abs(x - (L.x + L.w / 2)) < L.w / 2 + 6 && y > L.y - 2 && y - h * 0.5 < L.y + L.h) return L;
    return null;
  },
};

// ---------------------------------------------------------------- poses
const Pose = {
  set(p, o) { for (const k in o) p[k] = o[k]; },
  blend(p, a, t) { for (const k in a) { if (k === 'px' || k === 'py' || k === 'air') p[k] = lerp(p[k] || 0, a[k], t); else p[k] = lerpAngle(p[k], a[k], t); } },
  stand(d) { return Body.standPose(d); },

  // ------------------------------------------------------------ gait
  // Foot-planted locomotion. Each foot is placed on the ground during its
  // stance phase and travels back under the body at exactly the body's
  // speed (no sliding, provided the caller advances ph by TAU * speed /
  // stride per second), then swings forward on a lift arc. Knees come from
  // 2-bone IK, the pelvis bobs (high at mid-stance when walking, low at
  // mid-stance when running) and runs get a flight phase via pose.air.
  //   ph      phase in radians; one cycle = one stride = two steps
  //   stride  px travelled per cycle (×amp); duty = stance fraction (<0.5 runs)
  //   amp     0 standing … 1 full stride; lift = swing foot clearance
  //   crouch  px pelvis drop; lean = torso pitch; arm = arm-swing amplitude
  gait(d, ph, o = {}) {
    const s = d.s, legL = d.th + d.sh;
    const amp = clamp(o.amp === undefined ? 1 : o.amp, 0, 1);
    const S = (o.stride === undefined ? 70 * s : o.stride) * amp;
    const duty = o.duty === undefined ? 0.6 : o.duty;
    const run = duty < 0.5;
    const lift = (o.lift === undefined ? 7 * s : o.lift) * Math.min(1, amp * 1.6);
    const u = ((ph / TAU) % 1 + 1) % 1;
    const bobA = (o.bob === undefined ? 2.2 * s : o.bob) * amp;
    const crouch = o.crouch || 0;
    const knee = (o.knee === undefined ? 1.2 : o.knee) * s; // standing knee flex (px of pelvis drop)
    // pelvis height
    const mid = Math.cos(2 * TAU * (u - duty / 2)); // +1 at mid-stance of either foot
    let py = -(legL + d.footH) + knee + crouch;
    py += run ? bobA * (0.5 + 0.5 * mid) : bobA * (0.5 - 0.5 * mid);
    // feet
    const foot = (v, limp, standX) => {
      const k = limp ? 0.55 : 1;
      let x, y = -d.footH, up = 0;
      if (v < duty) { const t = v / duty; x = S * k * duty * (0.5 - t); }
      else {
        const t = (v - duty) / (1 - duty);
        x = S * k * duty * (-0.5 + smooth(t));
        up = lift * (limp ? 0.45 : 1) * Math.sin(Math.PI * Math.pow(t, run ? 0.7 : 0.9));
        y -= up;
      }
      return [x + standX * (1 - amp) + (o.footFwd || 0), y, up];
    };
    const fF = foot(u, o.limpF, 3.5 * s), fB = foot((u + 0.5) % 1, o.limpB, -5 * s);
    if (o.limpF && u < duty) py += 2.5 * s; else if (o.limpB && (u + 0.5) % 1 < duty) py += 2.5 * s;
    const lF = ik2(0, py, fF[0], fF[1], d.th, d.sh, 1), lB = ik2(0, py, fB[0], fB[1], d.th, d.sh, 1);
    const lean = o.lean === undefined ? 0.06 : o.lean;
    const arm = (o.arm === undefined ? 0.5 : o.arm) * amp, sw = Math.cos(TAU * u);
    const elbow = o.elbow === undefined ? (run ? 1.35 : 0.3) : o.elbow;
    const uaF = Math.PI / 2 + arm * sw, uaB = Math.PI / 2 - arm * sw;
    return {
      px: o.px || 0, py,
      air: run ? Math.max(0, Math.min(fF[2], fB[2]) - (fF[2] > 0 && fB[2] > 0 ? 0 : 1e9)) : 0,
      torso: -Math.PI / 2 + lean + Math.sin(2 * TAU * u) * 0.025 * amp,
      head: -Math.PI / 2 + lean * 0.35 + (o.headTilt || 0),
      thF: lF[0], shF: lF[1], thB: lB[0], shB: lB[1],
      uaF, faF: uaF - elbow, uaB, faB: uaB - elbow,
    };
  },
  // stride length (px per cycle) a gait spec covers, for phase advance
  strideOf(d, o) { return (o.stride === undefined ? 70 * d.s : o.stride); },
  // planted fighting stance: front foot `front` px ahead, back foot `back`
  // px behind, pelvis dropped by `drop`; legs solved by IK into pose p
  stance(d, p, front, back, drop) {
    p.py = -(d.th + d.sh + d.footH) + 1.2 * d.s + drop; p.air = 0;
    const f = ik2(0, p.py, front, -d.footH, d.th, d.sh, 1), b = ik2(0, p.py, -back, -d.footH, d.th, d.sh, 1);
    p.thF = f[0]; p.shF = f[1]; p.thB = b[0]; p.shB = b[1];
    return p;
  },
  // sample a keyframe track: keys = [[t, {k: v, …}], …] sorted by t, eased per segment
  keys(track, t) {
    if (t <= track[0][0]) return track[0][1];
    for (let i = 1; i < track.length; i++) {
      const [t1, b] = track[i];
      if (t <= t1) {
        const [t0, a, ease] = track[i - 1];
        const u = (t - t0) / ((t1 - t0) || 1), e = ease === 'in' ? u * u : ease === 'out' ? 1 - (1 - u) * (1 - u) : smooth(u);
        const o = {};
        for (const k in a) o[k] = lerp(a[k], b[k] === undefined ? a[k] : b[k], e);
        return o;
      }
    }
    return track[track.length - 1][1];
  },

  // ------------------------------------------------------------ ladder
  // Hand-over-hand climbing on the ladder's real rungs (every 16 px from
  // its top). Diagonal pairs move together (front hand + back foot, then
  // back hand + front foot), each limb reaching two rungs at a time and
  // gripping while the body pulls past; hands and feet are IK-placed.
  // Returns a pose; arms and legs are solved, call fk(false) after.
  ladder(d, L, y, dirY = -1) {
    const s = d.s, R = 16;
    const Ly = L.y !== undefined ? L.y : L.top, Lh = L.h !== undefined ? L.h : L.bottom - L.top; // world ladder or route link
    const j0 = Math.floor((Lh - 1) / R), Yb = Ly + R * j0;
    const c = (Yb - y) / R;
    const py = -(d.th + d.sh + d.footH) + 7 * s;
    const torso = -Math.PI / 2 + 0.1, head = -Math.PI / 2 + (dirY < 0 ? -0.3 : 0.25);
    const limb = (o, base) => {
      const t = (c + o) / 2, n = Math.floor(t), f = t - n;
      const m = f < 0.5 ? smooth(f / 0.5) : 1;
      const k = 2 * n + base + 2 * m;
      return [Yb - R * k - y, f < 0.5 ? Math.sin(Math.PI * m) : 0];
    };
    const nx = Math.cos(torso) * d.torso, ny = Math.sin(torso) * d.torso;
    const Sx = nx - Math.cos(torso) * d.shoulderDrop, Sy = py + ny - Math.sin(torso) * d.shoulderDrop;
    // hands reach out to the rungs in front of the face; feet sit on rungs in front of the shins
    const hand = (o, base) => { const [ly, a] = limb(o, base); return ik2(Sx, Sy, 12 * s - a * 4 * s, ly, d.ua, d.fa * 0.92, -1); };
    const leg = (o, base) => { const [ly, a] = limb(o, base); return ik2(0, py, 8 * s - a * 3 * s, ly - d.footH - a * 2 * s, d.th, d.sh, 1); };
    const hF = hand(0.55, 6), hB = hand(1.55, 5), fB = leg(0.55, -1), fF = leg(1.55, -2);
    return { px: 0, py, torso, head, uaF: hF[0], faF: hF[1], uaB: hB[0], faB: hB[1], thF: fF[0], shF: fF[1], thB: fB[0], shB: fB[1], air: 0 };
  },
  walk(d, ph, o = {}) {
    const amp = o.amp === undefined ? 0.45 : o.amp, knee = o.knee === undefined ? 0.75 : o.knee;
    const lean = o.lean || 0.05;
    const s = Math.sin(ph), c = Math.cos(ph);
    const ampF = amp * (o.limpF ? 0.45 : 1), ampB = amp * (o.limpB ? 0.45 : 1);
    return {
      px: o.px || 0,
      py: -(d.th + d.sh + d.footH) + Math.abs(Math.cos(ph)) * (o.bob === undefined ? 2.2 : o.bob) - (o.crouch || 0),
      torso: -Math.PI / 2 + lean + Math.sin(ph * 2) * 0.03,
      head: -Math.PI / 2 + lean * 0.5 + (o.headTilt || 0),
      thF: Math.PI / 2 - ampF * s, shF: Math.PI / 2 - ampF * s + knee * Math.max(0, c) + (o.crouch ? 0.6 : 0.05),
      thB: Math.PI / 2 + ampB * s, shB: Math.PI / 2 + ampB * s + knee * Math.max(0, -c) + (o.crouch ? 0.6 : 0.05),
      uaF: Math.PI / 2 + amp * 0.8 * s, faF: Math.PI / 2 + amp * 0.8 * s - 0.35,
      uaB: Math.PI / 2 - amp * 0.8 * s, faB: Math.PI / 2 - amp * 0.8 * s - 0.35,
    };
  },
  crouchLegs(p, d, depth) {
    // bend knees keeping feet under pelvis
    p.thF = Math.PI / 2 - 0.9 * depth; p.shF = Math.PI / 2 + 0.95 * depth;
    p.thB = Math.PI / 2 - 0.55 * depth; p.shB = Math.PI / 2 + 1.05 * depth;
  },
  crawl(d, ph, speedK = 1) {
    const s = Math.sin(ph), c = Math.cos(ph);
    return {
      px: -d.torso * 0.45, py: -d.waistT * 0.5 - 1.5,
      torso: -0.2 + Math.sin(ph * 2) * 0.04, head: -0.75 + s * 0.08,
      uaF: 0.75 + 0.55 * s * speedK, faF: 1.35 + 0.35 * s * speedK - 0.3 * Math.max(0, c),
      uaB: 0.75 - 0.55 * s * speedK, faB: 1.35 - 0.35 * s * speedK - 0.3 * Math.max(0, -c),
      thF: Math.PI - 0.1 + 0.05 * s, shF: Math.PI - 0.05, thB: Math.PI - 0.16 - 0.05 * s, shB: Math.PI + 0.02,
    };
  },
  lying(d) {
    return { px: 0, py: -d.waistT * 0.45, torso: Math.PI - 0.05, head: Math.PI - 0.2, uaF: Math.PI * 0.65, faF: Math.PI * 0.55, uaB: Math.PI * 0.8, faB: Math.PI * 0.7, thF: -0.1, shF: 0.25, thB: 0.05, shB: 0.4 };
  },
  climb(d, ph) {
    const s = Math.sin(ph);
    return {
      px: 0, py: -(d.th + d.sh + d.footH) + 4, torso: -Math.PI / 2 - 0.05, head: -Math.PI / 2 - 0.15,
      uaF: -Math.PI / 2 + 0.55 + 0.45 * s, faF: -Math.PI / 2 + 0.2 + 0.3 * s, uaB: -Math.PI / 2 + 0.55 - 0.45 * s, faB: -Math.PI / 2 + 0.2 - 0.3 * s,
      thF: Math.PI / 2 - 0.5 - 0.45 * s, shF: Math.PI / 2 + 0.6 - 0.2 * s, thB: Math.PI / 2 - 0.5 + 0.45 * s, shB: Math.PI / 2 + 0.6 + 0.2 * s,
    };
  },
  vault(d, t) {
    return {
      px: 0, py: -(d.th + d.sh + d.footH) + 22, torso: -Math.PI / 2 + 0.95, head: -0.5,
      uaF: 0.55, faF: 1.1, uaB: 0.8, faB: 1.3,
      thF: 0.2 + t * 0.6, shF: 1.6, thB: 1.2, shB: 2.2,
    };
  },
};
