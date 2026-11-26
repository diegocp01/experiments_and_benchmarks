import * as THREE from 'three';

// ---- colour helpers (vertex colours are stored in linear RGB) ----
const _c = new THREE.Color();
export function col(hex) { _c.set(hex); return [_c.r, _c.g, _c.b]; }
export function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function jitter(c, rng, amt = 0.08) { return shade(c, 1 + rng.range(-amt, amt)); }

const ZERO = [0, 0, 0];

// Window spec for a wall: cw/ch are the target cell size in metres, attr = [seed, style, litFraction].
export function winSpec(style, cw, ch, seed, lit) { return { cw, ch, attr: [seed, style, lit] }; }

// Points of an n-gon in the winding order the builder expects (front -> right -> back -> left).
export function ngon(cx, cz, rx, rz, n, phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    pts.push([cx + rx * Math.sin(a), cz + rz * Math.cos(a)]);
  }
  return pts;
}

// Accumulates many primitives into one indexed BufferGeometry (one draw call).
// Primitives are given in "lot space" and placed with at(tx, tz, rotY).
export class GeoBuilder {
  constructor(withWin = false) {
    this.withWin = withWin;
    this.pos = []; this.nor = []; this.col = []; this.uv = []; this.win = []; this.idx = [];
    this.n = 0;
    this.tx = 0; this.ty = 0; this.tz = 0; this.cs = 1; this.sn = 0;
    this.uOff = 0;
  }

  at(tx, tz, rot = 0, ty = 0) {
    this.tx = tx; this.tz = tz; this.ty = ty;
    this.cs = Math.cos(rot); this.sn = Math.sin(rot);
    return this;
  }

  // Lot-space point -> world-space [x, y, z].
  world(x, y, z) {
    return [x * this.cs + z * this.sn + this.tx, y + this.ty, -x * this.sn + z * this.cs + this.tz];
  }

  v(p, nx, ny, nz, c, u, w, wi) {
    const cs = this.cs, sn = this.sn;
    this.pos.push(p[0] * cs + p[2] * sn + this.tx, p[1] + this.ty, -p[0] * sn + p[2] * cs + this.tz);
    this.nor.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
    this.col.push(c[0], c[1], c[2]);
    if (this.withWin) { this.uv.push(u, w); this.win.push(wi[0], wi[1], wi[2]); }
    return this.n++;
  }

  // a,b,c,d counter-clockwise when seen from outside.
  quad(a, b, c, d, color, wi = null, u0 = 0, v0 = 0, u1 = 0, v1 = 0) {
    // Normal from the diagonals, so quads that collapse to a triangle still shade correctly.
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const w = wi || ZERO;
    const i = this.v(a, nx, ny, nz, color, u0, v0, w);
    this.v(b, nx, ny, nz, color, u1, v0, w);
    this.v(c, nx, ny, nz, color, u1, v1, w);
    this.v(d, nx, ny, nz, color, u0, v1, w);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i = this.v(a, nx, ny, nz, color, 0, 0, ZERO);
    this.v(b, nx, ny, nz, color, 0, 0, ZERO);
    this.v(c, nx, ny, nz, color, 0, 0, ZERO);
    this.idx.push(i, i + 1, i + 2);
  }

  // Vertical wall from (x0,z0) to (x1,z1); the outward normal is to the right of that direction.
  wall(x0, z0, x1, z1, y0, y1, color, win = null) {
    let wi = null, u0 = 0, u1 = 0, v1 = 0;
    if (win) {
      const nu = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / win.cw));
      const nv = Math.max(1, Math.round((y1 - y0) / win.ch));
      u0 = this.uOff; u1 = u0 + nu; v1 = nv;
      this.uOff = (this.uOff + nu + 3) % 512;   // different lit pattern on every wall
      wi = win.attr;
    }
    this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], color, wi, u0, 0, u1, v1);
  }

  // Horizontal rectangle facing up.
  rect(x0, z0, x1, z1, y, color) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color);
  }

  box(x0, x1, y0, y1, z0, z1, wallC, topC = wallC, win = null) {
    this.wall(x0, z1, x1, z1, y0, y1, wallC, win);
    this.wall(x1, z1, x1, z0, y0, y1, wallC, win);
    this.wall(x1, z0, x0, z0, y0, y1, wallC, win);
    this.wall(x0, z0, x0, z1, y0, y1, wallC, win);
    this.rect(x0, z0, x1, z1, y1, topC);
  }

  // Extruded convex polygon (see ngon for winding).
  prism(pts, y0, y1, wallC, topC = wallC, win = null) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.wall(a[0], a[1], b[0], b[1], y0, y1, wallC, win);
    }
    for (let i = 1; i < n - 1; i++) {
      this.tri([pts[0][0], y1, pts[0][1]], [pts[i][0], y1, pts[i][1]], [pts[i + 1][0], y1, pts[i + 1][1]], topC);
    }
  }

  cone(pts, y0, apexY, color) {
    const n = pts.length;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p[0] / n; cz += p[1] / n; }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.tri([a[0], y0, a[1]], [b[0], y0, b[1]], [cx, apexY, cz], color);
    }
  }

  // Thin rim around a flat roof.
  parapet(x0, x1, z0, z1, y, color, h = 0.9, t = 0.4) {
    this.box(x0, x1, y, y + h, z1 - t, z1, color);
    this.box(x0, x1, y, y + h, z0, z0 + t, color);
    this.box(x0, x0 + t, y, y + h, z0 + t, z1 - t, color);
    this.box(x1 - t, x1, y, y + h, z0 + t, z1 - t, color);
  }

  // Pitched roofs over the rectangle x0..x1 / z0..z1 starting at y0. `alongX` puts the ridge on the x axis.
  // inset = 0 gives a gable (triangular end walls in endC); inset > 0 gives a hip roof.
  roof(x0, x1, z0, z1, y0, h, alongX, roofC, endC, over = 0.4, inset = 0) {
    // Work in (a, b) where a runs along the ridge; swapping axes mirrors, so flip winding.
    const P = alongX ? (a, y, b) => [a, y, b] : (a, y, b) => [b, y, a];
    const a0 = alongX ? x0 : z0, a1 = alongX ? x1 : z1, b0 = alongX ? z0 : x0, b1 = alongX ? z1 : x1;
    const Q = (p, q, r, s) => (alongX ? this.quad(p, q, r, s, roofC) : this.quad(s, r, q, p, roofC));
    const T = (p, q, r, c) => (alongX ? this.tri(p, q, r, c) : this.tri(r, q, p, c));
    const bc = (b0 + b1) / 2, hd = (b1 - b0) / 2;
    const ye = y0 - over * (h / hd), yr = y0 + h;
    const ins = Math.min(inset, (a1 - a0) / 2);
    const ea0 = a0 - over, ea1 = a1 + over, eb0 = b0 - over, eb1 = b1 + over;
    const ra0 = inset > 0 ? a0 + ins : ea0, ra1 = inset > 0 ? a1 - ins : ea1;
    Q(P(ea0, ye, eb1), P(ea1, ye, eb1), P(ra1, yr, bc), P(ra0, yr, bc));
    Q(P(ea1, ye, eb0), P(ea0, ye, eb0), P(ra0, yr, bc), P(ra1, yr, bc));
    if (inset > 0) {
      T(P(ea1, ye, eb1), P(ea1, ye, eb0), P(ra1, yr, bc), roofC);
      T(P(ea0, ye, eb0), P(ea0, ye, eb1), P(ra0, yr, bc), roofC);
    } else {
      T(P(a1, y0, b1), P(a1, y0, b0), P(a1, yr, bc), endC);
      T(P(a0, y0, b0), P(a0, y0, b1), P(a0, yr, bc), endC);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.withWin) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.win, 3));
    }
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
