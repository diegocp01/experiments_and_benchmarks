// ===== Temporal anti-aliasing: reproject last frame through the first-hit depth, clamp, blend =====
uniform sampler2D uCur;      // jittered scene (rgb, a = first-hit distance)
uniform sampler2D uHist;     // previous TAA output
uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform vec3 uPrevPos;
uniform mat3 uPrevRot;
uniform float uTanHalf;
uniform float uReset;
out vec4 o;
vec3 toY(vec3 c) { return vec3(dot(c, vec3(0.25, 0.5, 0.25)), dot(c, vec3(0.5, 0.0, -0.5)), dot(c, vec3(-0.25, 0.5, -0.25))); }
vec3 fromY(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uCur, ip, 0);
  // neighbourhood statistics in YCoCg (tonemapped to tame fireflies)
  vec3 m1 = vec3(0.0), m2 = vec3(0.0), lo = vec3(1e9), hi = vec3(-1e9);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec3 s = texelFetch(uCur, clamp(ip + ivec2(i, j), ivec2(0), ivec2(uRes) - 1), 0).rgb;
    vec3 y = toY(s / (1.0 + dot(s, vec3(0.299, 0.587, 0.114))));
    m1 += y; m2 += y * y; lo = min(lo, y); hi = max(hi, y);
  }
  m1 /= 9.0; m2 /= 9.0;
  vec3 sd = sqrt(max(m2 - m1 * m1, 0.0));
  lo = max(lo, m1 - 1.25 * sd); hi = min(hi, m1 + 1.25 * sd);
  // reproject
  vec2 ndc = (2.0 * gl_FragCoord.xy - uRes) / uRes.y;
  vec3 P = uCamPos + normalize(uCamRot * vec3(ndc * uTanHalf, -1.0)) * min(c.a, 5000.0);
  vec3 lp = transpose(uPrevRot) * (P - uPrevPos);
  vec2 pn = lp.xy / max(-lp.z, 1e-4) / uTanHalf;
  vec2 puv = (pn * uRes.y + uRes) * 0.5 / uRes;
  vec3 cy = toY(c.rgb / (1.0 + dot(c.rgb, vec3(0.299, 0.587, 0.114))));
  float alpha = 0.1;
  vec3 hy = cy;
  if (uReset < 0.5 && lp.z < 0.0 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0)))) {
    vec3 h = texture(uHist, puv).rgb;
    hy = clamp(toY(h / (1.0 + dot(h, vec3(0.299, 0.587, 0.114)))), lo, hi);
    float motion = length((puv - gl_FragCoord.xy / uRes) * uRes);
    alpha = mix(0.1, 0.25, smoothstep(0.5, 6.0, motion));
  } else alpha = 1.0;
  vec3 y = mix(hy, cy, alpha);
  vec3 rgb = fromY(y);
  rgb /= max(1.0 - dot(rgb, vec3(0.299, 0.587, 0.114)), 1e-3);     // undo the tonemap
  o = vec4(max(rgb, 0.0), c.a);
}
