import { col, shade, mixc, jitter, winSpec, ngon } from './geo.js';

// Window styles understood by the facade shader (see materials.js).
export const PUNCH = 1, BAND = 2, CURTAIN = 3, SHOP = 4, STRIP = 5, GLOW = 7;

const P = arr => arr.map(col);
const GLASS = P(['#5f7f96', '#496a80', '#6c8b98', '#3d5262', '#7890a2', '#52707a', '#86795f', '#34424e', '#5a7d88', '#7b8791']);
const STONE = P(['#d9d3c5', '#c9c1b0', '#beb7a7', '#e2ddd0', '#aaa497', '#cfc7b8', '#b9b3aa']);
const BRICK = P(['#a3523b', '#8d4937', '#b3694b', '#7c4032', '#bd8862', '#996953', '#c4a184']);
const PASTEL = P(['#f0e6d2', '#e7d8bf', '#d8e1e3', '#e5cebf', '#cedbce', '#f2eee5', '#d6c5af', '#c3d1db', '#eed8a7', '#e9c9b0', '#b9c7b0']);
const ROOF = P(['#8b4a3a', '#5a6068', '#6d5446', '#3f474f', '#996950', '#70797f', '#7d3f33']);
const FLAT = P(['#8d8e8b', '#777879', '#9f9c94', '#6b6d6f', '#b0aca3']);
const ACCENT = P(['#c8553d', '#2f7f6f', '#e0a43a', '#3f6fae', '#a0456e', '#e9e6dc', '#5b8f4a']);
const NEON = P(['#ff5a4d', '#35d0c0', '#ffc247', '#5aa0ff', '#ff6fb1', '#f5f5f0', '#8bff7a']);
const SHED = P(['#b9bdc0', '#9aa5ad', '#c7c1b4', '#8b97a0', '#b4a892', '#a3b0a4']);
const METAL = col('#9aa3aa'), DARK = col('#2b2f33'), TRIM = col('#f1eee6'), WOOD = col('#7a5a40');

const glow = seed => ({ cw: 1e6, ch: 1e6, attr: [seed, GLOW, 1] });

function roofClutter(b, x0, x1, z0, z1, y, rng, n) {
  for (let i = 0; i < n; i++) {
    const sx = rng.range(1.6, 4), sz = rng.range(1.6, 4), h = rng.range(1.1, 2.6);
    if (x1 - x0 < sx + 2 || z1 - z0 < sz + 2) continue;
    const x = rng.range(x0 + 1, x1 - sx - 1), z = rng.range(z0 + 1, z1 - sz - 1);
    b.box(x, x + sx, y, y + h, z, z + sz, shade(METAL, rng.range(0.7, 1.05)));
  }
}

function waterTank(b, x, z, y, rng) {
  const r = rng.range(1.4, 1.9), h = rng.range(2.6, 3.4);
  b.box(x - r * 0.7, x + r * 0.7, y, y + 1.6, z - r * 0.7, z + r * 0.7, DARK);
  const pts = ngon(x, z, r, r, 8);
  b.prism(pts, y + 1.6, y + 1.6 + h, WOOD);
  b.cone(pts, y + 1.6 + h, y + 2.8 + h, shade(WOOD, 0.7));
}

function antenna(b, x, z, y, h, fx) {
  b.box(x - 0.9, x + 0.9, y, y + 2.5, z - 0.9, z + 0.9, DARK);
  b.box(x - 0.22, x + 0.22, y + 2.5, y + h, z - 0.22, z + 0.22, METAL);
  fx.beacons.push(b.world(x, y + h + 0.4, z));
}

// ---------------------------------------------------------------- skyscrapers
export function tower(b, w, d, h, rng, fx) {
  const hw = w / 2, hd = d / 2, m = Math.min(hw, hd);
  const seed = rng.range(1, 200), lit = rng.range(0.16, 0.5);
  const glass = jitter(rng.pick(GLASS), rng, 0.12), stone = jitter(rng.pick(STONE), rng), roofC = rng.pick(FLAT);
  const ch = rng.range(3.6, 4.2);
  const cur = winSpec(CURTAIN, rng.range(2.3, 3.3), ch, seed, lit);
  const lobby = winSpec(SHOP, 5, 5.5, seed, 0.92);
  const kind = rng.pick(['glass', 'glass', 'setback', 'deco', 'round', 'chamfer', 'twin']);
  let top = h, tx = 0, tz = 0, tr = m * 0.3;   // where the crown goes

  if (kind === 'glass' || kind === 'round' || kind === 'chamfer') {
    let y = 0, k = 1;
    if (rng.chance(0.65)) {   // podium
      const ph = rng.range(9, 17);
      b.box(-hw, hw, 0, 5.5, -hd, hd, shade(stone, 0.8), stone, lobby);
      b.box(-hw, hw, 5.5, ph, -hd, hd, stone, roofC, winSpec(BAND, 3.2, 3.7, seed, lit));
      y = ph; k = rng.range(0.74, 0.88);
    } else {
      b.box(-hw * 0.98, hw * 0.98, 0, 5.5, -hd * 0.98, hd * 0.98, shade(glass, 0.7), glass, lobby);
      y = 5.5;
    }
    const sx = hw * k, sz = hd * k;
    if (kind === 'round') {
      const r = Math.min(sx, sz), n = 24;
      b.prism(ngon(0, 0, r, r, n), y, h, glass, roofC, winSpec(CURTAIN, (Math.PI * 2 * r) / n, ch, seed, lit));
      b.prism(ngon(0, 0, r * 0.62, r * 0.62, 12), h, h + 5, shade(glass, 0.6), roofC);
      top = h + 5; tr = r * 0.4;
    } else if (kind === 'chamfer') {
      const c = Math.min(sx, sz) * rng.range(0.3, 0.45);
      const pts = [[-sx + c, sz], [sx - c, sz], [sx, sz - c], [sx, -sz + c], [sx - c, -sz], [-sx + c, -sz], [-sx, -sz + c], [-sx, sz - c]];
      const cut = h * rng.range(0.78, 0.9);
      b.prism(pts, y, cut, glass, roofC, cur);
      b.prism(pts.map(p => [p[0] * 0.78, p[1] * 0.78]), cut, h, glass, roofC, cur);
      tr = m * 0.25;
    } else {
      b.box(-sx, sx, y, h, -sz, sz, glass, roofC, cur);
      b.box(-sx * 0.55, sx * 0.55, h, h + rng.range(4, 8), -sz * 0.55, sz * 0.55, shade(glass, 0.55), roofC);
      top = h + 4;
    }
  } else if (kind === 'setback') {
    const useGlass = rng.chance(0.5), wc = useGlass ? glass : stone;
    const win = useGlass ? cur : winSpec(BAND, 3, ch, seed, lit);
    const tiers = [[0.56, 0.04], [0.82, 0.2], [1, 0.36]];
    b.box(-hw, hw, 0, 5.5, -hd, hd, shade(wc, 0.75), wc, lobby);
    let y = 5.5;
    for (const [f, ins] of tiers) {
      const sx = hw - m * ins, sz = hd - m * ins;
      b.box(-sx, sx, y, h * f, -sz, sz, wc, roofC, win);
      y = h * f;
    }
    tr = m * 0.3;
  } else if (kind === 'deco') {
    const wc = jitter(rng.pick(STONE.concat(BRICK.slice(4))), rng), strip = winSpec(STRIP, 2.2, ch, seed, lit);
    const tiers = [[0.46, 0], [0.74, 0.14], [0.9, 0.28], [1, 0.42]];
    let y = 0, sx = hw, sz = hd;
    for (const [f, ins] of tiers) {
      sx = hw - m * ins; sz = hd - m * ins;
      b.box(-sx, sx, y, h * f, -sz, sz, wc, shade(wc, 0.8), strip);
      y = h * f;
    }
    const cap = Math.min(sx, sz), ph = h * 0.09;
    b.roof(-cap, cap, -cap, cap, h, ph, true, col('#5f8f84'), wc, 0, cap);
    top = h + ph - 2; tr = 0;
  } else {   // twin slabs around a core
    const gap = w * 0.06, hb = h * rng.range(0.7, 0.9), off = hd * 0.14;
    b.box(-hw, hw, 0, 5.5, -hd, hd, shade(stone, 0.8), stone, lobby);
    b.box(-hw, -gap, 5.5, h, -hd + off, hd, glass, roofC, cur);
    b.box(gap, hw, 5.5, hb, -hd, hd - off, glass, roofC, cur);
    b.box(-gap, gap, 5.5, h + 3, -hd * 0.5, hd * 0.5, shade(glass, 0.45), roofC);
    top = h + 3; tx = 0; tr = 0;
  }
  if (tr > 0 && rng.chance(0.5)) roofClutter(b, -tr, tr, -tr, tr, top, rng, 2);
  if (rng.chance(kind === 'deco' ? 1 : 0.55)) antenna(b, tx, tz, top, rng.range(12, 34), fx);
  else fx.beacons.push(b.world(tx, top + 1.2, tz));
}

// ---------------------------------------------------------------- offices
export function office(b, w, d, h, rng) {
  const hw = w / 2, hd = d / 2, seed = rng.range(1, 200), lit = rng.range(0.12, 0.42);
  const style = rng.pick(['band', 'band', 'curtain', 'punch']);
  const wc = style === 'curtain' ? jitter(rng.pick(GLASS), rng, 0.12) : jitter(rng.pick(style === 'punch' ? BRICK.concat(STONE) : STONE), rng);
  const win = style === 'band' ? winSpec(BAND, 3, 3.6, seed, lit) : style === 'curtain' ? winSpec(CURTAIN, 2.6, 3.7, seed, lit) : winSpec(PUNCH, 2.7, 3.5, seed, lit);
  const roofC = rng.pick(FLAT), gh = 4.6;
  b.box(-hw, hw, 0, gh, -hd, hd, shade(wc, 0.78), wc, winSpec(SHOP, 4.4, gh, seed, 0.88));
  let x0 = -hw, x1 = hw, z0 = -hd, z1 = hd, top = h;
  if (h > 28 && rng.chance(0.45)) {   // stepped top
    const cut = h * rng.range(0.6, 0.78), ins = Math.min(hw, hd) * rng.range(0.18, 0.3);
    b.box(-hw, hw, gh, cut, -hd, hd, wc, roofC, win);
    b.parapet(-hw, hw, -hd, hd, cut, shade(wc, 0.9));
    x0 += ins; x1 -= ins; z0 += ins; z1 -= ins;
    b.box(x0, x1, cut, h, z0, z1, wc, roofC, win);
  } else {
    b.box(-hw, hw, gh, h, -hd, hd, wc, roofC, win);
  }
  b.parapet(x0, x1, z0, z1, top, shade(wc, 0.9));
  roofClutter(b, x0 + 1, x1 - 1, z0 + 1, z1 - 1, top, rng, rng.int(1, 3));
}

// ---------------------------------------------------------------- apartments
export function apartment(b, w, d, h, rng) {
  const hw = w / 2, hd = d / 2, seed = rng.range(1, 200), fh = 3.1;
  const brick = rng.chance(0.55);
  const wc = jitter(rng.pick(brick ? BRICK : PASTEL.concat(STONE)), rng);
  const win = winSpec(PUNCH, rng.range(2.5, 3.1), fh, seed, rng.range(0.3, 0.62));
  const roofC = rng.pick(FLAT), trim = shade(wc, 1.12);
  const floors = Math.max(2, Math.round(h / fh));
  h = floors * fh;
  const parts = [];
  const shape = w > 26 && d > 24 ? rng.pick(['slab', 'L', 'U', 'L']) : 'slab';
  if (shape === 'slab') parts.push([-hw, hw, -hd, hd]);
  else {
    const bar = d * rng.range(0.38, 0.5), wing = w * rng.range(0.3, 0.4);
    parts.push([-hw, hw, hd - bar, hd]);
    if (shape === 'L') { rng.chance(0.5) ? parts.push([-hw, -hw + wing, -hd, hd - bar]) : parts.push([hw - wing, hw, -hd, hd - bar]); }
    else { parts.push([-hw, -hw + wing, -hd, hd - bar]); parts.push([hw - wing, hw, -hd, hd - bar]); }
  }
  for (const [x0, x1, z0, z1] of parts) {
    b.box(x0, x1, 0, h, z0, z1, wc, roofC, win);
    b.parapet(x0, x1, z0, z1, h, trim, 0.8, 0.35);
  }
  if (rng.chance(0.6)) {   // balcony stacks on the street front
    const n = w > 22 ? 2 : 1, bw = Math.min(5, w * 0.24), bc = rng.chance(0.5) ? TRIM : shade(wc, 0.72);
    for (let k = 0; k < n; k++) {
      const cx = n === 1 ? 0 : (k ? 1 : -1) * w * 0.25;
      for (let f = 1; f < floors; f++) b.box(cx - bw / 2, cx + bw / 2, f * fh - 0.15, f * fh + 0.95, hd, hd + 1.2, bc);
    }
  }
  b.box(-1.6, 1.6, 0, 2.9, hd, hd + 0.5, shade(wc, 0.6), TRIM);   // entrance
  const [x0, x1, z0, z1] = parts[0];
  b.box(x0 + 2, x0 + 5.5, h, h + 2.6, z0 + 1.5, z0 + 5, shade(wc, 0.85), roofC);   // stair bulkhead
  if (brick && rng.chance(0.5)) waterTank(b, x1 - 4, (z0 + z1) / 2, h, rng);
  else roofClutter(b, x0 + 6, x1 - 1, z0 + 1, z1 - 1, h, rng, 2);
}

// ---------------------------------------------------------------- houses
export function house(b, w, d, lotW, rng) {
  const hw = w / 2, hd = d / 2, seed = rng.range(1, 200), fh = 3.1;
  const floors = rng.chance(0.55) ? 2 : 1, y1 = floors * fh + 0.3;
  const wc = jitter(rng.pick(PASTEL), rng, 0.06), roofC = jitter(rng.pick(ROOF), rng, 0.1);
  const win = winSpec(PUNCH, 2.7, fh, seed, rng.range(0.35, 0.7));
  b.box(-hw, hw, 0, y1, -hd, hd, wc, wc, win);
  const alongX = rng.chance(0.75) ? w >= d : w < d, short = alongX ? d : w;
  const rh = short * rng.range(0.28, 0.42);
  b.roof(-hw, hw, -hd, hd, y1, rh, alongX, roofC, wc, 0.5, rng.chance(0.35) ? short / 2 : 0);
  const cx = rng.range(-hw * 0.6, hw * 0.6), cz = rng.range(-hd * 0.5, hd * 0.5);
  b.box(cx - 0.4, cx + 0.4, y1, y1 + rh + 0.9, cz - 0.4, cz + 0.4, col('#8d4937'));   // chimney
  const dx = rng.range(-hw * 0.4, hw * 0.4);
  b.box(dx - 0.55, dx + 0.55, 0, 2.15, hd, hd + 0.08, jitter(rng.pick(ACCENT), rng), TRIM);   // door
  b.box(dx - 1.3, dx + 1.3, 0, 0.3, hd, hd + 1.4, col('#b8b2a6'));   // porch step
  if (hw + 4.4 <= lotW / 2 && rng.chance(0.6)) {   // garage wing
    const s = rng.sign(), g0 = s > 0 ? hw : -hw - 3.8, g1 = g0 + 3.8;
    b.box(g0, g1, 0, 2.8, hd - 6.4, hd - 0.6, wc, roofC);
    b.box(g0 + 0.5, g1 - 0.5, 0, 2.2, hd - 0.6, hd - 0.52, TRIM);
  }
  return dx;   // door position, so the lot can lay a path to it
}

// ---------------------------------------------------------------- shops / low-rise commercial
export function shop(b, w, d, rng) {
  const hw = w / 2, hd = d / 2, seed = rng.range(1, 200), gh = 4.4;
  const floors = rng.int(1, 3), h = gh + (floors - 1) * 3.4;
  const wc = jitter(rng.pick(STONE.concat(BRICK, PASTEL)), rng), roofC = rng.pick(FLAT);
  b.box(-hw, hw, 0, gh, -hd, hd, wc, roofC, winSpec(SHOP, 4, gh, seed, 0.92));
  if (floors > 1) b.box(-hw, hw, gh, h, -hd, hd, wc, roofC, winSpec(PUNCH, 2.8, 3.4, seed, 0.45));
  b.parapet(-hw, hw, -hd, hd, h, shade(wc, 0.9), 0.7, 0.35);
  roofClutter(b, -hw + 1, hw - 1, -hd + 1, hd - 1, h, rng, rng.int(1, 2));
  const sw = hw * rng.range(0.55, 0.9), neon = rng.pick(NEON);
  b.box(-sw, sw, 3.62, 4.32, hd, hd + 0.25, neon, neon, glow(seed));   // lit sign band
  if (rng.chance(0.7)) {   // awning (both faces so it reads from below)
    const ac = jitter(rng.pick(ACCENT), rng), x0 = -hw + 0.5, x1 = hw - 0.5, zo = hd + 1.7;
    b.quad([x0, 2.9, zo], [x1, 2.9, zo], [x1, 3.5, hd], [x0, 3.5, hd], ac);
    b.quad([x0, 3.5, hd], [x1, 3.5, hd], [x1, 2.9, zo], [x0, 2.9, zo], shade(ac, 0.6));
  }
  if (floors === 1 && w > 18 && rng.chance(0.3)) {   // rooftop billboard
    const bc = rng.pick(NEON);
    b.box(-4, 4, h + 1.5, h + 5, -0.2, 0.2, bc, bc, glow(seed));
    b.box(-3, -2.6, h, h + 1.5, -0.2, 0.2, DARK);
    b.box(2.6, 3, h, h + 1.5, -0.2, 0.2, DARK);
  }
}

// ---------------------------------------------------------------- industry
export function warehouse(b, w, d, rng) {
  const hw = w / 2, hd = d / 2, seed = rng.range(1, 200), h = rng.range(7, 11);
  const wc = jitter(rng.pick(SHED), rng), roofC = shade(METAL, rng.range(0.7, 1)), band = jitter(rng.pick(ACCENT), rng);
  b.box(-hw, hw, 0, h - 2.4, -hd, hd, wc);
  b.box(-hw, hw, h - 2.4, h, -hd, hd, wc, roofC, winSpec(BAND, 4.5, 2.4, seed, 0.25));
  b.box(-hw - 0.06, hw + 0.06, h - 3.1, h - 2.5, -hd - 0.06, hd + 0.06, band);   // colour stripe
  if (rng.chance(0.5)) {   // saw-tooth factory roof
    const n = Math.max(2, Math.round(w / 11)), seg = w / n;
    for (let i = 0; i < n; i++) b.roof(-hw + i * seg, -hw + (i + 1) * seg, -hd, hd, h, seg * 0.28, false, roofC, wc, 0);
  } else {   // low gable with ridge vents
    const along = w >= d, len = along ? w : d, rh = Math.min(w, d) * 0.13;
    b.roof(-hw, hw, -hd, hd, h, rh, along, roofC, wc, 0.3);
    for (let t = -len / 2 + 5; t < len / 2 - 5; t += 9) {
      if (along) b.box(t - 1.2, t + 1.2, h + rh - 0.4, h + rh + 0.9, -0.8, 0.8, METAL);
      else b.box(-0.8, 0.8, h + rh - 0.4, h + rh + 0.9, t - 1.2, t + 1.2, METAL);
    }
  }
  const n = Math.max(1, Math.floor(w / 12));
  for (let i = 0; i < n; i++) {
    const x = -hw + (w * (i + 0.5)) / n;
    b.box(x - 2.2, x + 2.2, 0, 4.2, hd, hd + 0.12, mixc(DARK, wc, 0.25));
  }
}

export function silo(b, x, z, r, h, rng) {
  const c = shade(METAL, rng.range(0.9, 1.2)), pts = ngon(x, z, r, r, 12);
  b.prism(pts, 0, h, c);
  b.cone(pts, h, h + r * 0.7, shade(c, 0.85));
}

// ---------------------------------------------------------------- civic props
export function fountain(b, r) {
  const stone = col('#cfc9bc');
  b.prism(ngon(0, 0, r, r, 16), 0, 0.7, stone, col('#4f8fb0'));
  b.prism(ngon(0, 0, r * 0.28, r * 0.28, 8), 0.7, 1.9, stone, col('#6aa7c4'));
  b.prism(ngon(0, 0, r * 0.1, r * 0.1, 6), 1.9, 3.2, stone);
}

export function obelisk(b, h) {
  const stone = col('#d8d2c4');
  b.box(-2.4, 2.4, 0, 1.2, -2.4, 2.4, shade(stone, 0.85));
  b.box(-1.3, 1.3, 1.2, 3, -1.3, 1.3, stone);
  b.roof(-1, 1, -1, 1, 3, h, true, stone, stone, 0, 1);
}
