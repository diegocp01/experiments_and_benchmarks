// All simulation coordinates are metres. X points east and Z points south.
export const DEFAULT_SEED = '42861';
export function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(seed) {
  let state = hash(seed);
  const rng = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.between = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(rng.between(lo, hi + 1));
  rng.pick = (array) => array[Math.floor(rng() * array.length)];
  return rng;
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const id = (i, j) => i + ',' + j;
function axis(count, min, max, rng) {
  const lines = [0];
  for (let i = 0; i < count; i++) lines.push(lines[i] + rng.int(min, max));
  const mid = lines[count] / 2;
  return lines.map((v) => v - mid);
}
const NAMES = [
  'Alder',
  'Calder',
  'Marwick',
  'Sutton',
  'Linden',
  'Hollis',
  'Briar',
  'Selby',
  'Mercer',
  'Sable',
  'Orford',
  'Fenwick',
  'Weylin',
  'Lowell',
  'Arden',
  'Ellis',
];
const ENDS = ['Bay', 'Harbor', 'Point', 'Reach', 'Quay', 'Haven'];

export function makeLayout(seed) {
  seed = String(seed);
  const rng = random(seed),
    nx = 14,
    nz = 11;
  const xs = axis(nx, 48, 60, rng),
    zs = axis(nz, 47, 56, rng);
  const centerI = rng.int(6, 8),
    centerJ = rng.int(4, 6);
  const vx = xs.map((_, i) => (i === centerI || i === 3 || i === 11 ? 13.2 : rng.between(8.5, 10.4)));
  const hz = zs.map((_, j) => (j === centerJ || j === 2 || j === 8 ? 12.8 : rng.between(8.3, 10.4)));
  const city = {
    seed,
    xs,
    zs,
    vx,
    hz,
    nx,
    nz,
    centerI,
    centerJ,
    blocks: [],
    blockAt: new Map(),
    buildings: [],
    parks: [],
    nodes: [],
    edges: [],
    shore: [],
    nodeAt: new Map(),
  };
  const nr = random(seed + '/name');
  city.name =
    seed === DEFAULT_SEED
      ? 'Port Alder'
      : nr() < 0.4
        ? 'Port ' + nr.pick(NAMES)
        : nr.pick(NAMES) + ' ' + nr.pick(ENDS);
  const west = [2, 1, 1, 0, 0, 0, 0, 0, 1, 1, 2],
    east = [3, 2, 1, 1, 0, 0, 0, 1, 1, 2, 3];
  if (rng() < 0.5) west[1] = 2;
  if (rng() < 0.5) east[9] = 1;
  const centralParkI = centerI - 2,
    centralParkJ = centerJ + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = west[j]; i < nx - east[j]; i++) {
      const r = random(seed + '/block/' + id(i, j));
      const x0 = xs[i] + vx[i] / 2,
        x1 = xs[i + 1] - vx[i + 1] / 2;
      const z0 = zs[j] + hz[j] / 2,
        z1 = zs[j + 1] - hz[j + 1] / 2;
      const landmark = i === centerI && j === centerJ;
      const civicPark = i === centralParkI && j === centralParkJ;
      const radius = Math.hypot((i - centerI) / 4.2, (j - centerJ) / 3.8);
      const park = !landmark && (civicPark || (radius > 0.43 && (i + 2 * j) % 3 === 1 && r() < 0.24));
      const b = {
        i,
        j,
        x0,
        x1,
        z0,
        z1,
        x: (x0 + x1) / 2,
        z: (z0 + z1) / 2,
        w: x1 - x0,
        d: z1 - z0,
        radius,
        park,
        landmark,
        civicPark,
        buildings: [],
      };
      city.blocks.push(b);
      city.blockAt.set(id(i, j), b);
      if (park) city.parks.push(b);
      else subdivide(b, r, city);
    }
  }
  function node(i, j) {
    const key = id(i, j);
    if (city.nodeAt.has(key)) return city.nodeAt.get(key);
    const n = {
      i,
      j,
      key,
      x: xs[i],
      z: zs[j],
      index: city.nodes.length,
      edges: [],
      turnRadius: Math.max(vx[i], hz[j]) * 0.5 + 1.25,
    };
    city.nodes.push(n);
    city.nodeAt.set(key, n);
    return n;
  }
  const edgeKeys = new Set();
  for (const b of city.blocks) {
    const { i, j } = b;
    const sides = [
      [i, j, i + 1, j, 0, -1],
      [i, j + 1, i + 1, j + 1, 0, 1],
      [i, j, i, j + 1, -1, 0],
      [i + 1, j, i + 1, j + 1, 1, 0],
    ];
    for (const [i0, j0, i1, j1, outX, outZ] of sides) {
      const a = node(i0, j0),
        end = node(i1, j1);
      const key = a.key + '/' + end.key;
      const width = j0 === j1 ? hz[j0] : vx[i0];
      if (!edgeKeys.has(key)) {
        const length = Math.hypot(end.x - a.x, end.z - a.z);
        const edge = {
          a,
          b: end,
          width,
          length,
          index: city.edges.length,
          dx: (end.x - a.x) / length,
          dz: (end.z - a.z) / length,
        };
        a.edges.push(edge);
        end.edges.push(edge);
        city.edges.push(edge);
        edgeKeys.add(key);
      }
      if (!city.blockAt.has(id(i + outX, j + outZ))) city.shore.push({ a, b: end, outX, outZ, width });
    }
  }
  const eastJ = 3;
  city.bridgeStart = city.nodes.filter((n) => n.j === eastJ).sort((a, b) => b.x - a.x)[0];
  city.focus = { x: xs[centerI] + 18, z: zs[centerJ] + 12 };
  city.flyStart = { x: xs[centerI] + vx[centerI] * 0.23, z: zs[Math.min(nz - 1, centerJ + 3)] - 10 };
  city.lamps = city.edges.map((e) => {
    const right = e.index % 2 === 0 ? 1 : -1,
      off = (e.width / 2 + 0.92) * right;
    return {
      x: (e.a.x + e.b.x) / 2 - e.dz * off,
      z: (e.a.z + e.b.z) / 2 + e.dx * off,
      dx: e.dz * right,
      dz: -e.dx * right,
      height: e.width > 12 ? 6.8 : 5.5,
    };
  });
  for (const p of city.parks.filter((p) => p.civicPark))
    for (const side of [-1, 1]) {
      city.lamps.push({
        x: p.x + side * 2.1,
        z: p.z + (p.d - 4.3) * 0.39 * side,
        dx: -side,
        dz: 0,
        height: 4.15,
      });
    }
  city.carCount = Math.round(city.edges.length * 0.59);
  return city;
}

function subdivide(b, r, city) {
  let cols = 2,
    rows = 2;
  if (b.radius > 1.06 && r() < 0.68) {
    if (b.w > b.d) cols = 3;
    else rows = 3;
  }
  if (b.radius > 1.48 && r() < 0.35) {
    cols = 3;
    rows = 3;
  }
  if (b.radius < 0.82 && r() < 0.52) {
    if (r() < 0.5) cols = 1;
    else rows = 1;
  }
  if (b.landmark) {
    cols = 1;
    rows = 1;
  }
  const inset = 2.8,
    sx = (b.w - 2 * inset) / cols,
    sz = (b.d - 2 * inset) / rows;
  const mood = r();
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x0 = b.x0 + inset + col * sx,
        z0 = b.z0 + inset + row * sz;
      const core = Math.max(0, 1 - b.radius);
      const roll = r();
      let type = 'apartment';
      if (b.landmark || (core > 0.08 && roll < 0.14 + 0.66 * core)) type = 'tower';
      else if (b.radius > 1.05 && roll < clamp((b.radius - 0.9) * 0.75 + (mood - 0.5) * 0.5, 0.05, 0.9))
        type = 'house';
      else if (r() < 0.35 || (b.radius < 0.65 && r() < 0.5)) type = 'commercial';
      const isHouse = type === 'house';
      const w = Math.min(sx - 1.8, sx * r.between(isHouse ? 0.56 : 0.74, isHouse ? 0.82 : 0.94));
      const d = Math.min(sz - 1.8, sz * r.between(isHouse ? 0.55 : 0.74, isHouse ? 0.82 : 0.94));
      const x = x0 + sx / 2 + r.between(-1, 1) * Math.max(0, (sx - w) / 2 - 0.85);
      const z = z0 + sz / 2 + r.between(-1, 1) * Math.max(0, (sz - d) / 2 - 0.85);
      const floors =
        type === 'tower'
          ? b.landmark
            ? r.int(34, 39)
            : r.int(9, 15) + Math.round(core * r.between(6, 17))
          : isHouse
            ? r.int(1, 2)
            : type === 'commercial'
              ? r.int(1, 3) + (core > 0.28 ? r.int(1, 4) : 0)
              : r.int(3, 6) + Math.round(core * r.between(1, 6));
      const floorH = type === 'tower' ? 3.45 : isHouse ? 2.85 : type === 'commercial' ? 3.65 : 3.02;
      const building = {
        x,
        z,
        w,
        d,
        type,
        floors,
        floorH,
        h: floors * floorH,
        landmark: b.landmark,
        key: city.buildings.length,
        detailSeed: r.int(1, 99999999),
        lot: { x0, z0, x1: x0 + sx, z1: z0 + sz },
      };
      b.buildings.push(building);
      city.buildings.push(building);
    }
}

export function blockAtPoint(city, x, z) {
  const i = city.xs.findIndex((v, k, a) => k < a.length - 1 && x >= v && x < a[k + 1]);
  const j = city.zs.findIndex((v, k, a) => k < a.length - 1 && z >= v && z < a[k + 1]);
  return city.blockAt.get(id(i, j));
}
