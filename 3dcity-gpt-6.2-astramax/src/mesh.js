import * as THREE from 'three';
import { random } from './layout.js';
import { surfaceUniforms } from './surfaces.js';

const V = THREE.Vector3;
const up = new V(0, 1, 0);
export const nightMix = { value: 0 };

// Facades use real edge lengths, including the short faces of chamfered towers.
// The same shader can therefore place windows in metres on every footprint.
function prism(points) {
  const pos = [],
    normal = [],
    uv = [],
    edge = [];
  function vertex(p, n, u, v, e) {
    pos.push(...p);
    normal.push(...n);
    uv.push(u, v);
    edge.push(...e);
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const l = Math.hypot(dx, dz),
      n = [dz / l, 0, -dx / l],
      e = [dx, dz];
    const v = [
      [a[0], -0.5, a[1]],
      [b[0], -0.5, b[1]],
      [b[0], 0.5, b[1]],
      [a[0], 0.5, a[1]],
    ];
    const tex = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const k of [0, 2, 1, 0, 3, 2]) vertex(v[k], n, ...tex[k], e);
    for (const p of [[0, 0], b, a]) vertex([p[0], 0.5, p[1]], [0, 1, 0], p[0] + 0.5, p[1] + 0.5, [0, 0]);
  }
  const g = new THREE.BufferGeometry();
  for (const [name, array, size] of [
    ['position', pos, 3],
    ['normal', normal, 3],
    ['uv', uv, 2],
    ['faceEdge', edge, 2],
  ])
    g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
  return g;
}
function gable() {
  const g = new THREE.BufferGeometry();
  const a = [-0.5, -0.5, -0.5],
    b = [0.5, -0.5, -0.5],
    c = [0.5, -0.5, 0.5],
    d = [-0.5, -0.5, 0.5],
    e = [0, 0.5, -0.5],
    f = [0, 0.5, 0.5];
  const points = [a, e, b, d, c, f, a, d, f, a, f, e, b, e, f, b, f, c];
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.computeVertexNormals();
  return g;
}
function crown(seed) {
  const g = new THREE.IcosahedronGeometry(0.5, 1),
    pos = g.attributes.position,
    colors = [];
  const rng = random(seed),
    a = rng.between(1, 4),
    b = rng.between(1, 5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    const r = 1 + 0.15 * Math.sin(x * 11 + a) * Math.cos(z * 13 - b) + 0.09 * Math.sin(y * 16 + z * 6 + a);
    pos.setXYZ(i, x * r, y * r, z * r);
    const light = 0.72 + (y + 0.5) * 0.27 + 0.1 * Math.sin(12 * x - 3 * z) * Math.cos(13 * y + b);
    colors.push(light * 0.99, light, light * 0.86);
  }
  g.computeVertexNormals();
  const normals = g.attributes.normal,
    v = new V(),
    out = new V();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(normals, i);
    out.fromBufferAttribute(pos, i).normalize();
    v.lerp(out, 0.54).normalize();
    normals.setXYZ(i, v.x, v.y, v.z);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}
function leafSprays() {
  const rng = random('leaf clusters'),
    p = [],
    n = [],
    uv = [],
    colors = [];
  const normal = new V(),
    right = new V(),
    vertical = new V(),
    point = new V(),
    center = new V();
  for (let i = 0; i < 40; i++) {
    const y = 1 - (2 * (i + 0.5)) / 40,
      rad = Math.sqrt(1 - y * y),
      angle = i * 2.39996 + rng.between(-0.14, 0.14);
    normal.set(rad * Math.cos(angle), y, rad * Math.sin(angle));
    center.copy(normal).multiplyScalar(rng.between(0.415, 0.46));
    right.set(-normal.z, 0, normal.x).normalize();
    vertical.crossVectors(normal, right).normalize();
    const width = rng.between(0.21, 0.32),
      height = rng.between(0.23, 0.34),
      lit = 0.72 + (0.24 * (y + 1)) / 2 + rng() * 0.09;
    for (const [u, v] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ]) {
      point
        .copy(center)
        .addScaledVector(right, (u - 0.5) * width)
        .addScaledVector(vertical, (v - 0.5) * height);
      p.push(point.x, point.y, point.z);
      n.push(normal.x, normal.y, normal.z);
      uv.push(u, v);
      colors.push(lit, lit, lit * 0.93);
    }
  }
  const g = new THREE.BufferGeometry();
  for (const [name, array, size] of [
    ['position', p, 3],
    ['normal', n, 3],
    ['uv', uv, 2],
    ['color', colors, 3],
  ])
    g.setAttribute(name, new THREE.Float32BufferAttribute(array, size));
  return g;
}
function foliageMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d'),
    r = random('broadleaf');
  for (let i = 0; i < 210; i++) {
    const angle = r() * Math.PI * 2,
      radius = Math.sqrt(r()) * 0.93;
    const x = 64 + Math.cos(angle) * radius * 53,
      y = 65 + Math.sin(angle) * radius * 56;
    const shade = r.int(178, 252);
    ctx.fillStyle = 'rgb(' + shade + ',' + shade + ',' + (shade - 10) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, r.between(3.0, 8), r.between(2.4, 5.2), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({
    map: tex,
    vertexColors: true,
    alphaTest: 0.36,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
}
function hull() {
  const top = [
    [-0.5, -0.34],
    [-0.36, -0.5],
    [0.36, -0.5],
    [0.5, -0.34],
    [0.47, 0.17],
    [0.28, 0.39],
    [0, 0.5],
    [-0.28, 0.39],
    [-0.47, 0.17],
  ];
  const p = [];
  for (let i = 0; i < top.length; i++) {
    const a = top[i],
      b = top[(i + 1) % top.length];
    const A = [...a],
      B = [...b];
    const at = [A[0], 0.5, A[1]],
      bt = [B[0], 0.5, B[1]],
      ab = [A[0] * 0.71, -0.5, A[1] * 0.83],
      bb = [B[0] * 0.71, -0.5, B[1] * 0.83];
    p.push(...ab, ...bt, ...bb, ...ab, ...at, ...bt, 0, 0.5, 0, ...bt, ...at);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function facadeMaterial() {
  const mat = new THREE.MeshLambertMaterial();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms, { uNight: nightMix });
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
      attribute vec2 faceEdge; attribute vec4 facadeData;
      varying vec2 fUv; varying vec2 fMeters; varying vec4 fDesign;
      varying vec3 fWorld; varying vec3 fNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vec3 sc=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      fUv=uv; fMeters=vec2(length(faceEdge*sc.xz),sc.y); fDesign=facadeData;
      fWorld=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
      fNormal=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*(normal/(sc*sc)));`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
      uniform float uNight; varying vec2 fUv; varying vec2 fMeters; varying vec4 fDesign;
      varying vec3 fWorld; varying vec3 fNormal;
      uniform sampler2D uCitySurface; uniform vec4 uCityBounds;
      float patternHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float windowBand(float t,float a,float b,float aa){return smoothstep(a-aa,a+aa,t)*(1.-smoothstep(b-aa,b+aa,t));}
      vec3 reflectedCity(vec3 ray,vec3 sky){
        vec3 col=sky;
        for(int i=4;i>=0;i--){
          float distanceAlong=10.*exp2(float(i)*.90);
          vec3 p=fWorld+ray*distanceAlong;
          vec4 tile=texture2D(uCitySurface,(p.xz-uCityBounds.xy)*uCityBounds.zw);
          float hit=smoothstep(-1.1,1.1,tile.r*200.-p.y)*smoothstep(-1.2,1.,p.y)*step(.005,tile.r);
          float floors=.79+.21*smoothstep(.12,.36,fract(p.y/3.4+tile.g));
          vec3 neighbor=mix(vec3(.080,.151,.174),vec3(.31,.238,.157),tile.g)*floors;
          col=mix(col,neighbor,hit*.89);
        }
        return col;
      }
      `,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec3 wall=diffuseColor.rgb, facadeEmission=vec3(0.);
      if(fNormal.y<.6){
        float style=fDesign.x, seed=fDesign.w;
        bool glass=style>.5 && style<2.5, ribbon=style>1.5 && style<2.5;
        bool brick=style>2.5 && style<3.5, balcony=style>3.5 && style<4.5;
        bool home=style>4.5 && style<5.5, shop=style>5.5;
        vec2 count=max(vec2(1.),floor(fMeters/vec2(fDesign.y,fDesign.z)+.5));
        vec2 grid=fUv*count, cell=floor(grid), st=fract(grid);
        vec2 aa=clamp(fwidth(grid)*.45,.008,.24);
        float orient=step(.5,abs(fNormal.z))*17.+step(0.,fNormal.x+fNormal.z)*11.;
        float noise=patternHash(cell+vec2(seed,orient)), band=patternHash(vec2(cell.y,seed+orient));
        float xEdge=glass?.034:(home?.22:(balcony?.13:(shop?.075:.17)));
        float low=glass?(ribbon?.22:.075):(home?.29:(balcony?.17:.23));
        float high=glass?(ribbon?.88:.945):(home?.82:.865);
        float pane=windowBand(st.x,xEdge,1.-xEdge,aa.x)*windowBand(st.y,low,high,aa.y);
        if(fMeters.x<.85) pane=0.;
        float sill=windowBand(st.y,low-.073,low-.012,aa.y)*windowBand(st.x,xEdge-.07,1.07-xEdge,aa.x);
        vec3 viewDir=normalize(cameraPosition-fWorld);
        vec3 refl=reflect(-viewDir,normalize(fNormal));
        float sky=clamp(.47+.55*refl.y+.19*sin(refl.x*8.+refl.z*3.+seed*.04),0.,1.);
        float reflected=sin(fWorld.x*.075+fWorld.z*.035+seed*.04)*.06+sin(fWorld.y*.046+seed)*.045;
        vec3 glazing=glass?mix(wall*.43,wall*1.14+vec3(.095,.15,.17),clamp(sky+reflected,0.,1.)):
          mix(vec3(.035,.066,.073),vec3(.19,.29,.31),sky*.7+noise*.26);
        glazing*=.79+band*.21+noise*.13;
        vec3 reflection=reflectedCity(refl,mix(vec3(.22,.32,.34),vec3(.61,.75,.80),clamp(.54+.88*refl.y+reflected,0.,1.)));
        glazing=mix(glazing,reflection*(glass?vec3(.60)+wall*.70:vec3(.62)),glass?.68:.37);
        float blind=step(.77,noise)*smoothstep(.35+.35*noise,.39+.35*noise,st.y);
        glazing=mix(glazing,vec3(.35,.37,.34),blind*(glass?.23:.54));
        float reveal=smoothstep(xEdge,xEdge+.060+aa.x,st.x)*(1.-smoothstep(high-.12-aa.y,high,st.y));
        glazing*=.77+.23*reveal;
        vec3 masonry=glass?mix(wall,vec3(.50,.53,.51),ribbon?.46:.43):wall;
        if(brick){
          vec2 tile=vec2(fUv.x*fMeters.x*1.8,fUv.y*fMeters.y*3.4);
          tile.x+=.5*mod(floor(tile.y),2.);
          float visible=1.-smoothstep(.28,1.1,fwidth(tile.y));
          float mortar=max(1.-smoothstep(.015,.115,fract(tile.y)),1.-smoothstep(.015,.08,fract(tile.x)));
          masonry*=1.+visible*(.14*mortar+.14*(patternHash(floor(tile))-.5));
        }else if(!glass){
          float joint=1.-smoothstep(.022,.054+aa.y,abs(st.y-.08));
          masonry*=1.-.14*joint;
        }
        if(balcony) masonry*=.70+.30*smoothstep(.03,.22,st.y);
        masonry*=.96+.04*band;
        vec3 facade=mix(masonry,glazing,pane);
        facade+=masonry*sill*(glass?.10:.24);
        float mullion=(1.-smoothstep(.012,.025+aa.x,abs(st.x-.50)))*(1.-smoothstep(.10,.30,aa.x));
        float transom=(1.-smoothstep(.010,.023+aa.y,abs(st.y-.655)))*(1.-smoothstep(.08,.26,aa.y));
        facade=mix(facade,masonry*(glass?.66:.72),max(mullion*(home || shop?.92:.60),transom*.73)*pane);
        float lit=step(glass?.56:.585,noise*.72+band*.28);
        vec3 lamp=mix(vec3(.91,.36,.08),vec3(1.,.72,.39),patternHash(cell.yx+seed*.63));
        if(glass) lamp=mix(lamp,vec3(.59,.76,.86),step(.57,band)*.68);
        float inside=(.62+.38*st.y)*(1.-mullion*.72)*(1.-transom*.76)*(1.-blind*.37);
        float radiance=glass?.40:.58;
        facadeEmission=pane*(glazing*(glass?.26:.14)*(1.-uNight)+uNight*lit*lamp*radiance*(.50+noise*.78)*inside);
        float streetLight=texture2D(uCitySurface,(fWorld.xz-uCityBounds.xy)*uCityBounds.zw).a;
        facadeEmission+=uNight*(1.-smoothstep(2.,12.,fWorld.y))*streetLight*(wall+.16)*vec3(.62,.38,.13);
        diffuseColor.rgb=mix(facade,facade*.64,uNight)*(.82+.18*smoothstep(1.,25.,fWorld.y));
      }else{
        diffuseColor.rgb=mix(wall,vec3(.28,.29,.27),.56);
      }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance+=facadeEmission;',
      );
  };
  return mat;
}
function pavingMaterial(asphalt) {
  const m = new THREE.MeshLambertMaterial();
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, surfaceUniforms, { uNight: nightMix });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 groundPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n groundPos=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;',
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\n varying vec3 groundPos; uniform sampler2D uCitySurface; uniform vec4 uCityBounds; uniform float uNight;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p=groundPos.xz; vec2 q=floor(p*6.);
        vec4 groundSurvey=texture2D(uCitySurface,(p-uCityBounds.xy)*uCityBounds.zw);
        diffuseColor.rgb*=mix(.22,1.,groundSurvey.b);
        float grain=fract(sin(dot(mod(q,901.),vec2(37.3,137.9)))*4358.5);
        diffuseColor.rgb*=.97+.06*grain*(1.-smoothstep(.35,1.,length(fwidth(p))));
        ${
          asphalt
            ? ''
            : `vec2 t=p/2.8; vec2 v=abs(fract(t+.5)-.5)/max(fwidth(t),vec2(.006));
          float seam=1.-smoothstep(.10,.84,min(v.x,v.y));
          diffuseColor.rgb*=1.-.13*seam*(1.-smoothstep(.23,.65,max(fwidth(t.x),fwidth(t.y))));`
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n totalEmissiveRadiance+=uNight*groundSurvey.a*(diffuseColor.rgb+.06)*vec3(.95,.55,.17);',
      );
  };
  m.customProgramCacheKey = () => (asphalt ? 'road' : 'sidewalk');
  return m;
}
function shopSigns() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d'),
    shops = [
      'BAY BOOKS',
      'MORROW & CO.',
      'CAFÉ LIDO',
      'CORNER MARKET',
      'NORTHLINE',
      'THE BAKERY',
      'FIELD GOODS',
      'STATIONERY',
      'PORT COFFEE',
      'WEST END DELI',
      'RECORD SHOP',
      'SUNDAY FLORIST',
      'TERRACE CAFÉ',
      'FRESH PRODUCE',
      'OAK & IRON',
      'HARBOUR TEA',
    ];
  const colors = ['#435651', '#68574a', '#315b61', '#84634f', '#455769', '#894f3c', '#5b6354', '#485b59'];
  shops.forEach((name, i) => {
    const x = (i % 4) * 256,
      y = Math.floor(i / 4) * 64;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, y, 256, 64);
    ctx.strokeStyle = '#c4b99e';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x + 5, y + 5, 246, 54);
    ctx.fillStyle = '#fff3d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = i % 3 === 0 ? 'bold 24px Georgia' : '600 23px Arial';
    ctx.fillText(name, x + 128, y + 33, 225);
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: texture });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n attribute vec4 facadeData;')
      .replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\n vMapUv=(vec2(mod(facadeData.x,4.),3.-floor(facadeData.x/4.))+mix(vec2(.007),vec2(.993),uv))*.25;',
      );
  };
  return mat;
}
export function makeKit() {
  const bevel = 0.16;
  const rect = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ];
  const chamfer = [
    [-0.5 + bevel, -0.5],
    [0.5 - bevel, -0.5],
    [0.5, -0.5 + bevel],
    [0.5, 0.5 - bevel],
    [0.5 - bevel, 0.5],
    [-0.5 + bevel, 0.5],
    [-0.5, 0.5 - bevel],
    [-0.5, -0.5 + bevel],
  ];
  const round = Array.from({ length: 16 }, (_, i) => [
    0.5 * Math.cos((i / 16) * Math.PI * 2),
    0.5 * Math.sin((i / 16) * Math.PI * 2),
  ]);
  const pad = [];
  for (let k = 0; k < 4; k++) {
    const cx = k === 0 || k === 3 ? 0.45 : -0.45,
      cz = k < 2 ? 0.45 : -0.45;
    for (let s = 0; s <= 4; s++) {
      const a = ((k + s / 4) * Math.PI) / 2;
      pad.push([cx + 0.05 * Math.cos(a), cz + 0.05 * Math.sin(a)]);
    }
  }
  const awning = new THREE.BufferGeometry();
  awning.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0.05, 1], 3));
  awning.computeVertexNormals();
  const geo = {
    box: new THREE.BoxGeometry(1, 1, 1),
    rect: prism(rect),
    chamfer: prism(chamfer),
    round: prism(round),
    pad: prism(pad),
    wedge: prism([
      [-0.5, -0.5],
      [0.27, -0.5],
      [0.5, 0.38],
      [0.38, 0.5],
      [-0.5, 0.5],
    ]),
    gable: gable(),
    leafA: crown('ash'),
    leafB: crown('elm'),
    sprays: leafSprays(),
    post: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    hull: hull(),
    sail: awning,
    plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    sign: new THREE.PlaneGeometry(1, 1),
  };
  const mats = {
    solid: new THREE.MeshLambertMaterial(),
    leaf: new THREE.MeshLambertMaterial({ vertexColors: true }),
    foliage: foliageMaterial(),
    facade: facadeMaterial(),
    paving: pavingMaterial(false),
    road: pavingMaterial(true),
    sign: shopSigns(),
    sail: new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }),
    lens: new THREE.MeshBasicMaterial({ color: 0xffebc4 }),
    halo: new THREE.ShaderMaterial({
      uniforms: { uNight: nightMix },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 haloUV;void main(){haloUV=uv-.5;
        vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
        center.xy+=position.xy*length(instanceMatrix[0].xyz);gl_Position=projectionMatrix*center;}`,
      fragmentShader: `varying vec2 haloUV;uniform float uNight;void main(){float r=length(haloUV);
        float a=exp(-12.*r)*.78+.22*(1.-smoothstep(.008,.13,r));
        gl_FragColor=vec4(1.,.65,.28,a*uNight);
        #include <colorspace_fragment>
      }`,
    }),
    pool: new THREE.ShaderMaterial({
      uniforms: { uNight: nightMix },
      vertexShader: `varying vec2 vP;
      void main(){vP=uv-.5;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uNight;varying vec2 vP;void main(){float r=clamp(1.-2.*length(vP),0.,1.);
        gl_FragColor=vec4(1.,.57,.21,r*r*uNight*.24);
        #include <colorspace_fragment>
      }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  };
  return { geo, mats };
}
const temp = new THREE.Object3D(),
  color = new THREE.Color(),
  v1 = new V();
export class Batches {
  constructor(kit) {
    this.kit = kit;
    this.bins = new Map();
  }
  add(shape, mat, x, y, z, w, h, d, tint, yaw = 0, cast = true, design = null) {
    temp.position.set(x, y, z);
    temp.rotation.set(0, yaw, 0);
    temp.scale.set(w, h, d);
    temp.updateMatrix();
    this.record(shape, mat, tint, cast, design);
  }
  record(shape, mat, tint, cast, design = null) {
    // Spatial batches keep a street-level camera from submitting the whole island.
    let chunk = '';
    if (mat === 'foliage')
      chunk = Math.floor(temp.position.x / 114) + ',' + Math.floor(temp.position.z / 114);
    else if (mat === 'leaf' || mat === 'facade' || (mat === 'solid' && shape === 'box'))
      chunk = (temp.position.x < 0 ? 'W' : 'E') + (temp.position.z < 0 ? 'N' : 'S');
    const key = [shape, mat, cast, chunk].join('/');
    let bin = this.bins.get(key);
    if (!bin) {
      bin = { shape, mat, cast, matrices: [], colors: [], designs: [] };
      this.bins.set(key, bin);
    }
    bin.matrices.push(...temp.matrix.elements);
    color.set(tint);
    bin.colors.push(color.r, color.g, color.b);
    if (design) bin.designs.push(...design);
  }
  box(x, y, z, w, h, d, tint, yaw = 0, cast = true) {
    this.add('box', 'solid', x, y, z, w, h, d, tint, yaw, cast);
  }
  beam(a, b, width, depth, tint, cast = true, shape = 'box') {
    const dir = v1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
      length = dir.length();
    temp.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    temp.quaternion.setFromUnitVectors(up, dir.normalize());
    temp.scale.set(width, length, depth);
    temp.updateMatrix();
    this.record(shape, 'solid', tint, cast);
  }
  finish() {
    const group = new THREE.Group();
    for (const bin of this.bins.values()) {
      let geometry = this.kit.geo[bin.shape];
      if (bin.designs.length) {
        geometry = geometry.clone();
        geometry.setAttribute(
          'facadeData',
          new THREE.InstancedBufferAttribute(new Float32Array(bin.designs), 4),
        );
      }
      const mesh = new THREE.InstancedMesh(geometry, this.kit.mats[bin.mat], bin.colors.length / 3);
      mesh.instanceMatrix.array.set(bin.matrices);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(bin.colors), 3);
      mesh.castShadow = bin.cast;
      mesh.receiveShadow = bin.mat !== 'pool' && bin.mat !== 'lens';
      mesh.userData.ownGeometry = !!bin.designs.length;
      mesh.name = bin.mat + ' / ' + bin.shape;
      mesh.userData.nearFoliage = bin.mat === 'foliage';
      mesh.computeBoundingSphere();
      if (bin.mat === 'pool' || bin.mat === 'halo') mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.bins.clear();
    return group;
  }
}
export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (o.userData.ownGeometry) o.geometry.dispose();
    if (o.userData.ownMaterial) o.material.dispose();
  });
  group.removeFromParent();
}
