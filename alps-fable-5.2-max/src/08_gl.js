<script>
(()=>{'use strict';
// ───────────────────────── WebGL plumbing ─────────────────────────
const $=id=>document.getElementById(id),src=id=>$(id).textContent;
const canvas=$('c'),qs=new URLSearchParams(location.search);
const fail=msg=>{const e=$('err');e.style.display='block';e.textContent=msg;throw new Error(msg);};
const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:false,stencil:false,powerPreference:'high-performance'});
if(!gl) fail('This scene needs WebGL 2, which this browser does not provide.');
if(!gl.getExtension('EXT_color_buffer_float')&&!gl.getExtension('EXT_color_buffer_half_float'))
  fail('This scene needs floating-point render targets, which this GPU does not provide.');
const HDR='#version 300 es\nprecision highp float;precision highp int;precision highp sampler2D;\n';

function shader(type,code,name){
  const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    const log=gl.getShaderInfoLog(s)||'',lines=code.split('\n');
    const at=[...log.matchAll(/ERROR: \d+:(\d+)/g)].slice(0,8).map(m=>+m[1]);
    fail(name+' failed to compile\n\n'+log+'\n'+[...new Set(at)].map(n=>n+': '+lines[n-1]).join('\n'));
  }
  return s;
}
function program(vs,fs,name){
  const p=gl.createProgram();
  gl.attachShader(p,shader(gl.VERTEX_SHADER,vs,name+' vertex shader'));
  gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs,name+' fragment shader'));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) fail(name+' failed to link\n\n'+gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name]=gl.getUniformLocation(p,a.name);}
  return {p,u};
}
const world=src('g-common')+src('g-world'),sceneFS=world+src('g-near')+src('g-objects')+src('g-interior')+src('g-main');
const P={
  scene:program(HDR+world+src('v-scene'),HDR+sceneFS,'Scene'),
  pre:qs.has('nopre')?null:program(HDR+world+src('v-scene'),HDR+'#define PREPASS\n'+sceneFS,'Depth prepass'),
  comp:program(src('v-quad'),src('f-comp'),'Composite'),
  bright:program(src('v-quad'),HDR+src('g-expo')+src('f-bright'),'Bright pass'),
  adapt:program(src('v-quad'),src('f-adapt'),'Adaptation'),
  final:program(src('v-quad'),HDR+src('g-expo')+src('f-final'),'Final')
};

// procedural lookup textures (no image files): a random lattice with its neighbours packed per texel, and 4 random channels
function mulberry(seed){return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const N=256,rnd=mulberry(1907);
const base=new Uint8Array(N*N),hashD=new Uint8Array(N*N*4),noiseD=new Uint8Array(N*N*4);
for(let i=0;i<N*N;i++) base[i]=rnd()*256;
for(let i=0;i<N*N*4;i++) hashD[i]=rnd()*256;
for(let y=0;y<N;y++)for(let x=0;x<N;x++){
  const o=(y*N+x)*4,x1=(x+1)&255,y1=(y+1)&255;
  noiseD[o]=base[y*N+x];noiseD[o+1]=base[y*N+x1];noiseD[o+2]=base[y1*N+x];noiseD[o+3]=base[y1*N+x1];
}
function lut(data,filter){
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,N,N,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  return t;
}
const texNoise=lut(noiseD,gl.NEAREST),texHash=lut(hashD,gl.NEAREST),texSmooth=lut(hashD,gl.LINEAR);

// the route program, shared by the shaders (as a lookup texture) and the simulation
const PERIOD=4800,TUNNELS=[[3900,4500],[1750,2000]];
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const route={
  lake:xm=>smooth(260,560,xm)*(1-smooth(1440,1700,xm)),
  dense:xm=>smooth(2850,2980,xm)*(1-smooth(3330,3440,xm)),
  spur:xm=>230*smooth(3870,4070,xm)*(1-smooth(4330,4530,xm))+150*smooth(1720,1860,xm)*(1-smooth(1890,2030,xm)),
  gorge:xm=>1-smooth(0,105,Math.abs(xm-3570)),
  zv:xm=>450+95*Math.sin(2*Math.PI*xm/PERIOD+1)+45*Math.sin(6*Math.PI*xm/PERIOD)+150*route.lake(xm)
};
const texRoute=gl.createTexture();
{
  const n=4096,d=new Float32Array(n*4);
  for(let i=0;i<n;i++){const xm=(i+.5)/n*PERIOD;d.set([route.lake(xm)-route.dense(xm),route.spur(xm),route.gorge(xm),route.zv(xm)],i*4);}
  gl.bindTexture(gl.TEXTURE_2D,texRoute);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,n,1,0,gl.RGBA,gl.FLOAT,d);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}
// forest cover: three octaves of periodic value noise, tile = 2160 m
const texForest=gl.createTexture();
{
  const n=512,d=new Uint8Array(n*n*4);
  const vn=(x,y,per,sx,sy)=>{
    const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    const L=(i,j)=>base[((((i%per)+per)%per+sx)&255)+((((j%per)+per)%per+sy)&255)*N]/255;
    const a=L(xi,yi),b=L(xi+1,yi),c=L(xi,yi+1),e=L(xi+1,yi+1);
    return a+(b-a)*u+(c-a)*v+(a-b-c+e)*u*v;
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const u=(x+.5)/n,v=(y+.5)/n,o=(y*n+x)*4;
    d[o]=255*(.6*vn(u*8,v*8,8,3,7)+.28*vn(u*24,v*24,24,40,90)+.12*vn(u*72,v*72,72,120,30));
    d[o+1]=255*vn(u*8,v*8,8,77,151);d[o+2]=255*vn(u*144,v*144,144,9,60);d[o+3]=255;
  }
  gl.bindTexture(gl.TEXTURE_2D,texForest);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,n,n,0,gl.RGBA,gl.UNSIGNED_BYTE,d);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
}

function target(w,h,n,filter,mips,wrap){
  const f=gl.createFramebuffer(),t=[];gl.bindFramebuffer(gl.FRAMEBUFFER,f);
  for(let i=0;i<n;i++){
    const x=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,x);
    gl.texStorage2D(gl.TEXTURE_2D,mips?Math.floor(Math.log2(Math.max(w,h)))+1:1,gl.RGBA16F,w,h);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mips?gl.LINEAR_MIPMAP_LINEAR:filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,wrap||gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,wrap||gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,x,0);t.push(x);
  }
  gl.drawBuffers(t.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) fail('Could not create the render targets.');
  return {f,t,w,h};
}
const drop=T=>{if(T){T.t.forEach(x=>gl.deleteTexture(x));gl.deleteFramebuffer(T.f);}};
const adapt=[target(1,1,1,gl.NEAREST),target(1,1,1,gl.NEAREST)];
let adaptI=0,adaptReset=1;
const R={scene:null,pre:null,comp:null,bright:null,w:0,h:0};
let budget=(+qs.get('mp')||.75)*1e6;                       // pixels shaded per frame by the scene pass
function resize(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(2,Math.round(canvas.clientWidth*dpr)),ch=Math.max(2,Math.round(canvas.clientHeight*dpr));
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const s=Math.min(1,Math.sqrt(budget/(cw*ch)));
  const w=Math.max(32,Math.round(cw*s)),h=Math.max(32,Math.round(ch*s));
  if(w===R.w&&h===R.h) return;
  drop(R.scene);drop(R.pre);drop(R.comp);drop(R.bright);
  R.w=w;R.h=h;
  R.scene=target(w,h,2,gl.NEAREST);
  R.pre=target((w+1)>>1,(h+1)>>1,1,gl.NEAREST);
  R.comp=target(w,h,1,gl.LINEAR);
  R.bright=target(Math.max(2,w>>1),Math.max(2,h>>1),1,gl.LINEAR,true);
}
// bake the coarse mountain relief once
const BAKE=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));
const bake=target(BAKE,BAKE,1,gl.LINEAR,true,gl.REPEAT);
{
  const b=program(src('v-quad'),src('f-bake'),'Terrain bake');
  gl.useProgram(b.p);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texHash);
  gl.uniform1i(b.u.uHash,0);gl.uniform1f(b.u.uSize,BAKE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,bake.f);gl.viewport(0,0,BAKE,BAKE);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindTexture(gl.TEXTURE_2D,bake.t[0]);gl.generateMipmap(gl.TEXTURE_2D);
  gl.deleteProgram(b.p);
}
const bind=(unit,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);};
const draw=(T,w,h)=>{gl.bindFramebuffer(gl.FRAMEBUFFER,T?T.f:null);gl.viewport(0,0,T?T.w:w,T?T.h:h);gl.drawArrays(gl.TRIANGLES,0,3);};
