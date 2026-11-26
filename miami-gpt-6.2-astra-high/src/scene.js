import * as THREE from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {Reflector} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/objects/Reflector.js';
import {EffectComposer} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/postprocessing/ShaderPass.js';
import {OutputPass} from '/Users/diego/Downloads/code_projects_m5/voice_room_design/node_modules/three/examples/jsm/postprocessing/OutputPass.js';

const $=s=>document.querySelector(s), TAU=Math.PI*2;
let seed=8031; const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;},range=(a,b)=>a+(b-a)*random();
const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2('#555971',0.0045);
const camera=new THREE.PerspectiveCamera(59,innerWidth/innerHeight,.15,4000);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.88;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
$('#viewport').appendChild(renderer.domElement);
const world=new THREE.Group();scene.add(world);
const clockUniform={value:0};
const white=new THREE.Color();
const materials={};
function mat(name,c,rough=.65,metal=0){return materials[name]??=(new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:metal}));}
function lit(name,c,power=2){return materials[name]??=(new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(power)}));}
const stucco=mat('stucco','#e6d3bb'),cream=mat('cream','#dddbc9'),trim=mat('trim','#e9e2d0'),dark=mat('dark','#202e38',.45),bronze=mat('bronze','#695d4a',.33,.7),chrome=mat('chrome','#b5bfc2',.2,.85),rubber=mat('rubber','#111719',.88),glass=mat('glass','#233a49',.13,.55);
const pink=lit('pink','#ff4b9d',3),cyan=lit('cyan','#62e4df',2.5),amber=lit('amber','#ffd49a',2.5),red=lit('red','#ff3828',3);
const bins=new Map(), temp=new THREE.Object3D();
function addGeo(geo,m,x=0,y=0,z=0,rx=0,ry=0,rz=0,parent=null){
 if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
 if(parent){let mesh=new THREE.Mesh(geo,m);mesh.position.set(x,y,z);mesh.rotation.set(rx,ry,rz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.set(1,1,1);temp.updateMatrix();geo=geo.clone().applyMatrix4(temp.matrix);if(geo.index)geo=geo.toNonIndexed();
 let key=m.uuid+':'+Math.floor(z/70);if(!bins.has(key))bins.set(key,{m,g:[]});bins.get(key).g.push(geo);
}
const boxGeo=new THREE.BoxGeometry(1,1,1);
function box(x,y,z,w,h,d,m,parent=null,r=0){const g=boxGeo.clone();g.scale(w,h,d);return addGeo(g,m,x,y,z,0,r,0,parent);}
function roundBox(x,y,z,w,h,d,r,m,parent=null){return addGeo(new RoundedBoxGeometry(w,h,d,2,r),m,x,y,z,0,0,0,parent);}
function cyl(x,y,z,r1,r2,h,m,parent=null,rz=0){return addGeo(new THREE.CylinderGeometry(r1,r2,h,10),m,x,y,z,0,0,rz,parent);}
function sphere(x,y,z,r,m,parent=null){return addGeo(new THREE.SphereGeometry(r,12,8),m,x,y,z,0,0,0,parent);}
function line(points,r,m,parent=null){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return addGeo(new THREE.TubeGeometry(curve,Math.max(4,points.length*3),r,5,false),m,0,0,0,0,0,0,parent);}
function plane(x,y,z,w,h,m,ry=0,rx=0,parent=null){return addGeo(new THREE.PlaneGeometry(w,h),m,x,y,z,rx,ry,0,parent);}

// Everything visible is synthesized here: even the plaster, sky, lettering and palm leaflets.
function noiseTex(size,type){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d'),im=ctx.createImageData(size,size);for(let j=0;j<size;j++)for(let i=0;i<size;i++){let p=(j*size+i)*4;let n=range(-1,1),v=type==='normal'?128:180+n*28;im.data[p]=type==='normal'?128+n*12:v;im.data[p+1]=type==='normal'?128+range(-12,12):v;im.data[p+2]=type==='normal'?250:v;im.data[p+3]=255;}ctx.putImageData(im,0,0);let t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(9,9);return t;}
const plaster=noiseTex(128,'normal');for(const m of [stucco,cream,trim]){m.normalMap=plaster;m.normalScale=new THREE.Vector2(.12,.12);}
const hemi=new THREE.HemisphereLight('#93bde6','#5b4055',1.15);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ff9f8a',.85);sun.position.set(-95,55,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=240;sun.shadow.bias=-.0005;sun.shadow.normalBias=.15;scene.add(sun,sun.target);
const sky=new THREE.Mesh(new THREE.SphereGeometry(2400,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{},vertexShader:`varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vDir;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+15.1;a*=.5;}return v;}
void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);float west=pow(max(-d.x*.9+d.z*.2,0.),2.);vec3 horizon=mix(vec3(.41,.39,.49),vec3(.95,.42,.30),west*.75);vec3 low=mix(horizon,vec3(.25,.35,.51),smoothstep(0.,.25,h));vec3 col=mix(low,vec3(.035,.095,.21),smoothstep(.12,.85,h));vec2 q=d.xz/(h+.16);float clouds=fbm(q*vec2(.7,3.)+vec2(16.,0.));float layer=smoothstep(.49,.74,clouds)*smoothstep(.02,.16,h)*(1.-smoothstep(.38,.65,h));col=mix(col,mix(vec3(.22,.27,.39),vec3(.65,.38,.41),west),layer*.7);float wisps=pow(fbm(q*vec2(.8,12.)),4.)*(1.-smoothstep(.12,.5,h));col+=vec3(.12,.075,.08)*wisps;col=mix(vec3(.24,.29,.36),col,smoothstep(-.05,.015,d.y));float belt=exp(-pow((h-.035)/.045,2.));col=mix(col,vec3(.56,.24,.30),belt*.52);col*=.34;col.b*=1.12;gl_FragColor=vec4(col,1.);}`}));scene.add(sky);

// West: hotels. East: Lummus Park, beach, Atlantic. North points along -Z.
box(0,-.35,-500,240,.5,1400,mat('ground','#807b70'));
box(-12,.02,-500,9,.18,1400,mat('pavement','#b4aa9d'));
box(10,.02,-500,3.5,.18,1400,mat('walk','#bcb5a5'));
box(28,-.06,-500,32,.2,1400,mat('grass','#263e32',1));
box(48,-.12,-500,13,.16,1400,mat('dunes','#b5a488',1));
box(63,-.15,-500,20,.12,1400,mat('sand','#bfb3a0',.95));
box(40,.01,-500,3.1,.12,1400,mat('path','#aaa895',.9));
box(-7.85,.15,-500,.25,.32,1400,trim);box(7.85,.15,-500,.25,.32,1400,trim);
function terrainTexture(base,variation){let c=document.createElement('canvas');c.width=c.height=256;let ctx=c.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,256,256);for(let j=0;j<28000;j++){let alpha=range(.03,.16);ctx.fillStyle=random()>.5?'rgba(230,215,166,'+alpha+')':'rgba(10,26,20,'+alpha+')';ctx.fillRect(range(0,256),range(0,256),range(.5,variation),range(.5,variation));}let t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(7,80);return t;}
 materials.grass.map=terrainTexture('#83946f',3);materials.grass.color.set('#69765a');materials.sand.map=terrainTexture('#d5c5ab',1.5);materials.sand.normalMap=plaster;materials.sand.normalScale=new THREE.Vector2(.2,.2);
 // Paving joints, storm drains, seams and curb paint provide a human scale.
for(let z=90;z>-1200;z-=2){box(-12,.119,z,8,.008,.018,mat('joint','#807a72'));box(10,.119,z,3.4,.008,.018,materials.joint);}
for(let z=70;z>-540;z-=24){box(-7.5,.025,z,.45,.025,1,mat('iron','#303839',.48,.6));for(let j=0;j<8;j++)box(-7.49,.045,z-.42+j*.12,.37,.015,.035,dark);}
const roadShader={uniforms:{color:{value:new THREE.Color('#26313c')},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},time:clockUniform},vertexShader:`uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;void main(){vUv=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform vec3 color;uniform float time;varying vec4 vUv;varying vec3 vWorld;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){vec2 p=vWorld.xz;float n=noise(p*1.1),grain=hash(p*260.);float puddle=smoothstep(.33,.73,noise(p*.24)+.13*noise(p*1.9));vec2 uv=vUv.xy/vUv.w;vec2 ripple=vec2(noise(p*vec2(5.,22.)),noise(p*vec2(14.,4.)))-.5;uv+=ripple*(.0012+.002*(1.-puddle));vec3 ref=texture2D(tDiffuse,uv).rgb*.32;float blur=.0015+.0018*(1.-puddle);ref+=(texture2D(tDiffuse,uv+vec2(blur,0)).rgb+texture2D(tDiffuse,uv-vec2(blur,0)).rgb)*.17;ref+=(texture2D(tDiffuse,uv+vec2(0.,blur*.6)).rgb+texture2D(tDiffuse,uv-vec2(0.,blur*.6)).rgb)*.17;
float grazing=1.-clamp(normalize(cameraPosition-vWorld).y,0.,1.);float f=.10+.36*pow(grazing,3.);vec3 base=color*(.21+.1*n)+grain*.012;vec3 col=mix(base,ref,f*(.25+puddle*.75));float tracks=exp(-pow((abs(p.x)-3.3)*2.2,2.));col*=1.-tracks*.14;float fog=1.-exp(-.0028*.0028*pow(length(cameraPosition-vWorld),2.));col=mix(col,vec3(.12,.17,.23),fog);gl_FragColor=vec4(col,1.);}`};
const road=new Reflector(new THREE.PlaneGeometry(15.6,1400),{textureWidth:1536,textureHeight:864,clipBias:.003,multisample:0,shader:roadShader});road.rotation.x=-Math.PI/2;road.position.set(0,.001,-500);scene.add(road);
const lane=mat('lane','#d7bb74',.48);
for(let z=90;z>-1200;z-=8){box(-.12,.015,z,.075,.012,4,lane);box(.12,.015,z,.075,.012,4,lane);}
for(let z=80;z>-1200;z-=7.4){box(-5.95,.017,z,.11,.012,3.2,trim);box(5.95,.017,z,.11,.012,3.2,trim);}
for(let z of [-68,-193,-318,-443]){for(let x=-6.7;x<7;x+=1.4)box(x,.027,z,.65,.015,3.1,trim);box(-12,.06,z,8,.12,7,materials.pavement);}

// Analytic water: directional capillary waves, Fresnel, and pastel dusk reflections.
const water=new THREE.Mesh(new THREE.PlaneGeometry(1800,3000,1,1),new THREE.ShaderMaterial({uniforms:{time:clockUniform},vertexShader:`varying vec3 p;void main(){p=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform float time;varying vec3 p;float wave(vec2 q){return sin(q.x*1.7+q.y*.15-time*.9)*.36+sin(q.x*3.4-q.y*.4-time*1.3)*.15+sin(q.x*9.1+q.y*2.1-time*1.9)*.045;}void main(){vec2 q=p.xz;float w=wave(q);vec3 n=normalize(vec3((wave(q+vec2(.06,0))-w)*3.,1.,(wave(q+vec2(0,.06))-w)*3.));vec3 v=normalize(cameraPosition-p);float fr=pow(1.-max(dot(n,v),0.),4.);vec3 c=mix(vec3(.025,.09,.12),vec3(.13,.15,.23),fr);float glint=pow(max(dot(reflect(-normalize(vec3(-.8,.16,.3)),n),v),0.),60.);c+=vec3(.72,.31,.25)*glint*.3;float surf=sin(q.x*1.5+sin(q.y*.19)*.55-time*.72);float foam=smoothstep(.83,1.,surf)*exp(-max(q.x-72.,0.)*.18);c=mix(c,vec3(.50,.57,.59),foam*.52);float dist=length(cameraPosition-p);c=mix(c,vec3(.16,.15,.22),1.-exp(-dist*.001));gl_FragColor=vec4(c,1.);}`}));water.rotation.x=-Math.PI/2;water.position.set(972,-.18,-250);scene.add(water);

function textTexture(text,color,sub=false){let c=document.createElement('canvas');c.width=1024;c.height=sub?128:256;let ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.textAlign='center';ctx.textBaseline='middle';let font=sub?'400 60px Georgia':'300 116px Arial';ctx.font=font;let measure=ctx.measureText(text).width;if(measure>940)ctx.font=font.replace(/\d+px/,Math.floor(parseInt(font.match(/\d+px/)[0])*940/measure)+'px');ctx.shadowColor=color;ctx.shadowBlur=12;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeText(text,512,c.height/2);ctx.shadowBlur=3;ctx.fillStyle=sub?color:'#fff3e8';if(sub)ctx.fillText(text,512,c.height/2);else{ctx.globalAlpha=.38;ctx.fillText(text,512,c.height/2);ctx.globalAlpha=1;ctx.strokeText(text,512,c.height/2);}let tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;}
function sign(text,x,y,z,width,color,height=1.8,sub=false,parent=null,rot=Math.PI/2){let m=new THREE.MeshBasicMaterial({map:textTexture(text,color,sub),transparent:true,depthWrite:false,color:new THREE.Color().setScalar(sub?1.1:2.5),side:THREE.DoubleSide});plane(x,y,z,width,height,m,rot,0,parent);}
const windowLit=[mat('windowWarm','#d6a06a',.3),mat('windowDim','#4b5c65',.2,.3),mat('windowBlue','#334f63',.2,.4)];windowLit[0].emissive=new THREE.Color('#ffbd75');windowLit[0].emissiveIntensity=.5;
const hotelData=[['COLONY','#92c6c7','#57e3ee',12.6,22],['BOULEVARD','#e6c5b4','#ffbe75',11,21],['THE BREAKWATER','#e8d1ae','#56b8ff',17,25],['EDISON','#cfb9bc','#fc7295',12,22],['THE TIDES','#deccb0','#ffd59f',23,23],['CAVALIER','#d8bcb0','#ff6b87',13,22],['CARDOZO','#c6d6c8','#8aeee2',13.5,27],['LESLIE','#e4cea1','#ffdf90',14,23],['THE VICTOR','#c2c9c9','#a6c8ff',21,25],['HOTEL WAVES','#d5b9bc','#ff8ac0',12,22],['OCEAN BLUE','#a5c3c7','#69dcff',15,25],['SOUTH BEACH','#e0c7b5','#ffc799',13,23],['PALM HOUSE','#bdcbc1','#7af0c9',12,24],['THE ATLANTIC','#d2bcc7','#f5a7dc',17,25],['SEABREEZE','#d8d3c1','#a1def4',12,22],['CASA DEL MAR','#d1b6a7','#ffb880',14,23],['THE REGENT','#b4c6cb','#7edcfc',18,24],['OCEAN TERRACE','#e0c4b4','#ff9fbf',14,23],['PALMETTO','#bec9b4','#b4ffd7',12,22],['THE MERIDIAN','#cec4d2','#bdaaff',17,24]];
const hotelLights=[];
let hz=24;
hotelData.forEach((d,i)=>{let [name,color,neon,h,w]=d;let z=hz-w/2;hz-=w+3.5;
 let facade=mat('facade'+i,color);facade.normalMap=plaster;facade.normalScale=new THREE.Vector2(.16,.16);
 let accent=mat('accent'+i,new THREE.Color(color).multiplyScalar(.67));let glow=lit('neon'+i,neon,2.5);
 const x=-24,front=-16.8,depth=14;
 roundBox(x,h/2,z,depth,h,w,.35,facade);
 for(let side of [-1,1])for(let f=0;f<Math.floor((h-3)/3);f++)for(let col=0;col<4;col++){let wx=-19-col*2.8,wy=4.5+f*3;box(wx,wy,z+side*(w/2+.025),1.3,1.6,.045,windowLit[random()<.2?0:1]);box(wx,wy+.93,z+side*(w/2+.12),1.6,.12,.3,trim);box(wx,wy,z+side*(w/2+.06),.055,1.6,.04,trim);}
 // Flat roofs, thick cornices and a stepped Deco silhouette.
 box(x,h+.14,z,depth+.35,.28,w+.55,trim);box(x-.4,h+.55,z,depth-.5,.8,w-.65,facade);
 box(x-2,h+.98,z,8,.15,w-3,accent);box(x-3,h+1.25,z-w*.24,2,.65,2,mat('roof','#6c7778'));
 for(let f=1;f<Math.floor(h/3);f++){let y=f*3.0+.45;box(front+.25,y,z,.7,.21,w+.3,trim);box(front+.3,y-.25,z,.55,.11,w+.1,accent);if(i%3===0)box(front+.62,y+.12,z,.025,.045,w-.5,glow);}
 // Recessed window bays; lintels, mullions, curtain silhouettes and projecting eyebrows.
 for(let f=0;f<Math.floor((h-3)/2.9);f++)for(let a=0;a<Math.floor(w/3);a++){
 let wz=z-w/2+1.8+a*3,wy=4.7+f*2.9;if(Math.abs(wz-z)<2.15)continue;
 box(front+.03,wy,wz,.13,1.78,1.8,accent);let wm=windowLit[random()<.28?0:random()<.45?1:2];box(front+.11,wy,wz,.08,1.52,1.57,wm);
 box(front+.18,wy,wz,.09,1.54,.055,trim);box(front+.18,wy-.12,wz,.09,.055,1.57,trim);box(front+.35,wy+1.0,wz,.9,.14,2.1,trim);box(front+.29,wy-.92,wz,.6,.13,1.94,trim);
 if(wm===windowLit[0]){box(front+.17,wy,wz-.6,.03,1.5,.28,mat('curtain','#a9977e'));box(front+.17,wy,wz+.59,.03,1.5,.28,materials.curtain);}
 }
 // Distinctive central pylons, fluting and architectural lettering.
 if(i%3!==1){box(front+.45,h*.61,z,1,h*.83,3.65,facade);box(front+.8,h+1.35,z,.8,1.8,2.55,facade);box(front+1.05,h+2.4,z,.5,.35,1.5,trim);
 for(let off of [-1.6,-1.36,1.36,1.6])box(front+1.0,h*.62,z+off,.08,h*.7,.075,trim);
 for(let off of [-1.1,1.1])box(front+1.025,h*.64,z+off,.035,h*.68,.035,glow);
 }
 // Broad glass lobby and shaded cafe terrace.
 for(let a=0;a<Math.floor(w/3);a++){let wz=z-w/2+1.5+a*3;box(front+.05,1.6,wz,.1,2.6,2.5,glass);box(front+.13,1.6,wz+1.24,.1,2.8,.12,bronze);box(front+.1,2.7,wz,.12,.06,2.5,amber);}
 box(front+1.15,3.05,z,2.5,.25,w-.9,trim);box(front+2.2,2.9,z,.1,.3,w-1.2,accent);
 for(let off of [-w/2+1,w/2-1]){cyl(front+1.75,1.5,z+off,.13,.15,3,trim);box(front+1.9,1.5,z+off,.03,1.65,.05,glow);}
 // Shadowed balconies, brass railings and decorative relief make each frontage distinct.
 if(i%3===0){for(let floor=0;floor<Math.floor((h-4)/3);floor++)for(let side of [-1,1]){let by=3.5+floor*3,bz=z+side*w*.30;box(front+.9,by,bz,1.7,.18,3.1,trim);box(front+1.72,by+.70,bz,.05,.05,3.05,bronze);for(let j=-3;j<=3;j++)box(front+1.72,by+.4,bz+j*.45,.035,.65,.035,bronze);}}
 if(i%3===1){for(let side of [-1,1]){let bz=z+side*w*.31;box(front+.12,h*.56,bz,.18,h*.75,2.5,accent);for(let j=-1;j<=1;j++)box(front+.26,h*.56,bz+j*.55,.12,h*.74,.1,trim);}}
 if(i%4===2){for(let j=-2;j<=2;j++){box(front+.8,h-1.2,z+j*.65,.28,2.3-Math.abs(j)*.5,.13,trim);}sign('HOTEL',front+1.07,h*.8,z,3.2,neon,.9);}
 // Shallow curved portico, illuminated door recess and restrained terrazzo entry.
 box(front+1.4,.17,z,3.2,.18,3.1,accent);box(front+.18,1.65,z,.15,2.7,2.0,windowLit[0]);box(front+.3,1.65,z,.1,2.7,.07,bronze);
 if(i%2===1){for(let k=-1;k<=1;k++){let az=z+k*w*.28;box(front+1.6,2.65,az,2.8,.13,4,accent);for(let stripe=-3;stripe<=3;stripe++)box(front+1.6,2.73,az+stripe*.53,2.8,.02,.22,cream);box(front+2.95,2.45,az,.06,.42,4,accent);}}
 let signY=i%3===1?h-.8:7.65;
 sign(name,front+1.09,signY,z,w*.78,neon,i%3===1?1.8:1.5);
 sign(i%2?'HOTEL  ·  OCEAN DRIVE':'SOUTH BEACH  ·  MIAMI',front+1.12,signY-.95,z,8.3,'#e8d4b6',.62,true);
 if(i===0){ // A projecting blade sign makes the first pass unmistakably Ocean Drive.
 box(front+1.1,h-.8,z-w/2+.65,1.7,7,1.05,accent);
 for(let n=0;n<6;n++){sign('COLONY'[n],front+2.0,h+1.9-n*.94,z-w/2+.65,1.0,neon,1.07);sign('COLONY'[n],front+1.1,h+1.9-n*.94,z-w/2+1.19,1.1,neon,1.07,false,null,0);}
 box(front+2,h-.8,z-w/2+.04,.04,7,.035,glow);box(front+2,h-.8,z-w/2+1.24,.04,7,.035,glow);
 }
 // Corner streamline drums and rails, different profiles per hotel.
 if(i%3===1){for(let f=1;f<4;f++){cyl(front-.1,f*3-.3,z+w/2-2.5,2,2,.25,trim);cyl(front-.1,f*3+.2,z+w/2-2.5,1.72,1.72,.65,accent);}}
 if(i%4===2){for(let f=0;f<3;f++){box(front+.25,h+f*.8,z,1.5-f*.25,.6,7-f*1.5,facade);box(front+1,h+f*.8,z,.03,.05,6.5-f*1.5,glow);}}
 hotelLights.push({x:front+2.4,y:4,z,color:neon});
 // Cafe tables and striped umbrellas, each actually modeled.
 for(let k=-1;k<=1;k++){let tz=z+k*(w*.28);cyl(-12.8,.76,tz,.65,.65,.08,mat('table','#b6a38c',.42));cyl(-12.8,.42,tz,.05,.07,.8,bronze);
 for(let side of [-1,1]){box(-12.8,.43,tz+side*.88,.46,.06,.44,bronze);box(-13,.72,tz+side*.88,.06,.55,.44,bronze);for(let dx of [-.17,.17])for(let dz of [-.17,.17])cyl(-12.8+dx,.22,tz+side*.88+dz,.018,.02,.42,bronze);}
 if(k!==0){cyl(-12.8,1.5,tz,.035,.035,2.9,bronze);let umbrella=new THREE.ConeGeometry(1.5,.55,10,1,true);addGeo(umbrella,i%2?cream:accent,-12.8,2.95,tz);}
 }
});

// Distant continuation prevents the district from ending at the flight's vanishing point.
 for(let i=0;i<28;i++){let z=-550-i*25,h=11+(i%4)*2;let fm=[cream,stucco,trim][i%3];box(-24,h/2,z,14,h,22,fm);box(-16.7,h,z,.6,.25,22,trim);for(let floor=1;floor<4;floor++){box(-16.7,floor*3,z,.6,.14,22,trim);for(let j=-3;j<=3;j++)box(-16.91,1.7+floor*3,z+j*2.7,.12,1.5,1.3,windowLit[(i+j+6)%3]);}}
 // Palm geometry: tapered, leaning trunks and dozens of separate curved leaflets per frond.
function trunkTexture(){let c=document.createElement('canvas');c.width=128;c.height=512;let ctx=c.getContext('2d');ctx.fillStyle='#8c8574';ctx.fillRect(0,0,128,512);for(let j=0;j<512;j++){let v=70+random()*30;ctx.fillStyle=`rgba(${v},${v*.9},${v*.7},.32)`;ctx.fillRect(0,j,128,1);}for(let j=0;j<512;j+=23){ctx.strokeStyle='#514f43';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,j);ctx.bezierCurveTo(40,j+7,90,j-4,128,j+3);ctx.stroke();}let t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,3);t.colorSpace=THREE.SRGBColorSpace;return t;}
const trunkMat=mat('trunk','#9f9a81',1);trunkMat.map=trunkTexture();
const leafMat=new THREE.MeshStandardMaterial({color:'#b9c29d',roughness:.82,side:THREE.DoubleSide});
leafMat.onBeforeCompile=shader=>{shader.uniforms.uTime=clockUniform;shader.vertexShader='uniform float uTime;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
float wind=sin(uTime*.85+position.z*.13+position.x*.35)+.4*sin(uTime*1.7+position.z*.4);transformed.x+=wind*.13*max(position.y-4.,0.);transformed.z+=sin(uTime*.7+position.x*.4)*.055*max(position.y-4.,0.);`);};
let leafPositions=[],leafColors=[];
function leafTri(a,b,c,col){leafPositions.push(...a,...b,...c);for(let k=0;k<3;k++)leafColors.push(col.r,col.g,col.b);}
function palm(x,z,height,lean=1){let angle=range(0,TAU),dx=Math.cos(angle)*lean,dz=Math.sin(angle)*lean;let pts=[];for(let j=0;j<=9;j++){let t=j/9;pts.push(new THREE.Vector3(x+dx*t*t,height*t,z+dz*t*t));}
 const curve=new THREE.CatmullRomCurve3(pts);let trunk=new THREE.TubeGeometry(curve,18,.17,8,false);let pos=trunk.attributes.position;for(let j=0;j<pos.count;j++){let y=pos.getY(j),t=Math.max(0,y/height),p=curve.getPoint(t);let s=1.3-.55*t;pos.setXYZ(j,p.x+(pos.getX(j)-p.x)*s,y,p.z+(pos.getZ(j)-p.z)*s);}trunk.computeVertexNormals();addGeo(trunk,trunkMat);let top=pts[9];sphere(top.x,top.y,top.z,.25,mat('crown','#697441'));
 for(let f=0;f<12;f++){let a=f*TAU/12+range(-.15,.15),L=range(3.1,4.6),rise=range(.5,1.75),drop=range(1.1,2.7);if(f>8){L*=.72;rise+=1.3;drop*=.6;}let forward=new THREE.Vector3(Math.cos(a),0,Math.sin(a)),side=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));let at=t=>top.clone().addScaledVector(forward,L*t).add(new THREE.Vector3(0,rise*Math.sin(t*Math.PI*.9)-drop*t*t,0));let spine=[];for(let j=0;j<8;j++)spine.push(at(j/7).toArray());line(spine,.018,mat('stem','#6b7b47'));
 for(let j=1;j<27;j++){let t=j/28,p=at(t),len=(Math.sin(t*Math.PI)*.7+.1)*(1-t*.38);for(let sign of [-1,1]){let end=p.clone().addScaledVector(side,len*sign).addScaledVector(forward,.20+len*.26);end.y-=.15+len*.38+t*.18;let mid=p.clone().lerp(end,.48);mid.y+=.07;let w=.068*(1-t*.5);let c=new THREE.Color('#557943').multiplyScalar(range(.7,1.45));leafTri(p.clone().addScaledVector(forward,-w).toArray(),mid.clone().addScaledVector(forward,-w*.7).toArray(),end.toArray(),c);leafTri(p.clone().addScaledVector(forward,-w).toArray(),end.toArray(),mid.clone().addScaledVector(forward,w).toArray(),c);leafTri(p.clone().addScaledVector(forward,-w).toArray(),mid.clone().addScaledVector(forward,w).toArray(),p.clone().addScaledVector(forward,w).toArray(),c);}}
 }
}
for(let z=38;z>-530;z-=13.7){palm(10.7+range(-.6,.8),z+range(-2,2),range(8.3,11.8),range(.4,1.6));if(Math.floor(z)%3!==0)palm(-9.6,z-4,range(8.5,11),range(.4,1));}
for(let z=42;z>-530;z-=22){palm(range(22,35),z,range(8,12.5),range(.8,2));palm(range(43,49),z-9,range(7,10.5),range(1,2));}
for(let z=-555;z>-1000;z-=38){palm(10.8,z,10,1);palm(-9.6,z-11,9,1);palm(33,z-18,11,1.4);}
let leaves=new THREE.BufferGeometry();leaves.setAttribute('position',new THREE.Float32BufferAttribute(leafPositions,3));leaves.setAttribute('color',new THREE.Float32BufferAttribute(leafColors,3));leaves.computeVertexNormals();leafMat.vertexColors=true;let leafMesh=new THREE.Mesh(leaves,leafMat);leafMesh.castShadow=true;world.add(leafMesh);

// Park furniture, sea oats, paths, and warm pools beneath period street lanterns.
const lampLocations=[];
for(let z=30;z>-900;z-=27){for(let x of [-8.5,8.7]){cyl(x,2.5,z,.065,.11,5,bronze);cyl(x,.2,z,.25,.31,.4,bronze);cyl(x,4.7,z,.14,.08,.24,bronze);sphere(x,5.03,z,.24,amber);cyl(x,5.32,z,.07,.18,.15,bronze);lampLocations.push({x,y:5,z});}}
for(let z=15;z>-530;z-=34){box(19,.6,z,1.7,.1,.48,mat('bench','#645447'));box(19,.94,z+.25,1.7,.55,.09,materials.bench);for(let dx of [-.6,.6])box(19+dx,.3,z,.07,.6,.5,bronze);cyl(17.2,.5,z-1.3,.28,.28,1,mat('bin','#3e514a'));}
for(let j=0;j<1600;j++){let x=range(43,54),z=range(-550,80),h=range(.15,.7);let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([x-.035,0,z,x+.035,0,z,x+range(-.2,.2),h,z+.1],3));g.computeVertexNormals();addGeo(g,mat('oat','#778265'));}

// Classic cars: curved fenders, elongated hoods, whitewalls, chrome and actual glazing.
const cars=[];
function car(x,z,color,direction=1,moving=false,convertible=false){const group=new THREE.Group();group.position.set(x,.08,z);if(direction<0)group.rotation.y=Math.PI;world.add(group);const paint=new THREE.MeshPhysicalMaterial({color,metalness:.5,roughness:.24,clearcoat:1,clearcoatRoughness:.15});
 const bodyGeo=new THREE.BufferGeometry(),bodyV=[],bodyI=[];for(let j=0;j<=48;j++){let zz=-2.36+j/48*4.72;let profile=.78+.20*Math.pow(Math.max(0,1-Math.pow(zz/2.5,4)),.4);let fender=.07*(Math.exp(-Math.pow((zz-1.43)*3,2))+Math.exp(-Math.pow((zz+1.43)*3,2)));for(let k=0;k<=24;k++){let a=k/24*TAU;let xx=Math.sign(Math.cos(a))*Math.pow(Math.abs(Math.cos(a)),.48)*(profile+fender);let yy=.65+Math.sign(Math.sin(a))*Math.pow(Math.abs(Math.sin(a)),.65)*.29;bodyV.push(xx,yy,zz);if(j<48&&k<24){let n=j*25+k;bodyI.push(n,n+25,n+1,n+1,n+25,n+26);}}}bodyGeo.setAttribute('position',new THREE.Float32BufferAttribute(bodyV,3));bodyGeo.setIndex(bodyI);bodyGeo.computeVertexNormals();addGeo(bodyGeo,paint,0,0,0,0,0,0,group);roundBox(0,.97,-1.17,1.75,.29,2.05,.13,paint,group);roundBox(0,.91,1.7,1.77,.25,1.0,.12,paint,group);
 // The cabin is a genuine sloped trapezoid instead of an opaque toy-like box.
 const cabin=new THREE.BufferGeometry(),verts=[-.76,1,-.66,.76,1,-.66,-.64,1.62,-.2,.64,1.62,-.2,-.64,1.62,1.1,.64,1.62,1.1,-.76,1,1.5,.76,1,1.5];cabin.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));cabin.setIndex([0,1,2,2,1,3,2,3,4,4,3,5,4,5,6,6,5,7,0,2,6,6,2,4,1,7,3,3,7,5]);cabin.computeVertexNormals();if(!convertible)addGeo(cabin,glass,0,0,0,0,0,0,group);else{let windshield=new THREE.BufferGeometry();windshield.setAttribute('position',new THREE.Float32BufferAttribute(verts.slice(0,12),3));windshield.setIndex([0,1,2,2,1,3]);windshield.computeVertexNormals();addGeo(windshield,glass,0,0,0,0,0,0,group);}
 for(let side of [-1,1]){roundBox(side*.42,1.08,.6,.62,.32,.55,.12,mat('seat','#453b32',.8),group);roundBox(side*.42,1.27,.87,.62,.5,.15,.08,materials.seat,group);}
 if(!convertible)roundBox(0,1.65,.45,1.37,.10,1.45,.06,mat('roof'+color,'#d6d6cb',.45),group);
 for(let s of [-1,1]){line([[s*.76,1,-.66],[s*.64,1.62,-.2],[s*.64,1.62,1.1],[s*.76,1,1.5]],.025,chrome,group);line([[s*.78,1,-.66],[s*.8,1,1.5]],.025,chrome,group);line([[s*.68,1.6,.6],[s*.78,1,.65]],.026,chrome,group);box(s*.915,.79,0,.02,.035,4.1,chrome,group);box(s*.93,.91,.52,.04,.045,.26,chrome,group);sphere(s*.98,1.1,-.49,.10,chrome,group);
 for(let zz of [-1.43,1.43]){let tire=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.22,24),rubber);tire.rotation.z=Math.PI/2;tire.position.set(s*.87,.43,zz);group.add(tire);let ww=new THREE.Mesh(new THREE.TorusGeometry(.30,.065,8,24),trim);ww.rotation.y=Math.PI/2;ww.position.set(s*1.0,.43,zz);group.add(ww);let hub=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.025,20),chrome);hub.rotation.z=Math.PI/2;hub.position.set(s*1.02,.43,zz);group.add(hub);
 // Wheel arches darken the recess above each whitewall.
 let arch=new THREE.Mesh(new THREE.TorusGeometry(.43,.045,6,18,Math.PI),chrome);arch.rotation.y=Math.PI/2;arch.position.set(s*.955,.43,zz);group.add(arch);}
 }
 roundBox(0,.44,-2.38,1.92,.16,.15,.05,chrome,group);roundBox(0,.46,2.37,1.9,.14,.13,.05,chrome,group);box(0,.68,-2.34,.84,.3,.04,dark,group);for(let j=-4;j<=4;j++)box(j*.095,.68,-2.37,.025,.26,.028,chrome,group);
 for(let xx of [-.67,.67]){sphere(xx,.79,-2.29,.15,amber,group);sphere(xx*.67,.79,-2.32,.105,amber,group);box(xx,.8,2.33,.26,.16,.04,red,group);}
 box(0,.46,2.46,.37,.16,.015,trim,group);box(0,.44,-2.48,.36,.15,.015,trim,group);
 // Twin warm headlight footprints on the wet roadway.
 const beamMat=new THREE.MeshBasicMaterial({map:beamTexture,transparent:true,opacity:.23,depthWrite:false,blending:THREE.AdditiveBlending,color:'#ffe4b8'});
 for(let xx of [-.68,.68])plane(xx,.025,-7.8,2.9,11,beamMat,0,-Math.PI/2,group);
 // Consolidate the many small car parts into material batches.
 group.updateMatrixWorld(true);let carBins=new Map();for(const child of [...group.children]){if(!child.isMesh)continue;let g=child.geometry.clone().applyMatrix4(moving?child.matrix:child.matrixWorld);if(g.index)g=g.toNonIndexed();let key=child.material.uuid;if(!carBins.has(key))carBins.set(key,{m:child.material,g:[]});carBins.get(key).g.push(g);group.remove(child);child.geometry.dispose();}
 for(const {m,g} of carBins.values()){let merged=mergeGeometries(g,false);if(moving){let mesh=new THREE.Mesh(merged,m);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}else{let key=m.uuid+':'+Math.floor(z/70);if(!bins.has(key))bins.set(key,{m,g:[]});bins.get(key).g.push(merged);}}
 cars.push({group,x,z,direction,moving,speed:range(2,3.5)});return group;
}
let bc=document.createElement('canvas');bc.width=128;bc.height=256;let bctx=bc.getContext('2d'),beamPixels=bctx.createImageData(128,256);for(let y=0;y<256;y++)for(let x=0;x<128;x++){let t=y/255,dx=(x-64)/64,spread=.18+.82*t;let intensity=Math.exp(-dx*dx/(spread*spread)*5)*Math.sin(Math.PI*t)*Math.pow(1-t,.65);let j=(y*128+x)*4;beamPixels.data[j]=255;beamPixels.data[j+1]=244;beamPixels.data[j+2]=215;beamPixels.data[j+3]=intensity*185;}bctx.putImageData(beamPixels,0,0);const beamTexture=new THREE.CanvasTexture(bc);
const carColors=['#61bfc4','#d0b5a0','#941f35','#d9ddd2','#315365','#c5a162','#132d3b','#ce817d'];
for(let i=0;i<28;i++){let z=18-i*18.2;car(-6.65,z,carColors[i%8],i%3===0?-1:1,false,i%4===0);if(i%3===0)car(6.65,z-8,carColors[(i+3)%8],-1,false);}
car(3,-14,'#97c7c2',1,true,true);car(-3,-82,'#d0c8ad',-1,true);car(3,-160,'#942e3c',1,true);car(-3,-240,'#32656c',-1,true);car(3,-340,'#9aa4b2',1,true);
// A restrained number of live lights follows the camera, illuminating nearby architecture.
const practicals=Array.from({length:10},()=>{let light=new THREE.PointLight('#ffbd88',20,20,2);scene.add(light);return light;});

for(const {m,g} of bins.values()){let geo=mergeGeometries(g,false);if(!geo)throw Error('Geometry merge failed');let mesh=new THREE.Mesh(geo,m);mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh);for(const geom of g)geom.dispose();}bins.clear();

const envScene=new THREE.Scene();envScene.add(sky.clone());const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(envScene,.02,.1,3000).texture;scene.environmentIntensity=.7;pmrem.dispose();
 const composeTarget=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:4});const composer=new EffectComposer(renderer,composeTarget);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.40,.5,1.15);composer.addPass(bloom);
const film=new ShaderPass({uniforms:{tDiffuse:{value:null},time:clockUniform},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform float time;varying vec2 vUv;void main(){vec2 uv=vUv;vec3 c=texture2D(tDiffuse,uv).rgb;float vig=1.-.22*pow(length((uv-.5)*vec2(1.2,1.)),1.5);c*=vig;float n=fract(sin(dot(uv+fract(time)*.01,vec2(12.9898,78.233)))*43758.5453)-.5;c+=n*.004;gl_FragColor=vec4(c,1.);}`});composer.addPass(film);composer.addPass(new OutputPass());
let elapsed=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,last=performance.now(),duration=125,quality='high',clean=false;
const seek=$('#seek'),timeLabel=$('#time'),play=$('#play');
function setCamera(t){let u=t/duration;let z=40-450*u;let x=1.1+Math.sin(u*Math.PI*2)*.75;let y=5.5+Math.sin(u*Math.PI)*2.5;camera.position.set(x,y,z);let lookx=-3+Math.sin(u*Math.PI*2-.6)*5;camera.lookAt(lookx,y-.8,z-30);camera.rotateZ(Math.sin(u*Math.PI*2)*.006);sky.position.copy(camera.position);
 sun.position.set(-75+camera.position.x,65,camera.position.z+30);sun.target.position.set(camera.position.x,0,camera.position.z-25);
 let lights=[...hotelLights.map(p=>({...p,type:'hotel'})),...lampLocations.map(p=>({...p,type:'lamp'}))].sort((a,b)=>(Math.abs(a.z-z)+Math.abs(a.x-x)*.1)-(Math.abs(b.z-z)+Math.abs(b.x-x)*.1));
 practicals.forEach((l,i)=>{let p=lights[i];l.position.set(p.x,p.y,p.z);l.color.set(p.color||'#ffd09d');l.intensity=p.type==='hotel'?22:16;l.distance=p.type==='hotel'?18:13;});
}
function update(t){$('#transition').style.opacity=Math.max(0,1-t/1.3,(t-(duration-1.3))/1.3);clockUniform.value=t;setCamera(t);for(const car of cars){if(car.moving){let nz=car.z-t*car.speed*car.direction;car.group.position.z=((nz+570)%650+650)%650-570;}}
 seek.value=t/duration*100;timeLabel.textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;$('#alt').textContent=camera.position.y.toFixed(1)+' M';}
function render(){renderer.info.autoReset=false;renderer.info.reset();composer.render();}
function animate(now){requestAnimationFrame(animate);let dt=Math.min((now-last)/1000,.08);last=now;if(!paused&&!document.hidden){elapsed+=dt;if(elapsed>=duration)elapsed=0;update(elapsed);}render();} 
play.onclick=()=>{paused=!paused;play.textContent=paused?'▶':'Ⅱ';play.setAttribute('aria-label',paused?'Play flight':'Pause flight');};
seek.oninput=()=>{elapsed=Number(seek.value)/100*duration;update(elapsed);};
$('#restart').onclick=()=>{elapsed=0;update(0);};
$('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>{});};
$('#quality').onclick=()=>{quality=quality==='high'?'balanced':'high';renderer.setPixelRatio(quality==='high'?Math.min(devicePixelRatio,1.5):1);bloom.enabled=quality==='high';resize();$('#quality').textContent=quality==='high'?'HIGH':'BALANCED';};
function toggleUI(){clean=!clean;document.body.classList.toggle('clean',clean);}
$('#hide').onclick=toggleUI;addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'&&e.code==='Space')return;if(e.code==='Space'){e.preventDefault();play.click();}if(e.key.toLowerCase()==='h')toggleUI();if(e.key.toLowerCase()==='r')$('#restart').click();if(e.key.toLowerCase()==='f')$('#fullscreen').click();});
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}addEventListener('resize',resize);
window.oceanDrive={seek(t){elapsed=Math.max(0,Math.min(duration,t));paused=true;play.textContent='▶';update(elapsed);render();},play(){paused=false;},pause(){paused=true;},get stats(){return{time:elapsed,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,camera:camera.position.toArray(),quality};},render,scene,camera,renderer};
update(0);render();$('#loading').classList.add('done');window.sceneReady=true;requestAnimationFrame(animate);
