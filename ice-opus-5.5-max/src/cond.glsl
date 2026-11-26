// ===== Condensation map: drops, runners and fog unrolled around the glass (u: angle, v: height) =====
// output xy: height-field slope (along circumference, up), z: fog density, w: drop coverage
uniform vec2 uSize;
out vec4 o;

const float CIRC = TAU * G_R0;

// one layer of randomly placed drops (spherical caps); the tallest cap under the texel wins
void drops(vec2 uv, float cs0, float seed, float dens, float r0, float r1, inout float best, inout vec2 slope, inout float clear) {
  float N = floor(CIRC / cs0), cs = CIRC / N;
  vec2 g = uv / cs, id = floor(g);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = id + vec2(i, j);
    vec2 wc = vec2(mod(c.x, N), c.y);
    vec3 h = hash32(wc * 1.731 + seed);
    float cl = vnoise(wc * cs * 0.9 + seed) * 1.6;              // clustered, not gridded
    if (h.z > dens * cl) continue;
    vec2 ctr = (c + 0.5 + (h.xy - 0.5) * 0.9) * cs;
    float r = mix(r0, r1, h.x * h.x * h.y);
    vec2 dv = uv - ctr; float dd = length(dv);
    clear = max(clear, smoothstep(r * 1.9, r * 1.2, dd));
    if (dd < r) {
      float ht = sqrt(r * r - dd * dd) * 0.62;
      if (ht > best) { best = ht; slope = -dv / sqrt(max(r * r - dd * dd, r * r * 0.02)) * 0.62; }
    }
  }
}

vec4 condenseUV(vec2 uv) {
  float y = uv.y;
  float cold = smoothstep(uLevel + 0.9, uLevel - 0.25, y);
  float above = 0.12 * smoothstep(G_H - 0.9, uLevel + 1.0, y);
  float grow = smoothstep(-25.0, 55.0, uTime);
  float age = 1.0 + 0.8 * smoothstep(30.0, 400.0, uTime);       // drops keep growing
  float dens = (cold * 0.85 + above) * (0.35 + 0.65 * grow);
  vec2 slope = vec2(0.0); float best = 0.0, clear = 0.0, dummy = 0.0;

  drops(uv, 0.075, 0.37, dens * 0.9, 0.008, 0.030 * age, best, slope, dummy);
  drops(uv, 0.15, 4.10, dens * 0.6, 0.020, 0.060 * age, best, slope, dummy);
  drops(uv, 0.36, 9.30, dens * 0.55 * grow, 0.045, 0.13 * age, best, slope, clear);

  // runners: a heavy drop breaks loose, slides down in stick-slip jerks and wipes a trail through the fog
  {
    float N = floor(CIRC / 0.8), cw = CIRC / N;
    float col = floor(uv.x / cw), cx = (fract(uv.x / cw) - 0.5) * cw;
    float wc = mod(col, N);
    vec3 h = hash32(vec2(wc, 7.7));
    float period = 26.0 + 34.0 * h.x;
    float tt = uTime + h.y * period;
    float cyc = floor(tt / period), lt = tt - cyc * period;
    vec3 h2 = hash32(vec2(wc, cyc + 3.0));
    float live = step(h2.z, 0.42) * smoothstep(25.0, 60.0, uTime);
    float y0 = mix(uLevel - 0.7, uLevel + 0.4, h2.x);
    float dur = 5.0 + 7.0 * h2.y;
    float t0 = 4.0 + fract(h2.z * 7.13) * (period - dur - 8.0);
    float s = clamp((lt - t0) / dur, 0.0, 1.0);
    float prog = s - sin(s * TAU * 3.0) / (TAU * 3.0) * 0.85;      // stick-slip
    float yd = mix(y0, 0.4, prog);
    float xo = (h2.y - 0.5) * 0.4 * cw + 0.06 * sin(y * 2.3 + h2.x * 6.0) + 0.03 * sin(y * 5.1 + h2.y * 9.0);
    float rr = (0.10 + 0.06 * fract(h2.x * 5.3)) * smoothstep(t0 - 5.0, t0, lt) * live;
    vec2 dv = vec2(cx - xo, y - yd);
    dv.y *= dv.y > 0.0 ? 0.78 : 1.3;                                // teardrop, heavy at the bottom
    float dd = length(dv);
    if (dd < rr) {
      float ht = sqrt(rr * rr - dd * dd) * 0.62;
      if (ht > best) { best = ht; slope = -dv / sqrt(max(rr * rr - dd * dd, rr * rr * 0.02)) * 0.66; }
    }
    // trail: cleared where the drop passed, re-fogging over ~12 s
    float passT = t0 + dur * clamp((y0 - y) / max(y0 - 0.4, 0.1), 0.0, 1.0);
    float fresh = smoothstep(12.0, 0.0, lt - passT) * step(passT, lt);
    float tw = (0.55 + 0.35 * vnoise(vec2(y * 3.0, wc))) * rr;
    float trail = smoothstep(tw, tw * 0.5, abs(cx - xo)) * step(yd, y) * step(y, y0 + 0.05) * fresh * live;
    clear = max(clear, trail);
    float by = floor(y / 0.19);
    vec3 hb = hash32(vec2(wc * 3.1 + by, cyc));
    vec2 bv = vec2(cx - xo - (hb.x - 0.5) * tw, (fract(y / 0.19) - 0.5) * 0.19);
    float br = 0.015 + 0.03 * hb.y, bd = length(bv);
    if (trail > 0.4 && hb.z < 0.5 && bd < br) {
      float ht = sqrt(br * br - bd * bd) * 0.62;
      if (ht > best) { best = ht; slope = -bv / sqrt(max(br * br - bd * bd, br * br * 0.02)) * 0.6; }
    }
  }
  float sm = length(slope);
  if (sm > 2.6) slope *= 2.6 / sm;
  float cover = best > 0.0 ? 1.0 : 0.0;
  float fog = cold * grow * (1.0 - clear) * (1.0 - cover) * mix(0.22, 0.42, smoothstep(G_BASE - 0.2, G_BASE + 0.6, y));
  vec2 fz = vec2(vnoise(vec2(uv.x * 14.8, y * 15.0)), vnoise(vec2(uv.x * 14.8 + 7.0, y * 15.0 + 3.0))) - 0.5;
  slope += fz * fog * 0.5;                                          // micro-droplet frosting
  return vec4(slope, fog, cover);
}

void main() {
  vec2 f = gl_FragCoord.xy / uSize;
  o = condenseUV(vec2(f.x * CIRC, f.y * G_H));
}
