'use strict';
// Materials → colour, plus baked lighting: sunlight and skylight are swept through the grid once at load.
(() => {
  const { NX, NY, NZ, OX, OY, OZ, D, grid, M, hash3, vnoise, toLin } = SPX;

  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const SUN = norm([0.74, 0.48, 0.22]);                  // morning sun, a little south of due east: full on the face
  const SUN_C = [1.45, 1.22, 0.94], SKY_C = [0.38, 0.5, 0.72], GND_C = [0.44, 0.35, 0.23];
  SPX.SUN = SUN;

  // Incoming light on a surface with normal n, given sky and sun visibility in 0..1.
  SPX.light = function (n, sky, sun, out) {
    const h = 0.5 + 0.5 * n[1], a = 0.25 + 0.75 * sky;
    const ndl = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]) * sun;
    for (let i = 0; i < 3; i++) out[i] = (GND_C[i] + (SKY_C[i] - GND_C[i]) * h) * a + SUN_C[i] * ndl;
  };

  const mix = (a, b, t, out) => { for (let i = 0; i < 3; i++) out[i] = toLin(a[i] + (b[i] - a[i]) * t); };
  const FLAT = {
    [M.BAND]: [196, 162, 116], [M.EYE]: [92, 68, 50], [M.SCAR]: [134, 102, 74], [M.MOUTH]: [118, 88, 62],
    [M.SKIN]: [198, 142, 102], [M.CLOTH_A]: [198, 62, 48], [M.CLOTH_B]: [58, 108, 176], [M.CLOTH_C]: [62, 56, 52],
  };
  // Linear-space albedo of the voxel at world (x, y, z).
  SPX.albedo = function (m, x, y, z, out) {
    const warp = Math.floor((y + 3 * vnoise(x * 0.04, z * 0.04)) / 2);       // gently undulating strata
    switch (m) {
      case M.BODY: mix([146, 112, 76], [202, 168, 122], hash3(0, warp, 5), out); break;
      case M.HEAD: mix([146, 110, 78], [178, 140, 98], hash3(1, warp, 5), out); break;
      case M.ROCK: mix([158, 130, 94], [198, 170, 128], hash3(2, warp, 5), out); break;
      case M.NEMES: mix([148, 114, 80], [184, 148, 104], y < 56 && y % 3 === 0 ? 0 : 1, out); break;   // pleats on the wings and lappets
      case M.MASON: {                                                          // courses of restoration blocks
        const c = y >> 1, o = (c & 1) * 2;
        mix([174, 148, 110], [208, 184, 144], hash3((x + o) >> 2, c, (z + o) >> 2), out); break;
      }
      case M.PAVE: mix([198, 178, 142], [222, 202, 166], hash3(x >> 2, 3, z >> 2), out); break;
      case M.GRANITE: mix([116, 80, 72], [158, 110, 98], hash3(x, y, z), out); break;
      case M.FLOOR: mix([178, 154, 116], [202, 178, 138], vnoise(x * 0.08, z * 0.08), out); break;
      case M.SAND: {                                                           // fades to the open-desert tone at the grid rim
        const rim = Math.min(x + OX, NX - OX - x, z + OZ, NZ - OZ - z, 40) / 40;
        mix([220, 188, 132], [236, 208, 154], 0.5 + (vnoise(x * 0.05, z * 0.05 + 3) - 0.5) * rim, out); break;
      }
      default: { const c = FLAT[m] || [200, 170, 130]; mix(c, c, 0, out); }
    }
  };

  // Sweep light from direction `dir` through the grid, slice by slice along its dominant axis.
  // Each empty cell takes the bilinear blend of the four cells one slice closer to the light,
  // which yields soft shadows that widen with distance from whatever casts them.
  function sweep(dir, L) {
    const N = [NX, NY, NZ], S = [NZ * NY, 1, NY];        // index = (x * NZ + z) * NY + y
    const ad = dir.map(Math.abs);
    const a = ad[0] >= ad[1] && ad[0] >= ad[2] ? 0 : (ad[1] >= ad[2] ? 1 : 2), b = (a + 1) % 3, c = (a + 2) % 3;
    const sa = dir[a] > 0 ? 1 : -1, ob = dir[b] / ad[a], oc = dir[c] / ad[a];
    const ib = Math.floor(ob), fb = ob - ib, ic = Math.floor(oc), fc = oc - ic;
    const w00 = (1 - fb) * (1 - fc), w10 = fb * (1 - fc), w01 = (1 - fb) * fc, w11 = fb * fc;
    const Na = N[a], Nb = N[b], Nc = N[c], Sa = S[a], Sb = S[b], Sc = S[c];
    const smp = (qa, qb, qc) => {
      if (qa < 0 || qa >= Na || qb < 0 || qb >= Nb || qc < 0 || qc >= Nc) {
        return (a === 1 ? qa : b === 1 ? qb : qc) - OY >= D ? 1 : 0;       // open sky above the desert
      }
      return L[qa * Sa + qb * Sb + qc * Sc];
    };
    for (let i = 0; i < Na; i++) {
      const pa = sa > 0 ? Na - 1 - i : i, qa = pa + sa;
      for (let pb = 0; pb < Nb; pb++) {
        const b0 = pb + ib, row = pa * Sa + pb * Sb, from = qa * Sa + b0 * Sb;
        const fast = qa >= 0 && qa < Na && b0 >= 0 && b0 + 1 < Nb;
        for (let pc = 0; pc < Nc; pc++) {
          const id = row + pc * Sc;
          if (grid[id]) { L[id] = 0; continue; }
          const c0 = pc + ic;
          if (fast && c0 >= 0 && c0 + 1 < Nc) {                      // interior: read the four cells directly
            const j = from + c0 * Sc;
            L[id] = w00 * L[j] + w10 * L[j + Sb] + w01 * L[j + Sc] + w11 * L[j + Sb + Sc];
          } else {
            L[id] = w00 * smp(qa, b0, c0) + w10 * smp(qa, b0 + 1, c0) + w01 * smp(qa, b0, c0 + 1) + w11 * smp(qa, b0 + 1, c0 + 1);
          }
        }
      }
    }
  }

  SPX.bakeLight = function () {
    const sky = new Float32Array(grid.length), tmp = new Float32Array(grid.length);
    const dirs = [[0, 1, 0, 0.32], [1, 0.8, 0, 0.17], [-1, 0.8, 0, 0.17], [0, 0.8, 1, 0.17], [0, 0.8, -1, 0.17]];
    for (const [x, y, z, w] of dirs) {
      sweep(norm([x, y, z]), tmp);
      for (let i = 0; i < sky.length; i++) sky[i] += tmp[i] * w;
    }
    sweep(SUN, tmp);
    SPX.sky = sky; SPX.sun = tmp;
  };
})();
