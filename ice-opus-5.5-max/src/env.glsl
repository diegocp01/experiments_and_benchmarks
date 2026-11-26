// ===== Background bake: a dim back bar seen far out of focus (equirect, rendered once) =====
uniform vec2 uSize;
out vec4 o;
vec3 bokehPal(float h) {
  if (h < 0.45) return vec3(1.0, 0.56, 0.22);
  if (h < 0.72) return vec3(1.0, 0.74, 0.44);
  if (h < 0.90) return vec3(0.95, 0.32, 0.12);
  return vec3(0.35, 0.60, 0.78);
}
vec3 bokehLayer(float az, float el, float cells, float elMin, float elMax, float seed, float dens) {
  vec2 g = vec2(az * cells, el * cells / TAU);
  vec2 id = floor(g), f = fract(g);
  vec3 acc = vec3(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 cid = id + vec2(i, j);
    float elc = (cid.y + 0.5) * TAU / cells;
    if (elc < elMin || elc > elMax) continue;
    vec2 wid = vec2(mod(cid.x, cells), cid.y);
    vec3 h = hash32(wid + seed);
    if (h.z > dens) continue;
    vec2 dv = vec2(i, j) + 0.5 + (h.xy - 0.5) * 0.7 - f;
    float dd = length(dv);
    float rad = 0.18 + 0.22 * hash12(wid + seed + 7.0);
    float disk = smoothstep(rad, rad * 0.9, dd);
    float rim = 1.0 + 0.6 * smoothstep(rad * 0.4, rad * 0.97, dd);
    float tex = 0.92 + 0.08 * vnoise(dv * 9.0 + h.xy * 50.0);
    float b = 0.05 + 0.95 * pow(hash12(wid + seed + 5.0), 4.0);
    acc += disk * rim * tex * b * bokehPal(hash12(wid + seed + 3.0));
  }
  return acc;
}
// back-lit shelves with bottles standing in front of the strip light (all far out of focus)
vec3 shelves(float az, float el) {
  vec3 c = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float y0 = k == 0 ? 0.075 : 0.215, w = k == 0 ? 0.034 : 0.028;
    float band = exp(-pow((el - y0) / w, 2.0));
    if (band < 1e-3) continue;
    float n = 95.0 + 30.0 * float(k);
    float x = az * n + float(k) * 17.0 + 0.35 * sin(az * 23.0 + float(k));   // uneven spacing
    float id = floor(x), f = fract(x);
    vec3 h = hash32(vec2(id, 5.0 + float(k)));
    float hw = 0.18 + 0.22 * h.z;                                     // bottle half-width (cell units)
    float bottle = smoothstep(hw + 0.2, hw - 0.12, abs(f - 0.5 + (h.x - 0.5) * 0.2)) * step(h.x, 0.6);
    float top = y0 + w * (0.1 + 1.4 * h.y);                           // shoulders cut into the glow
    float occl = bottle * smoothstep(top + 0.025, top - 0.025, el);
    vec3 glass = mix(vec3(0.9, 0.45, 0.15), vec3(0.5, 0.6, 0.32), step(0.75, fract(h.z * 9.1)));
    vec3 strip = vec3(1.0, 0.62, 0.3) * band * (0.5 + 0.5 * vnoise(vec2(az * 7.0, float(k))));
    c += mix(strip, strip * glass * 0.45, occl) * (k == 0 ? 0.022 : 0.015);
  }
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float az = uv.x, el = (uv.y - 0.5) * PI;
  vec3 c = vec3(0.0022, 0.0017, 0.0014);
  c += vec3(0.0065, 0.0034, 0.0016) * exp(-pow((el - 0.10) / 0.17, 2.0));
  if (el < 0.0) { o = vec4(c * 0.6, 1.0); return; }
  c += shelves(az, el);
  c += 0.10 * bokehLayer(az, el, 46.0, 0.03, 0.38, 0.0, 0.5);
  c += 0.06 * bokehLayer(az + 0.137, el, 88.0, 0.0, 0.28, 11.0, 0.42);
  c += 0.22 * bokehLayer(az + 0.31, el, 21.0, 0.10, 0.34, 23.0, 0.22);
  o = vec4(c, 1.0);
}
