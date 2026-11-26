import * as THREE from 'three';
import { uNight, uTime } from './materials.js';
import { smoothstep, lerp } from './rng.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // pin to the far plane
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHorizon, uGround, uCloud, uSunDir, uSunColor, uMoonDir;
uniform float uSunGlow, uStars, uTime;
varying vec3 vDir;
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.16 + pow(sd, 48.0) * 0.3) * uSunGlow;        // glow around the sun
  if (h > 0.0) {
    if (uStars > 0.01) {
      vec3 p = d * 210.0, ip = floor(p);
      float star = step(0.9962, h3(ip)) * (1.0 - smoothstep(0.08, 0.45, length(fract(p) - 0.5)));
      col += vec3(star) * uStars * (0.5 + 0.7 * h3(ip + 3.1)) * smoothstep(0.02, 0.3, h);
    }
    float md = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.82, 0.88, 1.0) * (smoothstep(0.99955, 0.99975, md) * 1.5 + pow(md, 260.0) * 0.14) * uStars;
    col += uSunColor * smoothstep(0.99962, 0.99982, sd) * 5.0 * uSunGlow;            // sun disc
    vec2 cp = d.xz / (h + 0.14) * 1.5 + vec2(uTime * 0.0035, uTime * 0.0012);
    float c = smoothstep(0.50, 0.80, fbm(cp));
    vec3 cc = mix(uCloud, uCloud * 0.7 + uHorizon * 0.22, smoothstep(0.45, 0.8, fbm(cp * 1.7 + 3.3)));
    col = mix(col, cc + uSunColor * pow(sd, 10.0) * 0.25 * uSunGlow, c * smoothstep(0.03, 0.26, h) * 0.86);
  }
  col = mix(col, uGround, 1.0 - smoothstep(-0.1, 0.0, h));   // what reflections see below the horizon
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const C = hex => new THREE.Color(hex);
// [night, dusk, day]
const PAL = {
  top: [C('#060b1d'), C('#27397a'), C('#2c6bcb')],
  horizon: [C('#1a2644'), C('#e9a273'), C('#bcd5ec')],
  ground: [C('#0b0f1a'), C('#4e4648'), C('#6f7a78')],
  cloud: [C('#10162a'), C('#f3b093'), C('#ffffff')],
  hemiSky: [C('#6278b8'), C('#b9a9c4'), C('#cfe1ff')],
  hemiGround: [C('#1c2236'), C('#5d5350'), C('#948b7b')],
};
const SUN_LOW = C('#ff9455'), SUN_HIGH = C('#fff2dc'), MOON = C('#93abff');
const MOON_DIR = new THREE.Vector3(0.42, 0.66, 0.62).normalize();
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Sky dome, sun / moon light with a camera-following shadow frustum, hemisphere fill, fog and
// the reflection environment. `t` runs from 0 (night) to 1 (day) and is animated by setDay().
export class Sky {
  constructor(renderer, scene, shadowSize) {
    this.renderer = renderer;
    this.scene = scene;
    this.t = 1;
    this.goal = 1;
    this.dir = new THREE.Vector3();   // direction towards the active light
    this.frame = 0;
    this.envDirty = true;

    this.uniforms = {
      uTop: { value: C('#000') }, uHorizon: { value: C('#000') }, uGround: { value: C('#000') }, uCloud: { value: C('#000') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: C('#fff') }, uMoonDir: { value: MOON_DIR },
      uSunGlow: { value: 1 }, uStars: { value: 0 }, uTime,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat));
    this.envRT = null;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const s = this.sun.shadow;
    s.mapSize.set(shadowSize, shadowSize);
    s.bias = -0.0004;
    s.normalBias = 0.45;
    s.camera.near = 50;
    s.camera.far = 4600;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0003);
    this.radius = 0;
    this.apply();
  }

  setDay(day) { this.goal = day ? 1 : 0; }
  get isDay() { return this.goal === 1; }

  mix3(out, pal, t) {
    out.copy(pal[0]).lerp(pal[1], smoothstep(0.06, 0.32, t)).lerp(pal[2], smoothstep(0.32, 0.66, t));
    return out;
  }

  apply() {
    const t = this.t, u = this.uniforms;
    const elev = THREE.MathUtils.degToRad(-18 + 68 * t), az = THREE.MathUtils.degToRad(-95 + 40 * t);   // sets in the west, stands south-west at noon
    u.uSunDir.value.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    const deg = -18 + 68 * t;
    const sunI = smoothstep(-2, 16, deg), moonI = smoothstep(-2, -11, deg);
    this.mix3(u.uTop.value, PAL.top, t);
    this.mix3(u.uHorizon.value, PAL.horizon, t);
    this.mix3(u.uGround.value, PAL.ground, t);
    this.mix3(u.uCloud.value, PAL.cloud, t);
    u.uSunColor.value.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(2, 28, deg));
    u.uSunGlow.value = smoothstep(-6, 3, deg);
    u.uStars.value = 1 - smoothstep(0.08, 0.3, t);

    if (deg > -2) {
      this.dir.copy(u.uSunDir.value);
      this.sun.color.copy(u.uSunColor.value);
      this.sun.intensity = 3.6 * sunI;
    } else {
      this.dir.copy(MOON_DIR);
      this.sun.color.copy(MOON);
      this.sun.intensity = 0.95 * moonI;
    }
    this.mix3(this.hemi.color, PAL.hemiSky, t);
    this.mix3(this.hemi.groundColor, PAL.hemiGround, t);
    this.hemi.intensity = lerp(0.85, 0.95, smoothstep(0.1, 0.6, t));
    this.scene.fog.color.copy(u.uHorizon.value);
    this.scene.fog.density = lerp(0.0002, 0.00026, t);
    this.renderer.toneMappingExposure = lerp(1.18, 0.98, smoothstep(0.1, 0.6, t));
    uNight.value = 1 - smoothstep(0.14, 0.38, t);
    this.envDirty = true;
  }

  // Keep the shadow map centred on what the camera looks at, snapped to texels so it does not swim.
  updateShadow(focus, radius) {
    const s = this.sun.shadow, cam = s.camera;
    radius = Math.pow(1.3, Math.round(Math.log(radius) / Math.log(1.3)));
    if (radius !== this.radius) {
      this.radius = radius;
      cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
      cam.updateProjectionMatrix();
    }
    const texel = (radius * 2) / s.mapSize.x, d = this.dir;
    _r.crossVectors(_up, d).normalize();
    _u.crossVectors(d, _r);
    const fx = Math.round(focus.dot(_r) / texel) * texel, fy = Math.round(focus.dot(_u) / texel) * texel, fz = focus.dot(d);
    this.sun.target.position.set(0, 0, 0).addScaledVector(_r, fx).addScaledVector(_u, fy).addScaledVector(d, fz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(d, 2300);
    this.sun.target.updateMatrixWorld();
  }

  update(dt, camera) {
    this.frame++;
    if (this.t !== this.goal) {
      const step = dt / 3.2;
      this.t = this.goal > this.t ? Math.min(this.goal, this.t + step) : Math.max(this.goal, this.t - step);
      this.apply();
    }
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(camera.far * 0.5);
    if (this.envDirty && (this.t === this.goal || this.frame % 8 === 0)) {
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 10);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.envDirty = false;
    }
  }
}
