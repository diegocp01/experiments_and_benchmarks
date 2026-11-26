'use strict';
// Shared namespace: voxel grid, materials and small math helpers.
// World units are voxels (1 voxel ≈ 1/3 m). +x = east (the way the Sphinx faces), +y = up, +z = south.
const SPX = (() => {
  const NX = 360, NY = 72, NZ = 224;   // dense grid around the Sphinx enclosure
  const OX = 176, OY = 1, OZ = 112;    // world coordinate = grid index − offset
  const D = 13;                        // height of the open desert surface
  const grid = new Uint8Array(NX * NY * NZ);

  const idx = (x, y, z) => ((x + OX) * NZ + (z + OZ)) * NY + (y + OY);
  const inside = (x, y, z) =>
    x >= -OX && x < NX - OX && y >= -OY && y < NY - OY && z >= -OZ && z < NZ - OZ;
  // Outside the dense grid the world is flat desert: solid below D, air above.
  const get = (x, y, z) => (inside(x, y, z) ? grid[idx(x, y, z)] : (y < D ? 255 : 0));
  const set = (x, y, z, m) => { if (inside(x, y, z)) grid[idx(x, y, z)] = m; };

  const M = {
    AIR: 0, BODY: 1, HEAD: 2, NEMES: 3, BAND: 4, MASON: 5, EYE: 6, SCAR: 7, MOUTH: 8,
    GRANITE: 9, FLOOR: 10, ROCK: 11, SAND: 12, PAVE: 13, SKIN: 14, CLOTH_A: 15, CLOTH_B: 16, CLOTH_C: 17,
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // Piecewise-linear curve through [[t, v], ...] (t ascending).
  function pl(t, pts) {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0]);
      }
    }
    return pts[pts.length - 1][1];
  }

  function hash3(x, y, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hash2 = (x, z) => hash3(x, 17, z);
  // Smooth 2D value noise in [0, 1].
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }

  const toLin = (c) => Math.pow(c / 255, 2.2);
  const toSrgb = (c) => Math.round(255 * Math.pow(clamp(c, 0, 1), 1 / 2.2));

  // Column-major 4x4 matrices.
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, t) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = zz, xz = -zx;                       // up × z with up = (0, 1, 0)
    l = Math.hypot(xx, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, 0, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
    ]);
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  return { NX, NY, NZ, OX, OY, OZ, D, grid, idx, inside, get, set, M, clamp, pl, hash3, hash2, vnoise,
           toLin, toSrgb, perspective, lookAt, mul };
})();
