import { col } from './geo.js';

export const ROAD_Y = 0.05;
export const LANES = { 1: [1.95], 2: [1.9, 5.5] };   // lane centre offsets from the road centre line

const ASPHALT = col('#3e4146'), ASPHALT_AVE = col('#393c41');
const WHITE = col('#e6e4dc'), DIM = col('#8f9094'), YELLOW = col('#d9a93a');
const FIELDS = ['#b9b36a', '#8fae5c', '#a58f5f', '#c9c07a', '#7f9f52', '#9c8a66'].map(col);

// Asphalt, lane markings, crosswalks and stop lines.
export function buildStreets(layout, ctx) {
  const { G, D } = ctx, y = ROAD_Y, ym = y + 0.02;
  G.at(0, 0, 0); D.at(0, 0, 0);
  for (const n of layout.nodes) G.rect(n.x - n.hx, n.z - n.hz, n.x + n.hx, n.z + n.hz, y, ASPHALT_AVE);

  for (const s of layout.segments) {
    G.rect(s.x0, s.z0, s.x1, s.z1, y, s.lanes === 2 ? ASPHALT_AVE : ASPHALT);
    const H = s.horiz, len = H ? s.x1 - s.x0 : s.z1 - s.z0, a0 = H ? s.x0 : s.z0;
    const c = H ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2, hw = s.w / 2;
    // t runs along the segment from node a; o is the offset to the right of the a->b direction.
    const band = (t0, t1, o0, o1, color) => (H
      ? D.rect(a0 + t0, c + o0, a0 + t1, c + o1, ym, color)
      : D.rect(c - o1, a0 + t0, c - o0, a0 + t1, ym, color));
    const endA = layout.nodes[s.a].count >= 3, endB = layout.nodes[s.b].count >= 3;
    const m0 = endA ? 6 : 0.5, m1 = endB ? 6 : 0.5;
    if (s.lanes === 2) {
      band(m0, len - m1, -0.3, -0.14, YELLOW);
      band(m0, len - m1, 0.14, 0.3, YELLOW);
      for (let t = m0 + 1.5; t < len - m1 - 3; t += 9) {
        band(t, t + 3, -3.72, -3.58, WHITE);
        band(t, t + 3, 3.58, 3.72, WHITE);
      }
    } else {
      for (let t = m0 + 1.5; t < len - m1 - 3; t += 9) band(t, t + 3, -0.08, 0.08, WHITE);
    }
    for (const sg of [-1, 1]) band(m0 + 5, len - m1 - 5, sg * (hw - 2.35) - 0.05, sg * (hw - 2.35) + 0.05, DIM);
    if (endA) {
      for (let o = -hw + 0.9; o < hw - 1.2; o += 1.25) band(1.2, 4.2, o, o + 0.6, WHITE);
      band(5, 5.4, -hw + 0.4, -0.35, WHITE);
    }
    if (endB) {
      for (let o = -hw + 0.9; o < hw - 1.2; o += 1.25) band(len - 4.2, len - 1.2, o, o + 0.6, WHITE);
      band(len - 5.4, len - 5, 0.35, hw - 0.4, WHITE);
    }
  }
}

// Farmland patches and woods on the open land around the built-up area.
export function buildOutskirts(layout, ctx, rng) {
  const { X, Z, nx, nz, urban, coast, noise, halfW, halfD } = layout, D = ctx.D;
  D.at(0, 0, 0);
  const field = Array.from({ length: nx }, () => new Array(nz).fill(false));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (urban[i][j]) continue;
    const x0 = X[i] + 13, x1 = X[i + 1] - 13, z0 = Z[j] + 13, z1 = Z[j + 1] - 13;
    if (z1 > Math.min(coast(x0), coast(x1), coast((x0 + x1) / 2)) - 8 || !rng.chance(0.42)) continue;
    if (layout.density((x0 + x1) / 2, (z0 + z1) / 2) > 0.2) continue;   // no farmland next to the core
    field[i][j] = true;
    const n = rng.int(2, 5), alongX = rng.chance(0.5);
    for (let k = 0; k < n; k++) {
      const c = rng.pick(FIELDS);
      if (alongX) D.rect(x0 + ((x1 - x0) * k) / n, z0, x0 + ((x1 - x0) * (k + 1)) / n - 0.8, z1, 0.03, c);
      else D.rect(x0, z0 + ((z1 - z0) * k) / n, x1, z0 + ((z1 - z0) * (k + 1)) / n - 0.8, 0.03, c);
    }
  }
  const find = (arr, v) => { for (let i = 0; i < arr.length - 1; i++) if (v >= arr[i] && v < arr[i + 1]) return i; return -1; };
  for (let k = 0; k < 9000; k++) {
    const x = rng.range(-halfW - 700, halfW + 700), z = rng.range(-halfD - 700, halfD + 350);
    if (z > coast(x) - 5) continue;
    const i = find(X, x), j = find(Z, z);
    if (i >= 0 && j >= 0) {
      if (urban[i][j] || field[i][j]) continue;
      if (x - X[i] < 15 || X[i + 1] - x < 15 || z - Z[j] < 15 || Z[j + 1] - z < 15) continue;
    } else if (x > X[0] - 15 && x < X[nx] + 15 && z > Z[0] - 15 && z < Z[nz] + 15) continue;
    const f = noise.fbm(x * 0.0035 + 40, z * 0.0035 + 40);
    if (f < 0.5 && !rng.chance(0.05)) continue;
    ctx.trees.push([x, z, rng.range(0.9, 1.7), rng.chance(0.55) ? 1 : 0, 0]);
  }
}

// Land surface up to the shoreline, with a sloping bank into the water.
export function buildLand(layout, L) {
  const coast = layout.coast, FAR = 9000, grass = col('#7f9f5c'), bank = col('#b3a784');
  const xs = [];
  for (let x = -FAR; x < -2400; x += 300) xs.push(x);
  for (let x = -2400; x < 2400; x += 24) xs.push(x);
  for (let x = 2400; x <= FAR; x += 300) xs.push(x);
  L.at(0, 0, 0);
  for (let k = 0; k < xs.length - 1; k++) {
    const x0 = xs[k], x1 = xs[k + 1], c0 = coast(x0), c1 = coast(x1);
    L.quad([x0, 0, c0], [x1, 0, c1], [x1, 0, -FAR], [x0, 0, -FAR], grass);
    L.quad([x0, -4, c0 + 9], [x1, -4, c1 + 9], [x1, 0, c1], [x0, 0, c0], bank);
  }
}
