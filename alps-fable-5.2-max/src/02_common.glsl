<script id="g-common" type="x-shader/x-fragment">
// ───────────────────────── shared: noise, track geometry, terrain height ─────────────────────────
const float PI=3.14159265;
const float PERIOD=4800.;                 // route program repeats every 4.8 km (mountains do not)
const float TK1=2.*PI*2./PERIOD, TK2=2.*PI*5./PERIOD;
const float TA1=105., TA2=26., TP1=.6, TP2=1.9;
const vec2  TUN_A=vec2(3900.,4500.), TUN_B=vec2(1750.,2000.);   // tunnels (route metres)
const float VIA0=3452., VIA1=3688., GORGE_X=3570.;              // viaduct over the side gorge
const float VILA_X=2450., VILA_Z=100., VILA_Y=-30.;             // hamlet below the track
const float VILB_X=1050.;                                       // lakeside village
const float WATER=-128.;
const mat2  M2=mat2(.8,-.6,.6,.8);

uniform sampler2D uNoise;   // lattice value + its 3 neighbours, NEAREST
uniform sampler2D uHash;    // 4 independent random channels, NEAREST
uniform sampler2D uSmooth;  // same data as uHash, LINEAR
uniform sampler2D uRoute;   // per-metre route profile over one 4.8 km cycle: r lake(+) / dense forest(-), g tunnel spur height, b gorge, a valley offset
uniform sampler2D uForest;  // tiling forest-cover noise (2160 m): r cover, g tree-line jitter
uniform sampler2D uBake;    // mountain relief baked once at start-up (30.4 km tile): r relief, gb slope accumulator, a massif

float ss(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}   // edges may be given in either order
float sat(float x){return clamp(x,0.,1.);}
vec4 hash4(vec2 c){return texelFetch(uHash,ivec2(floor(c))&255,0);}
vec3 noised(vec2 x){
  vec2 i=floor(x),f=x-i,u=f*f*(3.-2.*f),du=6.*f*(1.-f);
  vec4 t=texelFetch(uNoise,ivec2(i)&255,0);
  float k1=t.y-t.x,k2=t.z-t.x,k4=t.x-t.y-t.z+t.w;
  return vec3(t.x+k1*u.x+k2*u.y+k4*u.x*u.y,du*(vec2(k1,k2)+k4*u.yx));
}
vec4 vnoise4(vec2 x){vec2 i=floor(x),f=x-i;f=f*f*(3.-2.*f);return textureLod(uSmooth,(i+f+.5)/256.,0.);}
float vnoise(vec2 x){return vnoise4(x).x;}
float fbm(vec2 p){float a=0.,b=.5;for(int i=0;i<4;i++){a+=b*vnoise(p);p=M2*p*2.03;b*=.5;}return a;}
// Eroded relief: the 5 coarse octaves come from the baked tile, finer ones are added live.
// Octaves are damped by the accumulated slope; a fractional octave count fades the last one in.
float gLod=0.;            // mip level for the baked relief: the marcher uses coarse levels while far above the ground
float relief(vec2 q,float oct,out float massif){
  vec4 B=textureLod(uBake,q/30400.,gLod);
  massif=B.a;
  float a=B.r;
  if(oct>5.){
    float b=1./32.;vec2 d=B.gb,p=q*(32./1900.);
    for(int i=5;i<11;i++){
      float w=min(oct-float(i),1.);if(w<=0.)break;
      vec3 n=noised(p);d+=n.yz;a+=w*b*(n.x-.5)/(1.+dot(d,d));b*=.5;p=M2*p*2.;
    }
  }
  return a;
}

float trackZ(float x){return TA1*sin(TK1*x+TP1)+TA2*sin(TK2*x+TP2);}
float trackD(float x){return TA1*TK1*cos(TK1*x+TP1)+TA2*TK2*cos(TK2*x+TP2);}
bool inTunnel(float xm){return (xm>TUN_A.x&&xm<TUN_A.y)||(xm>TUN_B.x&&xm<TUN_B.y);}

// Macro terrain before the railway bench is cut. g = (zr, u, yFloor, lake(+)/dense forest(-))
float hBase(vec2 q,float oct,out vec4 g){
  float x=q.x,xm=mod(x,PERIOD);
  float zr=q.y-trackZ(x);
  vec4 L=textureLod(uRoute,vec2(x/PERIOD,.5),0.);
  float lake=max(L.x,0.),zv=L.w;                                   // valley axis, to the window side
  float u=zr-zv,a=abs(u);
  float yF=-112.-28.*lake;
  float a0=mix(75.,290.,lake);
  float b=max(a-a0,0.);
  float nm,rel=relief(q,oct,nm);
  float w;
  if(u>0.) w=(1300.+1500.*nm)*(1.-exp(-b/4200.));
  else{float r=b/(zv-a0);w=-yF*(r<1.?pow(r,1.3):1.+1.3*(r-1.)/(1.+.45*(r-1.)));}
  float amp=1500.*ss(100.,4300.,a)*(.025+.975*ss(12.,520.,abs(zr)));
  float h=yF+w+amp*rel;
  g=vec4(zr,u,yF,L.x);
  // spurs the tunnels pass under
  if(L.y>0.) h+=L.y*(1.-ss(90.,560.,zr));
  // side gorge crossed by the viaduct
  if(L.z>0.) h-=L.z*ss(40.,-60.,u)*ss(-1500.,-600.,zr)*max(h-max(-66.-.11*zr,yF+1.),0.);
  // village terraces
  if(abs(xm-VILA_X)<170.) h=mix(h,VILA_Y,(1.-ss(.55,1.,length(vec2(xm-VILA_X,zr-VILA_Z)/vec2(165.,62.))))*.93);
  if(abs(xm-VILB_X)<205.) h=mix(h,yF+21.,(1.-ss(.5,1.,length(vec2(xm-VILB_X,u+a0+98.)/vec2(200.,70.))))*.93);
  return h;
}
// railway bench: cut / fill slopes, open under the viaduct, untouched above tunnels
float bench(float h,float zr,float xm){
  if(inTunnel(xm)) return h;
  float w=max(abs(zr)-3.3,0.);
  float lo=-.72*w-((xm>VIA0&&xm<VIA1)?400.:0.);
  return clamp(h,lo,(zr<0.?1.15:1.2)*w);
}
// where conifers grow (0..1), ignoring the cleared railway corridor. t: distance (level of detail)
float forestField(vec2 q,float h,vec4 g,float t){
  float xm=mod(q.x,PERIOD);
  vec4 fn=textureLod(uForest,q/2160.,max(log2(t*.00028),0.));
  float thr=mix(.5,.2,max(-g.w,0.))-.17*ss(0.,300.,g.y);
  float m=ss(thr,thr+.13,fn.x);
  m*=ss(g.z+3.,g.z+16.,h)*(1.-ss(380.,560.,h+60.*fn.y));
  if(abs(xm-VILA_X)<210.) m*=ss(.9,1.25,length(vec2(xm-VILA_X,g.x-VILA_Z)/vec2(165.,62.)));
  if(abs(xm-VILB_X)<255.) m*=ss(.9,1.25,length(vec2(xm-VILB_X,g.y+mix(75.,290.,max(g.w,0.))+98.)/vec2(200.,70.)));
  return m;
}
// beyond the trackside rows the forest is part of the height field
float forestMask(vec2 q,float h,vec4 g,float t){
  return forestField(q,h,g,t)*ss(40.,58.,abs(g.x));
}
// conifer canopy as a height field: individual cones near, lumpy blanket far
float canopy(vec2 q,float m,float t){
  if(m<.01) return 0.;
  float lump=11.*m*(.75+.5*vnoise(q/7.))*(1.-ss(1800.,2600.,t));
  if(t>650.) return lump;
  vec2 c=q/6.4,i=floor(c),f=c-i;vec4 r=hash4(i);
  vec2 o=.5+(r.xy-.5)*.62,dv=f-o;float d=length(dv)*6.4;
  d*=1.+.5*(vnoise(vec2(atan(dv.y,dv.x)*1.9+r.x*20.,r.w*31.))-.5);           // ragged outline
  float cone=m>.15+.5*r.z?(7.+16.*r.w*r.w)*pow(max(0.,1.-d/(1.2+1.5*r.z)),.85):0.;
  return mix(cone,lump,ss(380.,650.,t));
}
// ground height; t = ray distance (level of detail). g as in hBase
// yq: height of the query point; small relief is only worth evaluating close to the surface
float ground(vec2 q,float t,float oct,float yq,out vec4 g){
  float h=hBase(q,oct,g);
  if(t<450.&&yq-h<4.){
    float k=(1.-ss(250.,450.,t));
    vec4 n=vnoise4(q/23.);
    h+=k*(1.5*(n.x-.5)+.4*(vnoise(q/5.3)-.5))*ss(3.5,9.,abs(g.x));
  }
  return bench(h,g.x,mod(q.x,PERIOD));
}
</script>
