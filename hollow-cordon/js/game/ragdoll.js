'use strict';
// =====================================================================
//  Ragdoll — verlet-integrated corpses & severed body parts. Points
//  are body joints, sticks are bones plus soft joint-limit constraints.
//  Corpses stay shootable: bullets push them, add wounds, and can sever
//  limbs, pop heads or spill intestines.
// =====================================================================

const RD_GRAV = 1500;

class Ragdoll {
  constructor(game, body, ex, ey, face, vx, vy, bones, opts = {}) {
    this.game = game;
    this.body = body;
    this.face = face;
    this.pts = {};
    this.bp = {};          // boneId -> [pointA, pointB]
    this.sticks = [];
    this.soft = [];
    this.sleep = false;
    this.still = 0;
    this.age = 0;
    this.bleed = opts.bleed === undefined ? 5 : opts.bleed;
    this.poolT = 0;
    this.isPiece = !!opts.piece;
    this.hp = { head: body.d.headR * 4, torso: 220, uaF: 60, faF: 50, uaB: 60, faB: 50, thF: 80, shF: 60, thB: 80, shB: 60 };
    this.fade = 1;
    this.burn = opts.burn || 0;
    this.color = opts.color;
    const d = body.d, j = body.j;
    this.bones = bones || BONES.filter((b) => !body.boneMissing(b.id)).map((b) => b.id);
    const need = new Set();
    for (const id of this.bones) { const b = BONE_BY_ID[id]; need.add(b.a); need.add(b.b); }
    const dt0 = 1 / 60;
    for (const n of need) {
      const q = j[n];
      const x = ex + q.x * face, y = ey + q.y;
      const r = n === 'head' ? d.headR * 0.8 : n === 'pelvis' ? d.waistT * 0.35 : n === 'neck' || n === 'shoulder' ? d.torsoT * 0.3 : n.startsWith('foot') ? 4.5 * d.s : n.startsWith('knee') ? 5 * d.s : 3.5 * d.s;
      this.pts[n] = { x, y, px: x - vx * dt0 * rand(0.8, 1.2), py: y - vy * dt0 * rand(0.8, 1.2), r, n };
    }
    for (const id of this.bones) {
      const b = BONE_BY_ID[id];
      const A = this.pts[b.a], B = this.pts[b.b];
      this.bp[id] = [A, B];
      this.sticks.push({ a: A, b: B, len: Math.hypot(B.x - A.x, B.y - A.y), id });
    }
    const P = this.pts;
    const addS = (a, b, min, max, tag) => { if (P[a] && P[b]) this.soft.push({ a: P[a], b: P[b], min, max, tag }); };
    if (P.shoulder && P.pelvis && P.neck) {
      this.sticks.push({ a: P.shoulder, b: P.pelvis, len: d.torso - d.shoulderDrop, id: 'torso' });
      this.sticks.push({ a: P.shoulder, b: P.neck, len: d.shoulderDrop, id: 'torso' });
    }
    addS('head', 'pelvis', (d.torso + d.neck) * 0.85, 1e9, 'head');
    addS('handF', 'shoulder', (d.ua + d.fa) * 0.35, 1e9, 'faF');
    addS('handB', 'shoulder', (d.ua + d.fa) * 0.35, 1e9, 'faB');
    addS('footF', 'pelvis', (d.th + d.sh) * 0.45, 1e9, 'shF');
    addS('footB', 'pelvis', (d.th + d.sh) * 0.45, 1e9, 'shB');
    addS('kneeF', 'neck', d.torso * 0.75, 1e9, 'thF');
    addS('kneeB', 'neck', d.torso * 0.75, 1e9, 'thB');
    addS('kneeF', 'kneeB', 0, d.th * 1.5, 'thF');
    addS('elbowF', 'pelvis', d.torso * 0.3, 1e9, 'uaF');
    addS('elbowB', 'pelvis', d.torso * 0.3, 1e9, 'uaB');
    this.cap = [];
    this.bbox = [0, 0, 0, 0];
    this.updateBBox();
  }

  points() { return Object.values(this.pts); }
  updateBBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k in this.pts) { const p = this.pts[k]; if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    for (const s of this.sticks) { const p = s.a; if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    this.bbox[0] = x0 - 14; this.bbox[1] = y0 - 14; this.bbox[2] = x1 + 14; this.bbox[3] = y1 + 14;
  }
  allPoints() {
    const s = new Set();
    for (const st of this.sticks) { s.add(st.a); s.add(st.b); }
    return s;
  }
  wake() { this.sleep = false; this.still = 0; }

  update(dt) {
    this.age += dt;
    if (this.burn > 0) {
      this.burn -= dt;
      if (Math.random() < 0.5) { const p = this.pts.pelvis || this.sticks[0].a; this.game.fx.fire(p.x + rand(-20, 20), p.y - rand(0, 30), 1, 12); }
    }
    // blood pooling under fresh corpses
    if (this.bleed > 0 && Settings.goreMul() > 0) {
      this.bleed -= dt;
      this.poolT -= dt;
      if (this.poolT <= 0 && this.sleep) {
        this.poolT = 0.35;
        const p = this.pts.pelvis || this.pts.neck || this.sticks[0].a;
        const gy = this.game.world.groundBelow(p.x, p.y - 4, 60);
        if (gy - p.y < 40) Decal.floor(this.game.world, p.x + rand(-18, 18), gy, rand(2.5, 5) * (1 + (5 - this.bleed) * 0.25));
      }
    }
    if (this.sleep) return;
    const w = this.game.world;
    const pts = this.allPoints();
    const dt2 = dt * dt;
    let motion = 0;
    for (const p of pts) {
      const vx = (p.x - p.px) * 0.992, vy = (p.y - p.py) * 0.992;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + RD_GRAV * dt2;
      motion += Math.abs(vx) + Math.abs(vy);
    }
    const tmp = this.game.tmpBlocks;
    for (let it = 0; it < 5; it++) {
      for (const s of this.sticks) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - s.len) / d * 0.5;
        s.a.x += dx * diff; s.a.y += dy * diff; s.b.x -= dx * diff; s.b.y -= dy * diff;
      }
      for (const s of this.soft) {
        const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, d = Math.hypot(dx, dy) || 0.001;
        let target = d;
        if (d < s.min) target = s.min; else if (d > s.max) target = s.max; else continue;
        const diff = (d - target) / d * 0.25;
        s.a.x += dx * diff; s.a.y += dy * diff; s.b.x -= dx * diff; s.b.y -= dy * diff;
      }
      for (const p of pts) this.collide(p, w, tmp);
    }
    this.updateBBox();
    if (motion < 0.6 * pts.size * 0.2) { this.still += dt; if (this.still > 0.8) this.sleep = true; } else this.still = 0;
    if (this.bbox[1] > w.h + 300) this.dead = true;
  }
  collide(p, w, tmp) {
    const r = p.r;
    w.query(p.x - r, p.y - r, p.x + r, p.y + r, tmp);
    const props = this.game.solidPropsNear(p.x, p.y, r);
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? tmp : props;
      for (const b of list) {
        if (p.x + r <= b.x || p.x - r >= b.x + b.w || p.y + r <= b.y || p.y - r >= b.y + b.h) continue;
        if (b.oneway) {
          if (p.py + r <= b.y + 2 && p.y + r > b.y) { p.y = b.y - r; this.fric(p); }
          continue;
        }
        const pl = p.x + r - b.x, pr = b.x + b.w - (p.x - r), pt = p.y + r - b.y, pb = b.y + b.h - (p.y - r);
        const m = Math.min(pl, pr, pt, pb);
        if (m === pt) { p.y = b.y - r; this.fric(p); }
        else if (m === pb) { p.y = b.y + b.h + r; }
        else if (m === pl) { p.x = b.x - r; }
        else { p.x = b.x + b.w + r; }
      }
    }
  }
  fric(p) { p.px = p.x - (p.x - p.px) * 0.55; if (p.py < p.y) p.py = p.y - (p.y - p.py) * 0.2; }

  impulse(px, py, ix, iy, radius = 30) {
    this.wake();
    for (const p of this.allPoints()) {
      const d = Math.hypot(p.x - px, p.y - py);
      const k = Math.max(0, 1 - d / radius);
      if (k <= 0) continue;
      p.px -= ix * k / 60; p.py -= iy * k / 60;
    }
  }

  capsules(out) {
    out.length = 0;
    const d = this.body.d;
    for (const id of this.bones) {
      const [A, B] = this.bp[id];
      const b = BONE_BY_ID[id];
      if (id === 'head') {
        if (this.body.headGone) continue;
        out.push({ bone: id, ax: B.x, ay: B.y, bx: B.x + (B.x - A.x) * 0.15, by: B.y + (B.y - A.y) * 0.15, r: d.headR * 0.95 });
      } else out.push({ bone: id, ax: A.x, ay: A.y, bx: B.x, by: B.y, r: id === 'torso' ? d.torsoT * 0.48 : d[b.rk] * 0.55 });
    }
    return out;
  }

  // bullet / blast damage on a corpse bone
  damage(bone, dmg, dirx, diry, force, hx, hy, opts = {}) {
    const fx = this.game.fx;
    this.impulse(hx, hy, dirx * force * 2.2, diry * force * 2.2, 26);
    if (Settings.goreMul() > 0) {
      fx.blood(hx, hy, -dirx, -diry, 3, 0.6);
      fx.blood(hx, hy, dirx, diry, 5, 0.9);
    }
    const B = BONE_BY_ID[bone];
    if (B && bone !== 'head') this.body.addWound(bone, rand(0.2, 0.9), rand(-0.6, 0.6), rand(1.4, 2.4));
    this.hp[bone] -= dmg;
    if (this.hp[bone] > 0 || !Settings.data.dismemberment || Settings.goreMul() <= 0) return;
    if (bone === 'head' && !this.body.headGone) { Gore.headBurst(this.game, this.body, hx, hy, dirx, diry, this); }
    else if (bone === 'torso') { if (!this.body.gutted) { this.body.gutted = true; Gore.gut(this.game, hx, hy, dirx, diry, () => { const p = this.pts.pelvis; return p ? [p.x, p.y] : null; }); } }
    else if (B && this.bones.includes(bone)) this.sever(bone, true);
  }

  sever(bone, fx = true) {
    const B = BONE_BY_ID[bone];
    const pair = this.bp[bone];
    if (!pair) return;
    const parentPt = pair[0];
    const np = { x: parentPt.x, y: parentPt.y, px: parentPt.px, py: parentPt.py, r: parentPt.r * 0.8, n: B.a + '_cut' };
    pair[0] = np;
    for (const s of this.sticks) if (s.id === bone) { if (s.a === parentPt) s.a = np; if (s.b === parentPt) s.b = np; }
    const child = BONE_CHILD[bone];
    this.soft = this.soft.filter((s) => s.tag !== bone && s.tag !== child);
    this.wake();
    if (fx) {
      Sfx.play('dismember', { x: parentPt.x, y: parentPt.y, vol: 0.7 });
      this.game.fx.blood(parentPt.x, parentPt.y, 0, -1, 10, 0.8);
      const stumpPt = parentPt, cutPt = np;
      this.game.fx.emit(() => [stumpPt.x, stumpPt.y, Math.atan2(stumpPt.y - (this.pts.pelvis || stumpPt).y, stumpPt.x - (this.pts.pelvis || stumpPt).x) || -Math.PI / 2], 30, 2.5);
      this.game.fx.emit(() => [cutPt.x, cutPt.y, rand(0, TAU)], 14, 1.2);
      this.game.fx.gib('bone', parentPt.x, parentPt.y, rand(-120, 120), rand(-260, -80));
    }
  }

  draw(ctx) {
    const body = this.body, face = this.face;
    const spr = body.spr;
    ctx.save();
    if (this.fade < 1) ctx.globalAlpha = this.fade;
    ctx.scale(face, 1);
    for (let layer = 0; layer <= 6; layer++) {
      for (const b of BONES) {
        if (b.layer !== layer) continue;
        const pair = this.bp[b.id];
        if (!pair) continue;
        const [A, B2] = pair;
        const ax = A.x * face, ay = A.y, bx = B2.x * face, by = B2.y;
        if (b.id === 'head') {
          body.j.neck.x = ax; body.j.neck.y = ay; body.j.head.x = bx; body.j.head.y = by;
          body.drawHead(ctx);
          continue;
        }
        const s = b.id === 'torso' ? (body.gutted ? spr.torsoGut : spr.torso) : spr[b.spr];
        body.drawSeg(ctx, s, ax, ay, bx, by, body.lenOf(b.id), b.id);
        const T = body.d[b.rk];
        if (A.n.endsWith('_cut')) capAt(ctx, ax, ay, Math.atan2(ay - by, ax - bx), T);
        const ch = BONE_CHILD[b.id];
        if (ch && (!this.bp[ch] || this.bp[ch][0] !== B2)) capAt(ctx, bx, by, Math.atan2(by - ay, bx - ax), body.d[BONE_BY_ID[ch].rk]);
      }
      if (layer === 2 && this.bp.torso) {
        const [Pp, Nn] = this.bp.torso;
        const cx = (Pp.x + Nn.x) / 2 * face, cy = (Pp.y + Nn.y) / 2;
        for (const id of ['uaF', 'uaB', 'thF', 'thB', 'head']) {
          const pair = this.bp[id];
          const tj = this.pts[BONE_BY_ID[id].a];
          if (!tj || (pair && pair[0] === tj)) continue;
          const x = tj.x * face, y = tj.y;
          capAt(ctx, x, y, Math.atan2(y - cy, x - cx), body.d[BONE_BY_ID[id].rk] * (id === 'head' ? 0.6 : 1));
        }
      }
    }
    ctx.restore();
  }
}
function capAt(ctx, x, y, ang, T) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  drawStumpCap(ctx, 0, 0, T * 0.42);
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Gore — shared helpers for big gore events
// ---------------------------------------------------------------------
const Gore = {
  headBurst(game, body, hx, hy, dx, dy, ragdoll) {
    if (body.headGone) return;
    body.headGone = true;
    body.jawLeft = Math.random() < 0.45;
    const fx = game.fx;
    const g = Settings.goreMul();
    Sfx.play('gore_burst', { x: hx, y: hy, vol: 1 });
    if (g <= 0) return;
    fx.blood(hx, hy, dx, dy, 28, 1.3, { spread: 0.9, big: 1.2 });
    fx.blood(hx, hy, 0, -1, 14, 1.1, { spread: 1.2 });
    const n = Math.ceil(6 * g);
    for (let i = 0; i < n; i++) fx.gib('brain', hx, hy, dx * rand(150, 500) + rand(-140, 140), dy * rand(100, 300) - rand(100, 380));
    for (let i = 0; i < Math.ceil(4 * g); i++) fx.gib('skull', hx, hy, dx * rand(120, 420) + rand(-160, 160), -rand(150, 420));
    for (let i = 0; i < Math.ceil(5 * g); i++) fx.gib('flesh', hx, hy, dx * rand(100, 400) + rand(-180, 180), -rand(80, 380));
    if (chance(0.8)) fx.gib('eye', hx, hy, dx * rand(100, 300) + rand(-100, 100), -rand(150, 350));
    if (chance(0.5)) fx.gib('eye', hx, hy, dx * rand(100, 300) + rand(-100, 100), -rand(150, 350));
    for (let i = 0; i < 3; i++) fx.gib('tooth', hx, hy, rand(-200, 200), -rand(100, 300));
    if (body.look.helmet) fx.gib(body.look.helmet === 'riot' ? 'helmet' : 'milhelmet', hx, hy, dx * 260 + rand(-60, 60), -rand(260, 420), { r: 7, bleed: 0, sound: 'hit_metal' });
    // neck fountain
    const src = ragdoll
      ? () => { const p = ragdoll.bp.head ? ragdoll.bp.head[0] : ragdoll.pts.neck; const q = ragdoll.pts.pelvis || p; return p ? [p.x, p.y, Math.atan2(p.y - q.y, p.x - q.x)] : null; }
      : () => game.neckSource(body);
    fx.emit(src, 55 * g, 3.5, { power: 1.2 });
    Sfx.play('spurt', { x: hx, y: hy, vol: 0.6 });
  },
  gut(game, x, y, dx, dy, attach) {
    const fx = game.fx, g = Settings.goreMul();
    if (g <= 0) return;
    Sfx.play('gore_burst', { x, y, vol: 0.9 });
    fx.blood(x, y, dx, dy, 24, 1.1, { spread: 1 });
    for (let i = 0; i < Math.ceil(2 * g); i++) fx.gib('organ', x, y, dx * rand(80, 300) + rand(-120, 120), -rand(80, 300));
    for (let i = 0; i < Math.ceil(5 * g); i++) fx.gib('flesh', x, y, dx * rand(80, 350) + rand(-150, 150), -rand(60, 320));
    for (let i = 0; i < Math.ceil(2 * g); i++) fx.gib('rib', x, y, rand(-200, 200), -rand(100, 300));
    fx.intestines(x, y, dx * 300, dy * 200 - 120, attach);
    if (g > 1) fx.intestines(x, y, dx * 200 + rand(-100, 100), -150, null);
  },
  explodeBody(game, body, ex, ey, face, vx, vy) {
    // full gib: only fragments remain
    const fx = game.fx, g = Settings.goreMul();
    const j = body.j;
    const cx = ex + j.pelvis.x * face, cy = ey + (j.pelvis.y + j.neck.y) / 2;
    Sfx.play('gore_burst', { x: cx, y: cy, vol: 1 });
    if (g <= 0) return;
    fx.blood(cx, cy, 0, -1, 50, 1.6, { spread: 1.6, big: 1.3 });
    for (let i = 0; i < Math.ceil(10 * g); i++) fx.gib(chance(0.3) ? 'skinflesh' : 'flesh', cx + rand(-15, 15), cy + rand(-25, 25), vx * 0.3 + rand(-420, 420), vy * 0.3 - rand(100, 600));
    for (let i = 0; i < Math.ceil(4 * g); i++) fx.gib('bone', cx, cy, rand(-400, 400), -rand(100, 500));
    for (let i = 0; i < Math.ceil(3 * g); i++) fx.gib('organ', cx, cy, rand(-300, 300), -rand(100, 400));
    for (let i = 0; i < Math.ceil(3 * g); i++) fx.gib('rib', cx, cy, rand(-300, 300), -rand(100, 400));
    fx.intestines(cx, cy, rand(-300, 300), -300, null);
    if (!body.headGone) { body.headGone = true; for (let i = 0; i < 4; i++) fx.gib('brain', cx, cy - 30, rand(-300, 300), -rand(200, 500)); fx.gib('eye', cx, cy - 30, rand(-200, 200), -rand(200, 400)); }
    Decal.scorch(game.world, cx, cy, 10);
  },
};
