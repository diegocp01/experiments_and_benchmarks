
// ───────────────────────── the journey: track, carriage motion, camera ─────────────────────────
const TK1=2*Math.PI*2/PERIOD,TK2=2*Math.PI*5/PERIOD,TA1=105,TA2=26,TP1=.6,TP2=1.9;
const trackZ=x=>TA1*Math.sin(TK1*x+TP1)+TA2*Math.sin(TK2*x+TP2);
const trackD=x=>TA1*TK1*Math.cos(TK1*x+TP1)+TA2*TK2*Math.cos(TK2*x+TP2);
const SPEED=24,SHUTTER=1/48;                       // 86 km/h, 180-degree shutter at 24 fps
const EYE=[-.5,1.24,.8];                           // window seat, carriage space
const DEF={yaw:.38,pitch:-.09,fov:56*Math.PI/180},FOV_MIN=.3,FOV_MAX=1.45;
const norm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
// 3x3 matrices, column-major
const mul=(a,b)=>{const o=[];for(let c=0;c<3;c++)for(let r=0;r<3;r++)o[c*3+r]=a[r]*b[c*3]+a[3+r]*b[c*3+1]+a[6+r]*b[c*3+2];return o;};
const mv=(m,v)=>[m[0]*v[0]+m[3]*v[1]+m[6]*v[2],m[1]*v[0]+m[4]*v[1]+m[7]*v[2],m[2]*v[0]+m[5]*v[1]+m[8]*v[2]];
const tmv=(m,v)=>[m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]];
const rotX=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,c,s,0,-s,c];};
const rotY=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,1,0,s,0,c];};
const rotZ=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,-s,c,0,0,0,1];};
const SUN=norm([.62,.40,-.55]);

const sim={x:qs.has('x')?+qs.get('x'):4350,t:qs.has('t')?+qs.get('t'):0,paused:qs.has('pause'),frame:0};
const view={yaw:DEF.yaw,pitch:DEF.pitch,fov:DEF.fov,tyaw:DEF.yaw,tpitch:DEF.pitch,tfov:DEF.fov,idle:0,home:true,vy:0,vp:0};
for(const k of['yaw','pitch','fov']) if(qs.has(k)){view[k]=view['t'+k]=+qs.get(k)*Math.PI/180;view.home=false;view.idle=-1e9;}

// carriage sway: slow roll and hunting, plus a small kick at every rail joint
function sway(t,x){
  const j=((x%18)+18)%18/SPEED,jolt=Math.exp(-9*j)*Math.sin(46*j);
  return{
    roll:.0075*Math.sin(1.9*t+.3)+.0045*Math.sin(3.1*t+1.3)+.003*Math.sin(.71*t)+.0012*jolt,
    yaw:.0022*Math.sin(1.3*t+.4)+.0013*Math.sin(2.7*t+2),
    pitch:.001*Math.sin(2.1*t+.3)+.0006*jolt,
    lat:.016*Math.sin(1.1*t+2)+.008*Math.sin(2.3*t+.7),
    bounce:.005*Math.sin(5.3*t)+.003*Math.sin(7.9*t+1)+.004*jolt
  };
}
function carPose(x,t){
  const th=Math.atan(trackD(x)),c=Math.cos(th),s=Math.sin(th),sw=sway(t,x);
  const lat=sw.lat+1.1*sw.roll;                                 // rolls about rail level
  const rot=mul([c,0,s,0,1,0,-s,0,c],mul(rotX(sw.roll),mul(rotY(sw.yaw),rotZ(sw.pitch))));
  return{rot,pos:[x-s*lat,1.1+sw.bounce,trackZ(x)+c*lat],sw,th};
}
// the passenger's head rides the motion loosely: it lags and partly cancels the carriage
function camPose(t,sw){
  const eye=[EYE[0]+.004*Math.sin(.9*t+1),EYE[1]+.003*Math.sin(1.7*t)-.3*sw.bounce,EYE[2]+.006*Math.sin(1.2*t+.5)-.25*sw.lat];
  const yaw=view.yaw-.4*sw.yaw+.0015*Math.sin(.6*t),pitch=view.pitch+.001*Math.sin(.83*t+2);
  const roll=-.45*sw.roll+.002*Math.sin(.5*t+1);
  const cp=Math.cos(pitch),f=[Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp];
  const r0=norm([-f[2],0,f[0]]),u0=cross(r0,f),cr=Math.cos(roll),sr=Math.sin(roll);
  const r=[r0[0]*cr+u0[0]*sr,r0[1]*cr+u0[1]*sr,r0[2]*cr+u0[2]*sr],u=cross(r,f);
  return{eye,rot:[...r,...u,...f]};
}
function nearestTunnel(x){
  const k=Math.floor(x/PERIOD);let best={a:-1e6,b:-1e6+1,depth:-1e9};
  for(const dk of[-1,0,1])for(const[a,b]of TUNNELS){
    const a0=(k+dk)*PERIOD+a,b0=(k+dk)*PERIOD+b;
    const depth=x<a0?x-a0:x>b0?b0-x:Math.min(x-a0,b0-x);        // positive inside, negative outside
    if(depth>best.depth) best={a:a0,b:b0,depth};
  }
  return best;
}
function village(x){
  const k=Math.floor(x/PERIOD),xm=x-k*PERIOD;
  if(xm>1900&&xm<3600){const cx=k*PERIOD+2450;return{v:[cx,-30,trackZ(cx)+100,1],r:[86,31,3]};}
  const cx=(xm>=3600?k+1:k)*PERIOD+1050;
  return{v:[cx,-119,trackZ(cx)+route.zv(1050)-290-98,1],r:[96,33,11]};
}

// ───────────────────────── input: drag to look, wheel / pinch to zoom, drift home when left alone ─────────────────────────
const pts=new Map();let pinch=0,lastMove=0;
const touched=()=>{view.idle=0;view.home=false;};
const spread=()=>{const[a,b]=[...pts.values()];return Math.hypot(a[0]-b[0],a[1]-b[1]);};
canvas.addEventListener('pointerdown',e=>{
  try{canvas.setPointerCapture(e.pointerId);}catch(_){}
  pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pts.size===2) pinch=spread();
  view.vy=view.vp=0;lastMove=performance.now();canvas.classList.add('drag');touched();
});
canvas.addEventListener('pointermove',e=>{
  const p=pts.get(e.pointerId);if(!p) return;
  const dx=e.clientX-p[0],dy=e.clientY-p[1];pts.set(e.pointerId,[e.clientX,e.clientY]);touched();
  if(pts.size===1){
    const k=2*Math.tan(view.fov/2)/canvas.clientHeight,now=performance.now(),dt=Math.max(.004,(now-lastMove)/1000);lastMove=now;
    view.tyaw+=dx*k;view.tpitch=clamp(view.tpitch+dy*k,-1.45,1.45);
    view.vy=.6*view.vy+.4*dx*k/dt;view.vp=.6*view.vp+.4*dy*k/dt;
  }else if(pts.size===2){
    const d=spread();if(pinch>0&&d>0) view.tfov=clamp(view.tfov*pinch/d,FOV_MIN,FOV_MAX);pinch=d;
  }
});
const release=e=>{
  pts.delete(e.pointerId);pinch=0;
  if(!pts.size){canvas.classList.remove('drag');if(performance.now()-lastMove>90) view.vy=view.vp=0;}
  touched();
};
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
canvas.addEventListener('wheel',e=>{
  e.preventDefault();
  view.tfov=clamp(view.tfov*Math.exp(e.deltaY*(e.ctrlKey?.01:.0012)),FOV_MIN,FOV_MAX);touched();
},{passive:false});
canvas.addEventListener('dblclick',()=>{view.idle=1e3;});
for(const g of['gesturestart','gesturechange','gestureend']) document.addEventListener(g,e=>e.preventDefault());
canvas.addEventListener('contextmenu',e=>e.preventDefault());

function updateView(dt){
  view.idle+=dt;
  if(!pts.size){
    view.tyaw+=view.vy*dt;view.tpitch=clamp(view.tpitch+view.vp*dt,-1.45,1.45);
    const f=Math.exp(-dt*5.5);view.vy*=f;view.vp*=f;
    if(view.idle>3.5&&!view.home){                               // ease back to the window
      const k=1-Math.exp(-dt*1.7*smooth(3.5,5,view.idle));
      let dy=DEF.yaw-view.tyaw;dy-=Math.round(dy/(2*Math.PI))*2*Math.PI;
      view.tyaw+=dy*k;view.tpitch+=(DEF.pitch-view.tpitch)*k;view.tfov+=(DEF.fov-view.tfov)*k;
      if(Math.abs(dy)<2e-4&&Math.abs(DEF.pitch-view.tpitch)<2e-4&&Math.abs(DEF.fov-view.tfov)<2e-4) view.home=true;
    }
  }
  const s=1-Math.exp(-dt*16);
  view.yaw+=(view.tyaw-view.yaw)*s;view.pitch+=(view.tpitch-view.pitch)*s;view.fov+=(view.tfov-view.fov)*s;
}

// ───────────────────────── frame ─────────────────────────
const perf={sum:0,n:0,ok:0,cap:Math.max(budget,1.7e6),up:false,fixed:qs.has('mp')};
function tune(ms){                                               // keep the frame rate by trading resolution
  if(perf.fixed||ms>100||sim.t<1.5) return;                      // ignore hitches, throttled tabs and start-up
  perf.sum+=ms;if(++perf.n<40) return;
  const avg=perf.sum/perf.n;perf.sum=perf.n=0;
  if(avg>21.5){if(perf.up) perf.cap=budget*.9;budget=Math.max(1.4e5,budget*(avg>32?.68:.84));perf.ok=0;perf.up=false;}
  else if(avg<17.6){perf.up=false;if(++perf.ok>=3&&budget<perf.cap*.99){budget=Math.min(perf.cap,budget*1.12);perf.ok=0;perf.up=true;}}
  else{perf.ok=0;perf.up=false;}
}
function render(dt){
  resize();
  const car=carPose(sim.x,sim.t),cam=camPose(sim.t,car.sw);
  const xp=sim.x-SPEED*SHUTTER/Math.hypot(1,trackD(sim.x));
  const carP=carPose(xp,sim.t-SHUTTER),camP=camPose(sim.t-SHUTTER,carP.sw);
  const tun=nearestTunnel(sim.x),vil=village(sim.x),tf=Math.tan(view.fov/2);
  let s;
  const sceneUniforms=()=>{
    bind(0,texNoise);bind(1,texHash);bind(2,texSmooth);bind(3,bake.t[0]);bind(4,texRoute);bind(5,texForest);
    gl.uniform1i(s.u.uNoise,0);gl.uniform1i(s.u.uHash,1);gl.uniform1i(s.u.uSmooth,2);gl.uniform1i(s.u.uBake,3);
    gl.uniform1i(s.u.uRoute,4);gl.uniform1i(s.u.uForest,5);gl.uniform1i(s.u.uPre,6);
    gl.uniform2f(s.u.uRes,R.w,R.h);gl.uniform1f(s.u.uTime,sim.t);gl.uniform1f(s.u.uTanFov,tf);
    gl.uniform3fv(s.u.uSun,SUN);gl.uniform3fv(s.u.uSunC,tmv(car.rot,SUN));
    gl.uniform1f(s.u.uBlur,SPEED*SHUTTER);gl.uniform2f(s.u.uFwd,Math.cos(car.th),Math.sin(car.th));
    gl.uniform2f(s.u.uTun,tun.a,tun.b);gl.uniform1f(s.u.uTrainX,sim.x);
    gl.uniform4fv(s.u.uVil,vil.v);gl.uniform3fv(s.u.uVilR,vil.r);
    gl.uniform1f(s.u.uDay,1-smooth(-5,13,tun.depth));
    gl.uniform3fv(s.u.uCarPos,car.pos);gl.uniformMatrix3fv(s.u.uCarRot,false,car.rot);
    gl.uniform3fv(s.u.uCamPos,cam.eye);gl.uniformMatrix3fv(s.u.uCamRot,false,cam.rot);
  };
  bind(6,null);
  if(P.pre){s=P.pre;gl.useProgram(s.p);sceneUniforms();gl.uniform1f(s.u.uPreOn,0);draw(R.pre);}
  s=P.scene;gl.useProgram(s.p);sceneUniforms();
  bind(6,P.pre?R.pre.t[0]:null);gl.uniform1f(s.u.uPreOn,P.pre?1:0);
  draw(R.scene);

  s=P.comp;gl.useProgram(s.p);bind(0,R.scene.t[0]);bind(1,R.scene.t[1]);
  gl.uniform1i(s.u.uExt,0);gl.uniform1i(s.u.uInt,1);
  gl.uniform2f(s.u.uRes,R.w,R.h);gl.uniform1f(s.u.uTanFov,tf);
  gl.uniform1f(s.u.uMaxBlur,R.w*.05);gl.uniform1f(s.u.uJit,(sim.frame%64)*7.31);
  gl.uniform3fv(s.u.uCamW,add(car.pos,mv(car.rot,cam.eye)));gl.uniform3fv(s.u.uPrevCamW,add(carP.pos,mv(carP.rot,camP.eye)));
  gl.uniformMatrix3fv(s.u.uBasis,false,mul(car.rot,cam.rot));gl.uniformMatrix3fv(s.u.uPrevBasis,false,mul(carP.rot,camP.rot));
  draw(R.comp);

  const key=+qs.get('key')||.15;
  s=P.bright;gl.useProgram(s.p);bind(0,R.comp.t[0]);bind(1,adapt[adaptI].t[0]);
  gl.uniform1i(s.u.uSrc,0);gl.uniform1i(s.u.uAdapt,1);gl.uniform1f(s.u.uKey,key);
  gl.uniform2f(s.u.uResB,R.bright.w,R.bright.h);
  draw(R.bright);
  bind(0,R.bright.t[0]);gl.generateMipmap(gl.TEXTURE_2D);

  s=P.adapt;gl.useProgram(s.p);bind(0,R.bright.t[0]);bind(1,adapt[adaptI].t[0]);
  gl.uniform1i(s.u.uBright,0);gl.uniform1i(s.u.uPrev,1);
  gl.uniform1f(s.u.uDt,dt);gl.uniform1f(s.u.uReset,adaptReset);
  draw(adapt[1-adaptI]);adaptI=1-adaptI;adaptReset=0;

  s=P.final;gl.useProgram(s.p);bind(0,R.comp.t[0]);bind(1,R.bright.t[0]);bind(2,adapt[adaptI].t[0]);
  gl.uniform1i(s.u.uSrc,0);gl.uniform1i(s.u.uBright,1);gl.uniform1i(s.u.uAdapt,2);gl.uniform1f(s.u.uKey,key);
  gl.uniform2f(s.u.uOut,canvas.width,canvas.height);gl.uniform1f(s.u.uTime,sim.t+sim.frame*.618);gl.uniform1f(s.u.uBloom,+qs.get('bloom')||.4);
  draw(null,canvas.width,canvas.height);
  sim.frame++;
}
let last=0;
function step(dt){
  sim.t+=dt;
  sim.x+=SPEED*dt/Math.hypot(1,trackD(sim.x));
  if(sim.x>8*PERIOD+4200) sim.x-=8*PERIOD;                        // loop the route, unseen, deep inside the long tunnel
}
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  if(!sim.paused){step(dt);if(!document.hidden) tune(dt*1000);}
  updateView(dt);
  render(sim.paused?0:dt);
}
window.__alps={sim,view,render,step,updateView,gl,canvas,R,get budget(){return budget;},set budget(v){budget=v;}};   // handle for inspection from the console
requestAnimationFrame(t=>{last=t;frame(t);const h=$('hud');h.classList.add('on');setTimeout(()=>h.classList.remove('on'),9000);});
})();
</script>
</body>
</html>
