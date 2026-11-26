import * as THREE from 'three';
import { nightMix } from './mesh.js';
import { random } from './layout.js';

const noiseGLSL = `
float hash21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+1.),f.x),f.y);}
`;
const sunVector = new THREE.Vector3(-0.79, 0.84, -0.32).normalize();
export function environment(scene, kit, maxTextureSize) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(3100, 40, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uNight: nightMix, uSun: { value: sunVector } },
      vertexShader: `varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position.z=gl_Position.w;}`,
      fragmentShader: `varying vec3 dir;uniform float uNight;uniform vec3 uSun;
    ${noiseGLSL}
    void main(){
      vec3 n=normalize(dir);float h=max(0.,n.y);
      vec3 day=mix(vec3(.67,.78,.81),vec3(.235,.495,.71),pow(clamp(h*2.8,0.,1.),.53));
      day=mix(day,vec3(.13,.34,.56),smoothstep(.35,1.,h)*.72);
      vec2 p=n.xz/max(.035,h+.021)*1.08;
      float cloud=noise2(p*.58)*.55+noise2(p*1.46)*.29+noise2(p*3.7)*.16;
      float veil=smoothstep(.50,.76,cloud)*smoothstep(.003,.09,h);
      day=mix(day,vec3(.95,.93,.86),veil*.49);
      float s=max(0.,dot(n,uSun));day+=vec3(1.,.77,.45)*(.15*pow(s,10.)+1.4*smoothstep(.99967,.99991,s));
      vec3 night=mix(vec3(.045,.081,.123),vec3(.006,.018,.048),pow(clamp(h*2.5,0.,1.),.58));
      vec2 sp=n.xz/(.30+h)*390.;float star=step(.994,hash21(floor(sp)))*(1.-smoothstep(.04,.23,length(fract(sp)-.5)));
      night+=vec3(.61,.76,.83)*star*smoothstep(.08,.31,h);
      gl_FragColor=vec4(mix(day,night,uNight),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  );
  // Render the sea and sky after opaque buildings so their fragment shaders
  // only run on the visible background.
  sky.renderOrder = 2;
  sky.frustumCulled = false;
  scene.add(sky);
  const clock = { value: 0 };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uNight: nightMix, uTime: clock, uSun: { value: sunVector } },
    vertexShader: `varying vec3 wp;void main(){wp=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader: `varying vec3 wp;uniform float uNight;uniform float uTime;uniform vec3 uSun;
    ${noiseGLSL}
    void main(){
      vec3 eye=normalize(cameraPosition-wp);float dist=length(cameraPosition-wp);
      vec2 p=wp.xz;float t=uTime;
      float broad=noise2(p*.018+vec2(t*.016,0.));
      float chop=noise2(p*.107+vec2(.012*t,-.061*t));
      float phase=p.y*1.31+p.x*.35+12.*broad+5.*chop+t*.86;
      float fine=1.-smoothstep(.13,1.48,length(fwidth(p)));
      float ripple=sin(phase)*.32+sin(p.y*2.76-p.x*.61+5.1*chop-t*.71)*.18*fine
        +sin(p.x*.25+p.y*.46+9.*chop+t*.49)*.31+(chop-.5)*.76;
      float angle=1.-clamp(eye.y,0.,1.);
      vec3 deep=mix(vec3(.056,.196,.245),vec3(.116,.305,.34),broad);
      vec3 col=mix(deep,vec3(.39,.58,.65),pow(angle,3.)*.80);
      col+=ripple*vec3(.018,.030,.032)*(1.-smoothstep(210.,1020.,dist));
      float crest=smoothstep(.55,.94,ripple)*(.16+.84*broad);
      col+=vec3(.074,.099,.092)*crest*(1.-smoothstep(180.,850.,dist));
      vec3 n=normalize(vec3(.05*cos(phase*.83),1.,.12*ripple));
      float glint=pow(max(0.,dot(reflect(-uSun,n),eye)),64.);
      col+=vec3(.90,.75,.49)*glint*(.3+.7*crest);
      col=mix(col,vec3(.67,.78,.81),smoothstep(600.,3800.,dist));
      vec3 dark=mix(vec3(.008,.026,.037),vec3(.039,.075,.115),pow(angle,2.));
      dark+=crest*vec3(.007,.014,.020)*(1.-smoothstep(140.,800.,dist))+glint*vec3(.06,.10,.14);
      dark=mix(dark,vec3(.045,.081,.123),smoothstep(850.,3800.,dist));
      gl_FragColor=vec4(mix(col,dark,uNight),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const waterGeo = new THREE.PlaneGeometry(16000, 16000);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = -2.0;
  water.renderOrder = 1;
  scene.add(water);
  const hemi = new THREE.HemisphereLight(0xe3f1fa, 0xc2aa86, 1.65);
  const ambient = new THREE.AmbientLight(0xffffff, 0.28);
  const sun = new THREE.DirectionalLight(0xffe4bd, 2.4);
  sun.position.copy(sunVector).multiplyScalar(850);
  sun.castShadow = true;
  const shadow = sun.shadow;
  shadow.mapSize.setScalar(Math.min(4096, maxTextureSize));
  Object.assign(shadow.camera, { left: -452, right: 452, top: 405, bottom: -405, near: 110, far: 1520 });
  shadow.camera.updateProjectionMatrix();
  shadow.normalBias = 0.16;
  shadow.bias = -0.00012;
  shadow.radius = 2.25;
  scene.add(sun, hemi, ambient, sun.target);
  scene.fog = new THREE.Fog(0xb7cbd2, 360, 1920);
  const dayFog = new THREE.Color('#b7cbd2'),
    nightFog = new THREE.Color('#34485c'),
    daySky = new THREE.Color('#cfebff'),
    nightSky = new THREE.Color('#a5c4e7'),
    dayGround = new THREE.Color('#bcb6a0'),
    nightGround = new THREE.Color('#5e738c'),
    daySun = new THREE.Color('#ffe7c9'),
    nightSun = new THREE.Color('#b0c9f5');
  function light(amount) {
    nightMix.value = amount;
    hemi.color.lerpColors(daySky, nightSky, amount);
    hemi.groundColor.lerpColors(dayGround, nightGround, amount);
    hemi.intensity = 1.46 - amount * 1.04;
    ambient.intensity = 0.23 - amount * 0.12;
    sun.color.lerpColors(daySun, nightSun, amount);
    sun.intensity = 2.85 - amount * 2.56;
    scene.fog.color.lerpColors(dayFog, nightFog, amount);
    kit.mats.lens.color.setRGB(0.88 + amount * 0.9, 0.82 + amount * 0.5, 0.64 + amount * 0.06);
    kit.mats.pool.visible = amount > 0.005;
    kit.mats.halo.visible = amount > 0.005;
  }
  light(0);
  return {
    light,
    update(camera, dt) {
      sky.position.copy(camera.position);
      clock.value += dt;
    },
  };
}

// Irregular rings form a coastline and a succession of ridgelines across the bay.
export function makeHills(city) {
  const r = random(city.seed + '/bay'),
    positions = [],
    colors = [],
    indices = [];
  const base = new THREE.Color(),
    c = new THREE.Color();
  function island(x, z, rx, rz, height, seed) {
    const rr = random(seed),
      phases = Array.from({ length: 6 }, () => rr() * Math.PI * 2),
      layers = 18,
      steps = 112,
      start = positions.length / 3;
    for (let k = 0; k <= layers; k++) {
      const f = k / layers;
      for (let i = 0; i < steps; i++) {
        const a = (i * Math.PI * 2) / steps;
        const coast =
          1 +
          0.12 * Math.sin(3 * a + phases[0]) +
          0.095 * Math.sin(5 * a + phases[1]) +
          0.046 * Math.cos(a * 9 + phases[2]) +
          0.028 * Math.sin(a * 17 + phases[3]);
        const dx = Math.cos(a) * f * coast,
          dz = Math.sin(a) * f * coast;
        const hills =
          0.63 +
          0.23 * Math.cos(dx * 7 + dz * 3 + phases[3]) +
          0.15 * Math.sin(dz * 8 - dx * 5 + phases[4]) +
          0.07 * Math.sin(dz * 18 + dx * 9) +
          0.022 * Math.sin(dx * 37 - dz * 24);
        const y = -3.5 + height * Math.max(0, 1 - f * f) * hills;
        positions.push(x + dx * rx, y, z + dz * rz);
        base.set(y < 3 ? '#aaa689' : '#75896f');
        c.copy(base).multiplyScalar(
          0.93 + rr() * 0.06 + 0.07 * Math.sin(dx * 16 + dz * 10) + (0.1 * y) / height,
        );
        colors.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < layers; k++)
      for (let i = 0; i < steps; i++) {
        const n = (i + 1) % steps;
        const a = start + k * steps + i,
          b = start + k * steps + n,
          c = a + steps,
          d = b + steps;
        indices.push(a, b, c, c, b, d);
      }
  }
  island(city.bridgeStart.x + 720, city.bridgeStart.z + 2, 240, 163, 65, 'bridge' + city.seed);
  island(-485, -1080, 910, 224, 142, r());
  island(590, -1240, 750, 220, 115, r());
  island(-1210, -201, 295, 680, 125, r());
  island(-1380, 700, 360, 530, 104, r());
  island(500, 1420, 720, 238, 105, r());
  island(1490, 570, 264, 560, 100, r());
  island(1040, -1030, 400, 205, 92, r());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const hills = new THREE.Mesh(geo, material);
  hills.userData.ownGeometry = true;
  hills.userData.ownMaterial = true;
  return hills;
}
