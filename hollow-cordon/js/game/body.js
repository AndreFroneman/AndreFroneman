'use strict';
// =====================================================================
//  Body — articulated skeleton: forward kinematics, 2-bone IK, rendering
//  of baked part sprites, wounds, stumps, and per-bone hit capsules.
//  Local space faces +x; feet origin at (0,0); y down.
// =====================================================================

const BONES = [
  // id, from, to, limb group, sprite key, hit radius factor (of thickness), draw layer
  { id: 'uaB', a: 'shoulder', b: 'elbowB', limb: 'armB', spr: 'uaB', rk: 'uaT', layer: 0 },
  { id: 'faB', a: 'elbowB', b: 'handB', limb: 'armB', spr: 'faB', rk: 'faT', layer: 0 },
  { id: 'thB', a: 'pelvis', b: 'kneeB', limb: 'legB', spr: 'thB', rk: 'thT', layer: 1 },
  { id: 'shB', a: 'kneeB', b: 'footB', limb: 'legB', spr: 'shB', rk: 'shT', layer: 1 },
  { id: 'torso', a: 'pelvis', b: 'neck', limb: 'torso', spr: 'torso', rk: 'torsoT', layer: 2 },
  { id: 'thF', a: 'pelvis', b: 'kneeF', limb: 'legF', spr: 'th', rk: 'thT', layer: 3 },
  { id: 'shF', a: 'kneeF', b: 'footF', limb: 'legF', spr: 'sh', rk: 'shT', layer: 3 },
  { id: 'head', a: 'neck', b: 'head', limb: 'head', spr: 'head', rk: 'headR', layer: 4 },
  { id: 'uaF', a: 'shoulder', b: 'elbowF', limb: 'armF', spr: 'ua', rk: 'uaT', layer: 6 },
  { id: 'faF', a: 'elbowF', b: 'handF', limb: 'armF', spr: 'fa', rk: 'faT', layer: 6 },
];
const BONE_BY_ID = Object.fromEntries(BONES.map((b) => [b.id, b]));
const BONE_CHILD = { uaF: 'faF', uaB: 'faB', thF: 'shF', thB: 'shB' };
const BONE_PARENT = { faF: 'uaF', faB: 'uaB', shF: 'thF', shB: 'thB' };
const JOINTS = ['pelvis', 'neck', 'shoulder', 'head', 'elbowF', 'handF', 'elbowB', 'handB', 'kneeF', 'footF', 'kneeB', 'footB'];

function ik2(sx, sy, tx, ty, a, b, bend) {
  let dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  const dmax = (a + b) * 0.999, dmin = Math.abs(a - b) + 0.01;
  d = clamp(d, dmin, dmax);
  const base = Math.atan2(dy, dx);
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const up = base - bend * Math.acos(cosA);
  const ex = sx + Math.cos(up) * a, ey = sy + Math.sin(up) * a;
  const lo = Math.atan2(ty - ey, tx - ex);
  return [up, lo];
}

class Body {
  constructor(look, scale = 1, build = 1, limb = 1) {
    this.look = look;
    this.d = BodyArt.dimsFor(scale, build, limb);
    this.spr = BodyArt.get(look, this.d);
    this.j = {};
    for (const n of JOINTS) this.j[n] = { x: 0, y: 0 };
    this.pose = Body.standPose(this.d);
    this.missing = {};      // boneId -> true when severed
    this.headGone = false;  // head destroyed (exploded)
    this.jawLeft = false;
    this.gutted = false;
    this.wounds = {};
    this.tint = 0;          // hit flash
  }
  static standPose(d) {
    return { px: 0, py: -(d.th + d.sh + d.footH), torso: -Math.PI / 2, head: -Math.PI / 2, uaF: Math.PI / 2, faF: Math.PI / 2, uaB: Math.PI / 2, faB: Math.PI / 2, thF: Math.PI / 2, shF: Math.PI / 2, thB: Math.PI / 2, shB: Math.PI / 2 };
  }
  fk(groundFit = true) {
    const p = this.pose, d = this.d, j = this.j;
    j.pelvis.x = p.px; j.pelvis.y = p.py;
    j.neck.x = p.px + Math.cos(p.torso) * d.torso; j.neck.y = p.py + Math.sin(p.torso) * d.torso;
    j.shoulder.x = j.neck.x - Math.cos(p.torso) * d.shoulderDrop; j.shoulder.y = j.neck.y - Math.sin(p.torso) * d.shoulderDrop;
    const hl = d.neck + d.headR * 0.75;
    j.head.x = j.neck.x + Math.cos(p.head) * hl; j.head.y = j.neck.y + Math.sin(p.head) * hl;
    j.elbowF.x = j.shoulder.x + Math.cos(p.uaF) * d.ua; j.elbowF.y = j.shoulder.y + Math.sin(p.uaF) * d.ua;
    j.handF.x = j.elbowF.x + Math.cos(p.faF) * d.fa; j.handF.y = j.elbowF.y + Math.sin(p.faF) * d.fa;
    j.elbowB.x = j.shoulder.x + Math.cos(p.uaB) * d.ua; j.elbowB.y = j.shoulder.y + Math.sin(p.uaB) * d.ua;
    j.handB.x = j.elbowB.x + Math.cos(p.faB) * d.fa; j.handB.y = j.elbowB.y + Math.sin(p.faB) * d.fa;
    j.kneeF.x = p.px + Math.cos(p.thF) * d.th; j.kneeF.y = p.py + Math.sin(p.thF) * d.th;
    j.footF.x = j.kneeF.x + Math.cos(p.shF) * d.sh; j.footF.y = j.kneeF.y + Math.sin(p.shF) * d.sh;
    j.kneeB.x = p.px + Math.cos(p.thB) * d.th; j.kneeB.y = p.py + Math.sin(p.thB) * d.th;
    j.footB.x = j.kneeB.x + Math.cos(p.shB) * d.sh; j.footB.y = j.kneeB.y + Math.sin(p.shB) * d.sh;
    if (groundFit) {
      let low = -Infinity;
      if (!this.missing.shF && !this.missing.thF) low = Math.max(low, j.footF.y);
      else if (!this.missing.thF) low = Math.max(low, j.kneeF.y);
      if (!this.missing.shB && !this.missing.thB) low = Math.max(low, j.footB.y);
      else if (!this.missing.thB) low = Math.max(low, j.kneeB.y);
      if (low === -Infinity) low = j.pelvis.y + d.waistT * 0.4;
      const off = -d.footH - low - (p.air || 0); // air: both feet off the ground (running flight)
      for (const n of JOINTS) j[n].y += off;
      this.fitOff = off;
    }
  }
  // world position of a local joint
  wj(name, x, y, face) { const q = this.j[name]; return [x + q.x * face, y + q.y]; }
  lenOf(id) { const d = this.d; return { uaF: d.ua, uaB: d.ua, faF: d.fa, faB: d.fa, thF: d.th, thB: d.th, shF: d.sh, shB: d.sh, torso: d.torso, head: d.neck + d.headR * 0.75 }[id]; }

  boneMissing(id) {
    if (this.missing[id]) return true;
    const p = BONE_PARENT[id];
    return p ? !!this.missing[p] : false;
  }
  limbState(limb) { // 'ok' | 'gone' | 'partial'
    const map = { armF: ['uaF', 'faF'], armB: ['uaB', 'faB'], legF: ['thF', 'shF'], legB: ['thB', 'shB'] };
    const [u, l] = map[limb];
    if (this.missing[u]) return 'gone';
    if (this.missing[l]) return 'partial';
    return 'ok';
  }

  clone() {
    const b = Object.create(Body.prototype);
    b.look = this.look; b.d = this.d; b.spr = this.spr;
    b.j = {}; for (const n of JOINTS) b.j[n] = { x: this.j[n].x, y: this.j[n].y };
    b.pose = Object.assign({}, this.pose); b.missing = Object.assign({}, this.missing);
    b.headGone = this.headGone; b.jawLeft = this.jawLeft; b.gutted = this.gutted;
    b.wounds = JSON.parse(JSON.stringify(this.wounds)); b.tint = 0;
    return b;
  }

  addWound(id, u, v, r) {
    const w = this.wounds[id] || (this.wounds[id] = []);
    if (w.length > 7) w.shift();
    w.push([u, v, r]);
  }

  // --------------------------------------------------------------- draw
  draw(ctx, x, y, face, hooks) {
    const j = this.j, spr = this.spr;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    this._M = ctx.getTransform();
    for (let layer = 0; layer <= 6; layer++) {
      if (layer === 2 && hooks && hooks.back) hooks.back(ctx);   // between back limbs and torso
      if (layer === 5 && hooks && hooks.weapon) hooks.weapon(ctx);
      for (const b of BONES) {
        if (b.layer !== layer) continue;
        if (this.boneMissing(b.id)) { if (this.missing[b.id]) this.drawStump(ctx, b); continue; }
        if (b.id === 'head') { this.drawHead(ctx); continue; }
        const A = j[b.a], B = j[b.b];
        const s = b.id === 'torso' ? (this.gutted ? spr.torsoGut : spr.torso) : spr[b.spr];
        this.drawSeg(ctx, s, A.x, A.y, B.x, B.y, this.lenOf(b.id), b.id);
      }
    }
    if (hooks && hooks.front) hooks.front(ctx);
    ctx.restore();
  }
  drawSeg(ctx, s, ax, ay, bx, by, L, id) {
    const ang = Math.atan2(by - ay, bx - ax);
    const len = Math.hypot(bx - ax, by - ay);
    const M = this._M || ctx.getTransform();
    ctx.save();
    xform(ctx, M, ax, ay, ang, Math.abs(len - L) > 0.5 ? clamp(len / L, 0.6, 1.4) : 1, 1);
    ctx.drawImage(s.cv, s.ox, s.oy, s.w, s.h);
    const w = this.wounds[id];
    if (w) {
      const T = this.d[BONE_BY_ID[id].rk] || 8;
      for (const [u, v, r] of w) drawWound(ctx, u * L, v * T * 0.5, r);
    }
    if (this.tint > 0) { ctx.globalAlpha = this.tint * 0.5; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(s.cv, s.ox, s.oy, s.w, s.h); }
    ctx.restore();
  }
  drawHead(ctx) {
    const j = this.j, d = this.d;
    if (this.headGone) {
      // ragged neck stump (+ maybe dangling jaw)
      const ang = Math.atan2(j.head.y - j.neck.y, j.head.x - j.neck.x);
      ctx.save(); ctx.translate(j.neck.x, j.neck.y); ctx.rotate(ang);
      if (this.jawLeft) { ctx.save(); ctx.translate(d.neck * 0.9, 0); ctx.rotate(Math.PI / 2 + 0.4); const jw = this.spr.jaw; ctx.drawImage(jw.cv, jw.ox, jw.oy, jw.w, jw.h); ctx.restore(); }
      drawStumpCap(ctx, d.neck * 0.6, 0, d.headR * 0.55, ang);
      ctx.restore();
      return;
    }
    const ang = Math.atan2(j.head.y - j.neck.y, j.head.x - j.neck.x) + Math.PI / 2;
    const s = this.spr.head;
    ctx.save(); ctx.translate(j.head.x, j.head.y); ctx.rotate(ang);
    ctx.drawImage(s.cv, s.ox, s.oy, s.w, s.h);
    const w = this.wounds.head;
    if (w) for (const [u, v, r] of w) drawWound(ctx, v * d.headR * 0.8, (u - 0.5) * d.headR * 1.4, r);
    if (this.tint > 0) { ctx.globalAlpha = this.tint * 0.5; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(s.cv, s.ox, s.oy, s.w, s.h); }
    ctx.restore();
  }
  drawStump(ctx, b) {
    const A = this.j[b.a], B = this.j[b.b];
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    const T = this.d[b.rk];
    ctx.save(); ctx.translate(A.x, A.y); ctx.rotate(ang);
    drawStumpCap(ctx, 1.5, 0, T * 0.42, 0);
    ctx.restore();
  }

  // ------------------------------------------------------------ hitboxes
  capsules(x, y, face, out) {
    const j = this.j, d = this.d;
    out.length = 0;
    for (const b of BONES) {
      if (this.boneMissing(b.id)) continue;
      if (b.id === 'head') {
        if (this.headGone) continue;
        const hx = x + j.head.x * face, hy = y + j.head.y;
        const nx = x + j.neck.x * face, ny = y + j.neck.y;
        const ux = (hx - nx), uy = (hy - ny), L = Math.hypot(ux, uy) || 1;
        out.push({ bone: 'head', ax: hx - ux / L * d.headR * 0.35, ay: hy - uy / L * d.headR * 0.35, bx: hx + ux / L * d.headR * 0.25, by: hy + uy / L * d.headR * 0.25, r: d.headR * 0.95 });
        continue;
      }
      const A = j[b.a], B = j[b.b];
      const rr = b.id === 'torso' ? d.torsoT * 0.5 : d[b.rk] * 0.55;
      let bx = x + B.x * face, by = y + B.y;
      let ax = x + A.x * face, ay = y + A.y;
      if (b.id === 'torso') { // shrink so the capsule caps don't overshoot the shoulders/pelvis
        const ux = bx - ax, uy = by - ay;
        ax += ux * 0.08; ay += uy * 0.08; bx -= ux * 0.1; by -= uy * 0.1;
      }
      out.push({ bone: b.id, ax, ay, bx, by, r: rr });
    }
    return out;
  }
}

function drawWound(ctx, x, y, r) {
  ctx.fillStyle = '#3a0606';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#120202';
  ctx.beginPath(); ctx.arc(x + r * 0.1, y, r * 0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(140,20,20,0.6)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, TAU); ctx.fill();
}
function drawStumpCap(ctx, x, y, r) {
  ctx.fillStyle = '#4a0707';
  ctx.beginPath();
  for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = r * (0.85 + ((k * 37) % 5) * 0.06); k ? ctx.lineTo(x + Math.cos(a) * rr * 0.7, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr * 0.7, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a1414'; ctx.beginPath(); ctx.ellipse(x + 0.5, y, r * 0.45, r * 0.7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e2d8c2'; ctx.beginPath(); ctx.ellipse(x + 1, y, r * 0.22, r * 0.28, 0, 0, TAU); ctx.fill();
}
