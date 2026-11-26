import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { blockAtPoint } from './layout.js';

const clamp = THREE.MathUtils.clamp;
export class Navigation {
  constructor(camera, canvas, onMode) {
    this.camera = camera;
    this.canvas = canvas;
    this.onMode = onMode;
    this.mode = 'orbit';
    this.city = null;
    this.controls = new OrbitControls(camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.12,
      screenSpacePanning: false,
      minDistance: 12,
      maxDistance: 1230,
      minPolarAngle: 0.07,
      maxPolarAngle: Math.PI * 0.485,
      panSpeed: 0.84,
      rotateSpeed: 0.68,
      zoomSpeed: 0.91,
    });
    this.keys = new Set();
    this.direction = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.lastOrbit = new THREE.Vector3();
    this.lastTarget = new THREE.Vector3();
    this.drag = null;
    this.wasLocked = false;
    this.pitch = 0;
    this.yaw = 0;
    window.addEventListener('keydown', (e) => {
      if (
        this.mode !== 'fly' ||
        /INPUT|TEXTAREA/.test(e.target.tagName) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.code === 'Escape') {
        this.setMode('orbit');
        return;
      }
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'KeyE',
          'KeyQ',
          'ShiftLeft',
          'ShiftRight',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ].includes(e.code)
      ) {
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.drag = null;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'fly' || e.button !== 0 || document.pointerLockElement === canvas) return;
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus({ preventScroll: true });
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id || this.mode !== 'fly') return;
      const dx = e.clientX - this.drag.x,
        dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.look(dx, dy);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const click = this.drag.moved < 4;
      this.drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (click && e.pointerType === 'mouse' && this.mode === 'fly' && canvas.requestPointerLock) {
        try {
          canvas.requestPointerLock()?.catch(() => {});
        } catch {
          /* Drag-look remains available in embedded browsers. */
        }
      }
    });
    canvas.addEventListener('pointercancel', () => {
      this.drag = null;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.mode === 'fly')
        this.look(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === canvas;
      if (!locked && this.wasLocked && this.mode === 'fly') this.setMode('orbit');
      this.wasLocked = locked;
    });
    for (const b of document.querySelectorAll('[data-key]')) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        this.keys.add(b.dataset.key);
      });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        b.addEventListener(event, () => this.keys.delete(b.dataset.key));
    }
  }
  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.fov = w < 590 ? 54 : 44;
    this.camera.near = this.mode === 'fly' ? 0.28 : 0.5;
    this.camera.setViewOffset(w, h, this.mode === 'orbit' && w >= 760 ? -w * 0.055 : 0, 0, w, h);
    this.camera.updateProjectionMatrix();
  }
  reset(city = this.city) {
    this.city = city;
    this.setMode('orbit');
    const { x, z } = city.focus,
      narrow = this.canvas.clientWidth < 590;
    const factor = narrow ? 1.13 : 1;
    this.controls.target.set(x, 24, z);
    this.camera.position.set(x - 278 * factor, 159 * factor, z + 387 * factor);
    this.flushOrbit();
    this.controls.update();
    this.lastFly = null;
  }
  flushOrbit() {
    // Consume any damped drag before installing a saved or freshly generated view.
    const pos = this.camera.position.clone(),
      at = this.controls.target.clone();
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.enableDamping = true;
    this.camera.position.copy(pos);
    this.controls.target.copy(at);
    this.controls.update();
  }
  setMode(mode) {
    if (this.mode === mode || !this.city) return;
    this.keys.clear();
    this.drag = null;
    if (mode === 'fly') {
      this.lastOrbit.copy(this.camera.position);
      this.lastTarget.copy(this.controls.target);
      this.controls.enabled = false;
      if (this.lastFly) {
        this.camera.position.copy(this.lastFly.position);
        this.pitch = this.lastFly.pitch;
        this.yaw = this.lastFly.yaw;
      } else {
        this.camera.position.set(this.city.flyStart.x, 9.2, this.city.flyStart.z);
        this.pitch = 0.055;
        this.yaw = 0;
      }
      this.applyLook();
      this.canvas.focus({ preventScroll: true });
    } else {
      this.lastFly = { position: this.camera.position.clone(), pitch: this.pitch, yaw: this.yaw };
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      this.controls.enabled = true;
      this.camera.position.copy(this.lastOrbit);
      this.controls.target.copy(this.lastTarget);
      this.flushOrbit();
    }
    this.mode = mode;
    this.canvas.classList.toggle('fly', mode === 'fly');
    this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.onMode(mode);
  }
  applyLook() {
    this.camera.quaternion.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, 'YXZ'));
  }
  look(dx, dy) {
    this.yaw -= dx * 0.0023;
    this.pitch = clamp(this.pitch - dy * 0.0023, -1.48, 1.48);
    this.applyLook();
  }
  passable(x, y, z) {
    const block = blockAtPoint(this.city, x, z);
    if (!block) return true;
    for (const b of block.buildings) {
      if (
        y < b.solidTop + 1 &&
        Math.abs(x - b.x) < b.w * 0.5 + 0.65 &&
        Math.abs(z - b.z) < b.d * 0.5 + 0.65
      )
        return false;
    }
    return true;
  }
  move(dx, dy, dz) {
    const p = this.camera.position;
    const y = clamp(p.y + dy, 1.9, 460),
      x = clamp(p.x + dx, -1100, 1100),
      z = clamp(p.z + dz, -950, 950);
    if (this.passable(p.x, y, p.z)) p.y = y;
    if (this.passable(x, p.y, p.z)) p.x = x;
    if (this.passable(p.x, p.y, z)) p.z = z;
  }
  update(dt) {
    if (this.mode === 'orbit') {
      this.controls.update(dt);
      const near = clamp(this.camera.position.distanceTo(this.controls.target) * 0.006, 0.32, 3.0);
      if (Math.abs(near - this.camera.near) > this.camera.near * 0.08) {
        this.camera.near = near;
        this.camera.updateProjectionMatrix();
      }
      if (this.city) {
        const at = this.controls.target;
        const x = clamp(at.x, -580, 650),
          z = clamp(at.z, -480, 480);
        this.camera.position.x += x - at.x;
        this.camera.position.z += z - at.z;
        at.x = x;
        at.z = z;
      }
      return;
    }
    const k = this.keys;
    if (!k.size) return;
    const f = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    const side = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    const lift = Number(k.has('KeyE')) - Number(k.has('KeyQ'));
    this.camera.getWorldDirection(this.direction);
    this.offset.copy(this.direction).multiplyScalar(f);
    this.offset.x += Math.cos(this.yaw) * side;
    this.offset.z -= Math.sin(this.yaw) * side;
    this.offset.y += lift;
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? 65 : 23;
    this.offset.normalize().multiplyScalar(speed * dt);
    this.move(this.offset.x, this.offset.y, this.offset.z);
  }
  zoom(inward) {
    if (this.mode === 'fly') {
      this.camera.getWorldDirection(this.direction).multiplyScalar(inward ? 5 : -5);
      this.move(this.direction.x, this.direction.y, this.direction.z);
      return;
    }
    this.offset.subVectors(this.camera.position, this.controls.target);
    this.offset.setLength(
      clamp(
        this.offset.length() * (inward ? 0.81 : 1 / 0.81),
        this.controls.minDistance,
        this.controls.maxDistance,
      ),
    );
    this.camera.position.copy(this.controls.target).add(this.offset);
    this.controls.update();
  }
  aimAt(x, z) {
    if (this.mode === 'fly') {
      const block = blockAtPoint(this.city, x, z);
      let y = this.camera.position.y;
      for (const b of block?.buildings ?? [])
        if (Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1)
          y = Math.max(y, b.solidTop + 2);
      this.camera.position.set(x, y, z);
    } else {
      this.offset.subVectors(this.camera.position, this.controls.target);
      this.controls.target.set(x, 10, z);
      this.camera.position.copy(this.controls.target).add(this.offset);
      this.controls.update();
    }
  }
}
