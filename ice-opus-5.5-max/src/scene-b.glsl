// ===== Main ray tracer, part B: path through glass / whiskey / ice =====
const int END_ENV = 0, END_TABLE = 1;

struct Path { vec3 col; vec3 thr; vec3 p; vec3 rd; int end; float depth; bool glass; };

float erfA(float x) { float a = abs(x), t = 1.0 / (1.0 + 0.47047 * a); return sign(x) * (1.0 - t * (0.3480242 + t * (-0.0958798 + t * 0.7478556)) * exp(-a * a)); }
float phaseHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5)); }

bool isOuterWall(vec3 p) { return glassSD(p).y > 0.1 && p.y > 0.3 && p.y < G_H - 0.2; }

vec3 reflEnvTable(vec3 p, vec3 dir, float blur) {
  if (dir.y < -0.002) {
    float t = -p.y / dir.y;
    vec3 q = p + dir * t;
    TableS ts = shadeTable(q, dir, 0.05 + t * 0.01);
    return ts.col + ts.F * envColor(reflect(dir, ts.n), 0.5);
  }
  return envColor(dir, blur);
}

// absorption, single scattering and cloudy ice cores along one straight segment
void segment(inout Path P, int med, int iceCur, vec3 p, vec3 rd, float t, bool primary) {
  if (med == M_AIR || t <= 0.0) return;
  if (med == M_GLASS) { P.thr *= exp(-SIG_GLASS * t); return; }
  vec3 mid = p + rd * (t * 0.5);
  vec3 L; float dl; vec3 E = lightAt(mid, L, dl);
  if (med == M_WHISKEY) {
    int id; float di = sdIce(mid, id);
    float dil = uMelt * 0.55 * exp(-max(di, 0.0) * 1.2) * (0.6 + 0.6 * sin(mid.x * 1.9 + 1.3 * sin(mid.y * 2.3 + uTime * 0.05)) * sin(mid.z * 1.7 + 1.1 * sin(mid.x * 2.1 - uTime * 0.04)));
    dil += 0.22 * uMelt * smoothstep(uLevel - 1.4, uLevel, mid.y);           // lighter meltwater layer on top
    vec3 sig = SIG_WHISKEY * (1.0 - min(dil, 0.75));
    vec3 Tv = exp(-sig * t);
    float lp = max(uLevel - mid.y, 0.0) / max(L.y, 0.3) + 0.4;
    vec3 sc = 0.010 * E * exp(-sig * lp) * phaseHG(dot(rd, L), 0.55);
    P.col += P.thr * sc * (1.0 - Tv) / max(sig, vec3(1e-3));
    P.thr *= Tv;
    return;
  }
  // ice: cloudy freezer core as a Gaussian ellipsoid (integrated in closed form) + one internal fracture plane
  P.thr *= exp(-SIG_ICE * t);
  if (!primary) return;
  vec3 q0 = uIceR[iceCur] * (p - uIceP[iceCur]);
  vec3 qd = uIceR[iceCur] * rd;
  float sz = uIceS[iceCur].x;
  float under = step(mid.y, uLevel);
  vec3 Li = E * mix(vec3(1.0), exp(-SIG_WHISKEY * 1.6), under) * phaseHG(dot(rd, L), 0.3) * 1.3 + vec3(0.02, 0.016, 0.013);
  vec3 inv = 1.0 / (sz * vec3(0.52, 0.40, 0.52));
  vec3 a3 = qd * inv, b3 = q0 * inv;
  float A = dot(a3, a3), m = dot(a3, b3) / A, Cc = dot(b3, b3);
  float sa = sqrt(A);
  float I = 0.886227 / sa * exp(min(m * m * A - Cc, 0.0)) * (erfA(sa * (t + m)) - erfA(sa * m));
  vec3 qc = q0 + qd * clamp(-m, 0.0, t);
  float veil = 0.45 + 1.1 * vnoise3(qc * vec3(2.2, 4.5, 2.2) + float(iceCur) * 7.0);
  float Tr = exp(-1.5 * (1.0 - 0.55 * uMelt) * veil * I);
  P.col += P.thr * (1.0 - Tr) * Li * 0.35;
  P.thr *= Tr;
  vec3 cn = normalize(vec3(0.6, 0.3, -0.7) + vec3(0.5, -0.4, 0.6) * float(iceCur));
  float den = dot(qd, cn);
  float tp = (0.12 * sz - dot(q0, cn)) / (abs(den) < 1e-4 ? 1e-4 : den);
  if (tp > 0.0 && tp < t) {
    vec3 qp = q0 + qd * tp;
    float fr = smoothstep(0.9, 0.35, length(qp / sz)) * (0.55 + 0.45 * vnoise3(qp * 3.1 + float(iceCur) * 3.0));
    float k = fr * clamp(0.1 / max(abs(den), 0.06), 0.0, 1.0);       // fractures flash silver at grazing angles
    P.col += P.thr * k * (Li * 0.6 + envColor(transpose(uIceR[iceCur]) * reflect(qd, cn), 0.2) * 0.5);
    P.thr *= 1.0 - 0.12 * k;
  }
}

Path tracePath(vec3 ro, vec3 rd, int maxB, int maxS, bool primary) {
  Path P;
  P.col = vec3(0.0); P.thr = vec3(1.0); P.end = END_ENV; P.depth = 1e4; P.glass = false;
  float tTab = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  vec2 tb = iCylY(ro, rd, B_R, 0.0, B_H);
  bool enter = tb.x < tb.y && tb.y > 0.0 && tb.x < tTab;
  vec3 p = enter ? ro + rd * max(tb.x, 0.0) : ro;
  float tAcc = enter ? max(tb.x, 0.0) : 0.0;
  int med = M_AIR, iceCur = 0, steps = 0, nTir = 0;
  vec3 rfP = vec3(0.0), rfD = vec3(0.0), rfW = vec3(0.0); float rfBlur = 0.0;
  if (enter) {
    for (int b = 0; b < 16; b++) {
      if (b >= maxB) break;
      float tmax = 30.0;
      if (med == M_AIR) { vec2 e = iCylY(p, rd, B_R, -1.0, B_H); tmax = max(e.y, 0.0); }
      if (rd.y < 0.0) tmax = min(tmax, -p.y / rd.y);
      int kind = 0, iid = 0;
      float t = 0.0; bool hit = false;
      for (int i = 0; i < 160; i++) {
        if (steps >= maxS) break;
        steps++;
        float d = sdInterfaces(p + rd * t, rd, kind, iid);
        if (d < EPS) { hit = true; break; }
        t += d;
        if (t >= tmax) { t = tmax; break; }
      }
      segment(P, med, iceCur, p, rd, t, primary);
      p += rd * t;
      if (!hit) break;
      if (primary && P.depth > 1e3) P.depth = tAcc + t;
      if (max(P.thr.r, max(P.thr.g, P.thr.b)) < 0.012) { P.thr = vec3(0.0); break; }
      tAcc += t;

      vec3 n = interfaceNormal(p, kind, iid);
      if (dot(n, rd) > 0.0) n = -n;
      int other = otherMedium(p, rd, kind, med);
      if (other == med) { p += rd * (EPS * 4.0); continue; }
      P.glass = true;

      float eta = iorOf(med) / iorOf(other);
      vec3 ns = n;
      float fog = 0.0;
      bool outer = kind == K_GLASS && (med == M_AIR || other == M_AIR) && isOuterWall(p);
      if (outer) {
        vec4 cd = condense(p, log2(max((tAcc + 1.0) * uPixAng / 0.0124, 1.0)));
        vec3 N0 = normalize(vec3(p.x, 0.0, p.z));
        vec3 Tg = vec3(-N0.z, 0.0, N0.x);
        float s = sign(dot(n, N0));
        fog = cd.z;
        ns = normalize(n - s * (cd.x * Tg + cd.y * vec3(0.0, 1.0, 0.0)));
      }
      else if (kind == K_ICE) {
        vec3 q = uIceR[iid] * (p - uIceP[iid]);
        float fr = (1.0 - uMelt) * step(liquidH(p), p.y);                        // frosty where dry
        vec3 q3 = q * 3.0 + float(iid) * 7.0, q11 = q * 11.0;
        vec3 bn = (vec3(vnoise3(q3), vnoise3(q3 + 5.1), vnoise3(q3 + 9.7)) - 0.5) * 0.12
                + (vec3(vnoise3(q11), vnoise3(q11 + 3.3), vnoise3(q11 + 6.6)) - 0.5) * (0.02 + 0.06 * fr);
        ns = normalize(n + bn);
      }
      float cosi = -dot(rd, ns);
      if (cosi < 0.03) { ns = n; cosi = -dot(rd, n); }
      float F = fresnel(cosi, eta);
      vec3 rr = reflect(rd, ns);
      vec3 rt = refract(rd, ns, eta);

      if (med == M_AIR) {                                          // key-light glint
        vec3 L; float dl; vec3 E = lightAt(p, L, dl);
        float rough = outer ? mix(0.02, 0.3, fog) : (kind == K_ICE ? 0.08 : 0.015);
        float Fh = fresnel(dot(normalize(L - rd), L), eta);
        P.col += P.thr * E * Fh * ggxSpec(ns, -rd, L, rough, dl);
      }
      if (dot(rt, rt) < 1e-6) {                                     // total internal reflection
        if (++nTir > 3) { P.thr *= 0.6; break; }                   // light trapped in the base: stop chasing it
        rd = rr; p += n * (EPS * 2.0); continue;
      }

      if (b == 0 && primary && med == M_AIR) { rfP = p; rfD = rr; rfW = P.thr * F; rfBlur = fog * 0.8; }   // shaded after the loop
      else P.col += P.thr * F * (med == M_AIR ? envColor(rr, 0.3) : envColor(rr, 0.4) * exp(-sigmaOf(med) * 2.0));
      P.thr *= 1.0 - F;

      if (fog > 0.0) {                                             // frosted micro-droplets scatter light
        vec3 L; float dl; vec3 E = lightAt(p, L, dl);
        vec3 N0 = normalize(vec3(p.x, 0.0, p.z));
        float wrap = max(dot(N0, L) * 0.6 + 0.4, 0.0);
        P.col += P.thr * fog * (E * wrap * 0.010 + vec3(0.003, 0.0025, 0.0022));
        P.thr *= 1.0 - 0.3 * fog;
      }

      rd = rt;
      p -= n * (EPS * 2.0);
      if (other == M_ICE) iceCur = iid;
      if (other == M_WHISKEY && uMelt > 0.02) {                  // schlieren where meltwater mixes in
        vec3 w = sin(p.zxy * 2.1 + 1.4 * sin(p.yzx * 1.7 + uTime * 0.05)) * 0.5;
        rd = normalize(rd + w * 0.05 * uMelt);
      }
      med = other;
    }
  }
  if (rfW.r + rfW.g + rfW.b > 0.0) P.col += rfW * reflEnvTable(rfP, rfD, rfBlur);
  P.p = p; P.rd = rd;
  if (rd.y < 0.0) {
    float t = -p.y / rd.y;
    P.p = p + rd * t;
    P.end = END_TABLE;
    if (primary && P.depth > 1e3) P.depth = tAcc + t;
  }
  return P;
}

void main() {
  vec2 ndc = (2.0 * (gl_FragCoord.xy + uJitter) - uRes) / uRes.y;
  vec3 rd = normalize(uCamRot * vec3(ndc * uTanHalf, -1.0));
  Path P = tracePath(uCamPos, rd, 9, 220, true);
  vec3 col = P.col;
  if (P.end == END_TABLE) {
    float dist = length(P.p - uCamPos);
    float fp = dist * 2.0 * uTanHalf / uRes.y / max(abs(P.rd.y), 0.08);
    TableS ts = shadeTable(P.p, P.rd, fp);
    vec3 rr = reflect(P.rd, ts.n);
    vec3 R;
    if (!P.glass) {
      Path Q = tracePath(P.p + vec3(0.0, EPS * 2.0, 0.0), rr, 6, 90, false);
      R = Q.col + Q.thr * (Q.end == END_TABLE ? shadeTable(Q.p, Q.rd, 0.1).col : envColor(Q.rd, ts.rough * 2.0));
    } else {
      R = envColor(rr, ts.rough * 2.0);
    }
    col += P.thr * (ts.col + ts.F * R);
  } else {
    col += P.thr * envColor(P.rd, 0.0);
  }
  outColor = vec4(max(col, 0.0), P.depth);
}
