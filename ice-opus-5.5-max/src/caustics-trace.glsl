// ===== Caustics pass 1: trace one light ray per texel through the drink onto the bar =====
uniform int uGridN;
uniform float uCausHalf;
layout(location = 0) out vec4 oHit;   // landing x, z, valid
layout(location = 1) out vec4 oCol;   // transmittance

void main() {
  int ix = int(gl_FragCoord.x), iz = int(gl_FragCoord.y);
  vec2 g = (vec2(ix, iz) / float(uGridN - 1) * 2.0 - 1.0) * uCausHalf;
  vec3 ro = uLightPos;
  vec3 rd = normalize(vec3(g.x, 0.0, g.y) - ro);
  vec3 thr = vec3(1.0);
  float valid = 1.0;
  int fails = 0;
  vec2 hitXZ = g;
  vec2 tb = iCylY(ro, rd, B_R, 0.0, B_H);
  if (tb.x < tb.y && tb.y > 0.0) {
    vec3 p = ro + rd * max(tb.x, 0.0);
    int med = M_AIR, steps = 0;
    fails = 0;
    for (int b = 0; b < 12; b++) {
      float tmax = 30.0;
      if (med == M_AIR) { vec2 e = iCylY(p, rd, B_R, -1.0, B_H); tmax = max(e.y, 0.0); }
      if (rd.y < 0.0) tmax = min(tmax, -p.y / rd.y);
      int kind = 0, iid = 0;
      float t = 0.0; bool hit = false;
      for (int i = 0; i < 96; i++) {
        if (steps >= 150) break;
        steps++;
        float d = sdInterfaces(p + rd * t, rd, kind, iid);
        if (d < EPS) { hit = true; break; }
        t += d;
        if (t >= tmax) { t = tmax; break; }
      }
      thr *= exp(-sigmaOf(med) * t);
      p += rd * t;
      if (!hit) { if (med != M_AIR) fails = 1; break; }
      if (b == 11) fails = 2;
      vec3 n = interfaceNormal(p, kind, iid);
      if (dot(n, rd) > 0.0) n = -n;
      int other = otherMedium(p, rd, kind, med);
      if (other == med) { p += rd * (EPS * 4.0); continue; }
      float eta = iorOf(med) / iorOf(other);
      vec3 rt = refract(rd, n, eta);
      if (dot(rt, rt) < 1e-6) { rd = reflect(rd, n); p += n * (EPS * 2.0); continue; }
      thr *= 1.0 - fresnel(-dot(rd, n), eta);
      rd = rt; p -= n * (EPS * 2.0); med = other;
    }
    if (rd.y > -1e-4 || fails > 0) { valid = 0.0; }
    else { hitXZ = (p + rd * (-p.y / rd.y)).xz; }
  }
  oHit = vec4(hitXZ, valid, 0.0);
  oCol = vec4(thr, 1.0);
}
