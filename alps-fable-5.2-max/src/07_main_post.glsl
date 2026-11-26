<script id="g-main" type="x-shader/x-fragment">
// ───────────────────────── scene pass: interior, glass, world ─────────────────────────
uniform vec2 uRes;
uniform vec3 uCamPos;      // eye in carriage space
uniform mat3 uCamRot;      // camera -> carriage (right, up, forward)
uniform float uTanFov;
flat in float vSun;        // sunlight reaching the carriage roof (computed once per frame in the vertex stage)
layout(location=0) out vec4 oExt;   // rgb: world seen through glass, a: distance
layout(location=1) out vec4 oInt;   // rgb: interior / reflections on the glass, a: glass transmittance
#ifdef PREPASS
void main(){                 // half resolution: only how far the terrain is along each ray
  vec2 uv=(gl_FragCoord.xy*4.-uRes)/uRes.y;
  vec3 rd=normalize(uCamRot*vec3(uv*uTanFov,1.));
  int m;bool ex;vec3 pg;
  traceInt(uCamPos,rd,110,m,ex,pg);
  oExt=vec4(-2.);oInt=vec4(0.);
  if(!ex||winRect(vec2(foldX(pg.x),pg.y))>-.013) return;
  oExt=vec4(preWorld(uCarPos+uCarRot*pg,uCarRot*rd));
}
#else
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-uRes)/uRes.y;
  vec3 rd=normalize(uCamRot*vec3(uv*uTanFov,1.));
  int m;bool ex;vec3 pg;
  float t=traceInt(uCamPos,rd,110,m,ex,pg);
  oExt=vec4(0.);
  if(!ex){
    vec3 p=uCamPos+rd*t;
    oInt=vec4(shadeInt(p,nrmInt(p),rd,m,true),0.);
    return;
  }
  if(winRect(vec2(foldX(pg.x),pg.y))>-.013){oInt=vec4(vec3(.004),0.);return;}     // rubber gasket
  float sd=sign(rd.z);
  float F=.03+.97*pow(1.-abs(rd.z),5.);
  vec3 refl=reflectInt(pg-vec3(0.,0.,sd*.003),vec3(rd.xy,-rd.z));
  // grime on the pane: soft smudges, fine vertical wash marks, a few specks
  vec2 gq=pg.xy+vec2(sd*3.7,0.);
  float dirt=vnoise(gq*vec2(6.,2.1))*vnoise(gq*27.)+.3*ss(.72,1.,vnoise(gq*vec2(230.,9.)))*vnoise(gq*3.);
  float speck=ss(.93,1.,vnoise(gq*190.))*.6;
  float sunOnPane=max(sd*uSunC.z,0.)*vSun;
  vec3 veil=(vec3(.7,.79,.92)*uDay*.9+SUNC*sunOnPane*1.6)*(.006+.035*dirt+.05*speck);
  vec4 w=renderWorld(uCarPos+uCarRot*pg,uCarRot*rd);
  oExt=vec4(w.rgb,min(t+w.a,60000.));
  oInt=vec4(F*refl+veil,(1.-F)*(.94-.22*dirt-.3*speck));
}
#endif
</script>

<script id="v-scene" type="x-shader/x-vertex">
// full-screen triangle; also meters the sunlight at the carriage once per frame
flat out float vSun;
uniform vec3 uCarPos;
float objShadow(vec3 p){return 1.;}
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  gl_Position=vec4(p*2.-1.,0.,1.);
  vec3 c=uCarPos+vec3(0.,2.6,0.);
  vSun=shadowT(c)*cloudSh(c);
}
</script>

<script id="f-bake" type="x-shader/x-fragment">#version 300 es
// ───────────────────────── one-off bake of the coarse mountain relief into a seamless tile ─────────────────────────
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uHash;uniform float uSize;
out vec4 o;
float lat(ivec2 i,int per,ivec2 off){i=((i%per)+per)%per;return texelFetch(uHash,(i+off)&255,0).x;}
vec3 nd(vec2 x,int per,ivec2 off){                  // periodic value noise with derivatives, quintic
  vec2 i=floor(x),f=x-i,u=f*f*f*(f*(f*6.-15.)+10.),du=30.*f*f*(f*(f-2.)+1.);
  ivec2 ii=ivec2(i);
  float a=lat(ii,per,off),b=lat(ii+ivec2(1,0),per,off),c=lat(ii+ivec2(0,1),per,off),d=lat(ii+ivec2(1,1),per,off);
  float k1=b-a,k2=c-a,k4=a-b-c+d;
  return vec3(a+k1*u.x+k2*u.y+k4*u.x*u.y,du*(vec2(k1,k2)+k4*u.yx));
}
void main(){
  vec2 q=gl_FragCoord.xy/uSize*16.;                 // base-octave cells; the tile is 16 of them
  vec2 w=vec2(nd(q*.5+3.3,8,ivec2(17,91)).x,nd(q*.5+7.1,8,ivec2(63,5)).x)-.5;      // periodic domain warp
  w+=.5*(vec2(nd(q+1.7,16,ivec2(111,40)).x,nd(q+4.2,16,ivec2(29,77)).x)-.5);
  vec2 p=q+w*.9,d=vec2(0.);
  float a=0.,b=1.;int per=16;
  for(int i=0;i<5;i++){
    vec3 n=nd(p,per,ivec2(i*37,i*59));
    d+=n.yz;a+=b*n.x/(1.+dot(d,d));
    b*=.5;p=p*2.+vec2(.37,.71);per*=2;
  }
  float rn=nd(q*2.+w*1.3+5.5,32,ivec2(200,13)).x,rdg=1.-abs(2.*rn-1.);            // sharp crests
  o=vec4(a-.62+.2*(rdg*rdg-.33),d,nd(q*(5./16.)+.5,5,ivec2(150,150)).x);
}
</script>

<script id="v-quad" type="x-shader/x-vertex">#version 300 es
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}
</script>

<script id="f-comp" type="x-shader/x-fragment">#version 300 es
// ───────────────────────── composite: motion blur of the world behind the glass, then the glass layer ─────────────────────────
precision highp float;precision highp sampler2D;
uniform sampler2D uExt,uInt;
uniform vec2 uRes;uniform float uTanFov,uMaxBlur,uJit;
uniform vec3 uCamW,uPrevCamW;uniform mat3 uBasis,uPrevBasis;
out vec4 o;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
// screen-space motion (pixels) of a world point at this pixel and distance over the shutter interval
vec2 vel(vec2 fc,float depth){
  vec2 uv=(fc*2.-uRes)/uRes.y;
  vec3 pw=uCamW+normalize(uBasis*vec3(uv*uTanFov,1.))*depth;
  vec3 q=(pw-uPrevCamW)*uPrevBasis;
  return (uv-q.xy/(max(q.z,1e-3)*uTanFov))*uRes.y*.5;
}
void main(){
  vec2 fc=gl_FragCoord.xy;ivec2 ic=ivec2(fc);
  vec4 I=texelFetch(uInt,ic,0);
  if(I.a<=0.){o=vec4(I.rgb,1.);return;}
  vec4 E=texelFetch(uExt,ic,0);
  vec2 vn=vel(fc,6.);float ln=length(vn);
  vec2 dir=ln>1e-3?vn/ln:vec2(1.,0.);
  const int N=14;
  float R=uMaxBlur,D=2.*R/float(N),jit=ign(fc+uJit)-.5;
  vec3 acc=vec3(0.);float ws=0.;
  for(int i=0;i<N;i++){
    float s=((float(i)+.5+jit)/float(N)*2.-1.)*R;
    vec2 pc=fc+dir*s;
    if(pc.x<0.||pc.y<0.||pc.x>=uRes.x||pc.y>=uRes.y) continue;
    ivec2 ip=ivec2(pc);
    if(texelFetch(uInt,ip,0).a<=0.) continue;
    vec4 e=texelFetch(uExt,ip,0);
    float L=min(length(vel(pc,e.a))*.5,R);          // half-length of that sample's streak
    if(L<D*.5) continue;                            // practically static: only matters for its own pixel
    float w=D/(2.*L)*(1.-smoothstep(L-D*.5,L+D*.5,abs(s)));
    acc+=e.rgb*w;ws+=w;
  }
  vec3 c=ws>1.?acc/ws:acc+E.rgb*(1.-ws);
  o=vec4(c*I.a*vec3(.955,1.,.975)+I.rgb,1.);
}
</script>

<script id="g-expo" type="x-shader/x-fragment">
uniform sampler2D uAdapt;uniform float uKey;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float exposure(){float L=texelFetch(uAdapt,ivec2(0),0).r;return clamp(uKey*pow(max(L,1e-4),-.95),.04,14.);}
</script>

<script id="f-bright" type="x-shader/x-fragment">
// half-resolution bright pass (exposed units) + luminance for metering in alpha; mip chain is built from it
uniform sampler2D uSrc;uniform vec2 uResB;
out vec4 o;
void main(){
  vec2 uv=gl_FragCoord.xy/uResB,px=.5/uResB;
  vec3 a=texture(uSrc,uv+px*vec2(-1.,-1.)).rgb,b=texture(uSrc,uv+px*vec2(1.,-1.)).rgb;
  vec3 c=texture(uSrc,uv+px*vec2(-1.,1.)).rgb,d=texture(uSrc,uv+px).rgb;
  float E=exposure();
  vec4 w=1./(1.+E*vec4(lum(a),lum(b),lum(c),lum(d)));
  vec3 m=(a*w.x+b*w.y+c*w.z+d*w.w)/(w.x+w.y+w.z+w.w)*E;
  float l=lum(m);
  vec3 br=min(m*max(l-.85,0.)/max(l,1e-4),vec3(30.));
  // metering: plain average luminance (highlights count, so snow and sky keep their detail); the sun itself is clipped
  o=vec4(br,clamp(lum((a+b+c+d)*.25),1e-5,40.));
}
</script>

<script id="f-adapt" type="x-shader/x-fragment">#version 300 es
// eye / auto-exposure adaptation: quick when the scene brightens, slow when it darkens
precision highp float;precision highp sampler2D;
uniform sampler2D uBright,uPrev;uniform float uDt,uReset;
out vec4 o;
void main(){
  // centre-weighted average of the frame, read from a coarse mip (about 8 texels wide)
  ivec2 sz=textureSize(uBright,0);
  float lod=max(log2(float(max(sz.x,sz.y)))-3.,0.),s=0.,ws=0.;
  for(int j=0;j<4;j++)for(int i=0;i<4;i++){
    float w=((i==1||i==2)&&(j==1||j==2))?2.:1.;
    s+=w*textureLod(uBright,(vec2(i,j)+.5)*.25,lod).a;ws+=w;
  }
  float target=log2(max(s/ws,1e-4));
  float prev=log2(max(texelFetch(uPrev,ivec2(0),0).r,1e-4));
  float rate=target>prev?2.3:.8;
  float v=mix(prev,target,1.-exp(-uDt*rate));
  if(uReset>.5) v=target;
  o=vec4(exp2(v),0.,0.,1.);
}
</script>

<script id="f-final" type="x-shader/x-fragment">
// ───────────────────────── lens + film: exposure, bloom, vignette, tone curve, grain ─────────────────────────
uniform sampler2D uSrc,uBright;uniform vec2 uOut;uniform float uTime,uBloom;
out vec4 o;
float h13(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
vec3 aces(vec3 x){return clamp(x*(2.51*x+.03)/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec2 uv=gl_FragCoord.xy/uOut,c=uv-.5;float r2=dot(c,c);
  float E=exposure();
  vec3 col=vec3(texture(uSrc,uv-c*r2*.007).r,texture(uSrc,uv).g,texture(uSrc,uv+c*r2*.007).b);
  // the scene is rendered below display resolution: restore some edge contrast after the upscale
  vec2 px=1./vec2(textureSize(uSrc,0));
  vec3 nb=(texture(uSrc,uv+vec2(px.x,0.)).rgb+texture(uSrc,uv-vec2(px.x,0.)).rgb+texture(uSrc,uv+vec2(0.,px.y)).rgb+texture(uSrc,uv-vec2(0.,px.y)).rgb)*.25;
  col=max(col+(col-nb)*.45*col/(col+nb+1e-3)*2.,0.)*E;
  vec3 bl=vec3(0.);
  vec2 ts=1./vec2(textureSize(uBright,0));
  for(int i=1;i<=6;i++){
    float l=float(i),r=exp2(l)*.5;
    vec3 s=textureLod(uBright,uv+ts*r*vec2(1.,1.),l).rgb+textureLod(uBright,uv+ts*r*vec2(-1.,1.),l).rgb
          +textureLod(uBright,uv+ts*r*vec2(1.,-1.),l).rgb+textureLod(uBright,uv+ts*r*vec2(-1.,-1.),l).rgb;
    bl+=s*.25*(.34-.045*l);
  }
  // faint horizontal streak, as from an anamorphic lens
  bl+=(textureLod(uBright,uv+vec2(ts.x*40.,0.),4.).rgb+textureLod(uBright,uv-vec2(ts.x*40.,0.),4.).rgb
      +textureLod(uBright,uv+vec2(ts.x*90.,0.),5.).rgb+textureLod(uBright,uv-vec2(ts.x*90.,0.),5.).rgb)*vec3(.05,.06,.085);
  col+=bl*uBloom;
  col*=mix(1.,.5,smoothstep(.12,.62,r2));
  col/=1.+.16*lum(col);                             // long, gentle shoulder before the film curve
  col=aces(col*.95);
  col=mix(col,sqrt(col),.14);                       // a little lift in the shadows, as a film print would have
  float g=lum(col);
  col=mix(vec3(g),col,1.06);
  col=mix(col,col*vec3(1.03,1.,.96),smoothstep(.2,.9,g))+vec3(-.004,0.,.006)*(1.-g);
  col=pow(max(col,0.),vec3(1./2.2));
  float gain=smoothstep(.6,6.,E);
  float n=h13(vec3(gl_FragCoord.xy,fract(uTime)*91.7))-.5;
  col+=n*(.022+.05*gain)*(1.-.5*g);
  o=vec4(col,1.);
}
</script>
