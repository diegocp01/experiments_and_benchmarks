// ===== Bloom, filmic tone map, grade, vignette, grain =====
uniform sampler2D uImg;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
out vec4 o;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 tap4(vec2 uv, float lod) {
  vec2 d = exp2(lod) / uRes;
  return 0.25 * (textureLod(uImg, uv + vec2(d.x, d.y), lod).rgb + textureLod(uImg, uv + vec2(-d.x, d.y), lod).rgb +
                 textureLod(uImg, uv + vec2(d.x, -d.y), lod).rgb + textureLod(uImg, uv - d, lod).rgb);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 cc = uv - 0.5;
  float ca = dot(cc, cc) * 0.006;
  vec3 c = vec3(texture(uImg, uv - cc * ca).r, texture(uImg, uv).g, texture(uImg, uv + cc * ca).b);
  vec2 px = 1.0 / vec2(textureSize(uImg, 0));                          // gentle unsharp mask at scene resolution
  vec3 nb = 0.25 * (texture(uImg, uv + vec2(px.x, 0)).rgb + texture(uImg, uv - vec2(px.x, 0)).rgb +
                    texture(uImg, uv + vec2(0, px.y)).rgb + texture(uImg, uv - vec2(0, px.y)).rgb);
  c = max(c + (c - nb) * 0.35 / (1.0 + dot(abs(c - nb), vec3(0.33))), 0.0);
  vec3 bl = tap4(uv, 2.0) * 0.45 + tap4(uv, 4.0) * 0.35 + textureLod(uImg, uv, 6.0).rgb * 0.2;
  c += max(bl - 0.02, 0.0) * 0.14 * vec3(1.0, 0.85, 0.7);
  c *= uExposure;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, c * vec3(1.03, 1.0, 0.94), smoothstep(0.2, 0.9, lum));        // warm highlights
  c = mix(vec3(lum), c, 1.06);
  c *= 1.0 - 0.55 * pow(length(cc * vec2(1.0, 0.85)) * 1.25, 2.6);          // vignette
  float gr = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5;
  c += gr * 0.022;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}
