import * as THREE from 'three';
import { RNG, randomSeedString } from './rng.js';
import { generateLayout } from './layout.js';
import { GeoBuilder } from './geo.js';
import { buildBlocks } from './blocks.js';
import { buildStreets, buildOutskirts } from './streets.js';
import { buildProps } from './props.js';
import { buildTerrain } from './terrain.js';
import { Traffic } from './traffic.js';
import { Sky } from './sky.js';
import { CameraRig } from './controls.js';
import { facadeMaterial, groundMaterial, decalMaterial, uTime, uNight, uPxScale } from './materials.js';

const $ = id => document.getElementById(id);
const canvas = $('view'), loading = $('loading');

let renderer, scene, camera, sky, rig, city = null, seed = '';
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2), ratioCeil = pixelRatio;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 1, 24000);
  sky = new Sky(renderer, scene, renderer.capabilities.maxTextureSize >= 8192 ? 4096 : 2048);
  rig = new CameraRig(camera, canvas);
  resize();
  window.addEventListener('resize', resize);
  wireUi();
  const fromUrl = new URLSearchParams(location.search).get('seed');
  generate(cleanSeed(fromUrl) || randomSeedString(), true);
  renderer.setAnimationLoop(frame);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  uPxScale.value = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}

const cleanSeed = s => (s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);

// ---------------------------------------------------------------- city construction
function buildCity(seedStr) {
  const layout = generateLayout(seedStr), root = new RNG(seedStr);
  const ctx = { layout, B: new GeoBuilder(true), G: new GeoBuilder(), D: new GeoBuilder(), trees: [], lamps: [], beacons: [], parked: [], count: 0 };
  buildBlocks(layout, ctx);
  buildStreets(layout, ctx);
  buildOutskirts(layout, ctx, root.fork('outskirts'));

  const group = new THREE.Group();
  const add = (geo, mat, cast) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
  };
  add(ctx.B.build(), facadeMaterial(), true);    // every building: one draw call
  add(ctx.G.build(), groundMaterial(), false);   // roads, kerbs, sidewalks, lots
  add(ctx.D.build(), decalMaterial(), false);    // markings, paths, pools, fields
  group.add(buildTerrain(layout));
  group.add(buildProps(ctx, root.fork('props')));
  const traffic = new Traffic(layout, root.fork('traffic'));
  group.add(traffic.group);
  return { layout, group, traffic, buildings: ctx.count, trees: ctx.trees.length, cars: traffic.count + ctx.parked.length };
}

function disposeCity(c) {
  scene.remove(c.group);
  c.group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
    if (o.isInstancedMesh) o.dispose();
  });
}

function generate(newSeed, first = false) {
  seed = newSeed;
  $('seed').value = seed;
  loading.classList.remove('done');
  // Let the overlay paint before the (synchronous) build.
  setTimeout(() => {
    try {
      const t0 = performance.now();
      if (city) disposeCity(city);
      city = buildCity(seed);
      scene.add(city.group);
      $('s-buildings').textContent = city.buildings.toLocaleString();
      $('s-trees').textContent = city.trees.toLocaleString();
      $('s-cars').textContent = city.cars.toLocaleString();
      const url = new URL(location.href);
      url.searchParams.set('seed', seed);
      history.replaceState(null, '', url);
      if (first) {
        const c = city.layout.center;
        rig.frame(new THREE.Vector3(c.x, 30, c.z), new THREE.Vector3(430, 300, 640));
      }
      console.info(`City "${seed}": ${city.buildings} buildings in ${(performance.now() - t0).toFixed(0)} ms`);
      loading.classList.add('done');
    } catch (err) { fail(err); }
  }, 30);
}

function fail(err) {
  console.error(err);
  loading.classList.remove('done');
  loading.classList.add('error');
  $('loading-text').textContent = 'Something went wrong: ' + (err && err.message ? err.message : err);
}

// ---------------------------------------------------------------- UI
function wireUi() {
  const seedInput = $('seed');
  const apply = () => { const s = cleanSeed(seedInput.value) || randomSeedString(); seedInput.blur(); generate(s); };
  const regen = () => generate(randomSeedString());
  const toggleDay = () => {
    sky.setDay(!sky.isDay);
    $('dn-label').textContent = sky.isDay ? 'Night' : 'Day';
    $('dn-ico').textContent = sky.isDay ? '☾' : '☀';
  };
  const toggleFly = () => rig.setFly(!rig.fly);
  rig.onChange = on => {
    $('fly').classList.toggle('active', on);
    $('fly-label').textContent = on ? 'Exit fly' : 'Fly mode';
    $('help-orbit').hidden = on;
    $('help-fly').hidden = !on;
    $('crosshair').hidden = !on;
  };
  const click = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); canvas.focus(); fn(); });
  click('apply', apply);
  click('regen', regen);
  click('daynight', toggleDay);
  click('fly', toggleFly);
  seedInput.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); e.stopPropagation(); });
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.code === 'KeyR') regen();
    else if (e.code === 'KeyN') toggleDay();
    else if (e.code === 'KeyF') toggleFly();
  });
}

// ---------------------------------------------------------------- frame loop
const clock = new THREE.Clock(), focus = new THREE.Vector3();
let acc = 0, frames = 0, slow = 0, fast = 0;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  uTime.value += dt;
  rig.update(dt);
  sky.update(dt, camera);
  if (city) {
    city.traffic.update(dt, uTime.value);
    city.traffic.setNight(uNight.value);
  }
  sky.updateShadow(focus, rig.focus(focus));
  // Depth precision: push the near plane out when the camera is far from everything.
  const reach = rig.fly ? camera.position.y : Math.min(camera.position.y, camera.position.distanceTo(rig.orbit.target));
  const near = THREE.MathUtils.clamp(reach * 0.02, 0.5, 20);
  if (Math.abs(near - camera.near) > camera.near * 0.1) { camera.near = near; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);

  // FPS readout + adaptive resolution: drop the pixel ratio if the GPU cannot keep up.
  acc += dt; frames++;
  if (acc >= 0.5) {
    const fps = frames / acc;
    $('s-fps').textContent = fps.toFixed(0);
    acc = 0; frames = 0;
    // Below ~12 fps the tab is almost certainly being throttled in the background, not GPU-bound.
    const watching = document.hasFocus() && fps >= 12;
    slow = watching && fps < 40 ? slow + 1 : 0;
    fast = watching && fps > 57 ? fast + 1 : 0;
    if (slow >= 4 && pixelRatio > 0.75) {
      pixelRatio = Math.max(0.75, pixelRatio - 0.25);
      ratioCeil = pixelRatio;
      slow = 0;
      resize();
    } else if (fast >= 12 && pixelRatio < ratioCeil) {
      pixelRatio = Math.min(ratioCeil, pixelRatio + 0.25);
      fast = 0;
      resize();
    }
  }
}

try { init(); } catch (err) { fail(err); }
window.__city = { get city() { return city; }, get sky() { return sky; }, get rig() { return rig; }, get renderer() { return renderer; }, generate };
