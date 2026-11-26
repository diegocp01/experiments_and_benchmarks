<script id="g-objects" type="x-shader/x-fragment">
// ───────────────────────── villages, the old stone viaduct, object shadows, world compositor ─────────────────────────
uniform vec4 uVil;    // village centre x, base y, centre z, enabled
uniform vec3 uVilR;   // half extents (x,z) and seed
const float CELL=22.;
const float OV_Z=175.,OV_Y=-36.,OV_L=132.;

#define CLIP(N,c) {float dn=dot(N,d),ds=(c)-dot(N,o);if(abs(dn)<1e-6){if(ds<0.)return -1.;}else{float tt=ds/dn;if(dn<0.){if(tt>tn){tn=tt;n=N;}}else tf=min(tf,tt);}}
// ray vs convex building: box clipped by roof planes (kx/kz pitch, Hx/Hz apex heights)
float hull(vec3 o,vec3 d,vec3 hs,float kx,float Hx,float kz,float Hz,out vec3 n){
  float tn=-1e9,tf=1e9;n=vec3(0.,1.,0.);
  CLIP(vec3(1.,0.,0.),hs.x) CLIP(vec3(-1.,0.,0.),hs.x)
  CLIP(vec3(0.,0.,1.),hs.z) CLIP(vec3(0.,0.,-1.),hs.z)
  CLIP(vec3(0.,-1.,0.),0.)
  CLIP(vec3(kx,1.,0.),Hx) CLIP(vec3(-kx,1.,0.),Hx)
  CLIP(vec3(0.,1.,kz),Hz) CLIP(vec3(0.,1.,-kz),Hz)
  if(tn>tf||tn<=0.) return -1.;
  n=normalize(n);
  return tn;
}
// one lot of the village grid. o is relative to the village centre at terrace level
float houseCell(vec2 ci,vec3 o,vec3 d,out vec3 n,out vec3 lp,out vec4 id){
  vec4 r=hash4(ci+uVilR.z),r2=hash4(ci*1.7+uVilR.z+40.);
  vec2 cc=(ci+.5)*CELL+(r.xy-.5)*6.;
  id=vec4(r.z,r.w,r2.x,0.);
  if(ci==vec2(0.)){                                   // church: tower with spire + nave
    vec3 n2;id.w=2.;
    vec3 oc=o-vec3(cc.x-5.5,0.,cc.y);
    float t=hull(oc,d,vec3(2.5,0.,2.5),3.4,23.5,3.4,23.5,n);lp=oc+d*t;
    vec3 on=o-vec3(cc.x+3.5,0.,cc.y);
    float t2=hull(on,d,vec3(6.5,0.,4.),0.,1e3,.95,10.3,n2);
    if(t2>0.&&(t<0.||t2<t)){t=t2;n=n2;lp=on+d*t;id.w=3.;}
    return t;
  }
  if(length(cc/uVilR.xy)>1.||r2.y>.78) return -1.;
  vec3 hs=vec3(3.6+1.6*r.z,0.,3.1+1.1*r.w);
  float wall=4.6+2.2*r2.z,k=.62;
  vec3 oc=o-vec3(cc.x,0.,cc.y);
  float t=r2.w>.5?hull(oc,d,hs,k,wall+k*hs.x,0.,1e3,n):hull(oc,d,hs,0.,1e3,k,wall+k*hs.z,n);
  lp=oc+d*t;
  return t;
}
float houses(vec3 ro,vec3 rd,float tmax,out vec3 n,out vec3 lp,out vec4 id){
  if(uVil.w<.5) return -1.;
  vec3 o=ro-uVil.xyz;
  float t0=0.,t1=tmax;
  vec3 lo=vec3(-uVilR.x-14.,0.,-uVilR.y-14.),hi=vec3(uVilR.x+14.,25.,uVilR.y+14.);
  vec3 ia=(lo-o)/rd,ib=(hi-o)/rd,mn=min(ia,ib),mx=max(ia,ib);
  t0=max(t0,max(mn.x,max(mn.y,mn.z)));t1=min(t1,min(mx.x,min(mx.y,mx.z)));
  if(t0>=t1) return -1.;
  vec2 gp=(o.xz+rd.xz*(t0+.02))/CELL,ci=floor(gp);
  vec2 sg=vec2(rd.x<0.?-1.:1.,rd.z<0.?-1.:1.),inv=CELL/max(abs(rd.xz),vec2(1e-5));
  vec2 tm=t0+((ci+max(sg,0.))-gp)*CELL/(rd.xz+sg*1e-6);
  for(int k=0;k<18;k++){
    float t=houseCell(ci,o,rd,n,lp,id);
    if(t>0.&&t<t1) return t;
    if(tm.x<tm.y){if(tm.x>t1)break;ci.x+=sg.x;tm.x+=inv.x;}
    else{if(tm.y>t1)break;ci.y+=sg.y;tm.y+=inv.y;}
  }
  return -1.;
}
vec3 shadeHouse(vec3 lp,vec3 n,vec4 id,vec3 wp,float t){
  vec3 alb;
  bool church=id.w>1.5;
  if(n.y>.2){
    alb=mix(vec3(.08,.068,.06),vec3(.15,.085,.055),step(.62,id.z))*(.8+.4*fract(lp.y*2.3));
    if(church&&id.w<2.5) alb=vec3(.10,.19,.16);                       // copper spire
  }else{
    float a=abs(n.x)>.5?lp.z:lp.x;
    alb=(lp.y<2.7||church)?vec3(.62,.6,.55):vec3(.15,.09,.05)*(.8+.4*step(.5,fract(lp.y*3.)));
    vec2 wq=vec2(fract(a/2.3+.5)-.5,fract((lp.y-.25)/2.6)-.5);
    float wy=church?step(lp.y,6.):step(lp.y,4.9);
    float fade=1.-ss(500.,1100.,t);
    float win=step(abs(wq.x),.19)*step(abs(wq.y),.2)*wy;
    float shut=step(abs(wq.x),.3)*step(abs(wq.y),.2)*wy*(1.-win);
    alb=mix(alb,vec3(.03,.04,.05),win*fade);
    if(!church) alb=mix(alb,mix(vec3(.07,.17,.09),vec3(.3,.07,.05),step(.5,id.y)),shut*fade);
    if(church&&id.w<2.5&&lp.y>12.&&lp.y<14.5&&abs(a)<1.1) alb=vec3(.05);      // belfry openings
  }
  float sh=shadowT(wp+n*.3)*cloudSh(wp);
  return alb*(SUNC*max(dot(n,uSun),0.)*sh+vec3(.33,.49,.8)*1.25*(.5+.5*n.y)+vec3(.2,.24,.1)*.5*(1.-n.y));
}

// arches in elevation: q.x along the bridge, q.y up from the deck top
float sdVia2(vec2 q){
  float xr=mod(q.x+11.,22.)-11.;
  float hole=min(length(vec2(xr,q.y+13.))-9.,max(abs(xr)-9.,q.y+13.));
  return max(max(q.y,abs(q.x)-OV_L),-hole);
}
vec3 viaOrigin(){float x0=uTrainX-mod(uTrainX,PERIOD)+GORGE_X;return vec3(x0,OV_Y,trackZ(x0)+OV_Z);}
float oldVia(vec3 ro,vec3 rd,float tmax,out vec3 n,out vec3 lp){
  if(abs(mod(uTrainX,PERIOD)-GORGE_X)>1200.||abs(rd.z)<1e-5) return -1.;
  vec3 o=ro-viaOrigin();
  float ta=(-2.5-o.z)/rd.z,tb=(2.5-o.z)/rd.z;
  float t=max(min(ta,tb),0.),t1=min(max(ta,tb),tmax);
  if(t>=t1) return -1.;
  for(int i=0;i<44;i++){
    vec3 q=o+rd*t;
    float d=sdVia2(q.xy);
    if(d<.03){
      lp=q;
      if(i==0) n=vec3(0.,0.,-sign(rd.z));
      else{vec2 e=vec2(.05,0.);n=normalize(vec3(sdVia2(q.xy+e.xy)-d,sdVia2(q.xy+e.yx)-d,0.));}
      return t;
    }
    t+=max(d,.06);
    if(t>t1) return -1.;
  }
  return -1.;
}
vec3 shadeStone(vec3 lp,vec3 n,vec3 wp){
  vec2 uv=abs(n.z)>.5?lp.xy:vec2(lp.x+lp.y,lp.z);
  float row=floor(uv.y/.55);
  vec4 r=hash4(vec2(floor(uv.x/1.1+.5*mod(row,2.)),row));
  vec3 alb=mix(vec3(.26,.24,.21),vec3(.40,.37,.32),r.x)*(.8+.3*vnoise(uv*1.3));
  alb*=.75+.25*ss(-60.,-5.,lp.y);                                 // damp, darker piers
  float sh=shadowT(wp+n*.4)*cloudSh(wp);
  return alb*(SUNC*max(dot(n,uSun),0.)*sh+vec3(.33,.49,.8)*1.2*(.5+.5*n.y)+vec3(.2,.22,.12)*.4);
}

float objShadow(vec3 p){
  float sh=1.;
  float t=rowHit(p,uSun,0.);
  if(t>0.&&t<500.){
    vec3 q=p+uSun*t;float sx=q.x-uTrainX;
    if(q.y>.25) sh=min(sh,ss(-.3,.05,max(q.y-3.85,max(-52.-sx,sx-70.))));    // the train itself
    float xm=mod(q.x,PERIOD);
    if(xm>VIA0-20.&&xm<VIA1+20.) sh=min(sh,ss(-.4,.4,sdVia2(vec2(xm-GORGE_X,q.y+.25))));
  }
  if(abs(mod(uTrainX,PERIOD)-GORGE_X)<1200.){
    vec3 o=p-viaOrigin();
    float tv=-o.z/uSun.z;
    if(tv>0.&&tv<600.) sh=min(sh,ss(-.4,.4,sdVia2((o+uSun*tv).xy)));
  }
  if(uVil.w>.5&&all(lessThan(abs(p.xz-uVil.xz),uVilR.xy+60.))){
    vec3 n,lp;vec4 id;
    if(houses(p+vec3(0.,.1,0.),uSun,90.,n,lp,id)>0.) sh=0.;
  }
  return sh;
}

uniform sampler2D uPre;     // half-resolution depth prepass: >0 terrain distance, -1 nothing, -2 interior, -3 no information
uniform float uPreOn;
#ifdef PREPASS
float preWorld(vec3 ro,vec3 rd){
  if(ro.x>uTun.x&&ro.x<uTun.y){
    bool ex;vec3 pe;tunnel(ro,rd,ex,pe);
    if(!ex) return -3.;
    ro=pe;
  }
  if(rd.y<0.){
    vec3 pd=ro+rd*(-ro.y/rd.y);float xm=mod(pd.x,PERIOD);
    if(xm>VIA0&&xm<VIA1&&abs(pd.z-trackZ(pd.x))<2.75) return -3.;
  }
  return march(ro,rd,.05,min(rd.y<0.?(WATER-ro.y)/rd.y:1e9,32000.),150);
}
#endif
// where the terrain march may start, from the prepass neighbourhood. -1: nothing to hit, 0: unknown
float preStart(){
  if(uPreOn<.5) return 0.;
  ivec2 c=ivec2(gl_FragCoord.xy*.5),sz=textureSize(uPre,0)-1;
  float t0=1e9;bool any=false;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
    float v=texelFetch(uPre,clamp(c+ivec2(i,j),ivec2(0),sz),0).r;
    if(v<-2.5) return 0.;
    if(v>0.){t0=min(t0,v);any=true;}
    else if(v>-1.5) any=true;
  }
  if(!any) return 0.;
  return t0>1e8?-1.:max(.05,t0*.94-1.5);
}
// Everything outside the glass. Returns colour and distance (60000 = do not post-blur).
vec4 renderWorld(vec3 ro,vec3 rd){
  float tOff=0.;
  if(ro.x>uTun.x&&ro.x<uTun.y){
    bool ex;vec3 pe;
    vec3 c=tunnel(ro,rd,ex,pe);
    if(!ex) return vec4(c,60000.);
    tOff=length(pe-ro);ro=pe;
  }
  vec3 col;float depth=-1.;
  // viaduct deck beneath the carriage
  if(rd.y<0.){
    float td=-ro.y/rd.y;vec3 pd=ro+rd*td;float xm=mod(pd.x,PERIOD),zr=pd.z-trackZ(pd.x);
    if(xm>VIA0&&xm<VIA1&&abs(zr)<2.75){
      vec4 nb=streak(pd.xz,1./.35,td);
      vec3 alb=abs(zr)<2.25?vec3(.2,.175,.155)*(.6+.8*nb.x):vec3(.4,.38,.35)*(.85+.3*nb.y);
      col=alb*(SUNC*uSun.y*objShadow(pd)*cloudSh(pd)+vec3(.33,.49,.8)*1.3);
      depth=td;
    }
  }
  if(depth<0.){
    float tW=rd.y<0.?(WATER-ro.y)/rd.y:1e9;
    float ts=preStart();
    float tT=ts<0.?-1.:march(ro,rd,max(ts,.05),min(tW,32000.),150);
    if(tT>0.){col=shadeTerrain(ro+rd*tT,rd,tT,false);depth=tT;}
    else if(tW<32000.){col=shadeWater(ro+rd*tW,rd,tW);depth=tW;}
    else{col=sky(ro,rd);depth=60000.;}
    vec3 n,lp;vec4 id;
    float th=houses(ro,rd,depth,n,lp,id);
    if(th>0.){col=shadeHouse(lp,n,id,ro+rd*th,th);depth=th;}
    float tv=oldVia(ro,rd,depth,n,lp);
    if(tv>0.){col=shadeStone(lp,n,ro+rd*tv);depth=tv;}
    if(depth<60000.) col=fog(col,rd,depth,ro.y);
  }
  // trackside layers, nearest first
  vec3 acc=vec3(0.);float tr=1.;
  float side=rd.z-trackD(ro.x)*rd.x;
  float xm0=mod(ro.x,PERIOD);
  if(xm0>VIA0-150.&&xm0<VIA1+150.) railing(ro,rd,side>0.?1.:-1.,depth,acc,tr);
  if(side>0.){
    fence(ro,rd,depth,acc,tr);
    treeRow(ro,rd,9.,7.5,1.,depth,acc,tr);
    treeRow(ro,rd,13.5,8.,2.,depth,acc,tr);
    treeRow(ro,rd,19.,8.5,3.,depth,acc,tr);
    treeRow(ro,rd,26.,9.,4.,depth,acc,tr);
    treeRow(ro,rd,34.,9.5,8.,depth,acc,tr);
    treeRow(ro,rd,43.,10.,9.,depth,acc,tr);
  }else{
    masts(ro,rd,depth,acc,tr);
    treeRow(ro,rd,-7.5,7.5,5.,depth,acc,tr);
    treeRow(ro,rd,-12.,8.,6.,depth,acc,tr);
    treeRow(ro,rd,-18.,8.5,7.,depth,acc,tr);
    treeRow(ro,rd,-26.,9.,10.,depth,acc,tr);
    treeRow(ro,rd,-36.,9.5,11.,depth,acc,tr);
  }
  col=acc+tr*col;
  return vec4(col,depth+tOff);
}
</script>
