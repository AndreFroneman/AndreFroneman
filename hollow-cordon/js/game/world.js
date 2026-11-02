'use strict';
// =====================================================================
//  World — static level geometry (blocks, one-way platforms, ladders,
//  stairs, back walls, decor), spatial grid, ray casts, decal layer.
// =====================================================================

const CELL = 128;

class World {
  constructor(map) {
    this.map = map;
    this.w = map.width || 4000;
    this.h = map.height || 1400;
    this.blocks = [];
    this.ladders = [];
    this.stairs = [];
    this.backwalls = [];
    this.decor = [];
    this.links = [];      // navigation links between levels
    this.grid = new Map();
    this.stamp = 0;
    this.decals = new DecalLayer(this.w, this.h);
  }
  addBlock(b) {
    b.idx = this.blocks.length;
    b.mat = b.mat || 'concrete';
    b.mdef = Tex.MATERIALS[b.mat] || Tex.MATERIALS.concrete;
    b._s = 0;
    this.blocks.push(b);
    return b;
  }
  buildGrid() {
    this.grid.clear();
    for (const b of this.blocks) {
      const x0 = Math.floor(b.x / CELL), x1 = Math.floor((b.x + b.w) / CELL);
      const y0 = Math.floor(b.y / CELL), y1 = Math.floor((b.y + b.h) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = cx * 4096 + cy;
        let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); }
        a.push(b);
      }
    }
  }
  query(x0, y0, x1, y1, out) {
    out.length = 0;
    const s = ++this.stamp;
    const cx0 = Math.floor(x0 / CELL), cx1 = Math.floor(x1 / CELL), cy0 = Math.floor(y0 / CELL), cy1 = Math.floor(y1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
      const a = this.grid.get(cx * 4096 + cy);
      if (!a) continue;
      for (const b of a) {
        if (b._s === s) continue; b._s = s;
        if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) out.push(b);
      }
    }
    return out;
  }
  solidAt(x, y, platforms = false) {
    const a = this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(y / CELL));
    if (!a) return null;
    for (const b of a) {
      if (b.oneway && !platforms) continue;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }
  // All blocks along a ray with [tEnter,tExit]; d must be unit. Sorted by tEnter.
  rayBlocks(ox, oy, dx, dy, maxD, out, includeOneway = false) {
    out.length = 0;
    const s = ++this.stamp;
    // DDA over grid cells
    let cx = Math.floor(ox / CELL), cy = Math.floor(oy / CELL);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tDY = Math.abs(dy) > 1e-9 ? CELL / Math.abs(dy) : Infinity;
    let tMX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMY = Math.abs(dy) > 1e-9 ? ((dy > 0 ? (cy + 1) * CELL - oy : oy - cy * CELL) / Math.abs(dy)) : Infinity;
    let t = 0;
    let guard = 0;
    while (t <= maxD && guard++ < 400) {
      const a = this.grid.get(cx * 4096 + cy);
      if (a) for (const b of a) {
        if (b._s === s) continue; b._s = s;
        if (b.oneway && !includeOneway) continue;
        const r = rayAABB(ox, oy, dx, dy, b.x, b.y, b.x + b.w, b.y + b.h);
        if (r && r[0] <= maxD) out.push({ t0: r[0], t1: Math.min(r[1], maxD + 50), b });
      }
      if (tMX < tMY) { t = tMX; tMX += tDX; cx += stepX; } else { t = tMY; tMY += tDY; cy += stepY; }
      if (cx < -2 || cy < -2 || cx > this.w / CELL + 2 || cy > this.h / CELL + 2) break;
    }
    out.sort((p, q) => p.t0 - q.t0);
    return out;
  }
  // first opaque hit (for lighting / line of sight); returns distance
  rayDist(ox, oy, dx, dy, maxD) {
    const tmp = World._tmp || (World._tmp = []);
    this.rayBlocks(ox, oy, dx, dy, maxD, tmp);
    for (const h of tmp) { if (h.b.mat === 'grate') continue; return h.t0; }
    return maxD;
  }
  lineOfSight(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    return this.rayDist(ax, ay, dx / d, dy / d, d) >= d - 1;
  }
  // is there walkable floor near height y in this 16px column? (for AI route planning)
  floorAt(x, y) {
    if (!this._floors) {
      const n = Math.ceil(this.w / 16) + 1;
      this._floors = Array.from({ length: n }, () => []);
      for (const b of this.blocks) {
        for (let c = Math.max(0, Math.floor(b.x / 16)); c <= Math.floor((b.x + b.w - 1) / 16) && c < n; c++) this._floors[c].push(b.y);
      }
    }
    const col = this._floors[Math.floor(x / 16)];
    if (!col) return false;
    for (const t of col) if (t >= y - 20 && t <= y + 60) return true;
    return false;
  }
  // y of the highest roof/solid above each 16px column: rain only falls above it
  skyY(x) {
    if (!this._sky) {
      const n = Math.ceil(this.w / 16) + 1;
      this._sky = new Float32Array(n).fill(this.h);
      for (const b of this.blocks) {
        if (b.mat === 'grate' || b.stair) continue;
        for (let c = Math.floor(b.x / 16); c <= Math.floor((b.x + b.w) / 16) && c < n; c++) if (c >= 0 && b.y < this._sky[c]) this._sky[c] = b.y;
      }
    }
    const c = Math.floor(x / 16);
    return c < 0 || c >= this._sky.length ? this.h : this._sky[c];
  }
  isIndoor(x, y) {
    for (const w of this.backwalls) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
    return false;
  }
  // y of the first surface below a point (or this.h)
  groundBelow(x, y, maxD = 2000) {
    const tmp = World._tmp2 || (World._tmp2 = []);
    this.rayBlocks(x, y, 0, 1, maxD, tmp, true);
    for (const h of tmp) if (!h.b.oneway || h.b.y >= y - 1) return y + h.t0;
    return this.h;
  }
}

// ---------------------------------------------------------------------
//  DecalLayer — persistent blood, scorch marks and bullet holes stored in
//  lazily created 256px chunks covering the world.
// ---------------------------------------------------------------------
const DCH = 256;
class DecalLayer {
  constructor(w, h) { this.w = w; this.h = h; this.chunks = new Map(); this.count = 0; }
  chunk(cx, cy, create) {
    const k = cx * 4096 + cy;
    let c = this.chunks.get(k);
    if (!c && create) {
      const cv = makeCanvas(DCH, DCH);
      c = { cv, ctx: cv.getContext('2d'), cx, cy };
      this.chunks.set(k, c);
    }
    return c;
  }
  stamp(x, y, r, fn) {
    if (x + r < 0 || y + r < 0 || x - r > this.w || y - r > this.h) return;
    const x0 = Math.floor((x - r) / DCH), x1 = Math.floor((x + r) / DCH), y0 = Math.floor((y - r) / DCH), y1 = Math.floor((y + r) / DCH);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.chunk(cx, cy, true);
      c.ctx.save();
      c.ctx.translate(-cx * DCH, -cy * DCH);
      fn(c.ctx);
      c.ctx.restore();
    }
    this.count++;
  }
  draw(ctx, vx0, vy0, vx1, vy1) {
    const x0 = Math.floor(vx0 / DCH), x1 = Math.floor(vx1 / DCH), y0 = Math.floor(vy0 / DCH), y1 = Math.floor(vy1 / DCH);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.chunks.get(cx * 4096 + cy);
      if (c) ctx.drawImage(c.cv, cx * DCH, cy * DCH);
    }
  }
  clear() { this.chunks.clear(); this.count = 0; }
}

// decal painters ------------------------------------------------------
const Decal = {
  bloodCol() { return pick(['#5a0606', '#6a0808', '#4a0505', '#731010']); },
  floor(world, x, y, size) {
    if (!Settings.data.bloodPersist) return;
    const col = this.bloodCol();
    world.decals.stamp(x, y, size * 2, (c) => {
      c.fillStyle = col; c.globalAlpha = rand(0.7, 0.9);
      c.beginPath(); c.ellipse(x, y + 1, size * rand(1.2, 2), Math.max(1.2, size * 0.32), 0, 0, TAU); c.fill();
      for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x + rand(-size * 2.5, size * 2.5), y + rand(0, 2), rand(0.8, size * 0.6), rand(0.5, 1.2), 0, 0, TAU); c.fill(); }
      // run down the face of the surface
      if (Math.random() < 0.25) { c.globalAlpha = 0.6; c.fillRect(x + rand(-size, size), y, rand(0.8, 1.6), rand(3, 10)); }
    });
  },
  wall(world, x, y, size, dir) {
    if (!Settings.data.bloodPersist) return;
    const col = this.bloodCol();
    world.decals.stamp(x, y, size * 4 + 30, (c) => {
      c.fillStyle = col; c.globalAlpha = rand(0.55, 0.85);
      c.beginPath(); c.arc(x, y, size, 0, TAU); c.fill();
      const n = 4 + (size * 1.5) | 0;
      for (let i = 0; i < n; i++) {
        const a = dir + gauss() * 0.9, d = rand(size, size * 4), r = rand(0.4, size * 0.4);
        c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, TAU); c.fill();
      }
      if (size > 2.2 && Math.random() < 0.6) {
        const k = randi(1, 3);
        for (let i = 0; i < k; i++) {
          const dx = x + rand(-size, size), len = rand(8, 34) * (size / 3);
          c.globalAlpha = 0.6; c.fillRect(dx - 0.6, y, rand(0.9, 1.7), len);
          c.beginPath(); c.arc(dx + 0.2, y + len, 1.2, 0, TAU); c.fill();
        }
      }
    });
  },
  smear(world, x0, y0, x1, y1, w) {
    if (!Settings.data.bloodPersist) return;
    const col = this.bloodCol();
    world.decals.stamp((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) + w * 2, (c) => {
      c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    });
  },
  hole(world, x, y, mat) {
    world.decals.stamp(x, y, 6, (c) => {
      if (mat === 'wood') { c.fillStyle = 'rgba(25,14,6,0.9)'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill(); c.strokeStyle = 'rgba(150,110,70,0.5)'; c.lineWidth = 0.6; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.stroke(); }
      else if (mat === 'metal') { c.fillStyle = 'rgba(10,10,10,0.95)'; c.beginPath(); c.arc(x, y, 1.3, 0, TAU); c.fill(); c.strokeStyle = 'rgba(200,200,200,0.45)'; c.lineWidth = 0.7; c.beginPath(); c.arc(x, y, 2.1, 0, TAU); c.stroke(); }
      else if (mat === 'dirt') { c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(x, y, 2.4, 0, TAU); c.fill(); }
      else { c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(x, y, 3.6, 0, TAU); c.fill(); c.fillStyle = 'rgba(8,8,8,0.9)'; c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fill(); }
    });
  },
  scorch(world, x, y, r) {
    world.decals.stamp(x, y, r, (c) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(0.5, 'rgba(10,8,6,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    });
  },
  bile(world, x, y, r) {
    world.decals.stamp(x, y, r, (c) => {
      c.fillStyle = 'rgba(90,110,20,0.55)';
      for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(x + rand(-r, r) * 0.7, y + rand(-r, r) * 0.3, rand(2, r * 0.3), 0, TAU); c.fill(); }
    });
  },
};
