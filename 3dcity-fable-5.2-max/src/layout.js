import { RNG, makeNoise, clamp } from './rng.js';

export const STREET_W = 12, AVENUE_W = 20, SIDEWALK = 4.5;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E, S, W, N as (dx, dz); right turn = +1

const grid = (w, h, v) => Array.from({ length: w }, () => new Array(h).fill(v));

// Pure data: road lines, which cells are built up, zoning, blocks, road segments and intersections.
export function generateLayout(seedStr) {
  const rng = new RNG(seedStr).fork('layout');
  const noise = makeNoise(rng.int(0, 0x7fffffff));
  const nx = rng.int(15, 17), nz = rng.int(13, 15);

  // ---- road lines: every 4th is an avenue ----
  const offX = rng.int(0, 3), offZ = rng.int(0, 3);
  const aveX = [], aveZ = [];
  for (let i = 0; i <= nx; i++) aveX.push((i + offX) % 4 === 0);
  for (let j = 0; j <= nz; j++) aveZ.push((j + offZ) % 4 === 0);
  const wX = aveX.map(a => (a ? AVENUE_W : STREET_W)), wZ = aveZ.map(a => (a ? AVENUE_W : STREET_W));
  const sizes = [72, 84, 84, 96, 108];
  const X = [0], Z = [0];
  for (let i = 0; i < nx; i++) X.push(X[i] + wX[i] / 2 + rng.pick(sizes) + wX[i + 1] / 2);
  for (let j = 0; j < nz; j++) Z.push(Z[j] + wZ[j] / 2 + rng.pick(sizes) + wZ[j + 1] / 2);
  const ox = X[nx] / 2, oz = Z[nz] / 2;
  for (let i = 0; i <= nx; i++) X[i] -= ox;
  for (let j = 0; j <= nz; j++) Z[j] -= oz;
  const halfW = X[nx], halfD = Z[nz];

  // ---- coastline: water lies at z > coast(x) ----
  const cz0 = halfD * rng.range(0.5, 0.7);
  const a1 = rng.range(50, 110), k1 = (Math.PI * 2) / rng.range(1500, 2600), p1 = rng.range(0, 6.28);
  const a2 = rng.range(14, 32), k2 = (Math.PI * 2) / rng.range(500, 800), p2 = rng.range(0, 6.28);
  const coast = x => cz0 + a1 * Math.sin(x * k1 + p1) + a2 * Math.sin(x * k2 + p2);

  // ---- built-up mask: noisy super-ellipse cut by the coast, largest connected part only ----
  const mid = (i, j) => [(X[i] + X[i + 1]) / 2, (Z[j] + Z[j + 1]) / 2];
  const raw = grid(nx, nz, false);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const [px, pz] = mid(i, j);
    const r = Math.pow(Math.pow(Math.abs(px / halfW), 2.6) + Math.pow(Math.abs(pz / halfD), 2.6), 1 / 2.6);
    const edge = 0.93 + (noise.fbm(px * 0.0035, pz * 0.0035) - 0.5) * 0.55;
    const shore = Math.min(coast(X[i] - 10), coast(px), coast(X[i + 1] + 10));
    raw[i][j] = r < edge && Z[j + 1] + wZ[j + 1] / 2 + 16 < shore;
  }
  let start = null, best = Infinity;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (!raw[i][j]) continue;
    const [px, pz] = mid(i, j);
    if (px * px + pz * pz < best) { best = px * px + pz * pz; start = [i, j]; }
  }
  const urban = grid(nx, nz, false);
  if (!start) { start = [nx >> 1, nz >> 1]; raw[start[0]][start[1]] = true; }
  const stack = [start];
  urban[start[0]][start[1]] = true;
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [dx, dz] of DIRS) {
      const a = i + dx, b = j + dz;
      if (a < 0 || b < 0 || a >= nx || b >= nz || urban[a][b] || !raw[a][b]) continue;
      urban[a][b] = true;
      stack.push([a, b]);
    }
  }

  // ---- density field: a waterfront downtown plus a smaller secondary centre ----
  const c0 = { x: rng.range(-0.18, 0.18) * halfW, z: Math.min(rng.range(0.0, 0.3) * halfD, cz0 - 340) };
  const c1 = { x: clamp(c0.x + rng.sign() * rng.range(0.4, 0.6) * halfW, -0.7 * halfW, 0.7 * halfW), z: rng.range(-0.55, 0.0) * halfD };
  const R0 = rng.range(330, 400), R1 = rng.range(200, 250);
  const density = (x, z) => {
    const d0 = Math.hypot(x - c0.x, z - c0.z) / R0, d1 = Math.hypot(x - c1.x, z - c1.z) / R1;
    const base = Math.max(Math.exp(-d0 * d0), 0.62 * Math.exp(-d1 * d1));
    return clamp(base + (noise(x * 0.006 + 31, z * 0.006 - 17) - 0.5) * 0.22, 0, 1);
  };

  // ---- blocks (a block may span several cells; the roads inside it are removed) ----
  const owner = grid(nx, nz, -1);
  const blocks = [];
  const free = (i0, j0, i1, j1) => {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz || !urban[i][j] || owner[i][j] >= 0) return false;
    }
    return true;
  };
  const addBlock = (i0, j0, i1, j1, zone) => {
    const b = {
      id: blocks.length, i0, j0, i1, j1, zone,
      x0: X[i0] + wX[i0] / 2, x1: X[i1 + 1] - wX[i1 + 1] / 2,
      z0: Z[j0] + wZ[j0] / 2, z1: Z[j1 + 1] - wZ[j1 + 1] / 2,
    };
    b.cx = (b.x0 + b.x1) / 2; b.cz = (b.z0 + b.z1) / 2;
    b.dens = density(b.cx, b.cz);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) owner[i][j] = b.id;
    blocks.push(b);
    return b;
  };

  // central park
  const [pw, ph] = rng.pick([[2, 2], [3, 2], [2, 3]]);
  const cands = [];
  for (let i = 0; i + pw <= nx; i++) for (let j = 0; j + ph <= nz; j++) {
    if (!free(i, j, i + pw - 1, j + ph - 1)) continue;
    const d = density((X[i] + X[i + pw]) / 2, (Z[j] + Z[j + ph]) / 2);
    if (d > 0.36 && d < 0.72) cands.push([i, j]);
  }
  if (cands.length) {
    const [i, j] = rng.pick(cands);
    addBlock(i, j, i + pw - 1, j + ph - 1, 'park').big = true;
  }
  // one civic plaza in the core
  const core = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (free(i, j, i, j) && density(...mid(i, j)) > 0.74) core.push([i, j]);
  }
  if (core.length > 3) { const [i, j] = rng.pick(core); addBlock(i, j, i, j, 'plaza'); }

  const isUrban = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && urban[i][j];
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (!urban[i][j] || owner[i][j] >= 0) continue;
    const [px, pz] = mid(i, j);
    const d = density(px, pz), roll = rng.next(), roll2 = rng.next();
    let zone = d > 0.66 ? 'downtown' : d > 0.43 ? 'midrise' : d > 0.25 ? 'mixed' : 'residential';
    const onAvenue = aveX[i] || aveX[i + 1] || aveZ[j] || aveZ[j + 1];
    if (zone === 'residential') {
      if (roll < 0.07) zone = 'park';
      else if (noise(px * 0.0045 + 77, pz * 0.0045 + 5) > 0.73) zone = 'industrial';
      else if (onAvenue && roll2 < 0.34) zone = 'commercial';
    } else if (zone === 'mixed') {
      if (roll < 0.08) zone = 'park';
      else if (onAvenue && roll2 < 0.25) zone = 'commercial';
    } else if (zone === 'midrise' && roll < 0.05) zone = 'park';
    addBlock(i, j, i, j, zone);
  }

  // ---- road segments and intersections ----
  const own = (i, j) => (isUrban(i, j) ? owner[i][j] : -1);
  const hSeg = grid(nx, nz + 1, false), vSeg = grid(nx + 1, nz, false);
  for (let i = 0; i < nx; i++) for (let j = 0; j <= nz; j++) {
    const a = own(i, j - 1), b = own(i, j);
    hSeg[i][j] = (a >= 0 || b >= 0) && a !== b;
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < nz; j++) {
    const a = own(i - 1, j), b = own(i, j);
    vSeg[i][j] = (a >= 0 || b >= 0) && a !== b;
  }

  const nodes = [], nodeAt = grid(nx + 1, nz + 1, -1);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const arms = [i < nx && hSeg[i][j], j < nz && vSeg[i][j], i > 0 && hSeg[i - 1][j], j > 0 && vSeg[i][j - 1]];
    const count = arms.filter(Boolean).length;
    if (!count) continue;
    nodeAt[i][j] = nodes.length;
    nodes.push({ id: nodes.length, i, j, x: X[i], z: Z[j], hx: wX[i] / 2, hz: wZ[j] / 2, arms, count, nb: [-1, -1, -1, -1] });
  }
  for (const n of nodes) {
    for (let d = 0; d < 4; d++) if (n.arms[d]) n.nb[d] = nodeAt[n.i + DIRS[d][0]][n.j + DIRS[d][1]];
  }

  // Each segment runs from node a (west / north end) to node b (east / south end).
  const segments = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j <= nz; j++) {
    if (!hSeg[i][j]) continue;
    segments.push({
      horiz: true, a: nodeAt[i][j], b: nodeAt[i + 1][j], w: wZ[j], lanes: aveZ[j] ? 2 : 1,
      x0: X[i] + wX[i] / 2, x1: X[i + 1] - wX[i + 1] / 2, z0: Z[j] - wZ[j] / 2, z1: Z[j] + wZ[j] / 2,
      sideA: own(i, j - 1) >= 0, sideB: own(i, j) >= 0,   // is there a sidewalk on the -z / +z side
    });
  }
  for (let i = 0; i <= nx; i++) for (let j = 0; j < nz; j++) {
    if (!vSeg[i][j]) continue;
    segments.push({
      horiz: false, a: nodeAt[i][j], b: nodeAt[i][j + 1], w: wX[i], lanes: aveX[i] ? 2 : 1,
      x0: X[i] - wX[i] / 2, x1: X[i] + wX[i] / 2, z0: Z[j] + wZ[j] / 2, z1: Z[j + 1] - wZ[j + 1] / 2,
      sideA: own(i - 1, j) >= 0, sideB: own(i, j) >= 0,   // sidewalk on the -x / +x side
    });
  }

  return {
    seed: seedStr, nx, nz, X, Z, wX, wZ, aveX, aveZ, urban, blocks, nodes, segments,
    halfW, halfD, coast, density, noise, center: c0,
  };
}
