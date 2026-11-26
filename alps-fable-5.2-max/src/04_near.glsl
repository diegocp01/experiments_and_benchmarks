<script id="g-near" type="x-shader/x-fragment">
// ───────────────────────── tunnel interior and analytically motion-blurred trackside layers ─────────────────────────
uniform vec2 uTun;        // world-x range of the tunnel nearest the camera
uniform float uTrainX;    // world x of the camera's carriage

// overlap of [a0,a1] with [b0,b1], as a fraction of the first interval (box-filtered coverage)
float cover(float a0,float a1,float b0,float b1){return sat((min(a1,b1)-max(a0,b0))/max(a1-a0,1e-4));}

// Ray marched inside the tunnel tube. exits=true when the ray leaves through a portal at pe.
vec3 tunnel(vec3 ro,vec3 rd,out bool exits,out vec3 pe){
  float t=0.;vec3 p=ro;exits=false;pe=ro;
  for(int i=0;i<48;i++){
    p=ro+rd*t;
    if(p.x<uTun.x||p.x>uTun.y){
      exits=true;
      float xe=rd.x>0.?uTun.y:uTun.x;
      pe=ro+rd*((xe-ro.x)/rd.x);
      return vec3(0.);
    }
    float d=min(3.4-tubeR(p,p.z-trackZ(p.x)),p.y);
    if(d<.004) break;
    t+=d*.92;
  }
  float s=mod(p.x,PERIOD),b=uBlur;
  float pd=min(p.x-uTun.x,uTun.y-p.x);                 // distance to the nearest portal
  float zr=p.z-trackZ(p.x);
  float v=atan(p.y-2.3,abs(zr))*3.4;                  // arc length up the wall
  // rough shotcrete: every feature is smeared along the direction of travel
  float tex=0.;
  for(int i=0;i<4;i++) tex+=vnoise(vec2((s+(float(i)-1.5)*b*.25)*1.6,v*4.1));
  tex=tex*.25*.5+vnoise(vec2(s*.21,v*17.))*.3+vnoise(vec2(s*.07,v*1.3))*.4;
  vec3 alb=vec3(.21,.2,.185)*(.25+1.4*tex);
  float joint=mod(s,6.)-3.;                                  // casting joints flick past as faint bands
  alb*=1.-.35*cover(joint-.5*b,joint+.5*b,-.04,.04);
  bool floorHit=p.y<.03;
  if(floorHit) alb=vec3(.12,.105,.095)*(.6+.6*vnoise(vec2(s*.4,zr*9.)));
  else{
    float cab=ss(.045,.02,abs(p.y-3.0))+ss(.035,.015,abs(p.y-3.16))+ss(.03,.012,abs(p.y-3.29));
    alb*=1.-.8*sat(cab);
    alb=mix(alb,vec3(.5,.5,.47),ss(.05,.03,abs(p.y-1.12))*.8);     // painted guide line
  }
  // light from the carriage windows: steady pools that travel with the train
  float xc=(p.x-uTrainX)/max(uFwd.x,.5);
  float pool=pow(.55+.45*cos(6.2832*xc/1.9),1.5)*step(abs(xc),62.);
  vec3 E=vec3(1.,.85,.64)*.05*pool*exp(-pow((p.y-2.5)/1.25,2.));
  // emergency lamps every 24 m: pool and fixture both box-blurred along the track
  float ds=mod(s+12.,24.)-12.,dy=p.y-3.55,c=sqrt(dy*dy+.3);
  float lampPool=(atan((ds+.5*b)/c)-atan((ds-.5*b)/c))/(b*c);
  E+=vec3(1.,.74,.42)*.11*lampPool*step(.03,p.y);
  // daylight creeping in from the portals
  E+=vec3(.55,.68,.9)*2.*exp(-pd/4.5);
  vec3 col=alb*E;
  if(!floorHit){
    float fix=cover(ds-.5*b,ds+.5*b,-.22,.22)*ss(.07,.04,abs(dy+.0));
    col+=vec3(1.,.8,.5)*26.*fix;
    float sign2=mod(s+60.,120.)-60.;                             // green escape-route signs
    col+=vec3(.1,1.,.35)*1.1*cover(sign2-.5*b,sign2+.5*b,-.2,.2)*ss(.1,.07,abs(p.y-2.05));
  }
  return col;
}

// distance along the ray to the vertical surface running parallel to the track at lateral offset zrRow
float rowHit(vec3 ro,vec3 rd,float zrRow){
  float den=rd.z-trackD(ro.x)*rd.x;
  float g0=ro.z-trackZ(ro.x)-zrRow;
  if(abs(den)<1e-4||-g0/den<=0.) return -1.;
  float t=-g0/den;
  for(int i=0;i<2;i++){
    float x=ro.x+rd.x*t;
    float dn=rd.z-trackD(x)*rd.x;
    if(abs(dn)<1e-4) return -1.;
    t-=(ro.z+rd.z*t-trackZ(x)-zrRow)/dn;
  }
  return t>0.?t:-1.;
}
float gTreeSh=-1.;      // sunlight at the trackside trees, evaluated once per pixel
// A row of spruces as camera-facing silhouettes; coverage is integrated over the shutter interval.
void treeRow(vec3 ro,vec3 rd,float zrRow,float cell,float seed,float tmax,inout vec3 acc,inout float trans){
  if(trans<.02) return;
  float t=rowHit(ro,rd,zrRow);
  if(t<0.||t>min(tmax+40.,340.)) return;
  vec3 ph=ro+rd*t;
  vec2 dh=rd.xz;float dl=length(dh);if(dl<1e-3) return;
  vec2 dn=dh/dl;
  if(abs(ph.y)>70.) return;
  vec4 g;float gh=ground(ph.xz,500.,3.,1e5,g);            // ground where the ray crosses the row
  float xm=mod(ph.x,PERIOD);
  float dens=max(forestField(ph.xz,gh,g,50.),.045)*ss(25.,70.,portalDist(xm));
  if(zrRow>0.) dens*=1.-.75*max(g.w,0.);                   // keep the lake view open
  if(xm>VIA0-25.&&xm<VIA1+25.) return;
  float sinA=abs(uFwd.x*dn.y-uFwd.y*dn.x);
  float i0=floor(ph.x/cell);
  for(int k=-1;k<=1;k++){
    float i=i0+float(k);
    vec4 r=hash4(vec2(i,seed)),r2=hash4(vec2(i+31.,seed+9.));
    if(r2.x>dens) continue;
    float sc=(i+.5+(r.x-.5)*.7)*cell;
    vec2 c=vec2(sc,trackZ(sc)+zrRow+(r.y-.5)*3.6);
    vec2 rel=c-ro.xz;
    float tc=dot(rel,dn)/dl;
    if(tc<.5||tc>tmax) continue;
    float dp=rel.x*dn.y-rel.y*dn.x;                        // signed distance from the ray to the trunk axis
    float H=6.+17.*r.z*r.z+4.*r2.y,R=H*(.12+.06*r.w),base=gh-.5;
    float yn=(ro.y+rd.y*tc-base)/H;
    if(yn<0.||yn>1.) continue;
    float tier=1.-fract(yn*(7.+5.*r.w)+r.x*3.);            // drooping whorls of boughs
    float nz=vnoise(vec2(yn*33.+r.y*9.,i*.37+seed));
    float w=yn<.07?.16:R*pow(1.-yn,.8)*(.45+.3*tier+.4*nz);
    float hb=.5*uBlur*sinA+.0009*tc;
    float cov=.5*cover(dp-hb,dp+hb,-w,w)+.5*cover(dp-hb,dp+hb,-w*.68,w*.68);   // feathered outer boughs
    if(cov<.003) continue;
    if(gTreeSh<0.){vec3 P=vec3(c.x,base+H*.6,c.y);gTreeSh=shadowT(P)*cloudSh(P);}
    float u=clamp(dp/max(w,.05),-1.,1.),su=sqrt(1.-u*u);
    vec3 n=normalize(vec3(-dn.x*su+dn.y*u,.3,-dn.y*su-dn.x*u));
    float lit=ss(-.15,.75,dot(n,uSun))*gTreeSh;
    vec3 alb=yn<.07?vec3(.05,.036,.026):mix(vec3(.014,.032,.017),vec3(.034,.06,.024),r.w)*(.5+.5*tier)*(.65+.7*nz);
    vec3 col=alb*(SUNC*lit*(.25+.75*yn)*.6+vec3(.33,.49,.8)*(.22+.6*yn));
    acc+=trans*cov*col;trans*=1.-cov;
  }
}
// wooden fence beside the meadows: rails stay sharp, posts dissolve into the motion
void fence(vec3 ro,vec3 rd,float tmax,inout vec3 acc,inout float trans){
  float t=rowHit(ro,rd,5.4);
  if(t<0.||t>min(tmax,220.)) return;
  vec3 p=ro+rd*t;float xm=mod(p.x,PERIOD);
  float on=ss(2040.,2070.,xm)*(1.-ss(2840.,2870.,xm))+ss(4560.,4590.,xm)+(1.-ss(215.,245.,xm));
  if(on<.01) return;
  if(abs(p.y)>40.) return;
  vec4 g;float y=p.y-ground(p.xz,t,5.,-1e5,g);
  if(y<0.||y>1.25) return;
  float px=.0011*t;
  float rail=max(ss(.05+px,.05-px,abs(y-.56)),ss(.05+px,.05-px,abs(y-1.02)));
  float ds=mod(p.x,2.4)-1.2;
  float post=cover(ds-.5*uBlur-px,ds+.5*uBlur+px,-.065,.065)*step(y,1.15);
  float cov=max(rail,post)*on;
  vec3 col=vec3(.2,.17,.135)*(.7+.5*vnoise(vec2(p.x*.6,y*30.)))*(SUNC*.55*shadowT(p)+vec3(.33,.49,.8));
  acc+=trans*cov*col;trans*=1.-cov;
}
// catenary masts on the hillside of the track
void masts(vec3 ro,vec3 rd,float tmax,inout vec3 acc,inout float trans){
  float t=rowHit(ro,rd,-2.75);
  if(t<0.||t>min(tmax,400.)) return;
  vec3 p=ro+rd*t;
  if(p.y<0.||p.y>6.7||inTunnel(mod(p.x,PERIOD))) return;
  float ds=mod(p.x+24.,48.)-24.,px=.0011*t;
  float cov=cover(ds-.5*uBlur-px,ds+.5*uBlur+px,-.11,.11);
  cov=max(cov,cover(ds-.5*uBlur-px,ds+.5*uBlur+px,-.11,2.6)*ss(.09+px,.05,abs(p.y-5.7)));
  vec3 col=vec3(.075,.085,.08)*(SUNC*.5+vec3(.33,.49,.8));
  acc+=trans*cov*col;trans*=1.-cov;
}
// steel railing along the viaduct deck
void railing(vec3 ro,vec3 rd,float side,float tmax,inout vec3 acc,inout float trans){
  float t=rowHit(ro,rd,2.55*side);
  if(t<0.||t>min(tmax,300.)) return;
  vec3 p=ro+rd*t;float xm=mod(p.x,PERIOD);
  if(xm<VIA0||xm>VIA1||p.y<0.||p.y>1.1) return;
  float px=.0011*t;
  float rail=max(ss(.035+px,.035-px,abs(p.y-1.03)),ss(.025+px,.025-px,abs(p.y-.55)));
  float ds=mod(p.x,1.8)-.9;
  float cov=max(rail,cover(ds-.5*uBlur-px,ds+.5*uBlur+px,-.03,.03));
  vec3 col=vec3(.1,.11,.11)*(SUNC*.6+vec3(.33,.49,.8));
  acc+=trans*cov*col;trans*=1.-cov;
}
</script>
