'use strict';
// The royal head: neck, face, ears, nemes headcloth with its browband, and the weathered features.
(() => {
  const { set, get, M, pl } = SPX;
  const p3 = (v) => { v = Math.abs(v); return v * v * v; };

  const HOOD_HALF = [[39, 14], [41, 16.5], [44, 17.5], [48, 17], [52, 15.5], [56, 13.5], [59, 11], [61, 8], [62.5, 4.5]];
  const HOOD_BACK = [[39, 148], [46, 150], [52, 153], [58, 158], [62.5, 165]];
  const HOOD_BROW = [[56, 180.4], [58, 179.6], [59, 178.2], [61, 175], [62.5, 171]];
  const WING_FRONT = [[41, 165.5], [50, 167.5], [56, 173.5]];

  // The nemes: a flared hood whose wings sit behind the ears and whose dome caps the forehead.
  function hood(u, y, az) {
    if (y < 39 || y > 62.5 || az > pl(y, HOOD_HALF)) return false;
    if (u < pl(y, HOOD_BACK) + 0.02 * az * az) return false;
    const wing = az > 7 ? pl(y, WING_FRONT) - 0.45 * (az - 7) : 172;
    const brow = pl(y, HOOD_BROW) - 0.03 * az * az - (az > 8 ? 1.6 * (az - 8) : 0);
    return u <= (y >= 56 ? Math.max(brow, wing) : wing);
  }

  SPX.buildHead = function () {
    const X0 = SPX.X0;
    for (let ui = 144; ui < 184; ui++) {
      const u = ui + 0.5;
      for (let zi = -19; zi < 19; zi++) {
        const z = zi + 0.5, az = Math.abs(z);
        for (let yi = 28; yi < 64; yi++) {
          const y = yi + 0.5;
          let m = 0;
          const skull = p3((u - 170) / 9.5) + p3((y - 50.5) / 10) + p3(az / 7.2) <= 1
            || ((u - 173) / 6) ** 2 + ((y - 43.5) / 3.5) ** 2 + (az / 6.3) ** 2 <= 1;
          const ear = az > 7 && az < 9.2 && u > 167 && u < 172 && y > 47.5 && y < 54.5;
          if (hood(u, y, az) && (y >= 56 || !skull)) m = yi === 56 || yi === 57 ? M.BAND : M.NEMES;
          else if (skull || ear) m = M.HEAD;
          // remains of the lappets falling over the collarbones
          else if (az > 7 && az < 15 && y > 30 && y < 42 && u > 172 - 0.25 * y && u <= 181.6 - 0.25 * y) m = M.NEMES;
          // the thick, eroded neck
          else if (p3((u - 164) / 9.5) + p3((y - 39) / 8) + p3(az / 11.5) <= 1) m = M.BODY;
          if (m) set(X0 + ui, yi, zi, m);
        }
      }
    }

    // Features are cut into (or added onto) the front-most voxel of each face column.
    const front = (yi, zi) => { for (let ui = 186; ui > 150; ui--) if (get(X0 + ui, yi, zi)) return ui; return -1; };
    for (let zi = -7; zi < 7; zi++) {
      const a = zi >= 0 ? zi : -zi - 1;          // voxels out from the centre line
      for (let yi = 41; yi < 60; yi++) {
        const f = front(yi, zi);
        if (f < 0) continue;
        const eye = (yi === 51 || yi === 52) && a >= 2 && a <= 4;
        const mouth = yi === 43 && a <= 2;
        if (eye || mouth) {                                       // sunken eyes and the line of the lips
          set(X0 + f, yi, zi, 0);
          set(X0 + f - 1, yi, zi, mouth ? M.MOUTH : yi === 52 ? M.EYE : M.HEAD);
        } else if (yi === 53 && a >= 1 && a <= 5) set(X0 + f + 1, yi, zi, M.HEAD);         // brow ridge
        else if (a === 0 && yi >= 48 && yi <= 50) set(X0 + f + 1, yi, zi, M.SCAR);         // stump of the broken nose
        else if (a <= 1 && yi >= 46 && yi <= 47) set(X0 + f, yi, zi, M.SCAR);              // scar where the rest was
        else if (a === 0 && yi >= 57 && yi <= 59) set(X0 + f + 1, yi, zi, M.BAND);         // broken uraeus cobra
      }
    }
  };
})();
