'use strict';
// The lion body of the Great Sphinx: torso, haunches, hind feet, shoulders, forepaws and tail.
// Body axis runs along x: rump at x = −110, paw tips at x = +110 (73 m at 3 voxels per metre).
(() => {
  const { set, M, pl, vnoise } = SPX;
  const X0 = -110;
  SPX.X0 = X0;

  // Profiles along the body; u = distance from the rump in voxels.
  const TOP = [[0, 19], [3, 27], [8, 32], [16, 35.5], [28, 36.5], [50, 35.5], [85, 34], [115, 34.5],
               [140, 36.5], [152, 38], [165, 39], [182, 38]];
  const HALF = [[0, 9], [3, 14], [8, 17.5], [20, 19], [60, 18.5], [100, 18], [140, 18.5], [165, 18], [182, 16]];
  const PAW = [[146, 20], [160, 17], [172, 13.5], [185, 11.5], [205, 10.5], [214, 9.5], [218, 7], [220, 3]];
  const HIND = [[36, 10], [60, 8.5], [68, 7.5], [72, 5], [74, 2]];
  // Wind-eroded strata: how far each height band of the soft bedrock is cut back.
  const RECESS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 1, 0, 1, 1, 0, 0, 2, 2, 1, 0, 0, 1, 2, 1, 0, 0, 1, 1];

  const p3 = (v) => { v = Math.abs(v); return v * v * v; };
  const p24 = (v) => Math.pow(Math.abs(v), 2.4);

  SPX.buildBody = function () {
    for (let xi = -4; xi < 220; xi++) {
      const u = xi + 0.5;
      const T = pl(u, TOP), W0 = pl(u, HALF), P = pl(u, PAW), H = pl(u, HIND);
      const tip = u > 213 ? Math.sqrt(Math.max(0, 1 - ((u - 213) / 7.5) ** 2)) : 1;
      for (let zi = -34; zi < 34; zi++) {
        const z = zi + 0.5, az = Math.abs(z), side = z < 0 ? 0 : 1;
        // Restoration masonry sheathes the lower body up to a wavy line.
        const masonTop = 8 + 5 * vnoise(u * 0.045, side * 9.7 + 2);
        for (let yi = 0; yi < 41; yi++) {
          const y = yi + 0.5;
          const mason = y < masonTop;
          const rec = mason ? (y < 4 ? -2 : -1)
            : (RECESS[yi] || 0) + (vnoise(u * 0.05 + 40, y * 0.45 + side * 31) > 0.68 ? 1 : 0);
          const skin = mason ? M.MASON : M.BODY;
          let m = 0;
          // torso, ending in the forward-leaning chest
          if (u > 0 && u <= 181 - 0.25 * y - 0.006 * z * z - Math.max(rec, 0) && p3(az / (W0 - rec)) + p3(y / T) <= 1) m = skin;
          // haunches
          else if (u < 50 && p24((u - 24) / 25) + p24(y / 31) + p24((az - 17) / (12 - rec)) <= 1) m = skin;
          // hind feet lying forward along the flanks
          else if (u >= 36 && u <= 74 && p3((az - 23.5) / 5.5) + p3(y / H) <= 1) m = M.MASON;
          // shoulders
          else if (u > 136 && u < 180 && p24((u - 158) / 20) + p24(y / 27) + p24((az - 14) / (8 - rec)) <= 1) m = skin;
          // forelegs and paws, with grooves between the toes
          else if (u >= 146 && tip > 0 && p3((az - 13.5) / (5.5 * tip)) + p3(y / P) <= 1) {
            const k = Math.floor(az - 8);
            const groove = (k === 2 || k === 5 || k === 8) && u > 203 && (y > P - 1.6 || (u > 216.5 && y > 2));
            if (!groove) m = M.MASON;
          }
          if (m) set(X0 + xi, yi, zi, m);
        }
      }
    }
    // Tail: curls out from the rump and up over the right (south) haunch.
    const path = [[2, 4, 4], [-2, 5, 14], [0, 7, 24], [8, 9, 30.5], [22, 12, 31], [34, 16, 29.5], [40, 21, 27]];
    for (let s = 0; s < path.length - 1; s++) {
      const a = path[s], b = path[s + 1];
      for (let t = 0; t <= 1; t += 0.04) {
        const c = [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t);
        for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) {
          const x = Math.floor(c[0] + dx), y = Math.floor(c[1] + dy), z = Math.floor(c[2] + dz);
          if (y >= 0 && Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]) <= 2.3) set(X0 + x, y, z, y < 9 ? M.MASON : M.BODY);
        }
      }
    }
  };
})();
