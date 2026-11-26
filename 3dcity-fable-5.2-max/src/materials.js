import * as THREE from 'three';

// Shared uniforms: 0 = full day, 1 = full night; time in seconds; pixels per world unit at distance 1.
export const uNight = { value: 0 };
export const uTime = { value: 0 };
export const uPxScale = { value: 800 };

const FRAG_HEAD = /* glsl */`
varying vec2 vWuv;
varying vec3 vWin;
uniform float uNight;
float wHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

// Windows are drawn procedurally from per-wall cell coordinates: no textures anywhere.
// vWin = (building seed, style, lit fraction). Style 7 is a self-lit sign panel.
const FRAG_WINDOWS = /* glsl */`
float wGlass = 0.0;
vec3 wEmit = vec3(0.0);
{
  float style = floor(vWin.y + 0.5);
  if (style > 6.5) {
    wEmit = diffuseColor.rgb * uNight * 2.6;
  } else if (style > 0.5) {
    vec2 lo = vec2(0.22, 0.26), hi = vec2(0.78, 0.80);                        // punched
    if (style > 4.5) { lo = vec2(0.28, -1.0); hi = vec2(0.72, 2.0); }          // vertical strips
    else if (style > 3.5) { lo = vec2(0.05, 0.07); hi = vec2(0.95, 0.80); }    // storefront
    else if (style > 2.5) { lo = vec2(0.035, 0.10); hi = vec2(0.965, 0.86); }  // curtain wall
    else if (style > 1.5) { lo = vec2(-1.0, 0.30); hi = vec2(2.0, 0.78); }     // ribbon
    vec2 cell = floor(vWuv), f = fract(vWuv);
    vec2 fw = max(fwidth(vWuv), vec2(1e-4));
    vec2 e = smoothstep(lo - fw, lo + fw, f) * (1.0 - smoothstep(hi - fw, hi + fw, f));
    vec2 span = min(hi, vec2(1.0)) - max(lo, vec2(0.0));
    float lod = clamp(max(fw.x, fw.y) * 2.0 - 0.5, 0.0, 1.0);   // fade to the average when cells go sub-pixel
    float mask = mix(e.x * e.y, span.x * span.y, lod);
    float r1 = wHash(cell + vWin.x * 17.0);
    float r2 = wHash(cell * 1.7 + vWin.x * 5.3 + 11.0);
    float lit = mix(step(1.0 - vWin.z, r1), vWin.z, lod);
    bool curtain = style > 2.5 && style < 3.5;
    vec3 glass = mix(vec3(0.10, 0.15, 0.21), vec3(0.38, 0.48, 0.58), r2 * r2 * (curtain ? 0.55 : 1.0));
    glass = mix(glass, diffuseColor.rgb * 1.3, curtain ? 0.6 : 0.12);   // glass towers keep their tint
    glass = mix(glass, glass * 0.3, uNight);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, mask);
    wGlass = mask;
    vec3 warm = mix(vec3(1.0, 0.66, 0.33), vec3(0.68, 0.84, 1.0), step(0.84, r2));
    wEmit = warm * (0.35 + r2 * 0.85) * lit * mask * uNight * 1.25;
  }
}`;

export function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWin;\nvarying vec2 vWuv;\nvarying vec3 vWin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWuv = uv;\nvWin = aWin;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_WINDOWS)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.09, wGlass);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.86, wGlass);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wEmit;');
  };
  return m;
}

export function groundMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.55 });
}

// Markings, paths, pools: coplanar overlays pulled toward the camera.
export function decalMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.55,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
}

export function landMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.5 });
}

export function waterMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#5f93ad', roughness: 0.16, metalness: 0.9 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWpos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWpos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWpos;\nuniform float uTime;')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
      {
        // cheap ripples: tilt the normal with a few moving sine waves, fading out with distance
        vec2 p = vWpos.xz;
        float t = uTime;
        vec2 g = vec2(
          cos(p.x * 0.21 + t * 0.9) * 0.5 + cos(p.x * 0.07 - p.y * 0.11 + t * 0.6) + cos(p.x * 0.53 + p.y * 0.31 - t * 1.3) * 0.3,
          cos(p.y * 0.19 - t * 0.8) * 0.5 + cos(p.y * 0.09 + p.x * 0.05 + t * 0.5) + cos(p.y * 0.47 - p.x * 0.29 + t * 1.1) * 0.3);
        float fade = 1.0 / (1.0 + length(vViewPosition) * 0.0035);
        normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.045 * fade);
      }`);
  };
  return m;
}

// Soft additive discs: streetlight halos and blinking aircraft beacons (THREE.Points).
export function glowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uNight, uTime, uPxScale },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aColor;
      attribute vec2 aGlow;   // x = world size, y = blink phase (0 = steady)
      uniform float uNight, uTime, uPxScale;
      varying vec3 vCol;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = aGlow.x * uPxScale / max(1.0, -mv.z);
        float blink = aGlow.y > 0.0 ? smoothstep(0.55, 0.75, fract(uTime * 0.55 + aGlow.y)) : 1.0;
        vA = uNight * blink * clamp(size / 2.5, 0.3, 1.0);
        vCol = aColor;
        gl_PointSize = vA > 0.003 ? clamp(size, 2.5, 96.0) : 0.0;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vCol;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = ((1.0 - smoothstep(0.0, 0.34, d)) * 1.6 + pow(max(0.0, 1.0 - d), 2.4) * 0.6) * vA;
        gl_FragColor = vec4(vCol * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Pools of light on the ground under lamps and in front of cars (instanced flat quads).
export function poolMaterial(strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { uNight, uStrength: { value: strength }, uColor: { value: new THREE.Color('#ffc890') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight, uStrength;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 1.8) * uNight * uStrength;
        gl_FragColor = vec4(uColor * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
