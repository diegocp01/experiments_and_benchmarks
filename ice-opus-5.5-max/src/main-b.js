// ===== Ice simulation, camera, main loop =====
const TAU = Math.PI * 2;
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// rotation (local -> world) as 3 column axes: Ry(yaw) * Rx(ax) * Rz(az)
function axesFrom(yaw, ax, az) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(ax), sx = Math.sin(ax), cz = Math.cos(az), sz = Math.sin(az);
  const Ry = v => [cy * v[0] + sy * v[2], v[1], -sy * v[0] + cy * v[2]];
  const Rx = v => [v[0], cx * v[1] - sx * v[2], sx * v[1] + cx * v[2]];
  const Rz = v => [cz * v[0] - sz * v[1], sz * v[0] + cz * v[1], v[2]];
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => Ry(Rx(Rz(e))));
}

// separating-axis overlap of two boxes: returns penetration depth (0 if apart)
function boxPen(ca, A, ea, cb, B, eb) {
  const axes = [...A, ...B];
  for (const a of A) for (const b of B) { const c = V.cross(a, b), l = Math.hypot(...c); if (l > 1e-3) axes.push(V.mul(c, 1 / l)); }
  const d = V.sub(cb, ca);
  let pen = Infinity;
  for (const L of axes) {
    const ra = ea[0] * Math.abs(V.dot(A[0], L)) + ea[1] * Math.abs(V.dot(A[1], L)) + ea[2] * Math.abs(V.dot(A[2], L));
    const rb = eb[0] * Math.abs(V.dot(B[0], L)) + eb[1] * Math.abs(V.dot(B[1], L)) + eb[2] * Math.abs(V.dot(B[2], L));
    const p = ra + rb - Math.abs(V.dot(d, L));
    if (p <= 0) return 0;
    pen = Math.min(pen, p);
  }
  return pen;
}

const ICE = [
  { th: 0.25, rho: 1.95, s: [1.21, 1.17, 1.19], lift: 0.30, rx: 0.10, rz: -0.30, yaw: 0.20 },
  { th: 2.35, rho: 1.90, s: [1.12, 1.10, 1.13], lift: 0.62, rx: -0.34, rz: 0.12, yaw: -0.45 },
  { th: 4.30, rho: 1.92, s: [1.08, 1.07, 1.10], lift: 0.18, rx: 0.05, rz: 0.08, yaw: 0.65 },
].map(c => ({ ...c, pos: null, ox: 0, oz: 0, ol: 0, tx: 0, tz: 0, tl: 0 }));

const st = {
  time: 0, melt: 0, level: 4.55,
  iceP: new Float32Array(9), iceR: new Float32Array(27), iceS: new Float32Array(12), rip: new Float32Array(16).fill(-100),
};
let ripIdx = 0, nextSettle = 6 + rnd() * 6;

function simulate(t, dt) {
  st.time = t;
  const m = Q.has('melt') ? clamp(qn('melt', 0), 0, 1) : 1 - Math.exp(-t / 240);
  st.melt = m;
  st.level = 4.55 + 0.12 * m;
  const k = 1 - 0.24 * m;
  const spin = 0.006 * t;

  if (t > nextSettle && dt > 0) {                      // a cube slips and settles
    nextSettle = t + 8 + rnd() * 13;
    const c = ICE[(rnd() * 3) | 0];
    c.tx = clamp(c.tx + (rnd() - 0.5) * 0.28, -0.2, 0.2);
    c.tz = clamp(c.tz + (rnd() - 0.5) * 0.28, -0.2, 0.2);
    c.tl = clamp(c.tl + (rnd() - 0.5) * 0.16, -0.1, 0.12);
    if (c.pos) { st.rip.set([c.pos[0], c.pos[2], t, 0.018 + rnd() * 0.012], ripIdx * 4); ripIdx = (ripIdx + 1) % 4; }
  }
  const ease = 1 - Math.exp(-dt * 2.6);
  const boxes = ICE.map((c, i) => {
    c.ox += (c.tx - c.ox) * ease; c.oz += (c.tz - c.oz) * ease; c.ol += (c.tl - c.ol) * ease;
    const th = c.th + spin + 0.03 * Math.sin(t * 0.11 + i * 2.0);
    const rho = c.rho * (1 - 0.05 * m);
    const e = c.s.map(v => v * k);
    const bob = 0.022 * Math.sin(t * 0.8 + i * 1.7) + 0.012 * Math.sin(t * 1.9 + i);
    const target = [rho * Math.cos(th), st.level - e[1] * 0.8 + (c.lift + c.ol) * k + bob, rho * Math.sin(th)];
    const A = axesFrom(-th + c.yaw + 0.02 * Math.sin(t * 0.37 + i), c.rx + c.ox + 0.015 * Math.sin(t * 0.53 + i * 3.0), c.rz + c.oz);
    if (!c.pos) c.pos = target.slice();
    const f = 1 - Math.exp(-dt * 3.0);
    c.pos = dt > 0 ? V.add(c.pos, V.mul(V.sub(target, c.pos), f)) : target.slice();
    return { c, A, e, r: Math.min(0.14 + 0.42 * m, 0.7 * Math.min(...e)) };
  });
  for (let it = 0; it < 4; it++) {                      // keep cubes apart and inside the glass
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = boxes[i], b = boxes[j];
      const pen = boxPen(a.c.pos, a.A, a.e.map(v => v * 0.97), b.c.pos, b.A, b.e.map(v => v * 0.97));
      if (pen > 0) {
        const d = V.norm([b.c.pos[0] - a.c.pos[0], 0, b.c.pos[2] - a.c.pos[2]]);
        a.c.pos = V.add(a.c.pos, V.mul(d, -pen * 0.5 - 0.004));
        b.c.pos = V.add(b.c.pos, V.mul(d, pen * 0.5 + 0.004));
      }
    }
    for (const b of boxes) {
      const p = b.c.pos, rh = Math.hypot(p[0], p[2]) || 1e-6, n = [p[0] / rh, 0, p[2] / rh];
      const sup = rh + b.e[0] * Math.abs(V.dot(b.A[0], n)) + b.e[1] * Math.abs(V.dot(b.A[1], n)) + b.e[2] * Math.abs(V.dot(b.A[2], n));
      const lim = 3.75 + 0.035 * p[1] - 0.07;
      if (sup > lim) b.c.pos = V.add(p, V.mul(n, lim - sup));
    }
  }
  boxes.forEach((b, i) => {
    st.iceP.set(b.c.pos, i * 3);
    const [a0, a1, a2] = b.A;                         // world->local = transpose, column-major
    st.iceR.set([a0[0], a1[0], a2[0], a0[1], a1[1], a2[1], a0[2], a1[2], a2[2]], i * 9);
    st.iceS.set([b.e[0], b.e[1], b.e[2], b.r], i * 4);
  });
}

// ---------- camera: orbit, drag to look, wheel / pinch to zoom, auto-orbit resumes when idle ----------
const cam = {
  az: qn('az', 0.75), el: qn('el', 0.07), dist: qn('dist', 25), distT: qn('dist', 25), fov: qn('fov', 30),
  T: [0, 4.3, 0], vAz: 0, vEl: 0, auto: Q.has('still') ? 0 : 1, last: -1e9,
  pos: new Float32Array(3), rot: new Float32Array(9), tanHalf: 0.27, focus: 20, aperture: qn('aperture', 0.02),
  prevPos: new Float32Array(3), prevRot: new Float32Array(9), jitter: new Float32Array(2),
};
const EL0 = cam.el, AUTO = TAU / 80, IDLE = 3.0;
const elMin = d => Math.asin(clamp((0.8 - cam.T[1]) / d, -1, 1));
const pointers = new Map();
let pinch0 = 0, pinchD = 0, nowS = 0, lastMove = 0;
const hint = $('hint');
let hintHidden = false;
function touched() {
  cam.last = nowS;
  if (!hintHidden) { hintHidden = true; setTimeout(() => hint.classList.add('hide'), 1200); }
}
const pinchLen = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic or already-released pointer */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) { pinch0 = pinchLen(); pinchD = cam.distT; }
  cam.vAz = cam.vEl = 0;
  canvas.classList.add('drag'); touched();
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1) {
    const k = 3.0 / Math.max(canvas.clientHeight, 320);
    cam.az += dx * k; cam.el += dy * k * 0.8;
    const dtm = Math.max(nowS - lastMove, 1 / 120); lastMove = nowS;
    cam.vAz = cam.vAz * 0.5 + 0.5 * clamp(dx * k / dtm, -6, 6);
    cam.vEl = cam.vEl * 0.5 + 0.5 * clamp(dy * k * 0.8 / dtm, -4, 4);
  } else if (pointers.size === 2) {
    cam.distT = cam.dist = clamp(pinchD * pinch0 / pinchLen(), 9, 70);
  }
  touched();
});
const release = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch0 = 0;
  if (pointers.size === 0) canvas.classList.remove('drag');
  else cam.vAz = cam.vEl = 0;
  if (nowS - lastMove > 0.08) cam.vAz = cam.vEl = 0;
  touched();
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
  cam.distT = clamp(cam.distT * Math.exp(dy * 0.0012), 9, 70);
  touched();
}, { passive: false });

function updateCamera(dt) {
  const idle = pointers.size === 0 && nowS - cam.last > IDLE && !Q.has('still');
  cam.auto = clamp(cam.auto + (idle ? dt / 2.5 : -dt * 4), 0, 1);
  const a = cam.auto * cam.auto * (3 - 2 * cam.auto);
  if (pointers.size === 0) {                            // inertia after a flick
    cam.az += cam.vAz * dt; cam.el += cam.vEl * dt;
    const damp = Math.exp(-dt * 3.5); cam.vAz *= damp; cam.vEl *= damp;
  }
  cam.az += AUTO * a * dt;
  cam.el += (EL0 - cam.el) * (1 - Math.exp(-dt * 0.35)) * a;
  cam.dist += (cam.distT - cam.dist) * (1 - Math.exp(-dt * 8));
  const breathe = a * Math.sin(nowS * 0.21) * 0.5;
  const d = cam.dist + breathe;
  cam.el = clamp(cam.el, elMin(cam.dist), 1.25);
  const el = Math.max(cam.el + a * 0.01 * Math.sin(nowS * 0.29), elMin(d));
  const T = cam.T, ce = Math.cos(el);
  const pos = [T[0] + d * ce * Math.cos(cam.az), T[1] + d * Math.sin(el), T[2] + d * ce * Math.sin(cam.az)];
  const f = V.norm(V.sub(T, pos)), r = V.norm(V.cross(f, [0, 1, 0])), u = V.cross(r, f);
  cam.pos.set(pos);
  cam.rot.set([r[0], r[1], r[2], u[0], u[1], u[2], -f[0], -f[1], -f[2]]);
  cam.tanHalf = Math.tan(cam.fov * Math.PI / 360);
  cam.focus = Math.max(d - 1.0, 3);
}

// ---------- main loop ----------
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
let simT = qn('t', 0), speed = qn('speed', 1), frameNo = 0, last = 0, ema = 16, adaptT = 0;
const still = Q.has('still');
// dynamic resolution with hysteresis: drop fast when struggling, creep up slowly, remember the ceiling
let slowFor = 0, fastFor = 0, ceil = 1;
function adapt(dt) {
  if (view.fixed || dt <= 0) return;
  ema += (dt * 1000 - ema) * 0.08;
  slowFor = ema > 23 ? slowFor + dt : 0;
  fastFor = ema < 17.6 ? fastFor + dt : 0;
  ceil = Math.min(1, ceil + dt * 0.004);
  let s = view.scale;
  if (slowFor > 0.8) { ceil = Math.max(0.35, s * 0.97); s *= ema > 40 ? 0.8 : 0.9; slowFor = 0; }
  else if (fastFor > 2.5 && s < ceil) { s = Math.min(ceil, s * 1.06); fastFor = 0; }
  s = clamp(s, 0.35, 1);
  if (Math.abs(s - view.scale) > 0.01) { view.scale = s; resize(); }
}
function frame(ms) {
  const dt = last ? Math.min((ms - last) / 1000, 0.1) : 0;
  last = ms; nowS = ms / 1000;
  if (!still) simT += dt * speed;
  resize();
  simulate(simT, still ? 0 : dt);
  cam.prevPos.set(cam.pos); cam.prevRot.set(cam.rot);
  updateCamera(dt);
  if (frameNo === 0) { cam.prevPos.set(cam.pos); cam.prevRot.set(cam.rot); }
  cam.jitter[0] = halton(frameNo % 16 + 1, 2) - 0.5; cam.jitter[1] = halton(frameNo % 16 + 1, 3) - 0.5;
  adapt(dt);
  if (frameNo % 3 === 0) renderCaustics(st);
  if (frameNo % 2 === 0) renderCond(st);
  renderScene(st, cam);
  renderPost(st, cam);
  frameNo++;
  requestAnimationFrame(frame);
}
function waitReady() {
  if (!Object.values(progs).every(p => p.ready())) { requestAnimationFrame(waitReady); return; }
  Object.values(progs).forEach(p => p.check());
  bakeEnv();
  hint.textContent = hint.dataset.text;
  setTimeout(() => { if (!hintHidden) hint.classList.add('hide'); }, 9000);
  requestAnimationFrame(frame);
}
hint.dataset.text = hint.innerHTML.replace(/&nbsp;/g, ' ');
hint.textContent = 'Pouring…';
window.__ice = { cam, view, st, get fps() { return 1000 / ema; }, get frames() { return frameNo; }, setTime: t => { simT = t; } };
requestAnimationFrame(waitReady);
