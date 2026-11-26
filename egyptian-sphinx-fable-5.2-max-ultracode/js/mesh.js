'use strict';
// Turns voxels into quads: only exposed faces, each corner carrying baked light and ambient occlusion.
(() => {
  const { NX, NY, NZ, OX, OY, OZ, D, grid } = SPX;

  // Linear light → display byte, with a soft shoulder so sunlit stone never clips harshly.
  const TONE = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) {
    const c = i / 640, s = c > 0.8 ? 0.8 + 0.2 * Math.tanh((c - 0.8) / 0.2) : c;
    TONE[i] = Math.round(255 * Math.pow(s, 1 / 2.2));
  }
  const tone = (c) => TONE[Math.min(1023, (c * 640) | 0)];

  class Mesh {
    constructor(cap) {
      this.n = 0; this.cap = cap;
      this.pos = new Float32Array(cap * 12); this.col = new Uint8Array(cap * 16);
      this.nrm = new Int8Array(cap * 16); this.flip = new Uint8Array(cap);
    }
    // p: 4 corners (12 floats, counter-clockwise seen from outside); n: normal; c: 4 lit linear colours.
    quad(p, n, c, flip) {
      if (this.n === this.cap) this.grow();
      const q = this.n++;
      this.pos.set(p, q * 12);
      for (let v = 0; v < 4; v++) {
        const o = q * 16 + v * 4;
        this.col[o] = tone(c[v * 3]); this.col[o + 1] = tone(c[v * 3 + 1]); this.col[o + 2] = tone(c[v * 3 + 2]); this.col[o + 3] = 255;
        this.nrm[o] = n[0] * 127; this.nrm[o + 1] = n[1] * 127; this.nrm[o + 2] = n[2] * 127;
      }
      this.flip[q] = flip ? 1 : 0;
    }
    grow() {
      this.cap *= 2;
      for (const k of ['pos', 'col', 'nrm', 'flip']) {
        const old = this[k], big = new old.constructor(old.length * 2);
        big.set(old); this[k] = big;
      }
    }
    indices() {
      const ix = new Uint32Array(this.n * 6);
      for (let q = 0, b = 0, o = 0; q < this.n; q++, b += 4) {
        if (this.flip[q]) {                           // split along the brighter diagonal
          ix[o++] = b + 1; ix[o++] = b + 2; ix[o++] = b + 3; ix[o++] = b + 1; ix[o++] = b + 3; ix[o++] = b;
        } else {
          ix[o++] = b; ix[o++] = b + 1; ix[o++] = b + 2; ix[o++] = b; ix[o++] = b + 2; ix[o++] = b + 3;
        }
      }
      return ix;
    }
  }
  SPX.Mesh = Mesh;

  const FACES = [
    { n: [1, 0, 0], v: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]] },
    { n: [0, 0, 1], v: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], v: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
  ];
  const outside = (ix, iy, iz) => ix < 0 || ix >= NX || iz < 0 || iz >= NZ || iy < 0 || iy >= NY;
  const sol = (ix, iy, iz) => (outside(ix, iy, iz) ? (iy - OY < D ? 1 : 0) : grid[(ix * NZ + iz) * NY + iy]);
  const lit = (arr, ix, iy, iz) => (outside(ix, iy, iz) ? (iy - OY >= D ? 1 : 0) : arr[(ix * NZ + iz) * NY + iy]);

  // The carved stone is shaded with a normal that leans toward the sculpture's underlying smooth form
  // (the direction away from the solid mass nearby), so rounded shapes get a soft terminator instead of
  // a checkerboard of lit and unlit cube faces. Flat masonry, terrain and props keep true face normals.
  const { M } = SPX;
  const SCULPTED = new Uint8Array(32);
  for (const m of [M.BODY, M.HEAD, M.NEMES, M.BAND, M.MASON, M.EYE, M.SCAR, M.MOUTH]) SCULPTED[m] = 1;
  const NEAR = [];
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
    if ((dx || dy || dz) && dx * dx + dy * dy + dz * dz <= 10) NEAR.push([dx, dy, dz]);
  }
  function formNormal(ix, iy, iz, out) {
    let gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < NEAR.length; i++) {
      const o = NEAR[i];
      if (sol(ix + o[0], iy + o[1], iz + o[2])) { gx -= o[0]; gy -= o[1]; gz -= o[2]; }
    }
    const l = Math.hypot(gx, gy, gz);
    if (l < 0.5) return false;
    out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
    return true;
  }

  SPX.buildMesh = function () {
    const mesh = new Mesh(300000);
    const { sky, sun, albedo, light } = SPX;
    const alb = [0, 0, 0], lg = [0, 0, 0], p = new Float32Array(12), c = new Float32Array(12), br = [0, 0, 0, 0];
    const form = [0, 0, 0], shade = [0, 0, 0];
    for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NZ; iz++) for (let iy = 0; iy < NY; iy++) {
      const m = grid[(ix * NZ + iz) * NY + iy];
      if (!m) continue;
      let have = false, soft = false;
      for (let f = 0; f < 6; f++) {
        const n = FACES[f].n, ax = ix + n[0], ay = iy + n[1], az = iz + n[2];   // the air cell this face looks into
        if (sol(ax, ay, az)) continue;
        if (!have) {
          albedo(m, ix - OX, iy - OY, iz - OZ, alb); have = true;
          soft = SCULPTED[m] === 1 && formNormal(ix, iy, iz, form);
        }
        let ln = n;                                                             // normal used for lighting
        if (soft) {
          const bx = 0.35 * n[0] + 0.65 * form[0], by = 0.35 * n[1] + 0.65 * form[1], bz = 0.35 * n[2] + 0.65 * form[2];
          const bl = Math.hypot(bx, by, bz) || 1;
          shade[0] = bx / bl; shade[1] = by / bl; shade[2] = bz / bl; ln = shade;
        }
        for (let v = 0; v < 4; v++) {
          const cv = FACES[f].v[v];
          const sx = cv[0] * 2 - 1, sy = cv[1] * 2 - 1, sz = cv[2] * 2 - 1;
          // the two edge-neighbours and the diagonal neighbour of this corner, within the air layer
          let x1 = ax, y1 = ay, z1 = az, x2 = ax, y2 = ay, z2 = az;
          if (n[0]) { y1 += sy; z2 += sz; } else if (n[1]) { x1 += sx; z2 += sz; } else { x1 += sx; y2 += sy; }
          const x3 = x1 + x2 - ax, y3 = y1 + y2 - ay, z3 = z1 + z2 - az;
          const o1 = sol(x1, y1, z1) ? 1 : 0, o2 = sol(x2, y2, z2) ? 1 : 0;
          const o3 = o1 && o2 ? 1 : (sol(x3, y3, z3) ? 1 : 0);
          let cnt = 1, k = lit(sky, ax, ay, az), s = lit(sun, ax, ay, az);
          if (!o1) { cnt++; k += lit(sky, x1, y1, z1); s += lit(sun, x1, y1, z1); }
          if (!o2) { cnt++; k += lit(sky, x2, y2, z2); s += lit(sun, x2, y2, z2); }
          if (!o3) { cnt++; k += lit(sky, x3, y3, z3); s += lit(sun, x3, y3, z3); }
          light(ln, (k / cnt) * (1 - 0.14 * (o1 + o2 + o3)), s / cnt, lg);
          c[v * 3] = alb[0] * lg[0]; c[v * 3 + 1] = alb[1] * lg[1]; c[v * 3 + 2] = alb[2] * lg[2];
          br[v] = lg[1];
          p[v * 3] = ix - OX + cv[0]; p[v * 3 + 1] = iy - OY + cv[1]; p[v * 3 + 2] = iz - OZ + cv[2];
        }
        mesh.quad(p, n, c, br[0] + br[2] < br[1] + br[3]);
      }
    }
    return mesh;
  };
})();
