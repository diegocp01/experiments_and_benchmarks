import * as THREE from 'three';
import { random } from './layout.js';
import { Traffic } from './traffic-model.js';
import { nightMix } from './mesh.js';

function shell(rings) {
  const positions = [];
  const ring = ([y, w, rear, front, cut]) => [
    [-w + cut, y, rear],
    [w - cut, y, rear],
    [w, y, rear + cut],
    [w, y, front - cut],
    [w - cut, y, front],
    [-w + cut, y, front],
    [-w, y, front - cut],
    [-w, y, rear + cut],
  ];
  const levels = rings.map(ring);
  for (let j = 1; j < levels.length; j++)
    for (let i = 0; i < 8; i++) {
      const a = levels[j - 1][i],
        b = levels[j - 1][(i + 1) % 8],
        c = levels[j][(i + 1) % 8],
        d = levels[j][i];
      positions.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  const top = levels.at(-1);
  for (let i = 1; i < 7; i++) positions.push(...top[0], ...top[i + 1], ...top[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
function mergeBoxes(parts) {
  const p = [],
    n = [];
  for (const [x, y, z, w, h, d] of parts) {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    p.push(...g.attributes.position.array);
    n.push(...g.attributes.normal.array);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  return geo;
}
const paint = [
  '#e5e1ce',
  '#d6d6cb',
  '#e8e2d1',
  '#477a85',
  '#797f78',
  '#9da5a3',
  '#647273',
  '#4b616b',
  '#cf9760',
  '#e3ad52',
  '#ad634d',
  '#bfc9be',
  '#716d66',
  '#648e91',
  '#bc7654',
  '#ece7d5',
];
export function makeFleet(city) {
  const model = new Traffic(city),
    r = random(city.seed + '/car-paint'),
    n = model.cars.length;
  const group = new THREE.Group(),
    matrix = new THREE.InstancedBufferAttribute(new Float32Array(n * 16), 16);
  matrix.setUsage(THREE.DynamicDrawUsage);
  const paintData = new Float32Array(n * 3),
    color = new THREE.Color();
  for (let i = 0; i < n; i++) {
    color.set(r.pick(paint));
    color.toArray(paintData, i * 3);
  }
  const colors = new THREE.InstancedBufferAttribute(paintData, 3);
  function part(geometry, material, tinted = false) {
    const m = new THREE.InstancedMesh(geometry, material, n);
    m.instanceMatrix = matrix;
    if (tinted) m.instanceColor = colors;
    m.frustumCulled = false;
    m.receiveShadow = true;
    m.userData.ownMaterial = true;
    m.userData.ownGeometry = true;
    group.add(m);
    return m;
  }
  const lambert = (c) => new THREE.MeshLambertMaterial({ color: c });
  part(
    shell([
      [0.19, 0.42, -0.465, 0.46, 0.065],
      [0.3, 0.49, -0.49, 0.5, 0.072],
      [0.53, 0.47, -0.47, 0.455, 0.085],
      [0.59, 0.43, -0.425, 0.399, 0.075],
    ]),
    lambert('#ffffff'),
    true,
  );
  part(
    shell([
      [0.56, 0.411, -0.335, 0.265, 0.058],
      [0.89, 0.332, -0.207, 0.112, 0.051],
    ]),
    lambert('#526b72'),
  );
  part(
    shell([
      [0.885, 0.337, -0.21, 0.114, 0.051],
      [0.94, 0.309, -0.186, 0.095, 0.044],
    ]),
    lambert('#ffffff'),
    true,
  );
  const wheels = [];
  for (const side of [-1, 1])
    for (const z of [-0.29, 0.3]) wheels.push([side * 0.445, 0.18, z, 0.108, 0.3, 0.134]);
  part(mergeBoxes(wheels), lambert('#393e3b'));
  const fronts = [],
    backs = [];
  for (const side of [-1, 1]) {
    fronts.push([side * 0.305, 0.4, 0.474, 0.205, 0.1, 0.045]);
    backs.push([side * 0.32, 0.405, -0.48, 0.172, 0.1, 0.036]);
  }
  part(mergeBoxes(fronts), new THREE.MeshBasicMaterial({ color: '#fff0be' }));
  part(mergeBoxes(backs), new THREE.MeshBasicMaterial({ color: '#b84e3c' }));
  const shadow = new THREE.PlaneGeometry(1.08, 1.06);
  shadow.rotateX(-Math.PI / 2);
  shadow.translate(0, 0.006, 0);
  part(
    shadow,
    new THREE.MeshBasicMaterial({ color: 0x303b37, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  const lights = new THREE.PlaneGeometry(2.45, 1.35);
  lights.rotateX(-Math.PI / 2);
  lights.translate(0, 0.009, 1.1);
  const headlight = part(
    lights,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uNight: nightMix },
      vertexShader: `varying vec2 lightUV;void main(){lightUV=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uNight;varying vec2 lightUV;void main(){float dist=1.-lightUV.y;
      float width=.08+dist*.24;float x=abs(lightUV.x-.5)-.14;
      float light=exp(-x*x/(width*width))*(1.-dist)*(1.-dist);
      gl_FragColor=vec4(1.,.83,.46,light*uNight*.34);
      #include <colorspace_fragment>
    }`,
    }),
  );
  headlight.renderOrder = 3;
  function update(dt) {
    if (dt) model.step(dt);
    headlight.visible = nightMix.value > 0.005;
    const a = matrix.array;
    for (let i = 0; i < n; i++) {
      const c = model.cars[i],
        sin = Math.sin(c.yaw),
        cos = Math.cos(c.yaw),
        j = i * 16;
      a[j] = cos * c.width;
      a[j + 2] = -sin * c.width;
      a[j + 5] = c.height;
      a[j + 8] = sin * c.length;
      a[j + 10] = cos * c.length;
      a[j + 12] = c.x;
      a[j + 13] = 0.083;
      a[j + 14] = c.z;
      a[j + 15] = 1;
    }
    matrix.needsUpdate = true;
  }
  update(0);
  return { group, model, update };
}
