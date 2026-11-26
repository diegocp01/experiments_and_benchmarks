// ===== Depth of field: scatter-as-gather bokeh (alpha carries depth) =====
uniform sampler2D uScene;
uniform vec2 uTexel;
uniform float uFocus;
uniform float uAperture;   // CoC in px at infinity
uniform float uMaxCoc;
out vec4 o;
float coc(float z) { return min(uAperture * abs(z - uFocus) / max(z, 1e-3), uMaxCoc); }
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec4 c0 = texture(uScene, uv);
  float cz = c0.a, cs = coc(cz);
  vec3 acc = c0.rgb; float tot = 1.0;
  float radius = 0.8;
  vec3 hp = fract(vec3(gl_FragCoord.xyx) * 0.1031); hp += dot(hp, hp.yzx + 33.33);
  float rot = fract((hp.x + hp.y) * hp.z) * 6.2831853;            // per-pixel spiral rotation: no star patterns
  for (int i = 0; i < 120; i++) {
    if (radius >= uMaxCoc) break;
    float ang = float(i) * 2.39996323 + rot;
    vec4 s = texture(uScene, uv + vec2(cos(ang), sin(ang)) * uTexel * radius);
    float ss = coc(s.a);
    if (s.a > cz) ss = min(ss, cs * 2.0);
    float m = smoothstep(radius - 0.5, radius + 0.5, ss);
    acc += mix(acc / tot, s.rgb, m);
    tot += 1.0;
    radius += 1.6 / radius;
  }
  o = vec4(acc / tot, 1.0);
}
