import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAD_Y } from './blocks.js';
import { ROAD_Y } from './streets.js';
import { glowMaterial, poolMaterial } from './materials.js';

const LEAF = ['#5c8a3a', '#4f7d33', '#6a9645', '#527a3a', '#7aa04a', '#466e34', '#638f41'];
const PINE = ['#2f5d3a', '#356644', '#2a5233', '#3d6b47'];
export const CAR_PAINT = ['#e8e8e6', '#c9ccd0', '#8e9399', '#2b2d31', '#15171a', '#a12b2b', '#2f4f8f', '#3c5a48', '#d9b23a', '#f2f2f0', '#6b2f2f', '#7fa3c7', '#b9bcc0', '#4a4d52'];
export const CAR_SIZES = [[1, 1, 1], [1, 1, 1], [0.95, 1, 0.86], [1.05, 1.22, 1.05], [1.08, 1.5, 1.2]];

// Give a primitive a flat vertex colour and drop what we do not need, so parts can be merged.
function part(geo, r, g, b, x = 0, y = 0, z = 0, sy = 1) {
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  geo.scale(1, sy, 1);
  geo.translate(x, y, z);
  const n = geo.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function leafTree() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.2, 0.32, 2.8, 5, 1, true), 0.5, 0.36, 0.26, 0, 1.4, 0),
    part(new THREE.IcosahedronGeometry(2.3, 1), 1, 1, 1, 0, 4.4, 0, 0.86),
    part(new THREE.IcosahedronGeometry(1.5, 0), 0.9, 0.9, 0.9, 1.25, 3.7, 0.5),
    part(new THREE.IcosahedronGeometry(1.4, 0), 0.82, 0.82, 0.82, -1.05, 3.9, -0.8),
  ]);
}

function pineTree() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.16, 0.26, 1.8, 5, 1, true), 0.5, 0.36, 0.26, 0, 0.9, 0),
    part(new THREE.ConeGeometry(2.0, 3.3, 7), 0.85, 0.85, 0.85, 0, 3.1, 0),
    part(new THREE.ConeGeometry(1.55, 2.9, 7), 0.93, 0.93, 0.93, 0, 5.0, 0),
    part(new THREE.ConeGeometry(1.05, 2.5, 7), 1, 1, 1, 0, 6.8, 0),
  ]);
}

function lampPost() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.08, 0.13, 7.6, 6, 1, true), 1, 1, 1, 0, 3.8, 0),
    part(new THREE.BoxGeometry(0.1, 0.1, 2.0), 1, 1, 1, 0, 7.55, 0.95),
    part(new THREE.BoxGeometry(0.36, 0.14, 0.8), 1.6, 1.6, 1.6, 0, 7.5, 1.85),
  ]);
}

export function carBody() {
  const tyre = [0.03, 0.03, 0.035];
  const parts = [
    part(new THREE.BoxGeometry(1.8, 0.62, 4.3), 1, 1, 1, 0, 0.56, 0),
    part(new THREE.BoxGeometry(1.58, 0.5, 2.2), 0.06, 0.08, 0.1, 0, 1.12, -0.2),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.26, 0.62, 0.66), ...tyre, sx * 0.86, 0.31, sz * 1.36));
  }
  return mergeGeometries(parts);
}

export function carLights() {
  return mergeGeometries([
    part(new THREE.BoxGeometry(0.38, 0.15, 0.06), 1, 0.94, 0.78, -0.6, 0.62, 2.16),
    part(new THREE.BoxGeometry(0.38, 0.15, 0.06), 1, 0.94, 0.78, 0.6, 0.62, 2.16),
    part(new THREE.BoxGeometry(0.4, 0.14, 0.06), 1, 0.08, 0.06, -0.6, 0.66, -2.16),
    part(new THREE.BoxGeometry(0.4, 0.14, 0.06), 1, 0.08, 0.06, 0.6, 0.66, -2.16),
  ]);
}

// Writes a Y-rotation + scale + translation matrix straight into an instance buffer.
export function setInstance(arr, i, x, y, z, rot, sx, sy, sz) {
  const c = Math.cos(rot), s = Math.sin(rot), o = i * 16;
  arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

function instanced(geo, mat, count, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.castShadow = shadow; m.receiveShadow = true;
  m.frustumCulled = false;   // instances span the whole city
  m.matrixAutoUpdate = false;
  return m;
}

// Trees, streetlights (+ night halos and light pools), aircraft beacons and parked cars.
export function buildProps(ctx, rng) {
  const group = new THREE.Group(), color = new THREE.Color();
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, envMapIntensity: 0.5 });

  // Trees are instanced in ~600 m tiles so tiles outside the view (or the shadow frustum) are culled.
  const tiles = new Map(), geos = [leafTree(), pineTree()];
  for (const t of ctx.trees) {
    const key = t[3] + ':' + Math.floor(t[0] / 600) + ':' + Math.floor(t[1] / 600);
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(t);
  }
  for (const list of tiles.values()) {
    const kind = list[0][3], mesh = instanced(geos[kind], flat, list.length, true);
    const arr = mesh.instanceMatrix.array, pal = kind ? PINE : LEAF;
    list.forEach((t, i) => {
      const s = t[2] * rng.range(0.9, 1.1);
      setInstance(arr, i, t[0], t[4] ?? PAD_Y, t[1], rng.range(0, 6.28), s, s * rng.range(0.9, 1.2), s);
      mesh.setColorAt(i, color.set(rng.pick(pal)).multiplyScalar(rng.range(0.85, 1.12)));
    });
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  const lamps = ctx.lamps, nGlow = lamps.length + ctx.beacons.length;
  const metal = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#3b4046', roughness: 0.55, metalness: 0.5 });
  const posts = instanced(lampPost(), metal, lamps.length, false);
  const pools = instanced(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMaterial(0.55), lamps.length, false);
  pools.receiveShadow = false;
  const gPos = new Float32Array(nGlow * 3), gCol = new Float32Array(nGlow * 3), gGlow = new Float32Array(nGlow * 2);
  lamps.forEach((l, i) => {
    const bx = l[0] + Math.sin(l[2]) * 1.85, bz = l[1] + Math.cos(l[2]) * 1.85;
    setInstance(posts.instanceMatrix.array, i, l[0], PAD_Y, l[1], l[2], 1, 1, 1);
    setInstance(pools.instanceMatrix.array, i, bx, PAD_Y + 0.06, bz, 0, 17, 1, 17);
    gPos.set([bx, PAD_Y + 7.38, bz], i * 3);
    gCol.set([1, 0.78, 0.5], i * 3);
    gGlow.set([1.9, 0], i * 2);
  });
  ctx.beacons.forEach((b, k) => {
    const i = lamps.length + k;
    gPos.set(b, i * 3);
    gCol.set([1, 0.12, 0.08], i * 3);
    gGlow.set([3.2, 0.05 + rng.next() * 0.9], i * 2);
  });
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('aColor', new THREE.BufferAttribute(gCol, 3));
  gGeo.setAttribute('aGlow', new THREE.BufferAttribute(gGlow, 2));
  const glow = new THREE.Points(gGeo, glowMaterial());
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  pools.renderOrder = 2;
  group.add(posts, pools, glow);

  if (ctx.parked.length) {
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
    const cars = instanced(carBody(), paint, ctx.parked.length, true);
    ctx.parked.forEach((p, i) => {
      const sz = rng.pick(CAR_SIZES);
      setInstance(cars.instanceMatrix.array, i, p[0], p[3] ?? ROAD_Y, p[1], p[2] + (rng.chance(0.5) && p[3] ? Math.PI : 0), sz[0], sz[1], sz[2]);
      cars.setColorAt(i, color.set(rng.pick(CAR_PAINT)));
    });
    group.add(cars);
  }
  return group;
}
