import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIRS } from './layout.js';
import { LANES, ROAD_Y } from './streets.js';
import { PAD_Y } from './blocks.js';
import { carBody, carLights, setInstance, CAR_PAINT, CAR_SIZES } from './props.js';
import { poolMaterial, glowMaterial } from './materials.js';

const V_TURN = 5.5, ACCEL = 2.6, BRAKE = 4.5, GAP = 2.6;
const CYCLE = 26, GREEN = 10.5;   // per axis: 10.5 s green, 2.5 s yellow, 13 s red
const SIGNAL_COLORS = ['#2bff7a', '#ffd23a', '#ff3b30'].map(c => new THREE.Color(c));

// Cars drive on a lane graph: one directed edge per road direction between two intersections,
// joined by Bezier turn paths. They follow the car ahead, obey signals and yield on left turns.
export class Traffic {
  constructor(layout, rng) {
    this.rng = rng;
    this.group = new THREE.Group();
    const nodes = layout.nodes;
    this.edges = new Array(nodes.length * 4).fill(null);
    const list = [];
    let total = 0;
    for (const a of nodes) for (let d = 0; d < 4; d++) {
      if (!a.arms[d]) continue;
      const b = nodes[a.nb[d]], D = DIRS[d], R = DIRS[(d + 1) % 4];
      const ha = d % 2 === 0 ? a.hx : a.hz, hb = d % 2 === 0 ? b.hx : b.hz;
      const n = (d % 2 === 0 ? layout.aveZ[a.j] : layout.aveX[a.i]) ? 2 : 1;
      const e = {
        a, b, d, n, dx: D[0], dz: D[1], rx: R[0], rz: R[1], rot: Math.atan2(D[0], D[1]),
        sx: a.x + D[0] * ha, sz: a.z + D[1] * ha, off: LANES[n],
        len: Math.abs((b.x - a.x) * D[0] + (b.z - a.z) * D[1]) - ha - hb,
        signal: b.count >= 3, cars: [], turning: [], leaving: [],
      };
      for (let l = 0; l < n; l++) { e.cars.push([]); e.turning.push([]); }
      this.edges[a.id * 4 + d] = e;
      list.push(e);
      total += e.len * n;
    }
    for (const n of nodes) { n.off = rng.range(0, CYCLE); n.sig = [-1, -1]; }

    // ---- spawn ----
    this.cars = [];
    this.turners = [];
    const want = list.length ? Math.min(460, Math.round(total / 60)) : 0;
    for (let i = 0; i < want; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const e = rng.pick(list);
        if (e.len < 30) continue;
        const exitDir = this.chooseDir(e.b, e.d), lane = this.laneFor(e, exitDir), s = rng.range(6, e.len - 10);
        if (e.cars[lane].some(o => Math.abs(o.s - s) < 9)) continue;
        const size = rng.pick(CAR_SIZES);
        const c = { id: this.cars.length, e, lane, s, v: 0, vbase: rng.range(8.5, 13), len: 4.3 * size[2], size, exitDir, turn: null, x: 0, z: 0, rot: 0 };
        this.plan(c);
        e.cars[lane].push(c);
        this.cars.push(c);
        break;
      }
    }
    this.count = this.cars.length;
    this.buildMeshes(nodes);
    this.update(0, 0);
  }

  buildMeshes(nodes) {
    const n = Math.max(1, this.cars.length), color = new THREE.Color();
    const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.35 });
    const body = new THREE.InstancedMesh(carBody(), paint, n);
    body.castShadow = true; body.receiveShadow = true;
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const lights = new THREE.InstancedMesh(carLights(), this.lightMat, n);
    const beamGeo = new THREE.PlaneGeometry(5.5, 12).rotateX(-Math.PI / 2).translate(0, 0.1, 8.6);
    const beams = new THREE.InstancedMesh(beamGeo, poolMaterial(0.42), n);
    beams.material.uniforms.uColor.value.set('#fff1d6');
    lights.instanceMatrix = beams.instanceMatrix = body.instanceMatrix;   // one shared transform buffer
    this.cars.forEach((c, i) => body.setColorAt(i, color.set(this.rng.pick(CAR_PAINT))));
    for (const m of [body, lights, beams]) { m.frustumCulled = false; m.matrixAutoUpdate = false; m.count = this.cars.length; }
    beams.renderOrder = 2;
    this.body = body;
    this.group.add(body, lights, beams);

    // head / tail light halos: two glow points per car, repositioned every frame
    this.glowPos = new Float32Array(n * 6);
    const gCol = new Float32Array(n * 6), gGlow = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      gCol.set([1, 0.93, 0.78, 1, 0.1, 0.07], i * 6);
      gGlow.set([1.5, 0, 1.15, 0], i * 4);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    gg.setAttribute('aColor', new THREE.BufferAttribute(gCol, 3));
    gg.setAttribute('aGlow', new THREE.BufferAttribute(gGlow, 2));
    gg.setDrawRange(0, this.cars.length * 2);
    this.glow = new THREE.Points(gg, glowMaterial());
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 3;
    this.group.add(this.glow);

    // ---- traffic signals: a post per approach whose head glows green / yellow / red ----
    this.signals = [];
    const spots = [];
    for (const node of nodes) {
      if (node.count < 3) continue;
      node.sigIdx = [];
      for (let k = 0; k < 4; k++) {
        if (!node.arms[k]) continue;
        const D = DIRS[k], R = DIRS[(k + 3) % 4];   // right-hand side of traffic approaching along arm k
        const along = (k % 2 === 0 ? node.hx : node.hz) + 5.2, side = (k % 2 === 0 ? node.hz : node.hx) + 0.9;
        node.sigIdx.push([spots.length, k % 2]);
        spots.push([node.x + D[0] * along + R[0] * side, node.z + D[1] * along + R[1] * side]);
      }
      this.signals.push(node);
    }
    if (!spots.length) return;
    const postGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.11, 5, 6).translate(0, 2.5, 0),
      new THREE.BoxGeometry(0.42, 1.25, 0.42).translate(0, 5.2, 0),
    ]);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.6, metalness: 0.4 }), spots.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.42, 0.5), new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length);
    spots.forEach((p, i) => {
      setInstance(posts.instanceMatrix.array, i, p[0], PAD_Y, p[1], 0, 1, 1, 1);
      setInstance(heads.instanceMatrix.array, i, p[0], PAD_Y + 5.2, p[1], 0, 1, 1, 1);
      heads.setColorAt(i, SIGNAL_COLORS[2]);
    });
    for (const m of [posts, heads]) { m.frustumCulled = false; m.matrixAutoUpdate = false; }
    this.heads = heads;
    this.group.add(posts, heads);
  }

  state(node, axis, t) {
    const p = (t + node.off) % CYCLE, q = axis === 0 ? p : (p + CYCLE / 2) % CYCLE;
    return q < GREEN ? 0 : q < CYCLE / 2 ? 1 : 2;
  }

  // Direction to leave `node` when arriving with heading d: mostly straight, never a U-turn.
  chooseDir(node, d) {
    const w = [0.55, 0.25, 0, 0.2];   // straight, right, back, left
    const opts = [];
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      const dd = (d + k) % 4;
      if (k !== 2 && node.arms[dd]) { opts.push(dd, w[k]); sum += w[k]; }
    }
    if (!opts.length) return (d + 2) % 4;
    let r = this.rng.next() * sum;
    for (let i = 0; i < opts.length; i += 2) { r -= opts[i + 1]; if (r <= 0) return opts[i]; }
    return opts[opts.length - 2];
  }

  // Inner lane for left turns, kerb lane for right turns.
  laneFor(e, dOut) {
    if (e.n === 1 || dOut === (e.d + 3) % 4) return 0;
    if (dOut === (e.d + 1) % 4) return e.n - 1;
    return this.rng.int(0, e.n - 1);
  }

  // c.e / c.exitDir are known; decide the edge after that and which of its lanes to take.
  plan(c) {
    const e2 = this.edges[c.e.b.id * 4 + c.exitDir];
    const d3 = this.chooseDir(e2.b, e2.d);
    c.next = e2; c.nextLane = this.laneFor(e2, d3); c.afterDir = d3;
  }

  canEnter(c, e, t, yielding = false) {
    const e2 = c.next, l2 = c.nextLane;
    if (e.signal && this.state(e.b, e.d & 1, t) !== 0) return false;
    const q = e2.cars[l2];
    if (q.length && q[0].s - q[0].len / 2 < c.len + 2) return false;
    for (let l = 0; l < e2.n; l++) for (const o of e2.turning[l]) {
      // someone from another approach is still swinging into that road, or our own leader is too close
      if (o.turn.from !== e) { if (o.turn.t < 0.8) return false; continue; }
      const crossing = l === l2 || (o.turn.fromLane - c.lane) * (l - l2) < 0;
      if (crossing && o.turn.t * o.turn.len < c.len + 2.5) return false;
    }
    if (!yielding && c.exitDir === (e.d + 3) % 4 && e.b.arms[e.d]) {   // unprotected left: yield to oncoming traffic
      const on = this.edges[e.b.nb[e.d] * 4 + ((e.d + 2) % 4)];
      for (const o of on.leaving) if (o.turn.t < (o.turn.left ? 0.6 : 0.85)) return false;
      for (let l = 0; l < on.n; l++) {
        const arr = on.cars[l], f = arr[arr.length - 1];
        if (!f || on.len - f.s > Math.max(34, f.v * 4.5)) continue;
        if (f.exitDir === (on.d + 3) % 4 && f.id > c.id) continue;   // opposing left turns: lower id goes first
        if (f.v > 1 || this.canEnter(f, on, t, true)) return false;
      }
    }
    return true;
  }

  startTurn(c, e) {
    const e2 = c.next, l2 = c.nextLane, o1 = e.off[c.lane], o2 = e2.off[l2];
    const x0 = e.sx + e.dx * e.len + e.rx * o1, z0 = e.sz + e.dz * e.len + e.rz * o1;
    const x1 = e2.sx + e2.rx * o2, z1 = e2.sz + e2.rz * o2;
    const straight = e2.d === e.d;
    const cx = straight ? (x0 + x1) / 2 : e.d % 2 === 0 ? x1 : x0, cz = straight ? (z0 + z1) / 2 : e.d % 2 === 0 ? z0 : z1;
    const len = (Math.hypot(cx - x0, cz - z0) + Math.hypot(x1 - cx, z1 - cz) + Math.hypot(x1 - x0, z1 - z0)) / 2;
    c.turn = { x0, z0, cx, cz, x1, z1, t: 0, len: Math.max(len, 1), from: e, fromLane: c.lane, to: e2, lane: l2, straight, left: e2.d === (e.d + 3) % 4 };
    e.leaving.push(c);
    e2.turning[l2].push(c);
    this.turners.push(c);
  }

  update(dt, t) {
    dt = Math.min(dt, 0.05);
    for (const e of this.edges) {
      if (!e) continue;
      for (let l = 0; l < e.n; l++) {
        const arr = e.cars[l];
        if (!arr.length) continue;
        for (let i = 1; i < arr.length; i++) {   // keep sorted by position (nearly sorted already)
          const c = arr[i];
          let k = i - 1;
          while (k >= 0 && arr[k].s > c.s) { arr[k + 1] = arr[k]; k--; }
          arr[k + 1] = c;
        }
        const off = e.off[l];
        for (let i = arr.length - 1; i >= 0; i--) {
          const c = arr[i], vmax = c.vbase * (e.n === 2 ? 1.25 : 1);
          let limit = Infinity;
          if (i < arr.length - 1) {
            const f = arr[i + 1];
            limit = f.s - f.len / 2 - c.s - c.len / 2 - GAP;
          } else {
            const stopS = e.len - c.len / 2 - (e.signal ? 5.6 : 0.5);
            // Aim to stop 1 m short of the line; only a car already past the line is committed.
            if (c.s < stopS && e.len - c.s < 45 && !this.canEnter(c, e, t)) limit = stopS - 1 - c.s;
            for (const o of e.leaving) {
              if (o.turn.fromLane === l) limit = Math.min(limit, e.len - c.s + o.turn.t * o.turn.len - o.len / 2 - c.len / 2 - GAP);
            }
          }
          const vEnd = c.exitDir === e.d ? vmax : V_TURN;
          let target = Math.min(vmax, Math.sqrt(vEnd * vEnd + 2 * BRAKE * Math.max(0, e.len - c.s)));
          if (limit < Infinity) target = Math.min(target, limit > 0 ? Math.sqrt(2 * BRAKE * limit) : 0);
          c.v = target > c.v ? Math.min(target, c.v + ACCEL * dt) : Math.max(target, c.v - BRAKE * 1.7 * dt);
          c.s += c.v * dt;
          if (i === arr.length - 1 && c.s >= e.len) { arr.pop(); this.startTurn(c, e); continue; }
          c.x = e.sx + e.dx * c.s + e.rx * off;
          c.z = e.sz + e.dz * c.s + e.rz * off;
          c.rot = e.rot;
        }
      }
    }

    for (let i = this.turners.length - 1; i >= 0; i--) {
      const c = this.turners[i], tr = c.turn, e2 = tr.to, q = e2.cars[tr.lane];
      let target = tr.straight ? c.vbase : V_TURN, limit = Infinity;
      const rem = (1 - tr.t) * tr.len;
      if (q.length) limit = rem + q[0].s - q[0].len / 2 - c.len / 2 - GAP;
      for (const o of e2.turning[tr.lane]) {
        if (o === c) continue;
        const ro = (1 - o.turn.t) * o.turn.len;
        if (ro < rem || (ro === rem && o.id < c.id)) limit = Math.min(limit, rem - ro - o.len / 2 - c.len / 2 - GAP);
      }
      if (limit < Infinity) target = Math.min(target, limit > 0 ? Math.sqrt(2 * BRAKE * limit) : 0);
      c.v = target > c.v ? Math.min(target, c.v + ACCEL * dt) : Math.max(target, c.v - BRAKE * 1.7 * dt);
      tr.t += (c.v * dt) / tr.len;
      if (tr.t >= 1) {
        c.s = (tr.t - 1) * tr.len;
        c.e = e2; c.lane = tr.lane; c.exitDir = c.afterDir; c.turn = null;
        q.unshift(c);
        tr.from.leaving.splice(tr.from.leaving.indexOf(c), 1);
        e2.turning[tr.lane].splice(e2.turning[tr.lane].indexOf(c), 1);
        this.turners.splice(i, 1);
        this.plan(c);
        const off = e2.off[c.lane];
        c.x = e2.sx + e2.dx * c.s + e2.rx * off; c.z = e2.sz + e2.dz * c.s + e2.rz * off; c.rot = e2.rot;
        continue;
      }
      const u = tr.t, w = 1 - u;
      c.x = w * w * tr.x0 + 2 * w * u * tr.cx + u * u * tr.x1;
      c.z = w * w * tr.z0 + 2 * w * u * tr.cz + u * u * tr.z1;
      const tx = w * (tr.cx - tr.x0) + u * (tr.x1 - tr.cx), tz = w * (tr.cz - tr.z0) + u * (tr.z1 - tr.cz);
      if (tx * tx + tz * tz > 1e-6) c.rot = Math.atan2(tx, tz);
    }

    const arr = this.body.instanceMatrix.array, gp = this.glowPos;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i], half = 2.2 * c.size[2], fx = Math.sin(c.rot) * half, fz = Math.cos(c.rot) * half, o = i * 6;
      setInstance(arr, i, c.x, ROAD_Y, c.z, c.rot, c.size[0], c.size[1], c.size[2]);
      gp[o] = c.x + fx; gp[o + 1] = 0.72; gp[o + 2] = c.z + fz;
      gp[o + 3] = c.x - fx; gp[o + 4] = 0.76; gp[o + 5] = c.z - fz;
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.glow.geometry.attributes.position.needsUpdate = true;

    if (this.heads) {
      let dirty = false;
      for (const node of this.signals) {
        const s0 = this.state(node, 0, t), s1 = this.state(node, 1, t);
        if (s0 === node.sig[0] && s1 === node.sig[1]) continue;
        node.sig[0] = s0; node.sig[1] = s1;
        for (const [idx, axis] of node.sigIdx) this.heads.setColorAt(idx, SIGNAL_COLORS[axis ? s1 : s0]);
        dirty = true;
      }
      if (dirty) this.heads.instanceColor.needsUpdate = true;
    }
  }

  setNight(k) { this.lightMat.color.setScalar(0.75 + k * 0.6); }
}
