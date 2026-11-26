import { random } from './layout.js';

const PI = Math.PI,
  road = '#666c69',
  curb = '#b5b3a4',
  paving = '#cdc9b8';
const green = ['#718752', '#668250', '#87975b', '#698957', '#859563', '#597a51', '#97a26a', '#758c54'];
const box = (b, x, y, z, w, h, d, c, cast = false) => b.box(x, y, z, w, h, d, c, 0, cast);

function tree(b, r, x, z, size, slender = false) {
  const tall = size * r.between(1.35, 1.77),
    trunk = tall * 0.45,
    angle = r() * PI * 2;
  b.add('post', 'solid', x, 0.32 + trunk / 2, z, size * 0.079, trunk, size * 0.079, '#827762');
  const tint = r.pick(green),
    shape = r() < 0.5 ? 'leafA' : 'leafB';
  const width = size * (slender ? 0.65 : 1),
    h = tall * (slender ? 0.84 : 0.69);
  const depth = width * r.between(0.87, 1.08),
    cy = 0.32 + tall - h * 0.48;
  b.add(shape, 'leaf', x, cy, z, width * 0.87, h * 0.92, depth * 0.88, tint, angle);
  b.add('sprays', 'foliage', x, cy, z, width * 1.1, h * 1.07, depth * 1.1, tint, angle);
  if (!slender) {
    for (let i = 0; i < 2; i++) {
      const a = angle + i * 2.75,
        dist = width * 0.23;
      const xx = x + Math.cos(a) * dist,
        zz = z + Math.sin(a) * dist;
      b.beam(
        [x, 0.32 + trunk * 0.66, z],
        [xx, 0.32 + tall * 0.63, zz],
        size * 0.045,
        size * 0.04,
        '#817461',
      );
      b.add(
        i === 0 ? 'leafB' : 'leafA',
        'leaf',
        xx,
        0.32 + tall - h * r.between(0.56, 0.67),
        zz,
        width * 0.69,
        h * 0.72,
        width * 0.71,
        tint,
        a,
      );
    }
  }
}
function bench(b, x, z, yaw) {
  const w = 2.05,
    dx = Math.cos(yaw),
    dz = -Math.sin(yaw);
  for (const s of [-0.36, 0.36])
    b.box(x + dx * w * s, 0.53, z + dz * w * s, 0.17, 0.43, 0.56, '#5e665c', yaw);
  b.box(x, 0.77, z, w, 0.16, 0.62, '#987855', yaw);
  b.box(x - 0.27 * dz, 1.03, z + 0.27 * dx, w, 0.4, 0.09, '#9f805a', yaw);
}
function lamp(b, x, z, towardX, towardZ, height = 5.6) {
  const arm = 1.35,
    lensX = x + towardX * arm,
    lensZ = z + towardZ * arm,
    top = 0.3 + height;
  b.add('post', 'solid', x, 0.3 + height / 2, z, 0.13, height, 0.13, '#586561');
  b.add('post', 'solid', x, 0.53, z, 0.31, 0.5, 0.31, '#66716a');
  b.beam([x, top - 0.38, z], [lensX, top, lensZ], 0.12, 0.12, '#697571');
  b.box(lensX, top, lensZ, towardX ? 0.79 : 0.39, 0.2, towardZ ? 0.79 : 0.39, '#596660');
  b.add(
    'box',
    'lens',
    lensX,
    top - 0.112,
    lensZ,
    towardX ? 0.64 : 0.3,
    0.045,
    towardZ ? 0.64 : 0.3,
    '#ffebc2',
    0,
    false,
  );
  b.add('sign', 'halo', lensX, top - 0.13, lensZ, 3.25, 3.25, 1, '#ffdb9e', 0, false);
  b.add('plane', 'pool', lensX, 0.095, lensZ, height * 2.35, 1, height * 2.35, '#fff', 0, false);
}
function stripe(b, x, z, w, d, color) {
  b.add('plane', 'solid', x, 0.08, z, w, 1, d, color, 0, false);
}
function streetGrid(b, city) {
  for (const block of city.blocks) {
    const { i, j } = block;
    const exposed = (di, dj) => !city.blockAt.has(i + di + ',' + (j + dj));
    const x0 = city.xs[i] - (exposed(-1, 0) ? city.vx[i] / 2 + 5.5 : 0);
    const x1 = city.xs[i + 1] + (exposed(1, 0) ? city.vx[i + 1] / 2 + 5.5 : 0);
    const z0 = city.zs[j] - (exposed(0, -1) ? city.hz[j] / 2 + 5.5 : 0);
    const z1 = city.zs[j + 1] + (exposed(0, 1) ? city.hz[j + 1] / 2 + 5.5 : 0);
    b.add('box', 'paving', (x0 + x1) / 2, -1.99, (z0 + z1) / 2, x1 - x0, 4, z1 - z0, '#b2ad9b', 0, false);
    b.add('pad', 'paving', block.x, 0.163, block.z, block.w, 0.31, block.d, paving, 0, false);
  }
  for (const e of city.edges) {
    const { a, b: end, dx, dz, width, length } = e;
    const x = (a.x + end.x) / 2,
      z = (a.z + end.z) / 2;
    b.add('box', 'road', x, 0.03, z, dx ? length : width, 0.045, dz ? length : width, road, 0, false);
    const major = width > 12,
      paint = major ? '#d8b975' : '#c6bd9c';
    const near = a.turnRadius + 3.3,
      far = length - end.turnRadius - 3.3,
      available = far - near;
    if (major) {
      for (const side of [-0.16, 0.16])
        stripe(
          b,
          a.x + (dx * (near + far)) / 2 - dz * side,
          a.z + (dz * (near + far)) / 2 + dx * side,
          dx ? available : 0.105,
          dz ? available : 0.105,
          paint,
        );
      for (const side of [-1, 1]) {
        const off = side * (width / 2 - 1.45);
        stripe(
          b,
          a.x + (dx * (near + far)) / 2 - dz * off,
          a.z + (dz * (near + far)) / 2 + dx * off,
          dx ? available : 0.1,
          dz ? available : 0.1,
          '#c0c1ae',
        );
      }
    } else {
      const n = Math.max(1, Math.floor(available / 8));
      for (let k = 0; k < n; k++) {
        const t = near + ((k + 0.5) * available) / n;
        stripe(b, a.x + t * dx, a.z + t * dz, dx ? 2.9 : 0.14, dz ? 2.9 : 0.14, paint);
      }
    }
    for (const [node, sign] of [
      [a, 1],
      [end, -1],
    ]) {
      if (node.edges.length < 3) continue;
      const dist = (dx ? city.vx[node.i] : city.hz[node.j]) * 0.5 + 1.1;
      const stripes = Math.floor((width - 1.1) / 1.03);
      for (let k = 0; k < stripes; k++) {
        const cross = (k - (stripes - 1) * 0.5) * 1.03;
        stripe(
          b,
          node.x + sign * dx * dist - dz * cross,
          node.z + sign * dz * dist + dx * cross,
          dx ? 1.64 : 0.4,
          dz ? 1.64 : 0.4,
          '#dfded0',
        );
      }
      if (major) {
        const off = -sign * width * 0.23,
          at = dist + 2.45;
        stripe(
          b,
          node.x + sign * dx * at - dz * off,
          node.z + sign * dz * at + dx * off,
          dx ? 0.26 : width * 0.37,
          dz ? 0.26 : width * 0.37,
          '#d5d5c6',
        );
      }
    }
  }
  for (const n of city.nodes) {
    b.add('box', 'road', n.x, 0.033, n.z, city.vx[n.i] + 0.01, 0.05, city.hz[n.j] + 0.01, road, 0, false);
  }
}
function paths(b, x0, z0, x1, z1, w, h = 0.036, tint = '#d3c8a4') {
  const dx = x1 - x0,
    dz = z1 - z0;
  b.box(
    (x0 + x1) / 2,
    0.368 + h / 2,
    (z0 + z1) / 2,
    w,
    h,
    Math.hypot(dx, dz),
    tint,
    Math.atan2(dx, dz),
    false,
  );
}
function park(b, r, p) {
  const { x, z, w, d } = p,
    lw = w - 4.3,
    ld = d - 4.3;
  b.add('pad', 'solid', x, 0.34, z, lw, 0.048, ld, r.pick(['#9aa76b', '#a3ae75', '#99a96b']), 0, false);
  const ax = x - lw / 2,
    az = z + ld * 0.28,
    bx = x + lw / 2,
    bz = z - ld * 0.27;
  paths(b, ax, az, bx, bz, 2.25);
  paths(b, x, z - ld / 2, x, z + ld / 2, p.civicPark ? 3.1 : 1.95);
  const plaza = p.civicPark || r() < 0.27;
  if (plaza) {
    b.add('post', 'solid', x, 0.41, z, 9.6, 0.11, 9.6, '#c7c0a6', 0, false);
    b.add('post', 'solid', x, 0.63, z, 5.6, 0.43, 5.6, '#d0cab4');
    b.add('post', 'solid', x, 0.87, z, 5.04, 0.09, 5.04, '#80aba0', 0, false);
    b.add('post', 'solid', x, 1.12, z, 1.4, 0.58, 1.4, '#c3bfa6');
    b.add('cone', 'solid', x, 2.35, z, 1.05, 2.45, 1.05, '#839483');
  }
  const n = Math.floor((lw * ld) / 70);
  for (let k = 0; k < n; k++) {
    const tx = x + r.between(-0.46, 0.46) * lw,
      tz = z + r.between(-0.46, 0.46) * ld;
    const pathZ = az + ((bz - az) * (tx - ax)) / (bx - ax);
    if (Math.abs(tz - pathZ) < 2.3 || Math.abs(tx - x) < 2.1 || (plaza && Math.hypot(tx - x, tz - z) < 5.7))
      continue;
    tree(b, r, tx, tz, r.between(3.8, 6.7), r() < 0.18);
  }
  for (const side of [-1, 1]) {
    bench(b, x + side * 2.15, z + ld * 0.26 * side, PI / 2);
  }
}
function blocks(b, city) {
  for (const p of city.blocks) {
    const r = random(city.seed + '/landscape/' + p.i + ',' + p.j);
    if (p.park) park(b, r, p);
    else
      for (const house of p.buildings.filter((v) => v.type === 'house')) {
        const { lot, x, z, w, d } = house,
          lw = lot.x1 - lot.x0,
          ld = lot.z1 - lot.z0,
          side = z < p.z ? -1 : 1;
        box(
          b,
          (lot.x0 + lot.x1) / 2,
          0.327,
          (lot.z0 + lot.z1) / 2,
          lw - 0.18,
          0.015,
          ld - 0.18,
          r.pick(['#a2a77f', '#a7ae83', '#99a379']),
        );
        const door = z + side * d * 0.5,
          end = side < 0 ? lot.z0 : lot.z1;
        box(b, x, 0.35, (door + end) / 2, 1.05, 0.02, Math.max(0.1, Math.abs(door - end)), '#c9c4af');
        if (lw - w > 3 && r() < 0.29) {
          const tx = lot.x0 + 1.2,
            tz = lot.z0 + 1.3;
          tree(b, r, tx, tz, r.between(2.0, 3.3));
        }
      }
    for (const side of [-1, 1]) {
      const n = Math.max(1, Math.floor(p.w / 13.5));
      for (let k = 0; k < n; k++) {
        if (r() < 0.24) continue;
        const x = p.x + ((k - (n - 1) / 2) * (p.w - 7)) / n + r.between(-1.2, 1.2),
          z = p.z + side * (p.d / 2 - 1.04);
        box(b, x, 0.329, z, 1.45, 0.021, 1.55, '#948e75');
        tree(b, r, x, z, r.between(2.8, 4.35), r() < 0.3);
      }
      const count = Math.max(1, Math.floor(p.d / 16.0));
      for (let k = 0; k < count; k++) {
        if (r() < 0.3) continue;
        const x = p.x + side * (p.w / 2 - 0.99),
          z = p.z + ((k - (count - 1) / 2) * (p.d - 7)) / count;
        tree(b, r, x, z, r.between(2.9, 4.4), r() < 0.38);
      }
    }
  }
}
function boat(b, r, x, z, yaw, sail, size) {
  const boatColor = r.pick(['#ebe6d0', '#d8e0d8', '#eee7d6', '#c4d3ce']);
  const at = (side, fwd) => [
    x + Math.cos(yaw) * side + Math.sin(yaw) * fwd,
    z - Math.sin(yaw) * side + Math.cos(yaw) * fwd,
  ];
  const w = size * 0.32;
  b.add('hull', 'solid', x, -1.65, z, w, 1.13, size, boatColor, yaw);
  b.add('hull', 'solid', x, -1.06, z, w * 0.86, 0.14, size * 0.85, '#b69b78', yaw);
  const [cx, cz] = at(0, -size * 0.09);
  b.box(cx, -0.7, cz, w * 0.66, 0.72, size * 0.42, '#dde1d3', yaw);
  b.box(cx, -0.31, cz, w * 0.63, 0.17, size * 0.38, '#7f9ba0', yaw);
  if (sail) {
    const [mx, mz] = at(0, 0.06 * size),
      height = size * 1.11;
    b.add('post', 'solid', mx, -1 + height / 2, mz, 0.1, height, 0.1, '#dad8c6');
    b.add('sail', 'sail', mx, -0.56, mz, 1, height * 0.87, size * 0.4, '#f4e7c8', yaw + PI);
    b.add('sail', 'sail', mx, -0.67, mz, 1, height * 0.72, size * 0.37, '#f5eee0', yaw);
  } else {
    b.box(cx, -0.05, cz, w * 0.74, 0.15, size * 0.45, '#e6e4d5', yaw);
  }
}
function waterfront(b, city) {
  const r = random(city.seed + '/quays');
  for (let index = 0; index < city.shore.length; index++) {
    const { a, b: end, outX: ox, outZ: oz, width } = city.shore[index];
    const dx = Number(a.j === end.j),
      dz = 1 - dx,
      len = Math.hypot(end.x - a.x, end.z - a.z);
    const off = width / 2 + 5.1,
      mx = (a.x + end.x) / 2,
      mz = (a.z + end.z) / 2;
    const pos = (along, out) => [mx + dx * along + ox * out, mz + dz * along + oz * out];
    const [cx, cz] = pos(0, off);
    box(b, cx, 0.24, cz, dx ? len + 0.24 : 0.56, 0.53, dz ? len + 0.24 : 0.56, curb);
    const n = Math.floor(len / 4.2);
    for (let k = 0; k < n; k++) {
      const [px, pz] = pos(((k + 0.5) * len) / n - len / 2, off - 0.09);
      b.add('post', 'solid', px, 0.68, pz, 0.17, 0.77, 0.17, '#61706a', 0, false);
    }
    box(b, cx, 0.94, cz, dx ? len : 0.08, 0.085, dz ? len : 0.08, '#687770');
    for (const along of [-len * 0.25, len * 0.25]) {
      const [tx, tz] = pos(along, off - 2.15);
      tree(b, r, tx, tz, r.between(3.6, 5.3));
    }
    const [bx, bz] = pos(len * 0.12, off - 1.45);
    bench(b, bx, bz, dx ? 0 : PI / 2);
    if (oz !== 1 || a.j < city.nz - 1 || a.i % 2 !== 0) continue;
    const plen = r.between(25, 42),
      [px, pz] = pos(0, off + plen / 2);
    b.box(px, -0.21, pz, 2.9, 0.5, plen, '#ab8d68');
    for (let k = 2; k < plen; k += 3.5) box(b, px, -0.46, pz - plen / 2 + k, 3.05, 0.55, 0.24, '#726c57');
    for (const side of [-1, 1]) {
      for (let k = 6; k < plen; k += 10.5) {
        const [fx, fz] = pos(side * 4.6, off + k);
        box(b, fx, -0.26, fz, 7.3, 0.42, 1.1, '#ae916e');
        b.add('post', 'solid', fx + side * 3.3, -1.23, fz, 0.43, 3.4, 0.43, '#776f5a');
        if (r() < 0.82)
          boat(
            b,
            r,
            fx + side * 0.15,
            fz + 3.1,
            PI / 2 + (side === 1 ? 0 : PI) + r.between(-0.035, 0.035),
            r() < 0.48,
            r.between(5, 8),
          );
      }
    }
  }
  const maxZ = city.zs.at(-1);
  boat(b, r, city.focus.x + 96, maxZ + 66, -0.9, true, 13);
  boat(b, r, city.focus.x - 73, maxZ + 106, 0.95, false, 12);
  boat(b, r, city.xs.at(-1) + 60, city.zs[7], -0.34, true, 11);
}
export function drawBridge(b, city) {
  const start = city.bridgeStart,
    z = start.z,
    x0 = start.x + city.vx[start.i] / 2,
    length = 550;
  const deckY = (t) => Math.min(14.8, 0.12 + t * 0.14, 0.4 + (length - t) * 0.16);
  const paint = '#a5644d',
    light = '#bb8064',
    steel = '#828781';
  for (let t = 0; t < length; t += 10) {
    const end = Math.min(length, t + 10);
    b.beam([x0 + t, deckY(t) - 0.5, z], [x0 + end, deckY(end) - 0.5, z], 1.05, 10.6, '#767d76', false);
    for (const side of [-1, 1]) {
      b.beam(
        [x0 + t, deckY(t) + 0.45, z + side * 5.05],
        [x0 + end, deckY(end) + 0.45, z + side * 5.05],
        0.82,
        0.35,
        steel,
        false,
      );
    }
    b.beam(
      [x0 + t + 1, deckY(t + 1) + 0.045, z],
      [x0 + t + 4.5, deckY(t + 4.5) + 0.045, z],
      0.04,
      0.14,
      '#d0b883',
      false,
    );
  }
  const ts = [140, 360],
    height = 55;
  for (const t of [45, 90, 140, 360, 420, 480]) {
    const px = x0 + t,
      dy = deckY(t);
    b.add('chamfer', 'solid', px, (dy - 3) / 2, z, 4.2, dy + 3, 9.2, '#afac98');
  }
  for (const t of ts) {
    const px = x0 + t;
    for (const side of [-1, 1]) {
      b.add('chamfer', 'solid', px, 25.8, z + side * 6.2, 3.8, 58, 2.7, paint);
      b.box(px, 52.5, z + side * 6.2, 4.1, 1.0, 3.0, light);
      b.box(px, 55.4, z + side * 6.2, 3.5, 0.9, 2.5, light);
    }
    for (const y of [24, 39, 50.5]) b.box(px, y, z, 3.2, 2.1, 11.7, paint);
    for (const y of [25.1, 40]) {
      b.beam([px, y, z - 5.2], [px, y + 9.4, z + 5.2], 0.6, 0.64, light);
      b.beam([px, y, z + 5.2], [px, y + 9.4, z - 5.2], 0.6, 0.64, light);
    }
  }
  for (const side of [-1, 1]) {
    const pz = z + side * 5.6;
    const cy = (t) =>
      t < 140
        ? deckY(t) + 1.5 + (height - deckY(140) - 1.5) * Math.pow(Math.max(0, (t - 45) / 95), 1.72)
        : t <= 360
          ? 23 + (height - 23) * Math.pow((t - 250) / 110, 2)
          : deckY(t) + 1.5 + (height - deckY(360) - 1.5) * Math.pow(Math.max(0, (460 - t) / 100), 1.72);
    for (let t = 45; t < 460; t += 5) {
      b.beam([x0 + t, cy(t), pz], [x0 + t + 5, cy(t + 5), pz], 0.36, 0.36, paint, false);
      if (t % 10 === 0 && cy(t) > deckY(t) + 2)
        b.beam([x0 + t, deckY(t) + 0.6, pz], [x0 + t, cy(t), pz], 0.12, 0.12, steel, false);
      if (t % 15 === 0) {
        b.add('box', 'lens', x0 + t, cy(t) + 0.24, pz, 0.33, 0.26, 0.33, '#ffd79f', 0, false);
        b.add('sign', 'halo', x0 + t, cy(t) + 0.29, pz, 4.3, 4.3, 1, '#ffd79f', 0, false);
      }
    }
  }
}
export function drawStreets(batch, city) {
  streetGrid(batch, city);
  blocks(batch, city);
  waterfront(batch, city);
  drawBridge(batch, city);
  for (const l of city.lamps) lamp(batch, l.x, l.z, l.dx, l.dz, l.height);
}
