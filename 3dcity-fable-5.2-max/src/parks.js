import { PAD_Y, C } from './blocks.js';
import { col, shade, ngon, winSpec } from './geo.js';
import { fountain, obelisk, STRIP } from './architecture.js';

// Grass, paths, a pond or fountain and plenty of trees. `blk.big` is the multi-block central park.
export function park(blk, r, ctx, rng) {
  const { D, B } = ctx, y = PAD_Y + 0.02, cx = blk.cx, cz = blk.cz;
  const W = r.x1 - r.x0, Dp = r.z1 - r.z0, big = !!blk.big, pw = big ? 4 : 2.6;
  D.at(0, 0, 0);
  const paths = [];
  const addPath = (x0, z0, x1, z1) => { D.rect(x0, z0, x1, z1, y, C.path); paths.push([x0, z0, x1, z1]); };
  addPath(r.x0, cz - pw / 2, r.x1, cz + pw / 2);
  addPath(cx - pw / 2, r.z0, cx + pw / 2, r.z1);
  if (big) {   // loop path
    const m = 16, w = 3;
    addPath(r.x0 + m, r.z0 + m, r.x1 - m, r.z0 + m + w);
    addPath(r.x0 + m, r.z1 - m - w, r.x1 - m, r.z1 - m);
    addPath(r.x0 + m, r.z0 + m, r.x0 + m + w, r.z1 - m);
    addPath(r.x1 - m - w, r.z0 + m, r.x1 - m, r.z1 - m);
  }

  // central circle with a fountain
  const cr = big ? 11 : 5.5;
  D.prism(ngon(cx, cz, cr, cr, 20), y, y + 0.02, C.path);
  const hasFountain = big || rng.chance(0.55);
  if (hasFountain) { B.at(cx, cz, 0, PAD_Y); fountain(B, big ? 5 : 2.6); }

  // pond
  let pond = null;
  if (big || (W > 60 && Dp > 60 && rng.chance(0.4))) {
    const qx = rng.sign(), qz = rng.sign();
    pond = { x: cx + qx * W * 0.25, z: cz + qz * Dp * 0.25, rx: W * rng.range(0.1, 0.15), rz: Dp * rng.range(0.1, 0.15) };
    D.prism(ngon(pond.x, pond.z, pond.rx + 1.3, pond.rz + 1.3, 22), y, y + 0.02, col('#cfc4a4'));
    D.prism(ngon(pond.x, pond.z, pond.rx, pond.rz, 22), y, y + 0.05, C.water);
  }

  const blocked = (x, z) => {
    for (const p of paths) if (x > p[0] - 1.6 && x < p[2] + 1.6 && z > p[1] - 1.6 && z < p[3] + 1.6) return true;
    if (Math.hypot(x - cx, z - cz) < cr + 2) return true;
    if (pond) {
      const u = (x - pond.x) / (pond.rx + 3), v = (z - pond.z) / (pond.rz + 3);
      if (u * u + v * v < 1) return true;
    }
    return false;
  };
  const noise = ctx.layout.noise, n = Math.floor((W * Dp) / (big ? 80 : 62));
  for (let k = 0; k < n; k++) {
    const x = rng.range(r.x0 + 2, r.x1 - 2), z = rng.range(r.z0 + 2, r.z1 - 2);
    if (blocked(x, z)) continue;
    if (big && noise(x * 0.035 + 9, z * 0.035 - 3) < 0.36) continue;   // meadows
    ctx.trees.push([x, z, rng.range(0.8, 1.5), rng.chance(0.2) ? 1 : 0]);
  }
  if (!hasFountain) ctx.trees.push([cx, cz, 1.7, 0]);
}

function civicHall(b, w, d, rng) {
  const stone = col('#ddd6c6'), copper = col('#5f8f84'), hw = w / 2, hd = d / 2, h = 15, seed = rng.range(1, 200);
  b.box(-hw - 1.5, hw + 1.5, 0, 1.2, -hd - 1, hd + 4, shade(stone, 0.85));
  b.box(-hw * 0.5, hw * 0.5, 0, 0.6, hd + 4, hd + 6, shade(stone, 0.8));
  b.box(-hw, hw, 1.2, h, -hd, hd, stone, col('#8d8e8b'), winSpec(STRIP, 3.2, 4.6, seed, 0.6));
  const pw = hw * 0.55;
  for (let i = 0; i <= 6; i++) {
    const x = -pw + (2 * pw * i) / 6;
    b.box(x - 0.45, x + 0.45, 1.2, h - 1, hd + 2.2, hd + 3.1, stone);
  }
  b.box(-pw - 1, pw + 1, h - 1, h + 0.4, hd, hd + 3.4, stone);
  b.roof(-pw - 1, pw + 1, -hd, hd + 3.4, h + 0.4, pw * 0.32, false, copper, stone, 0.3);
  const drum = ngon(0, -hd * 0.2, 4.2, 4.2, 12);
  b.prism(drum, h, h + 9, stone);
  b.cone(ngon(0, -hd * 0.2, 4.8, 4.8, 12), h + 9, h + 15, copper);
}

// Paved civic square: hall on the north side, fountain, obelisk and tree rows.
export function plaza(blk, r, ctx, rng) {
  const { D, B } = ctx, y = PAD_Y + 0.02, cx = blk.cx, cz = blk.cz;
  const W = r.x1 - r.x0, Dp = r.z1 - r.z0;
  D.at(0, 0, 0);
  D.rect(r.x0 + 4, r.z0 + 4, r.x1 - 4, r.z1 - 4, y, col('#c9c3b6'));
  D.rect(cx - 3, r.z0 + 4, cx + 3, r.z1 - 4, y + 0.02, col('#b3ad9f'));
  const hw = Math.min(W - 18, 54), hd = Math.min(Dp * 0.3, 24);
  B.at(cx, r.z0 + 6 + hd / 2, 0, PAD_Y);
  civicHall(B, hw, hd, rng);
  ctx.count++;
  B.at(cx, cz + Dp * 0.12, 0, PAD_Y);
  fountain(B, 6);
  B.at(cx, r.z1 - 9, 0, PAD_Y);
  obelisk(B, rng.range(16, 22));
  for (let z = r.z0 + hd + 18; z < r.z1 - 5; z += 9) {
    ctx.trees.push([r.x0 + 6, z, 0.85, 0], [r.x1 - 6, z, 0.85, 0]);
    if (W > 70) ctx.trees.push([r.x0 + 15, z, 0.85, 0], [r.x1 - 15, z, 0.85, 0]);
  }
}
