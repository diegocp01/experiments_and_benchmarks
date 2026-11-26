import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _want = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const LOOK = 0.0022;

// Two camera modes: orbit / pan / zoom (OrbitControls) and a free fly-through (WASD + mouse look).
export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.fly = false;
    this.onChange = () => {};
    this.keys = new Set();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.speed = 55;
    this.dragging = false;

    const o = (this.orbit = new OrbitControls(camera, dom));
    o.enableDamping = true;
    o.dampingFactor = 0.08;
    o.screenSpacePanning = false;
    o.maxPolarAngle = Math.PI * 0.492;   // stay above the ground
    o.minDistance = 15;
    o.maxDistance = 3400;
    o.rotateSpeed = 0.55;
    o.zoomSpeed = 1.1;
    o.zoomToCursor = true;

    const typing = e => e.target instanceof HTMLInputElement;
    window.addEventListener('keydown', e => {
      if (typing(e) || e.metaKey || e.ctrlKey) return;
      this.keys.add(e.code);
      if (this.fly && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Mouse look: pointer lock when the browser grants it, otherwise click-drag on the canvas.
    document.addEventListener('pointerlockchange', () => {
      if (this.fly && this.locked && document.pointerLockElement !== dom) this.setFly(false);   // Esc
      this.locked = document.pointerLockElement === dom;
    });
    dom.addEventListener('mousedown', () => {
      if (!this.fly) return;
      this.dragging = true;
      if (!this.locked) this.lock();
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', e => {
      if (!this.fly || !(this.locked || this.dragging)) return;
      this.yaw -= e.movementX * LOOK;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * LOOK, -1.5, 1.5);
    });
    dom.addEventListener('wheel', e => {
      if (!this.fly) return;
      e.preventDefault();
      this.speed = THREE.MathUtils.clamp(this.speed * Math.pow(1.12, -Math.sign(e.deltaY)), 8, 400);
    }, { passive: false });
  }

  lock() {
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* drag-to-look still works */ }
  }

  // Where the view direction meets the ground (clamped), used for the orbit pivot and shadow focus.
  groundHit(out, minT, maxT, fallback) {
    this.camera.getWorldDirection(_fwd);
    let t = fallback;
    if (_fwd.y < -0.03) t = THREE.MathUtils.clamp(this.camera.position.y / -_fwd.y, minT, maxT);
    return out.copy(this.camera.position).addScaledVector(_fwd, t);
  }

  setFly(on) {
    if (on === this.fly) return;
    this.fly = on;
    this.orbit.enabled = !on;
    if (on) {
      _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = _euler.y;
      this.pitch = _euler.x;
      this.vel.set(0, 0, 0);
      this.lock();
    } else {
      if (document.pointerLockElement === this.dom) document.exitPointerLock();
      this.groundHit(this.orbit.target, 40, 2500, 300);
      this.orbit.target.y = Math.max(0, this.orbit.target.y);
      this.orbit.update();
    }
    this.onChange(on);
  }

  // Place the camera for a first look at a new city.
  frame(target, offset) {
    this.orbit.target.copy(target);
    this.camera.position.copy(target).add(offset);
    this.orbit.update();
  }

  // Focus point + radius for the shadow frustum.
  focus(out) {
    if (!this.fly) {
      out.copy(this.orbit.target);
      return THREE.MathUtils.clamp(this.camera.position.distanceTo(out) * 0.8, 170, 1300);
    }
    const y = this.camera.position.y;
    this.groundHit(out, 30, 500 + y * 1.5, 250);
    out.y = 0;
    return THREE.MathUtils.clamp(y * 1.7 + 190, 220, 1100);
  }

  update(dt) {
    if (!this.fly) { this.orbit.update(); return; }
    const k = this.keys, cam = this.camera;
    _euler.set(this.pitch, this.yaw, 0);
    cam.quaternion.setFromEuler(_euler);
    cam.getWorldDirection(_fwd);
    _right.crossVectors(_fwd, cam.up).normalize();
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const u = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyQ') || k.has('KeyC') ? 1 : 0);
    const boost = k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1;
    _want.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
    _want.y += u;
    if (_want.lengthSq() > 1) _want.normalize();
    _want.multiplyScalar(this.speed * boost);
    this.vel.lerp(_want, 1 - Math.exp(-dt * 7));
    cam.position.addScaledVector(this.vel, dt);
    cam.position.y = THREE.MathUtils.clamp(cam.position.y, 2.2, 2500);
    cam.position.x = THREE.MathUtils.clamp(cam.position.x, -5500, 5500);
    cam.position.z = THREE.MathUtils.clamp(cam.position.z, -5500, 5500);
  }
}
