<script id="g-world" type="x-shader/x-fragment">
// ───────────────────────── sky, atmosphere, terrain marching and shading, lake ─────────────────────────
uniform vec3 uSun;          // direction to the sun (world)
uniform float uTime,uBlur;  // uBlur: metres travelled while the shutter is open
uniform vec2 uFwd;          // track tangent (xz)
const vec3 SUNC=vec3(1.,.87,.68)*5.;
float objShadow(vec3 p);    // train, viaduct, houses – defined with the objects

vec3 skyBase(vec3 rd){
  float y=max(rd.y,0.),mu=max(dot(rd,uSun),0.);
  vec3 c=mix(vec3(.46,.63,.88)*3.,vec3(.085,.22,.60)*2.3,pow(y,.4));
  c+=vec3(1.,.72,.42)*(pow(mu,6.)*.9+pow(mu,60.)*3.);
  c=mix(c,vec3(.78,.79,.80)*3.1,pow(1.-y,12.)*.5);
  return c;
}
float cloudD(vec2 q){
  q+=uTime*vec2(7.,2.5);
  return ss(.5,.76,fbm(q/2600.)*.92+vnoise(q/390.)*.12);
}
vec3 sky(vec3 ro,vec3 rd){
  vec3 c=skyBase(rd);
  float mu=dot(rd,uSun);
  c+=vec3(1.,.9,.72)*ss(.99955,.9997,mu)*500.;
  if(rd.y>.004){
    float t=(9000.-ro.y)/rd.y;vec2 q=ro.xz+rd.xz*t;
    float ci=ss(.42,.85,fbm(q*vec2(.35,1.)/5200.+4.)*.8+vnoise(q/21000.)*.4)*exp(-t/90000.);
    c=mix(c,vec3(1.,.96,.9)*4.2,ci*.55);
    t=(3600.-ro.y)/rd.y;q=ro.xz+rd.xz*t;
    float d=cloudD(q);
    if(d>.001){
      float lit=cloudD(q+uSun.xz*520.);
      vec3 cc=mix(vec3(1.,.95,.87)*6.,vec3(.52,.60,.74)*2.3,sat(lit*1.3+.15*(1.-d)));
      c=mix(c,cc,d*exp(-t/52000.));
    }
  }
  return c;
}
// aerial perspective: exponential-height haze, bluer extinction, warm in-scatter toward the sun
vec3 fog(vec3 col,vec3 rd,float t,float y0){
  float k=rd.y*t/1500.;
  float f=abs(k)<1e-3?1.:(1.-exp(-k))/k;
  float od=2.1e-5*t*exp(-max(y0+112.,0.)/1500.)*f;
  vec3 T=exp(-od*vec3(.72,1.,1.5));
  float mu=max(dot(rd,uSun),0.);
  vec3 fc=mix(vec3(.45,.60,.84)*2.3,vec3(1.,.80,.58)*3.4,pow(mu,4.)*.65);
  return col*T+fc*(1.-T);
}

// marching version: canopy is only evaluated when the ray is low enough to touch it
float terrainM(vec3 p,float t,out vec4 g,out float fm,out float cz){
  float h=ground(p.xz,t,t<1500.?6.:t<6000.?5.:4.,p.y,g);
  fm=0.;cz=0.;
  if(t<2600.&&p.y-h<70.){fm=forestMask(p.xz,h,g,t);if(p.y-h<24.) cz=canopy(p.xz,fm,t);}
  return h;
}
// height-field march. returns distance or -1
float march(vec3 ro,vec3 rd,float tmin,float tmax,int steps){
  float t=tmin,lt=tmin,fm,cz;vec4 g;
  gLod=0.;
  for(int i=0;i<steps;i++){
    vec3 p=ro+rd*t;
    if(p.y>3400.&&rd.y>=0.){gLod=0.;return -1.;}
    float h=terrainM(p,t,g,fm,cz);
    float d=p.y-h-cz;
    if(i==0&&d<0.&&tmin>.06){t=lt=tmin=.05;continue;}           // the head start from the prepass was too generous
    if(d<.0012*t+gLod*4.){
      if(gLod>0.){gLod=0.;t=mix(lt,t,.5);continue;}            // re-examine at full detail
      float a=lt,b=t;
      for(int j=0;j<5;j++){
        float m=.5*(a+b);vec3 pm=ro+rd*m;
        float hm=terrainM(pm,m,g,fm,cz);
        if(pm.y-hm-cz<.0012*m)b=m;else a=m;
      }
      return b;
    }
    lt=t;
    float st,K=t<400.?.55:.72;
    if(fm>.01) st=d>24.?(d-22.)*K+.5:clamp(d*.35,.3+.003*t,2.5+.005*t);   // above / inside the canopy layer
    else st=max(d*K,.03+.003*t);
    gLod=floor(clamp(log2(max(d,1.)/50.),0.,5.));
    t+=st;
    if(t>tmax){gLod=0.;return -1.;}
  }
  gLod=0.;
  return t;
}
// surface normal with canopy (returned) and of the bare ground (ng)
vec3 terrainN(vec3 p,float t,out vec3 ng,out vec4 g,out float fm,out float cz){
  float oct=clamp(1.+log2(633000./max(t,20.)),5.,11.);
  float e=max(.0012*t,.06);vec4 g1;
  float h0=ground(p.xz,t,oct,-1e5,g);
  fm=forestMask(p.xz,h0,g,t);cz=canopy(p.xz,fm,t);
  float hx=ground(p.xz+vec2(e,0.),t,oct,-1e5,g1),hz=ground(p.xz+vec2(0.,e),t,oct,-1e5,g1);
  ng=normalize(vec3(h0-hx,e,h0-hz));
  if(fm<.01) return ng;
  float cx=canopy(p.xz+vec2(e,0.),fm,t),cy=canopy(p.xz+vec2(0.,e),fm,t);
  return normalize(vec3(h0+cz-hx-cx,e,h0+cz-hz-cy));
}
float shadowT(vec3 p){
  float res=1.,t=3.;vec4 g;
  for(int i=0;i<16;i++){
    vec3 q=p+uSun*t;
    if(q.y>3300.) break;
    float h=q.y-ground(q.xz,600.,4.,1e5,g);
    res=min(res,10.*h/t);
    if(res<.01) break;
    t+=clamp(h*.75,3.+t*.16,600.);
  }
  return ss(0.,1.,res);
}
float cloudSh(vec3 p){return 1.-.6*cloudD(p.xz+uSun.xz*((3600.-p.y)/uSun.y));}
// detail noise box-filtered along the direction of travel (motion blur of ground texture)
vec4 streak(vec2 q,float f,float t){
  if(t>150.) return vnoise4(q*f);
  vec4 a=vec4(0.);
  for(int i=0;i<4;i++) a+=vnoise4((q+uFwd*((float(i)-1.5)*uBlur*.25))*f);
  return a*.25;
}
float tubeR(vec3 p,float zr){   // radial distance from the tunnel axis
  float c=inversesqrt(1.+trackD(p.x)*trackD(p.x));
  return length(vec2(p.y-2.3,zr*c));
}
float portalDist(float xm){
  return min(min(abs(xm-TUN_A.x),abs(xm-TUN_A.y)),min(abs(xm-TUN_B.x),abs(xm-TUN_B.y)));
}

vec3 shadeTerrain(vec3 p,vec3 rd,float t,bool lite){
  vec4 g;float fm,cz;vec3 ng;
  vec3 n=terrainN(p,t,ng,g,fm,cz);
  float xm=mod(p.x,PERIOD),zr=g.x,alt=p.y;
  // tunnel mouth painted on the portal face
  float pd=portalDist(xm),tr=tubeR(p,zr);
  if(inTunnel(xm)&&tr<3.4) return vec3(.012,.011,.01)*(1.+3.*exp(-pd*.25));
  vec4 nA=vnoise4(p.xz/57.),nL=vnoise4(p.xz/900.+11.);
  vec4 nB=streak(p.xz,1./2.3,t);
  float fine=t<90.?streak(p.xz,1./.33,t).x:.5;
  float slope=ng.y;
  // meadow: several greens, drier and yellower where the ground is convex or high
  vec3 grass=mix(vec3(.042,.088,.022),vec3(.115,.15,.04),nA.x*.55+nL.y*.45);
  grass=mix(grass,vec3(.03,.062,.02),ss(.5,.8,nA.w)*.7);
  grass=mix(grass,vec3(.16,.15,.055),ss(.62,.9,nL.w)*.5);
  vec4 nM=vnoise4(p.xz/11.3+5.);                                          // tussocks, wet hollows, worn ground
  grass*=.72+.56*mix(nM.x,.5,ss(900.,2500.,t));
  grass=mix(grass,vec3(.09,.085,.05),ss(.72,.9,nM.y)*ss(.5,.75,nA.z)*.6*ss(1500.,500.,t));
  grass*=(.7+.6*nB.y)*(.75+.5*fine);
  if(t<60.) grass=mix(grass,vec3(.42,.36,.12),ss(.8,.95,nB.w)*ss(.55,.8,nA.y)*.5);      // buttercups by the line
  if(t<3500.){                                                            // lone trees and shrubs dotting the pastures
    vec2 c=p.xz/34.,ci=floor(c);vec4 r=hash4(ci+77.);
    float dd=length(c-ci-.5-(r.xy-.5)*.6)*34.;
    grass=mix(grass,vec3(.02,.04,.018),step(r.z,.3)*ss(5.5,2.5,dd)*ss(3500.,2000.,t));
  }
  grass=mix(grass,vec3(.15,.135,.07),ss(330.,760.,alt));
  vec3 rock=mix(vec3(.15,.145,.14),vec3(.29,.255,.21),nA.z)*(.6+.8*nB.x);
  rock*=(.75+.5*vnoise(vec2(alt*.11+nA.y*5.,p.x*.004)))*(.7+.6*fine);
  float rk=ss(.78,.58,slope+(nB.x-.5)*.16);
  rk=max(rk,ss(650.,1150.,alt+260.*nL.x)*.85);
  vec3 alb=mix(grass,rock,rk);
  alb=mix(alb,vec3(.33,.31,.26),ss(WATER+3.5,WATER+.4,alt)*max(g.w,0.));               // lake shore
  float gg=textureLod(uRoute,vec2(p.x/PERIOD,.5),0.).z;
  alb=mix(alb,vec3(.34,.45,.47)*(.7+.9*nB.x),ss(.993,.999,gg)*step(alt,-20.)*step(g.y,0.));   // gorge torrent
  // railway corridor
  float az=abs(zr);
  if(az<9.&&alt<1.5&&alt>-6.){
    vec3 ballast=vec3(.19,.165,.145)*(.55+.9*nB.z)*(.7+.6*fine);
    alb=mix(ballast,alb,ss(2.9,4.6,az+(nB.w-.5)*1.4));
    if(az>3.8&&az<4.25) alb=mix(alb,vec3(.40,.39,.37),.75);                             // cable trough lids
  }
  // retaining wall + ring around tunnel portals
  if(pd<9.&&slope<.5&&az<12.){
    alb=mix(alb,vec3(.34,.33,.31)*(.7+.5*nB.x),ss(11.,6.,tr));
    alb=mix(alb,vec3(.5,.49,.47),ss(4.3,4.1,tr)*ss(3.3,3.5,tr));
  }
  // snow: above a wandering snow line, where it is flat enough to hold, more in the shade
  float sline=930.+420.*(nL.z-.5);
  float sn=sat((alt-sline)/230.+(slope-.62)*2.2+(nB.z-.5)*.6-.3*dot(ng,uSun))*ss(.26,.46,slope);
  alb=mix(alb,vec3(.80,.84,.90),sn);
  // forest: individual cones nearby, a textured blanket beyond
  float ff=forestField(p.xz,alt,g,t);
  bool blanket=t>650.;
  float fb=blanket?ss(.06,.4,fm):step(.4,cz);
  vec3 nl=n;float selfSh=1.,ao=1.;
  if(ff>.01){
    vec3 fo=mix(vec3(.016,.036,.019),vec3(.036,.064,.026),nA.y);
    alb=mix(alb,vec3(.03,.034,.02),ff*.8*(1.-fb));                 // needle litter between the trees
    if(fb>0.){
      float crown=.5;
      if(t<2600.){                                                 // sunlit crowns as jittered dots, not lattice noise
        vec2 c=p.xz/6.4,ci=floor(c);vec4 r=hash4(ci);
        crown=(1.-ss(.15,.6,length(c-ci-.5-(r.xy-.5)*.62)))*(.35+.65*r.z)+.18*nA.x;
        crown=mix(crown,.42,ss(1100.,2600.,t));
      }
      // near cones: whorls of boughs as bands up the tree, needles breaking up the smooth surface
      float bough=.55+.45*fract(cz*.42+nA.x*3.)+.5*(nB.x-.5);
      alb=mix(alb,fo*(blanket?.4+1.3*crown*crown:(.35+.6*sat(cz/16.))*bough),fb);
      if(blanket){nl=normalize(mix(ng,n,.3));selfSh=mix(1.,.7,fb);ao=mix(1.,.8,fb);}
      else{nl=normalize(mix(ng,n,.55));selfSh=(.2+.6*ss(.15,.8,cz/14.))*(.6+.4*bough);ao=.35+.65*sat(cz/15.);}
    }else{selfSh=1.-.75*ff;ao=1.-.5*ff;}
  }
  float ndl=max(dot(nl,uSun),0.);
  float sh=0.;
  if(ndl>0.){
    sh=cloudSh(p)*selfSh;
    if(!lite) sh*=shadowT(p+vec3(0.,.4+.002*t,0.))*objShadow(p);
  }
  vec3 skyA=vec3(.36,.52,.82)*1.75*(.5+.5*nl.y)*ao;
  vec3 bnc=vec3(.42,.40,.30)*.45*(.6-.4*nl.y)*ao;
  vec3 col=alb*(SUNC*ndl*sh+skyA+bnc);
  col+=sn*SUNC*sh*.05*pow(ndl,.4);
  return col;
}
// cheap geometric march for the lake's mirror image
float marchRefl(vec3 ro,vec3 rd){
  float t=25.,lt=0.;vec4 g;
  gLod=2.;
  for(int i=0;i<22;i++){
    vec3 p=ro+rd*t;
    if(p.y>3400.) break;
    if(p.y<ground(p.xz,2000.,5.,1e5,g)){
      float a=lt,b=t;
      for(int j=0;j<4;j++){float m=.5*(a+b);vec3 pm=ro+rd*m;if(pm.y<ground(pm.xz,2000.,5.,1e5,g))b=m;else a=m;}
      gLod=0.;return b;
    }
    lt=t;t*=1.34;
  }
  gLod=0.;
  return -1.;
}
vec3 shadeWater(vec3 p,vec3 rd,float t){
  vec2 q=p.xz;vec4 g;
  float wind=ss(.36,.64,vnoise(q*vec2(1.,2.6)/700.+uTime*.01));              // ruffled versus glassy water
  vec3 d1=noised(q/13.+uTime*vec2(.22,.1)),d2=noised(q/3.7-uTime*vec2(.19,.3));
  vec2 sl=(d1.yz*.65+d2.yz*.35/(1.+t*.004))*mix(.008,.06,wind);
  vec3 n=normalize(vec3(-sl.x,1.,-sl.y));
  float fr=.02+.98*pow(1.-max(dot(-rd,n),0.),5.);
  vec3 rr=reflect(rd,n);rr.y=abs(rr.y)+.003;rr=normalize(rr);
  vec3 refl=sky(p,rr);
  float tr=marchRefl(p,rr);
  if(tr>0.){vec3 pr=p+rr*tr;refl=fog(shadeTerrain(pr,rr,tr,true),rr,tr,p.y);}
  float depth=WATER-ground(q,2000.,4.,1e5,g);
  float sh=cloudSh(p);
  // glacial flour: milky blue-green, paler in the shallows
  vec3 body=mix(vec3(.12,.30,.28),vec3(.02,.10,.115),1.-exp(-depth/5.))*(.9+2.2*sh);
  vec3 col=mix(body,refl,fr);
  col+=SUNC*sh*pow(max(dot(rr,uSun),0.),260.)*3.*wind;
  return col;
}
</script>
