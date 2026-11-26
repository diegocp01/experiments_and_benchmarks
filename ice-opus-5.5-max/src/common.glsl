// ===== Shared scene description: glass, ice, whiskey (units: cm, table at y = 0) =====
uniform float uTime;
uniform float uMelt;          // 0 fresh ice .. 1 well melted
uniform float uLevel;         // whiskey surface height
uniform vec3  uIceP[3];       // cube centres
uniform mat3  uIceR[3];       // world -> cube-local rotation
uniform vec4  uIceS[3];       // half extents xyz, edge radius w
uniform vec4  uRip[4];        // ripple sources: x, z, start time, amplitude
uniform vec3  uLightPos;

#define PI  3.14159265359
#define TAU 6.28318530718
#define EPS 0.0015

// heavy-based rocks glass
const float G_H = 9.2;        // height
const float G_R0 = 4.05;      // outer radius at the foot
const float G_TAPER = 0.035;  // radius growth per cm of height
const float G_T = 0.30;       // wall thickness
const float G_BASE = 1.55;    // inner floor height
const float G_RB = 0.32;      // outer foot rounding
const float G_RF = 0.70;      // inner floor fillet
const float B_R = 4.48;       // bounding cylinder
const float B_H = 9.32;

const int M_AIR = 0, M_GLASS = 1, M_WHISKEY = 2, M_ICE = 3;
const int K_GLASS = 0, K_ICE = 1, K_LIQ = 2;

// absorption per cm
const vec3 SIG_GLASS   = vec3(0.016, 0.005, 0.011);
const vec3 SIG_ICE     = vec3(0.010, 0.0035, 0.0012);
const vec3 SIG_WHISKEY = vec3(0.085, 0.29, 0.78);

// ---------- hashing / noise ----------
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; }
  return s / 0.9375;
}

// ray vs vertical cylinder r<R, y0<y<y1 ; returns (tnear, tfar)
vec2 iCylY(vec3 ro, vec3 rd, float R, float y0, float y1) {
  float a = dot(rd.xz, rd.xz), b = dot(ro.xz, rd.xz), c = dot(ro.xz, ro.xz) - R * R;
  float t0, t1;
  if (a < 1e-9) { if (c > 0.0) return vec2(1e9, -1e9); t0 = -1e9; t1 = 1e9; }
  else { float h = b * b - a * c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); t0 = (-b - h) / a; t1 = (-b + h) / a; }
  float ry = abs(rd.y) < 1e-7 ? 1e-7 : rd.y;
  float ta = (y0 - ro.y) / ry, tb = (y1 - ro.y) / ry;
  return vec2(max(t0, min(ta, tb)), min(t1, max(ta, tb)));
}

// ---------- glass ----------
float sdRB2(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }

// x: glass solid, y: inner cavity (both negative inside)
vec2 glassSD(vec3 p) {
  float rr = length(p.xz) - G_TAPER * p.y;
  float htop = G_H - G_T * 0.5;
  float dO = max(sdRB2(vec2(rr, p.y - (htop + 2.0) * 0.5), vec2(G_R0, (htop + 2.0) * 0.5), G_RB), p.y - htop);
  float dC = sdRB2(vec2(rr, p.y - (G_BASE + 30.0)), vec2(G_R0 - G_T, 30.0), G_RF);
  float dT = length(vec2(rr - (G_R0 - G_T * 0.5), p.y - htop)) - G_T * 0.5;   // rounded rim
  return vec2(min(max(dO, -dC), dT), dC);
}

// ---------- ice ----------
float iceBump(vec3 q, float s) {
  float a = 0.016 + 0.05 * uMelt;
  return a * sin(q.x * 2.1 + s) * sin(q.y * 2.6 + s * 1.7) * sin(q.z * 2.3 + s * 2.9)
       + a * 0.5 * sin(q.x * 4.3 + q.z * 3.1 + s * 4.1) * sin(q.y * 3.7 - s);
}
float sdIceI(vec3 p, int i) {
  vec3 q = uIceR[i] * (p - uIceP[i]);
  vec4 s = uIceS[i];
  vec3 d = abs(q) - (s.xyz - s.w);
  float b = length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - s.w;
  if (b > 0.2) return (b - 0.1) * 0.9;            // far: the melt bumps (|bump| < 0.1) cannot matter
  return (b + iceBump(q, float(i) * 2.7)) * 0.9;
}
float sdIce(vec3 p, out int id) {
  float d = 1e5; id = 0;
  for (int i = 0; i < 3; i++) {
    float bs = length(p - uIceP[i]) - length(uIceS[i].xyz) - 0.08;   // bounding sphere
    float di = bs > 0.25 ? bs : sdIceI(p, i);
    if (di < d) { d = di; id = i; }
  }
  return d;
}

// ---------- whiskey surface ----------
float liquidH(vec3 p) {
  float r = length(p.xz);
  float ri = G_R0 - G_T + G_TAPER * uLevel;
  float h = uLevel + 0.10 * exp(-max(ri - r, 0.0) * 7.5);            // meniscus on the glass
  int id; float di = sdIce(vec3(p.x, uLevel, p.z), id);
  h += 0.055 * exp(-max(di, 0.0) * 10.0);                            // meniscus on the ice
  for (int k = 0; k < 4; k++) {                                       // ripples from shifting cubes
    vec4 R = uRip[k];
    float age = uTime - R.z;
    if (age < 0.0 || age > 4.0) continue;
    float x = length(p.xz - R.xy) - age * 6.5;
    h += R.w * exp(-age * 1.1) * exp(-x * x * 0.7) * cos(x * 5.5);                          // ring
    h += R.w * 1.6 * exp(-age * 0.8) * sin(age * 15.0) * dot(p.xz, normalize(R.xy + 1e-3)) / 3.8; // slosh
  }
  h += 0.003 * sin(p.x * 2.9 + uTime * 1.3) * sin(p.z * 3.3 - uTime * 1.05);
  return h;
}

// ---------- media & interfaces ----------
int mediumAt(vec3 p) {
  vec2 gc = glassSD(p);
  if (gc.x < 0.0) return M_GLASS;
  if (gc.y > 0.0) return M_AIR;
  int id;
  if (sdIce(p, id) < 0.0) return M_ICE;
  return p.y < uLevel ? M_WHISKEY : M_AIR;
}

// distance (along the ray) to the nearest optical interface of any kind.
// The whiskey surface is intersected as an exact plane; meniscus and ripples live in its normal.
float sdInterfaces(vec3 p, vec3 rd, out int kind, out int iceId) {
  vec2 gc = glassSD(p);
  float d = abs(gc.x);
  kind = K_GLASS; iceId = 0;
  if (gc.y < 0.2) {
    int id; float di = sdIce(p, id);
    if (abs(di) < d) { d = abs(di); kind = K_ICE; iceId = id; }
    float dy = uLevel - p.y;
    float dl = dy * rd.y > 0.0 ? dy / rd.y : 1e5;
    dl = max(dl, max(gc.y, -di));
    if (dl < d) { d = dl; kind = K_LIQ; }
  }
  return d;
}

// medium on the far side of an interface, inferred from what was hit (cheaper than mediumAt)
int otherMedium(vec3 p, vec3 rd, int kind, int med) {
  if (kind == K_LIQ) return med == M_WHISKEY ? M_AIR : M_WHISKEY;
  vec3 q = p + rd * (EPS * 3.0);
  if (kind == K_ICE) return med != M_ICE ? (sdIceI(q, 0) < 0.0 || sdIceI(q, 1) < 0.0 || sdIceI(q, 2) < 0.0 ? M_ICE : med)
                                         : (q.y < uLevel ? M_WHISKEY : M_AIR);
  vec2 gc = glassSD(q);
  if (gc.x < 0.0) return M_GLASS;
  return gc.y < 0.0 ? (q.y < uLevel ? M_WHISKEY : M_AIR) : M_AIR;
}

vec3 interfaceNormal(vec3 p, int kind, int iceId) {
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.002;
  if (kind == K_GLASS)
    return normalize(k.xyy * glassSD(p + k.xyy * h).x + k.yyx * glassSD(p + k.yyx * h).x +
                     k.yxy * glassSD(p + k.yxy * h).x + k.xxx * glassSD(p + k.xxx * h).x);
  if (kind == K_ICE)
    return normalize(k.xyy * sdIceI(p + k.xyy * h, iceId) + k.yyx * sdIceI(p + k.yyx * h, iceId) +
                     k.yxy * sdIceI(p + k.yxy * h, iceId) + k.xxx * sdIceI(p + k.xxx * h, iceId));
  const float e = 0.004;
  float hx = liquidH(p + vec3(e, 0, 0)) - liquidH(p - vec3(e, 0, 0));
  float hz = liquidH(p + vec3(0, 0, e)) - liquidH(p - vec3(0, 0, e));
  return normalize(vec3(-hx, 2.0 * e, -hz));
}

float iorOf(int m) { return m == M_GLASS ? 1.52 : m == M_WHISKEY ? 1.36 : m == M_ICE ? 1.31 : 1.0; }
vec3 sigmaOf(int m) { return m == M_GLASS ? SIG_GLASS : m == M_WHISKEY ? SIG_WHISKEY : m == M_ICE ? SIG_ICE : vec3(0.0); }

// unpolarised dielectric Fresnel, eta = n1 / n2
float fresnel(float cosi, float eta) {
  cosi = clamp(cosi, 0.0, 1.0);
  float st2 = eta * eta * (1.0 - cosi * cosi);
  if (st2 >= 1.0) return 1.0;
  float ct = sqrt(1.0 - st2);
  float rs = (eta * cosi - ct) / (eta * cosi + ct);
  float rp = (cosi - eta * ct) / (cosi + eta * ct);
  return 0.5 * (rs * rs + rp * rp);
}
