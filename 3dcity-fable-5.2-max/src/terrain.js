import * as THREE from 'three';
import { smoothstep } from './rng.js';
import { GeoBuilder } from './geo.js';
import { buildLand } from './streets.js';
import { landMaterial, waterMaterial } from './materials.js';

// Land up to the shoreline, the bay, and a ring of distant hills that fade into the haze.
export function buildTerrain(layout) {
  const group = new THREE.Group();
  const L = new GeoBuilder();
  buildLand(layout, L);
  const land = new THREE.Mesh(L.build(), landMaterial());
  land.receiveShadow = true;
  group.add(land);

  const water = new THREE.Mesh(new THREE.CircleGeometry(9500, 72).rotateX(-Math.PI / 2), waterMaterial());
  water.position.y = -2.2;
  water.receiveShadow = true;
  group.add(water);

  const rings = 30, segs = 200, noise = layout.noise, coast = layout.coast;
  const pos = [], col = [], idx = [];
  const cLow = new THREE.Color('#7f9f5c'), cMid = new THREE.Color('#557548'), cHigh = new THREE.Color('#878c93'), cTop = new THREE.Color('#dde1e6');
  const c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    const r = 1400 + 7100 * Math.pow(i / rings, 1.6);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const inland = smoothstep(coast(x) - 200, coast(x) - 1100, z);
      const n = noise.fbm(x * 0.00042 + 3.7, z * 0.00042 - 1.9);
      const h = (n - 0.4) * 1900 * smoothstep(1500, 3400, r) * inland * (1 - smoothstep(6500, 8400, r)) - 8;
      pos.push(x, h, z);
      c.copy(cLow).lerp(cMid, smoothstep(10, 170, h)).lerp(cHigh, smoothstep(260, 520, h)).lerp(cTop, smoothstep(600, 780, h));
      col.push(c.r, c.g, c.b);
    }
  }
  const w = segs + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const p = i * w + j;
    idx.push(p, p + 1, p + w, p + 1, p + w + 1, p + w);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.4 })));
  for (const m of group.children) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  return group;
}
