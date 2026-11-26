<script id="g-interior" type="x-shader/x-fragment">
// ───────────────────────── carriage interior (signed distance field, carriage space) ─────────────────────────
uniform vec3 uSunC;        // sun direction in carriage space
uniform float uDay;        // daylight reaching the carriage (0 deep inside a tunnel)
uniform vec3 uCarPos;      // carriage origin (floor centre of the camera's bay) in the world
uniform mat3 uCarRot;      // carriage -> world
const float BAY=1.9,HW=1.4,GLASS=1.45,CEIL=2.22,ENDX=8.55;
const float WIN_X=.74,WIN_Y0=.84,WIN_Y1=1.84;
const vec3 LAMPC=vec3(1.,.87,.69);

float sdBox(vec3 p,vec3 b){vec3 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);}
float sdRBox(vec3 p,vec3 b,float r){return sdBox(p,b-r)-r;}
float sdBox2(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,0.))+min(max(q.x,q.y),0.);}
float sdCyl(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
float foldX(float x){return x-BAY*clamp(floor(x/BAY+.5),-4.,4.);}
float winRect(vec2 q){return sdBox2(vec2(q.x,q.y-.5*(WIN_Y0+WIN_Y1)),vec2(WIN_X,.5*(WIN_Y1-WIN_Y0))-.07)-.07;}

#define U(dd,id) {float d_=dd;if(d_<d){d=d_;m=id;}}
// materials: 1 shell 4 fabric 5 headrest 6 plastic 7 table 8 metal 9 lamp 10 cup 11 coffee 12 bag 13 trim
float mapInt(vec3 p,out int m){
  float xb=foldX(p.x),az=abs(p.z),sx=.95-abs(xb);
  float d=1e9;m=1;
  // shell with window openings, end walls
  float room=sdBox2(vec2(az,p.y-.5*CEIL),vec2(HW,.5*CEIL)-.3)-.3;
  float win=sdRBox(vec3(xb,p.y-.5*(WIN_Y0+WIN_Y1),az-HW-.15),vec3(WIN_X,.5*(WIN_Y1-WIN_Y0),.3),.07);
  d=min(max(-room,-win),ENDX-abs(p.x));
  U(sdBox2(vec2(az-1.365,p.y-.815),vec2(.05,.018))-.008,13)                          // sill
  // seats: two per side, back to back at every bay boundary
  float zs=abs(az-.82)-.28,lean=.05*(p.y-.85);
  U(sdRBox(vec3(sx-.078+lean,p.y-.86,zs),vec3(.066,.42,.245),.05),4)                 // backrest
  U(sdRBox(vec3(sx-.118+lean,p.y-1.2,zs),vec3(.05,.105,.17),.045),5)                 // headrest
  U(sdRBox(vec3(sx-.35,p.y-.41,zs),vec3(.25,.055,.245),.05),4)                       // cushion
  U(sdRBox(vec3(sx-.3,p.y-.18,zs),vec3(.2,.18,.2),.02),6)                            // pedestal
  float za=min(abs(az-.3),abs(az-.82));
  U(sdRBox(vec3(sx-.32,p.y-.615,za),vec3(.19,.022,.027),.015),6)                     // armrests
  // table, luggage rack, lamps
  U(sdRBox(vec3(xb,p.y-.725,az-1.01),vec3(.27,.017,.4),.012),7)
  U(sdBox(vec3(xb,p.y-.4,az-1.34),vec3(.025,.31,.03)),8)
  U(sdBox2(vec2(az-1.2,p.y-1.95),vec2(.2,.007)),13)
  U(length(vec2(az-1.,p.y-1.975))-.014,8)
  U(sdBox(vec3(sx-.012,p.y-2.04,az-1.2),vec3(.012,.09,.2)),8)
  U(sdBox2(vec2(az-.52,p.y-CEIL+.012),vec2(.07,.014)),9)
  // things: coffee on our table, bags on the racks
  if(abs(p.x)<.6&&p.z>.5&&p.y<1.){
    vec3 c=p-vec3(.11,.742,1.07);
    U(sdCyl(c-vec3(0.,.003,0.),.072,.004),10)
    float cup=max(sdCyl(c-vec3(0.,.048,0.),.041,.042),-sdCyl(c-vec3(0.,.056,0.),.035,.042));
    U(cup,10)
    U(sdCyl(c-vec3(0.,.062,0.),.035,.004),11)
  }
  if(p.y>1.9){
    U(sdRBox(p-vec3(1.25,2.075,-1.19),vec3(.31,.11,.17),.07),12)
    U(sdRBox(p-vec3(-3.7,2.085,1.19),vec3(.27,.12,.17),.08),12)
    U(sdRBox(p-vec3(4.3,2.07,-1.19),vec3(.33,.105,.17),.06),12)
  }
  return d;
}
vec3 nrmInt(vec3 p){
  int m;vec2 e=vec2(.0012,-.0012);
  return normalize(e.xyy*mapInt(p+e.xyy,m)+e.yyx*mapInt(p+e.yyx,m)+e.yxy*mapInt(p+e.yxy,m)+e.xxx*mapInt(p+e.xxx,m));
}
// march the interior. ex=true when the ray leaves through a window pane at pg
float traceInt(vec3 ro,vec3 rd,int steps,out int m,out bool ex,out vec3 pg){
  float t=0.;ex=false;m=1;
  for(int i=0;i<steps;i++){
    vec3 p=ro+rd*t;
    if(abs(p.z)>GLASS){
      ex=true;t=(sign(rd.z)*GLASS-ro.z)/rd.z;pg=ro+rd*t;return t;
    }
    float d=mapInt(p,m);
    if(d<.0012*(1.+t)) break;
    t+=d;
    if(t>40.) break;
  }
  return t;
}
// what a window shows in reflections and glossy highlights (cheap stand-in for the landscape)
vec3 proxyOut(vec3 rdc){
  vec3 rw=uCarRot*rdc;
  vec3 land=mix(vec3(.2,.24,.13),vec3(.5,.52,.5),ss(.0,.2,rw.y))*1.8;
  return mix(land,skyBase(rw),ss(-.03,.16,rw.y))*uDay*.55;
}
// direct sunlight on an interior point: through a window, past the furniture, past the landscape
float sunIn(vec3 p,vec3 n,bool hi){
  vec3 s=uSunC;
  if(uDay<.01||dot(n,s)<=0.||abs(s.z)<.03) return 0.;
  float t=(sign(s.z)*GLASS-p.z)/s.z;
  vec3 q=p+s*t;
  if(abs(q.x)>ENDX) return 0.;
  float pen=.004+.006*t;
  float v=ss(pen,-pen,winRect(vec2(foldX(q.x),q.y)));
  if(v<=0.) return 0.;
  if(hi){
    float tt=.03;int m;
    for(int i=0;i<22;i++){
      float d=mapInt(p+n*.004+s*tt,m);
      v=min(v,18.*d/tt);
      tt+=clamp(d,.02,.25);
      if(v<.01||tt>t) break;
    }
    v=sat(v);
    if(v<=0.) return 0.;
  }
  vec3 wq=uCarPos+uCarRot*q;
  v*=shadowT(wq)*cloudSh(wq);
  if(hi&&v>.01){
    vec3 acc=vec3(0.);float tr=1.;
    treeRow(wq,uSun,-7.5,7.5,5.,300.,acc,tr);
    treeRow(wq,uSun,-12.,8.,6.,300.,acc,tr);
    v*=tr;
  }
  return v;
}
float aoInt(vec3 p,vec3 n){
  float a=0.,s=1.;int m;
  for(int i=1;i<=4;i++){float h=.035*float(i);a+=(h-mapInt(p+n*h,m))*s;s*=.6;}
  return sat(1.-3.2*a);
}
// mirror-like term for glossy materials: the windows by day, the lamp strips always
vec3 gloss(vec3 p,vec3 r){
  vec3 c=vec3(0.);
  if(abs(r.z)>.02){
    float t=(sign(r.z)*GLASS-p.z)/r.z;vec3 q=p+r*t;
    c+=proxyOut(r)*ss(.03,-.03,winRect(vec2(foldX(q.x),q.y)))*step(abs(q.x),ENDX);
  }
  if(r.y>.02){
    float t=(CEIL-p.y)/r.y;vec3 q=p+r*t;
    c+=LAMPC*3.4*ss(.085,.06,abs(abs(q.z)-.52))*step(abs(q.x),ENDX);
  }
  return c;
}
vec3 shadeInt(vec3 p,vec3 n,vec3 rd,int m,bool hi){
  float az=abs(p.z),xb=foldX(p.x);
  vec4 nz=vnoise4(p.xz*37.+p.y*19.);
  vec3 alb=vec3(.6);float f0=.0,rough=1.;vec3 emi=vec3(0.);
  if(m==1){
    if(abs(p.x)>ENDX-.02){                                    // end wall with a glazed door
      alb=vec3(.52,.51,.48);
      if(az<.44&&p.y<2.02){alb=vec3(.02,.025,.03);f0=.08;rough=0.;
        if(az>.38||p.y>1.96||p.y<.12) {alb=vec3(.2);f0=.5;}}
      if(az<.34&&abs(p.y-2.1)<.045){
        vec2 dq=fract(vec2(p.z,p.y)*90.)-.5;
        float on=step(.45,hash4(floor(vec2(p.z*90.,p.y*90.))).x)*step(abs(p.z),.3);
        emi=vec3(1.,.5,.08)*2.2*on*ss(.4,.2,length(dq));alb=vec3(.01);
      }
    }else if(p.y<.02){                                        // floor
      alb=vec3(.075,.08,.09)*(.75+.5*nz.x);f0=.03;rough=.5;
      if(az<.27) alb=vec3(.03,.045,.08)*(.7+.6*nz.y);
    }else if(az>HW+.004){alb=vec3(.012);                      // window reveal, rubber gasket
    }else if(p.y>CEIL-.35){alb=vec3(.68,.67,.64);
    }else if(p.y<.16){alb=vec3(.09,.09,.095);
    }else if(p.y<WIN_Y0-.03){alb=vec3(.47,.46,.43)*(.95+.1*nz.z);
    }else alb=vec3(.6,.59,.56);
  }else if(m==4){
    float weave=.75+.5*vnoise(vec2(p.x+p.z,p.y)*210.)*vnoise(vec2(p.x-p.z,p.y)*190.);
    alb=vec3(.035,.062,.12)*weave;
    float stripe=ss(.46,.5,abs(fract((p.y+abs(xb)*.3)*9.)-.5));
    alb=mix(alb,vec3(.16,.11,.045),stripe*.35);
  }else if(m==5){alb=vec3(.2,.085,.035)*(.8+.4*nz.x);f0=.035;rough=.8;
  }else if(m==6){alb=vec3(.045,.046,.05);f0=.04;rough=.6;
  }else if(m==7){
    float grain=vnoise(vec2(p.x*7.,p.z*95.))*.6+vnoise(vec2(p.x*3.,p.z*23.))*.4;
    alb=mix(vec3(.42,.28,.15),vec3(.58,.43,.26),grain);f0=.05;rough=.12;
    if(n.y<.5) alb=vec3(.05,.05,.055);
  }else if(m==8){alb=vec3(.5,.51,.52);f0=.6;rough=.25;
  }else if(m==9){alb=vec3(.8);emi=LAMPC*3.4*step(n.y,-.5);
  }else if(m==10){alb=vec3(.78,.77,.74);f0=.05;rough=.1;
  }else if(m==11){alb=vec3(.045,.022,.01);f0=.04;rough=0.;
  }else if(m==12){alb=p.x>0.?(p.x>3.?vec3(.26,.035,.03):vec3(.1,.11,.065)):vec3(.05,.07,.1);alb*=.8+.4*nz.w;
  }else if(m==13){alb=vec3(.11,.11,.115);f0=.04;rough=.4;}
  float ao=hi?aoInt(p,n):1.;
  // daylight from both window walls
  vec3 E=vec3(0.);
  for(int i=0;i<2;i++){
    float sd=i==0?1.:-1.;
    vec3 L=vec3(0.,1.42-p.y,sd*GLASS-p.z);float d2=dot(L,L);L*=inversesqrt(d2);
    float e=(max(dot(n,L),0.)*.85+.15)*abs(L.z)/(.55+d2);
    E+=mix(vec3(.62,.66,.6),vec3(.74,.86,1.),.5+.5*n.y)*e;
  }
  E*=3.1*uDay*ao;
  // lamp strips (line lights), small fill
  for(int i=0;i<2;i++){
    vec3 L=vec3(0.,CEIL-p.y,(i==0?.52:-.52)-p.z);float dl=length(L);
    E+=LAMPC*.085*(max(dot(n,L/dl),0.)*.9+.1)/(.25+dl)*ao;
  }
  E+=vec3(.011,.012,.014)*ao;
  float sun=sunIn(p,n,hi);
  E+=SUNC*.6*max(dot(n,uSunC),0.)*sun;
  vec3 col=alb*E+emi;
  if(f0>0.){
    vec3 r=reflect(rd,n);
    float fr=f0+(1.-f0)*pow(1.-max(dot(-rd,n),0.),5.);
    col+=gloss(p,r)*fr*(1.-rough*.75)*(hi?ao:1.);
    col+=SUNC*sun*fr*pow(max(dot(r,uSunC),0.),mix(900.,30.,rough))*(8.-7.*rough);
  }
  return col;
}
// the interior as mirrored in a window pane
vec3 reflectInt(vec3 pg,vec3 rr){
  int m;bool ex;vec3 q;
  float t=traceInt(pg,rr,40,m,ex,q);
  if(ex){      // a window opposite: soft-edged, since the eye is focused on the landscape
    vec3 rw=uCarRot*rr;
    float streaks=.65+.7*vnoise(vec2(q.x*.35+uTime*4.,q.y*5.));
    return proxyOut(rr)*streaks*ss(-.005,-.09,winRect(vec2(foldX(q.x),q.y)));
  }
  vec3 p=pg+rr*t;
  return shadeInt(p,nrmInt(p),rr,m,false);
}
</script>
