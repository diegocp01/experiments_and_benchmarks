'use strict';
// Builds the scene step by step, then runs the orbit camera: drag to turn 360°, scroll or pinch to zoom.
(() => {
  const canvas = document.getElementById('view'), hint = document.getElementById('hint');
  const loading = document.getElementById('loading'), loadingText = document.getElementById('loadingText');
  const { clamp, D } = SPX;

  const HOME = { az: 1.05, el: 0.15, dist: 275, tx: 18, ty: 25, tz: 0 };
  const goal = { ...HOME }, view = { ...HOME, az: HOME.az - 0.5, dist: 420 };
  const MIN_DIST = 14, MAX_DIST = 1000;
  const BOX = { x: [-120, 120], y: [4, 62], z: [-45, 45] };          // the orbit pivot stays on or near the monument
  let touched = false, push = 0, renderer = null;
  SPX.camera = { goal, view, HOME };

  const eyeOf = (v, d) => [v.tx + d * Math.cos(v.el) * Math.sin(v.az), v.ty + d * Math.sin(v.el), v.tz + d * Math.cos(v.el) * Math.cos(v.az)];
  // Is there breathing room around this point? Keeps the camera out of stone and sand.
  const clear = (p) => {
    const x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]), r = 4;
    return !(SPX.get(x, y, z) || SPX.get(x + r, y, z) || SPX.get(x - r, y, z) || SPX.get(x, y - r, z)
      || SPX.get(x, y + r, z) || SPX.get(x, y, z + r) || SPX.get(x, y, z - r));
  };

  function interact() {
    if (!touched) { touched = true; hint.classList.add('dim'); }
  }

  // The point in the world under a spot on the canvas: first cube hit, or the open desert. Null for sky.
  function pick(clientX, clientY) {
    const eye = eyeOf(view, view.dist + push), t = Math.tan(SPX.FOV / 2), r = canvas.getBoundingClientRect();
    const nx = ((clientX - r.left) / r.width * 2 - 1) * t * r.width / r.height, ny = (1 - (clientY - r.top) / r.height * 2) * t;
    let bx = eye[0] - view.tx, by = eye[1] - view.ty, bz = eye[2] - view.tz;       // camera "back" axis
    const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
    let rx = bz, rz = -bx;                                                          // "right" axis
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const d = [rx * nx + by * rz * ny - bx, (bz * rx - bx * rz) * ny - by, rz * nx - by * rx * ny - bz];
    const p = eye.map(Math.floor), s = d.map((v) => (v > 0 ? 1 : -1)), step = d.map((v) => Math.abs(1 / v));
    const next = d.map((v, i) => (v === 0 ? Infinity : ((v > 0 ? p[i] + 1 : p[i]) - eye[i]) / v));
    for (let i = 0, dist = 0; i < 9000; i++) {                                      // walk the ray cube by cube
      if (SPX.get(p[0], p[1], p[2])) return [eye[0] + d[0] * dist, eye[1] + d[1] * dist, eye[2] + d[2] * dist];
      const a = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : (next[1] < next[2] ? 1 : 2);
      dist = next[a]; next[a] += step[a]; p[a] += s[a];
    }
    return null;
  }
  // Zoom by a factor about the point under the cursor, so you can dive straight at the face or a paw.
  function zoomAt(factor, clientX, clientY) {
    const dist = clamp(goal.dist * factor, MIN_DIST, MAX_DIST), k = dist / goal.dist;
    if (k === 1) return;
    const hit = pick(clientX, clientY);
    if (hit) {
      goal.tx = clamp(hit[0] + (goal.tx - hit[0]) * k, BOX.x[0], BOX.x[1]);
      goal.ty = clamp(hit[1] + (goal.ty - hit[1]) * k, BOX.y[0], BOX.y[1]);
      goal.tz = clamp(hit[2] + (goal.tz - hit[2]) * k, BOX.z[0], BOX.z[1]);
    }
    if (k > 1) {                                                                    // pulling far back re-centres on the Sphinx
      const w = clamp((dist - 320) / 500, 0, 1) * 0.25;
      goal.tx += (HOME.tx - goal.tx) * w; goal.ty += (HOME.ty - goal.ty) * w; goal.tz += (HOME.tz - goal.tz) * w;
    }
    goal.dist = dist;
  }

  // --- pointer input: one pointer orbits (or pans with right button / shift), two pointers pinch-zoom and pan
  const pointers = new Map();
  let panning = false;
  const pan = (dx, dy) => {
    const s = view.dist * 2 * Math.tan(SPX.FOV / 2) / canvas.clientHeight;   // world units per CSS pixel at the pivot
    goal.tx = clamp(goal.tx - dx * s * Math.cos(view.az), BOX.x[0], BOX.x[1]);
    goal.tz = clamp(goal.tz + dx * s * Math.sin(view.az), BOX.z[0], BOX.z[1]);
    goal.ty = clamp(goal.ty + dy * s, BOX.y[0], BOX.y[1]);
  };
  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    panning = e.button !== 0 || e.shiftKey;
    canvas.classList.add('dragging');
    interact();
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
    if (pointers.size === 1) {
      if (panning) pan(dx, dy);
      else { goal.az -= dx * 0.0055; goal.el += dy * 0.0055; }
    } else {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)[1];
      const before = Math.hypot(prev[0] - other[0], prev[1] - other[1]);
      const after = Math.hypot(e.clientX - other[0], e.clientY - other[1]);
      if (before > 0 && after > 0) zoomAt(before / after, (e.clientX + other[0]) / 2, (e.clientY + other[1]) / 2);
      pan(dx / 2, dy / 2);
    }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const release = (e) => { pointers.delete(e.pointerId); if (!pointers.size) canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = e.deltaY * (e.deltaMode === 1 ? 16 : 1) * (e.ctrlKey ? 6 : 1);
    zoomAt(Math.exp(clamp(step, -240, 240) * 0.0012), e.clientX, e.clientY);
    interact();
  }, { passive: false });
  canvas.addEventListener('dblclick', () => {
    const turns = Math.round((goal.az - HOME.az) / (2 * Math.PI)) * 2 * Math.PI;   // unwind the short way
    Object.assign(goal, HOME, { az: HOME.az + turns });
  });

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (!touched) goal.az += dt * 0.05;                               // slow turntable until first touch
    // keep the camera above the desert floor and short of straight overhead
    goal.el = clamp(goal.el, Math.max(0.03, Math.asin(clamp((D + 5 - goal.ty) / goal.dist, -1, 1))), 1.5);
    const k = 1 - Math.exp(-dt * 9);
    for (const key in goal) view[key] += (goal[key] - view[key]) * k;
    // slide back along the view ray if the camera would end up inside something
    let need = 0;
    while (need < 240 && !clear(eyeOf(view, view.dist + need))) need += 2;
    push += (need - push) * (1 - Math.exp(-dt * 20));
    renderer.resize();
    renderer.draw(eyeOf(view, view.dist + push), [view.tx, view.ty, view.tz]);
  }

  const steps = [
    ['Raising the plateau…', () => SPX.buildTerrain()],
    ['Carving limestone…', () => { SPX.buildBody(); SPX.buildHead(); SPX.buildProps(); }],
    ['Casting the morning light…', () => SPX.bakeLight()],
    ['Laying every cube…', () => {
      const mesh = SPX.buildMesh();
      SPX.buildFar(mesh);
      SPX.sky = SPX.sun = null;
      SPX.stats = { quads: mesh.n };
      renderer = SPX.createRenderer(canvas, mesh);
      if (!renderer) throw new Error('WebGL2 is not available in this browser.');
    }],
  ];
  (async () => {
    try {
      for (const [label, run] of steps) {
        loadingText.textContent = label;
        await new Promise((r) => setTimeout(r, 30));
        run();
      }
      loading.classList.add('done');
      requestAnimationFrame(frame);
    } catch (err) {
      loadingText.textContent = err.message;
      console.error(err);
    }
  })();
})();
