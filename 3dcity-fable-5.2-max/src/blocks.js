import { RNG, lerp, smoothstep } from './rng.js';
import { col } from './geo.js';
import { SIDEWALK } from './layout.js';
import { tower, office, apartment, house, shop, warehouse, silo } from './architecture.js';
import { park, plaza } from './parks.js';

export const PAD_Y = 0.2;   // top of sidewalks / lots; roads sit at 0.05
export const C = {
  sidewalk: col('#bdb9b0'), curb: col('#a29e96'), pave: col('#aba79e'), lot: col('#56585c'),
  grass: [col('#7da35a'), col('#739a52'), col('#86a964'), col('#6f9450')],
  path: col('#d9cfb6'), water: col('#4f8fb0'), line: col('#e8e6df'),
};
const PI = Math.PI;

// Lot-space -> world-space for a lot {cx, cz, rot}.
export function local(lot, lx, lz) {
  const s = Math.sin(lot.rot), c = Math.cos(lot.rot);
  return [lot.cx + lx * c + lz * s, lot.cz - lx * s + lz * c];
}

function splitRow(len, minW, maxW, rng) {
  const out = [];
  let rem = len;
  while (rem > maxW + minW) { const w = rng.range(minW, maxW); out.push(w); rem -= w; }
  if (rem > maxW) out.push(rem / 2, rem / 2); else out.push(rem);
  return out;
}

// Two rows of lots along the block's long axis, each facing its street.
function rowLots(r, depth, minW, maxW, rng) {
  const W = r.x1 - r.x0, D = r.z1 - r.z0, alongX = W >= D, lots = [];
  for (let side = 0; side < 2; side++) {
    let a = alongX ? r.x0 : r.z0;
    for (const w of splitRow(alongX ? W : D, minW, maxW, rng)) {
      const c = a + w / 2;
      if (alongX) lots.push(side ? { cx: c, cz: r.z0 + depth / 2, w, d: depth, rot: PI } : { cx: c, cz: r.z1 - depth / 2, w, d: depth, rot: 0 });
      else lots.push(side ? { cx: r.x0 + depth / 2, cz: c, w, d: depth, rot: -PI / 2 } : { cx: r.x1 - depth / 2, cz: c, w, d: depth, rot: PI / 2 });
      a += w;
    }
  }
  return lots;
}

// Raised slab: sidewalk ring, curb faces and the lot surface inside.
function pad(blk, G, base) {
  const { x0, x1, z0, z1 } = blk, s = SIDEWALK, y = PAD_Y;
  G.rect(x0, z1 - s, x1, z1, y, C.sidewalk);
  G.rect(x0, z0, x1, z0 + s, y, C.sidewalk);
  G.rect(x0, z0 + s, x0 + s, z1 - s, y, C.sidewalk);
  G.rect(x1 - s, z0 + s, x1, z1 - s, y, C.sidewalk);
  G.rect(x0 + s, z0 + s, x1 - s, z1 - s, y, base);
  G.wall(x0, z1, x1, z1, 0, y, C.curb);
  G.wall(x1, z1, x1, z0, 0, y, C.curb);
  G.wall(x1, z0, x0, z0, 0, y, C.curb);
  G.wall(x0, z0, x0, z1, 0, y, C.curb);
}

// Streetlights, street trees and parked cars along the four sides of a block.
function sidewalkProps(blk, ctx, rng, treeGap, treeP, parkP) {
  const { x0, x1, z0, z1 } = blk;
  // [start, direction, outward normal, lamp rotation, parked-car heading, stagger]
  const sides = [
    [x0, z1, 1, 0, 0, 1, 0, -PI / 2, 0.25], [x1, z1, 0, -1, 1, 0, PI / 2, 0, 0.25],
    [x1, z0, -1, 0, 0, -1, PI, PI / 2, 0.75], [x0, z0, 0, 1, -1, 0, -PI / 2, PI, 0.75],
  ];
  for (const [sx, sz, dx, dz, nx, nz, rot, head, phase] of sides) {
    const L = dx ? x1 - x0 : z1 - z0;
    const n = Math.max(1, Math.round(L / 34)), lampAt = [];
    for (let k = 0; k < n; k++) {
      const t = ((k + phase) * L) / n;
      lampAt.push(t);
      ctx.lamps.push([sx + dx * t - nx * 0.9, sz + dz * t - nz * 0.9, rot]);
    }
    for (let t = 8; t < L - 8; t += treeGap) {
      if (!rng.chance(treeP) || lampAt.some(a => Math.abs(a - t) < 3.5)) continue;
      ctx.trees.push([sx + dx * t - nx * 1.7, sz + dz * t - nz * 1.7, rng.range(0.55, 0.8), 0]);
    }
    for (let t = 13; t < L - 13; t += 6.3) {
      if (rng.chance(parkP)) ctx.parked.push([sx + dx * t + nx * 1.2, sz + dz * t + nz * 1.2, head]);
    }
  }
}

function downtown(blk, r, ctx, rng) {
  const { B } = ctx, W = r.x1 - r.x0, D = r.z1 - r.z0;
  let nxl = W > 70 ? 2 : 1, nzl = D > 70 ? 2 : 1;
  if (blk.landmark) nxl = nzl = 1;
  else if (nxl * nzl === 4 && rng.chance(0.3)) { if (rng.chance(0.5)) nxl = 1; else nzl = 1; }
  const cw = W / nxl, cd = D / nzl, t = smoothstep(0.6, 1, blk.dens);
  for (let i = 0; i < nxl; i++) for (let j = 0; j < nzl; j++) {
    const cx = r.x0 + (i + 0.5) * cw, cz = r.z0 + (j + 0.5) * cd;
    let fw = Math.min(cw - 7, 52), fd = Math.min(cd - 7, 52);
    if (fw > fd * 1.7) fw = fd * 1.7;
    if (fd > fw * 1.7) fd = fw * 1.7;
    let h = lerp(48, 185, t) * rng.range(0.62, 1.3);
    if (blk.landmark) h = rng.range(255, 300);
    h = Math.min(h, Math.min(fw, fd) * 7.5);
    B.at(cx, cz, j === nzl - 1 ? 0 : PI, PAD_Y);
    if (!blk.landmark && rng.chance(0.22)) office(B, fw, fd, Math.min(h * 0.5, 75), rng);
    else tower(B, fw, fd, h, rng, ctx);
    ctx.count++;
  }
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
    if (rng.chance(0.6)) ctx.trees.push([x + (x < blk.cx ? 1.6 : -1.6), z + (z < blk.cz ? 1.6 : -1.6), rng.range(0.6, 0.85), 0]);
  }
}

function rowsZone(blk, r, ctx, rng) {
  const { B, D } = ctx, zone = blk.zone, short = Math.min(r.x1 - r.x0, r.z1 - r.z0);
  const cfg = {
    midrise: [Math.min(short / 2 - 2, 30), 20, 38],
    mixed: [Math.min(short / 2 - 3, 26), 16, 30],
    commercial: [Math.min(short / 2 - 7, 22), 14, 26],
    residential: [short / 2, 15, 21],
  }[zone];
  const depth = cfg[0], lots = rowLots(r, depth, cfg[1], cfg[2], rng);
  const dT = smoothstep(0.4, 0.7, blk.dens);
  for (const lot of lots) {
    const place = (bw, bd, fs) => { const [x, z] = local(lot, 0, lot.d / 2 - fs - bd / 2); B.at(x, z, lot.rot, PAD_Y); ctx.count++; };
    if (zone === 'residential') {
      const bw = Math.min(lot.w - 5.5, rng.range(9, 12.5)), bd = Math.min(lot.d - 12, rng.range(8, 10.5)), fs = rng.range(5, 7.5);
      if (bw < 6.5 || bd < 6) { ctx.trees.push([lot.cx, lot.cz, rng.range(0.8, 1.2), 0]); continue; }
      place(bw, bd, fs);
      const doorX = house(B, bw, bd, lot.w, rng);
      D.at(lot.cx, lot.cz, lot.rot);
      D.rect(doorX - 0.6, lot.d / 2 - fs, doorX + 0.6, lot.d / 2, PAD_Y + 0.02, C.path);
      const back = lot.d / 2 - fs - bd - 2.5;   // local z of the back-yard front edge
      const room = back + lot.d / 2;
      if (room > 9 && rng.chance(0.12)) {   // pool
        const pz = back - room / 2, px = rng.range(-1, 1);
        D.rect(px - 2.8, pz - 4.4, px + 2.8, pz + 4.4, PAD_Y + 0.02, C.line);
        D.rect(px - 2.2, pz - 3.8, px + 2.2, pz + 3.8, PAD_Y + 0.04, C.water);
      } else if (room > 5) {
        for (let k = rng.int(1, 2); k > 0; k--) {
          const [x, z] = local(lot, rng.range(-lot.w / 2 + 2, lot.w / 2 - 2), rng.range(-lot.d / 2 + 1.5, back - 1));
          ctx.trees.push([x, z, rng.range(0.7, 1.15), rng.chance(0.25) ? 1 : 0]);
        }
      }
      if (rng.chance(0.3)) {
        const [x, z] = local(lot, rng.sign() * (lot.w / 2 - 2.2), lot.d / 2 - 2.6);
        ctx.trees.push([x, z, rng.range(0.5, 0.75), 0]);
      }
    } else if (zone === 'commercial') {
      const bd = Math.min(lot.d - 1.5, rng.range(12, 20));
      place(lot.w - 0.4, bd, 0.8);
      shop(B, lot.w - 0.4, bd, rng);
    } else if (zone === 'mixed') {
      const bw = lot.w - rng.range(0.6, 3), bd = lot.d - rng.range(3, 6), roll = rng.next();
      if (roll < 0.34) { place(bw, Math.min(bd, 18), 0.8); shop(B, bw, Math.min(bd, 18), rng); }
      else if (roll < 0.9) { place(bw, bd, 1.6); apartment(B, bw, bd, rng.range(12, 30), rng); }
      else { place(bw, bd, 1); office(B, bw, bd, rng.range(14, 26), rng); }
    } else {
      const bw = lot.w - 0.6, bd = lot.d - 2.6, h = lerp(17, 62, dT) * rng.range(0.6, 1.3), roll = rng.next();
      place(bw, bd, 1.6);
      if (roll < 0.47) office(B, bw, bd, h, rng);
      else if (roll < 0.92) apartment(B, bw, bd, Math.min(h, 46), rng);
      else shop(B, bw, bd, rng);
    }
  }
  // what is left between the two rows
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0, gap = short - depth * 2;
  if (gap < 5) return;
  const g = alongX
    ? { x0: r.x0 + 3, x1: r.x1 - 3, z0: r.z0 + depth + 1, z1: r.z1 - depth - 1 }
    : { x0: r.x0 + depth + 1, x1: r.x1 - depth - 1, z0: r.z0 + 3, z1: r.z1 - 3 };
  D.at(0, 0, 0);
  if (zone === 'commercial') {   // parking court with stalls
    D.rect(g.x0, g.z0, g.x1, g.z1, PAD_Y + 0.02, C.lot);
    const len = alongX ? g.x1 - g.x0 : g.z1 - g.z0;
    for (let t = 2; t < len - 2; t += 2.8) {
      for (const side of [0, 1]) {
        const a = alongX ? g.x0 + t : g.z0 + t, e = side ? (alongX ? g.z1 : g.x1) : (alongX ? g.z0 : g.x0), s = side ? -1 : 1;
        if (alongX) D.rect(a - 0.07, Math.min(e, e + s * 5), a + 0.07, Math.max(e, e + s * 5), PAD_Y + 0.04, C.line);
        else D.rect(Math.min(e, e + s * 5), a - 0.07, Math.max(e, e + s * 5), a + 0.07, PAD_Y + 0.04, C.line);
        if (rng.chance(0.42)) ctx.parked.push(alongX ? [a + 1.4, e + s * 2.6, side ? PI : 0, PAD_Y] : [e + s * 2.6, a + 1.4, side ? -PI / 2 : PI / 2, PAD_Y]);
      }
    }
  } else {
    D.rect(g.x0, g.z0, g.x1, g.z1, PAD_Y + 0.02, rng.pick(C.grass));
    const n = Math.floor(((g.x1 - g.x0) * (g.z1 - g.z0)) / 150);
    for (let k = 0; k < n; k++) ctx.trees.push([rng.range(g.x0 + 1.5, g.x1 - 1.5), rng.range(g.z0 + 1.5, g.z1 - 1.5), rng.range(0.7, 1.1), 0]);
  }
}

function industrial(blk, r, ctx, rng) {
  const { B } = ctx, W = r.x1 - r.x0, D = r.z1 - r.z0, alongX = W >= D;
  const len = alongX ? W : D, short = alongX ? D : W, n = len > 92 ? 3 : len > 62 ? 2 : 1;
  const yard = rng.range(14, 22), side = rng.sign();
  for (let k = 0; k < n; k++) {
    const fl = len / n - 8, fs = short - yard - 4;
    const a = (alongX ? r.x0 : r.z0) + (len * (k + 0.5)) / n;
    const c = (alongX ? blk.cz : blk.cx) + (side * yard) / 2;
    if (alongX) B.at(a, c, side > 0 ? PI : 0, PAD_Y); else B.at(c, a, side > 0 ? -PI / 2 : PI / 2, PAD_Y);
    warehouse(B, fl, fs, rng);
    ctx.count++;
  }
  if (rng.chance(0.45)) {
    const e = (alongX ? blk.cz : blk.cx) - side * (short / 2 - yard / 2 - 1);
    for (let k = rng.int(2, 4); k > 0; k--) {
      const a = (alongX ? r.x0 : r.z0) + 7 + k * 8.5, rad = rng.range(2.8, 3.8);
      B.at(alongX ? a : e, alongX ? e : a, 0, PAD_Y);
      silo(B, 0, 0, rad, rng.range(11, 18), rng);
    }
  }
}

// Fills every block: ground slab, buildings, yards, trees, lamps, parked cars.
export function buildBlocks(layout, ctx) {
  const root = new RNG(layout.seed);
  let top = null;
  for (const b of layout.blocks) if (b.zone === 'downtown' && (!top || b.dens > top.dens)) top = b;
  if (top) top.landmark = true;

  for (const blk of layout.blocks) {
    const rng = root.fork('block' + blk.id);
    const s = SIDEWALK, r = { x0: blk.x0 + s, x1: blk.x1 - s, z0: blk.z0 + s, z1: blk.z1 - s };
    const z = blk.zone;
    const base = z === 'residential' || z === 'park' ? rng.pick(C.grass) : z === 'industrial' ? C.lot : C.pave;
    pad(blk, ctx.G, base);
    if (z === 'downtown') { downtown(blk, r, ctx, rng); sidewalkProps(blk, ctx, rng, 16, 0.7, 0.55); }
    else if (z === 'park') { park(blk, r, ctx, rng); sidewalkProps(blk, ctx, rng, 10, 0.9, 0.35); }
    else if (z === 'plaza') { plaza(blk, r, ctx, rng); sidewalkProps(blk, ctx, rng, 12, 0.8, 0.3); }
    else if (z === 'industrial') { industrial(blk, r, ctx, rng); sidewalkProps(blk, ctx, rng, 26, 0.5, 0.25); }
    else { rowsZone(blk, r, ctx, rng); sidewalkProps(blk, ctx, rng, z === 'residential' ? 12 : 14, 0.8, z === 'residential' ? 0.3 : 0.5); }
  }
}
