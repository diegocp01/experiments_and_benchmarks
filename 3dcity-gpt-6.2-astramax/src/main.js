import * as THREE from 'three';
import { DEFAULT_SEED, makeLayout } from './layout.js';
import { Batches, disposeGroup, makeKit, nightMix } from './mesh.js';
import { drawBuildings } from './architecture.js';
import { drawStreets } from './streets.js';
import { environment, makeHills } from './environment.js';
import { makeFleet } from './vehicles.js';
import { Navigation } from './navigation.js';
import { CityMap } from './minimap.js';
import { surveyCity } from './surfaces.js';

const $ = (id) => document.getElementById(id);
const loading = $('loading'),
  cityCanvas = $('city'),
  seedBox = $('seed');
let toastTimer;
function toast(message, duration = 2600) {
  clearTimeout(toastTimer);
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, duration);
}
function errorMessage(message) {
  loading.hidden = false;
  loading.replaceChildren(document.createTextNode(message));
}
function bindFold(buttonId, cardId, collapsed = false) {
  const button = $(buttonId),
    card = $(cardId);
  function set(value) {
    card.classList.toggle('collapsed', value);
    button.setAttribute('aria-expanded', String(!value));
  }
  set(collapsed);
  button.addEventListener('click', () => set(!card.classList.contains('collapsed')));
}
function init() {
  const renderer = new THREE.WebGLRenderer({
    canvas: cityCanvas,
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(44, 1, 0.5, 9800),
    kit = makeKit();
  const env = environment(scene, kit, renderer.capabilities.maxTextureSize);
  const coarse = matchMedia('(pointer:coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const helpPanel = $('help-panel'),
    helpButton = $('help');
  function guide(mode) {
    const rows =
      mode === 'orbit'
        ? coarse
          ? [
              ['Orbit', 'One finger'],
              ['Pan / zoom', 'Two fingers'],
            ]
          : [
              ['Orbit', 'Drag'],
              ['Pan', 'Right-drag'],
              ['Zoom', 'Scroll'],
            ]
        : coarse
          ? [
              ['Look', 'Drag'],
              ['Move / lift', 'Arrow pad'],
            ]
          : [
              ['Move', 'W A S D'],
              ['Look', 'Drag mouse'],
              ['Capture mouse', 'Click scene'],
              ['Up / down', 'E / Q'],
              ['Move faster', 'Shift'],
              ['Return to orbit', 'Esc'],
            ];
    $('key-guide').replaceChildren(
      ...rows.map(([name, key]) => {
        const div = document.createElement('div'),
          dt = document.createElement('dt'),
          dd = document.createElement('dd'),
          kbd = document.createElement('kbd');
        dt.textContent = name;
        kbd.textContent = key;
        dd.append(kbd);
        div.append(dt, dd);
        return div;
      }),
    );
  }
  const nav = new Navigation(camera, cityCanvas, (mode) => {
    for (const id of ['orbit', 'fly']) $(id).setAttribute('aria-pressed', String(id === mode));
    $('touch-flight').hidden = mode !== 'fly' || !coarse;
    guide(mode);
    if (mode === 'fly')
      toast(
        coarse ? 'Drag to look · Use arrows to fly' : 'WASD to fly · Drag to look · E/Q for height',
        3900,
      );
  });
  const map = new CityMap($('minimap'), nav);
  guide('orbit');
  let city = null,
    cityGroup = null,
    fleet = null,
    busy = false,
    targetNight = 0,
    switchedAt = 0;
  let previousTime = 0,
    lastMapTime = 0,
    avgFrame = 1 / 60,
    ratingTime = 0,
    quality = 1,
    maxDpr = 1;
  let foliageTiles = [],
    lastMovement = 0;
  const lastPosition = new THREE.Vector3(),
    lastRotation = new THREE.Quaternion();
  function resize() {
    const w = cityCanvas.clientWidth,
      h = cityCanvas.clientHeight;
    if (!w || !h) return;
    maxDpr = Math.min(window.devicePixelRatio || 1, 1.65, Math.sqrt(2450000 / (w * h)));
    renderer.setPixelRatio(Math.max(0.66, maxDpr * quality));
    renderer.setSize(w, h, false);
    nav.resize(w, h);
    if (city) map.update();
  }
  new ResizeObserver(resize).observe($('viewport'));
  resize();
  function seedLabel() {
    const changed = city && seedBox.value.trim() && seedBox.value.trim() !== city.seed;
    $('generate').querySelector('span').textContent = changed ? 'Apply seed' : 'Regenerate city';
  }
  function build(seed) {
    const next = makeLayout(seed),
      batch = new Batches(kit);
    surveyCity(next);
    drawBuildings(batch, next);
    drawStreets(batch, next);
    const group = batch.finish();
    group.add(makeHills(next));
    const vehicles = makeFleet(next);
    group.add(vehicles.group);
    if (cityGroup) disposeGroup(cityGroup);
    city = next;
    cityGroup = group;
    fleet = vehicles;
    scene.add(group);
    foliageTiles = group.children.filter((mesh) => mesh.userData.nearFoliage);
    renderer.shadowMap.needsUpdate = true;
    nav.reset(city);
    map.setCity(city);
    seedBox.value = city.seed;
    seedLabel();
    $('compact-seed').textContent = 'Seed ' + city.seed;
    $('city-name').textContent = city.name;
    $('building-count').textContent = city.buildings.length.toLocaleString('en-US');
    $('park-count').textContent = city.parks.length;
    $('vehicle-count').textContent = city.carCount;
    const url = new URL(location.href);
    url.searchParams.set('seed', city.seed);
    history.replaceState(null, '', url);
  }
  function regenerate(seed) {
    if (busy) return;
    busy = true;
    $('generate').disabled = true;
    loading.hidden = false;
    requestAnimationFrame(() =>
      setTimeout(() => {
        try {
          build(seed);
          loading.hidden = true;
          previousTime = 0;
        } catch (err) {
          console.error(err);
          errorMessage('City generation could not finish. Reload to try again.');
        } finally {
          busy = false;
          $('generate').disabled = false;
        }
      }, 0),
    );
  }
  function freshSeed() {
    const a = new Uint32Array(1);
    do {
      crypto.getRandomValues(a);
    } while (String(a[0]) === city?.seed);
    return String(a[0]);
  }
  $('seed-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = seedBox.value.trim();
    regenerate(value && value !== city?.seed ? value : freshSeed());
  });
  seedBox.addEventListener('input', seedLabel);
  seedBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && seedBox.value.trim()) {
      e.preventDefault();
      regenerate(seedBox.value.trim());
      seedBox.blur();
    }
  });
  $('copy-seed').addEventListener('click', async () => {
    const value = seedBox.value.trim();
    if (!value) return;
    try {
      if (!navigator.clipboard) throw Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
    } catch {
      seedBox.focus();
      seedBox.select();
      if (!document.execCommand('copy')) {
        toast('Seed selected for copying');
        return;
      }
    }
    const icon = $('copy-seed').querySelector('use');
    icon.setAttribute('href', '#i-check');
    setTimeout(() => icon.setAttribute('href', '#i-copy'), 1200);
    toast('Seed copied');
  });
  bindFold('overview-toggle', 'overview', innerWidth <= 560 || innerHeight <= 505);
  bindFold('map-toggle', 'map-card', innerWidth <= 560);
  for (const id of ['day', 'night'])
    $(id).addEventListener('click', () => {
      targetNight = Number(id === 'night');
      switchedAt = performance.now();
      for (const key of ['day', 'night']) $(key).setAttribute('aria-pressed', String(id === key));
      if (reduced) env.light(targetNight);
    });
  $('orbit').addEventListener('click', () => nav.setMode('orbit'));
  $('fly').addEventListener('click', () => nav.setMode('fly'));
  $('zoom-in').addEventListener('click', () => nav.zoom(true));
  $('zoom-out').addEventListener('click', () => nav.zoom(false));
  $('home').addEventListener('click', () => {
    if (city) nav.reset();
  });
  helpButton.addEventListener('click', () => {
    helpPanel.hidden = !helpPanel.hidden;
    helpButton.setAttribute('aria-expanded', String(!helpPanel.hidden));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpPanel.hidden) {
      helpPanel.hidden = true;
      helpButton.setAttribute('aria-expanded', 'false');
    }
  });
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast('Fullscreen is unavailable in this browser');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').setAttribute(
      'aria-label',
      document.fullscreenElement ? 'Exit fullscreen' : 'Toggle fullscreen',
    );
    resize();
  });
  cityCanvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    loading.hidden = false;
    loading.querySelector('span').textContent = 'Restoring graphics…';
  });
  cityCanvas.addEventListener('webglcontextrestored', () => {
    renderer.shadowMap.needsUpdate = true;
    loading.querySelector('span').textContent = 'Generating city…';
    loading.hidden = true;
    previousTime = 0;
  });
  document.addEventListener('visibilitychange', () => {
    previousTime = 0;
  });
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || !city || renderer.getContext().isContextLost()) return;
    const rawDt = previousTime ? (now - previousTime) / 1000 : 1 / 60;
    previousTime = now;
    const dt = Math.min(0.1, rawDt);
    nav.update(dt);
    if (
      lastPosition.distanceToSquared(camera.position) > 0.0001 ||
      1 - Math.abs(lastRotation.dot(camera.quaternion)) > 1e-8
    ) {
      lastMovement = now;
      lastPosition.copy(camera.position);
      lastRotation.copy(camera.quaternion);
    }
    for (const mesh of foliageTiles)
      mesh.visible = mesh.boundingSphere.distanceToPoint(camera.position) < 170;
    if (nightMix.value !== targetNight) {
      const delta = targetNight - nightMix.value;
      const next =
        Math.abs(delta) < 0.003 || now - switchedAt > 1200
          ? targetNight
          : nightMix.value + delta * (1 - Math.exp(-dt * 6));
      env.light(next);
    }
    env.update(camera, dt);
    fleet.update(dt);
    renderer.render(scene, camera);
    if (now - lastMapTime > 95) {
      map.update();
      lastMapTime = now;
    }
    avgFrame = 0.96 * avgFrame + 0.04 * Math.min(0.18, rawDt);
    if (now - ratingTime > 1200) {
      const moving = now - lastMovement < 600;
      let next = quality;
      if (!moving && avgFrame < 0.053) next = 1;
      else if (avgFrame > (moving ? 0.034 : 0.056)) next = Math.max(0.72, quality - 0.12);
      else if (avgFrame < 0.02) next = Math.min(1, quality + 0.08);
      if (quality !== next) {
        quality = next;
        resize();
      }
      ratingTime = now;
    }
  }
  requestAnimationFrame(frame);
  const seed = new URLSearchParams(location.search).get('seed')?.trim().slice(0, 32) || DEFAULT_SEED;
  regenerate(seed);
}
try {
  init();
} catch (err) {
  console.error(err);
  errorMessage('Enable WebGL 2 in your browser to explore this city.');
}
