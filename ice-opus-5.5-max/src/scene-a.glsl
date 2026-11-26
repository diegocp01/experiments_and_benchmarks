// ===== Main ray tracer, part A: lighting, environment, bar top, condensation =====
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanHalf;
uniform sampler2D uCaustic;
uniform float uCausHalf;
uniform sampler2D uEnv;
uniform sampler2D uCond;
uniform float uPixAng;
uniform vec2 uJitter;
out vec4 outColor;

const vec3 LIGHT_COL = vec3(1.0, 0.66, 0.38);   // ~2700K tungsten
const float LIGHT_POW = 5200.0;
const float LIGHT_R = 2.2;                      // emitter radius (soft highlights)

vec3 lightAt(vec3 p, out vec3 L, out float dist) {
  vec3 d = uLightPos - p; dist = length(d); L = d / dist;
  vec3 axis = normalize(vec3(0.0, 2.5, 0.0) - uLightPos);
  float spot = smoothstep(0.86, 0.985, dot(-L, axis));
  return LIGHT_COL * (LIGHT_POW * spot / (dist * dist));
}

// GGX specular for a spherical light: returns BRDF * cos / F (multiply by F and irradiance)
float ggxSpec(vec3 n, vec3 v, vec3 l, float rough, float dist) {
  float a = clamp(rough * rough + LIGHT_R / (2.0 * dist), 1e-3, 1.0);
  vec3 h = normalize(v + l);
  float nh = max(dot(n, h), 0.0), nl = max(dot(n, l), 0.0), nv = max(dot(n, v), 1e-3);
  float a2 = a * a, dd = nh * nh * (a2 - 1.0) + 1.0;
  float k = a * 0.5;
  float G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  return a2 / (PI * dd * dd) * G / (4.0 * nv);
}

// ---------- background (baked once into a mipmapped equirect map) ----------
vec3 envColor(vec3 d, float blur) {
  vec2 uv = vec2(atan(d.z, d.x) / TAU + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
  return textureLod(uEnv, uv, log2(1.0 + blur * 60.0)).rgb;
}

// ---------- caustic + shadow map lookup ----------
vec3 causticAt(vec2 x) {
  vec2 uv = x / (2.0 * uCausHalf) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(1.0);
  float r = length(x);
  float b = (0.035 + 0.022 * max(r - G_R0, 0.0)) / (2.0 * uCausHalf);
  vec3 c = texture(uCaustic, uv).rgb * 0.36;
  c += (texture(uCaustic, uv + vec2(b, 0)).rgb + texture(uCaustic, uv - vec2(b, 0)).rgb +
        texture(uCaustic, uv + vec2(0, b)).rgb + texture(uCaustic, uv - vec2(0, b)).rgb) * 0.16;
  return c;
}

// ---------- bar top: dark varnished walnut, wet ring, stray drops ----------
struct TableS { vec3 col; vec3 n; float F; float rough; };

vec3 woodAlbedo(vec2 x, float lod, out float rough, out vec2 slope) {
  float pw = 24.0;
  float zz = x.y + 11.0;
  float pid = floor(zz / pw);
  float pz = zz - pid * pw;
  vec2 q = vec2(x.x + pid * 37.0, pz + pid * 11.0);
  float big = fbm2(q * vec2(0.022, 0.11));
  float warp = fbm2(q * vec2(0.035, 0.30) + 3.0);
  float depth = 5.5 + 2.8 * sin(q.x * 0.045 + pid * 1.7) + 1.6 * sin(q.x * 0.11 + pid);
  float rings = length(vec2(q.y - pw * 0.5 + (warp - 0.5) * 3.0, depth)) * 1.1 + warp * 1.6;
  rings += 0.35 * sin(rings * 0.9 + big * 4.0);                       // uneven growth years
  float rf = fract(rings);
  float late = smoothstep(0.45, 0.9, rf) * smoothstep(1.0, 0.9, rf) * (0.55 + 0.45 * vnoise(vec2(q.x * 0.08, rings * 0.7)));
  float fine = mix(vnoise(vec2(q.x * 0.30, q.y * 21.0)), 0.5, smoothstep(0.03, 0.09, lod));
  float pores = smoothstep(0.70, 0.92, vnoise(vec2(q.x * 1.6, q.y * 46.0))) * (1.0 - smoothstep(0.015, 0.05, lod));
  vec3 dark = vec3(0.020, 0.0095, 0.005), mid = vec3(0.070, 0.035, 0.018), lite = vec3(0.13, 0.068, 0.034);
  vec3 col = mix(mid, lite, smoothstep(0.25, 0.8, big));
  col = mix(col, dark, late * 0.55);
  col *= 0.9 + 0.2 * fine;
  col = mix(col, dark, pores * 0.55);
  float seam = min(pz, pw - pz);
  col = mix(col, vec3(0.006, 0.003, 0.0015), 1.0 - smoothstep(0.015, 0.05, seam));
  rough = 0.16 + 0.08 * fine + 0.1 * late;
  // varnish orange-peel + seam bevel
  slope = vec2(vnoise(x * 2.2) - 0.5, vnoise(x * 2.2 + 9.0) - 0.5) * 0.012;
  slope.y += (pz < pw * 0.5 ? 1.0 : -1.0) * 0.35 * (1.0 - smoothstep(0.02, 0.11, seam));
  return col;
}

// water ring left by condensation running off the glass, plus a few stray drops
float wetAt(vec2 x, out vec2 slope) {
  float r = length(x), a = atan(x.y, x.x);
  float w = 0.22 + 0.20 * vnoise(vec2(a * 2.4, 1.3)) + 0.12 * vnoise(vec2(a * 6.5, 4.0));
  float outer = G_R0 + w;
  float m = smoothstep(outer + 0.02, outer - 0.05, r);
  float edge = exp(-pow((r - outer + 0.05) / 0.05, 2.0));
  slope = -normalize(x + 1e-5) * edge * 0.6;
  for (int i = 0; i < 6; i++) {
    vec3 h = hash32(vec2(float(i) * 7.3, 2.1));
    float ang = h.x * TAU, rad = G_R0 + 0.7 + h.y * 2.6;
    vec2 c = vec2(cos(ang), sin(ang)) * rad;
    float dr = 0.07 + 0.13 * h.z;
    vec2 dv = x - c; float dd = length(dv);
    if (dd < dr) {
      float s = sqrt(max(dr * dr - dd * dd, 1e-5));
      slope += -dv / s * 0.45 * smoothstep(dr, dr * 0.7, dd);
      m = max(m, smoothstep(dr, dr * 0.85, dd));
    }
  }
  return m;
}

TableS shadeTable(vec3 p, vec3 rd, float fp) {
  TableS T;
  float rough; vec2 sl;
  vec3 alb = woodAlbedo(p.xz, fp, rough, sl);
  vec2 ws; float wet = wetAt(p.xz, ws);
  alb *= mix(1.0, 0.55, wet);
  rough = mix(rough, 0.015, wet);
  sl = mix(sl, ws, wet);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 L; float dl; vec3 E = lightAt(p, L, dl);
  vec3 ca = causticAt(p.xz);
  float r = length(p.xz);
  float ao = r < G_R0 ? 0.55 : 1.0 - 0.6 * exp(-(r - G_R0) * 1.1);
  vec3 amb = vec3(0.020, 0.014, 0.010) * ao;
  float nl = max(dot(n, L), 0.0);
  vec3 v = -rd;
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float Fl = 0.04 + 0.96 * pow(1.0 - max(dot(normalize(L + v), v), 0.0), 5.0);
  T.col = alb / PI * (E * ca * nl + amb) * (1.0 - F) + E * ca * Fl * ggxSpec(n, v, L, rough, dl);
  T.n = n; T.F = F * mix(0.75, 1.0, wet); T.rough = rough;
  return T;
}

// ---------- condensation on the outer wall (rendered each frame into uCond) ----------
vec4 condense(vec3 p, float lod) {
  return textureLod(uCond, vec2(atan(p.z, p.x) / TAU + 0.5, p.y / G_H), lod);
}
