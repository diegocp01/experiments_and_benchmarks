'use strict';
// The quarried enclosure the Sphinx sits in, the stair down from the desert, the Dream Stele, and a few visitors for scale.
(() => {
  const { NX, NY, NZ, OX, OY, OZ, D, set, get, M, vnoise, clamp } = SPX;
  const PIT = { x0: -128, x1: 146, z: 52 };       // enclosure floor rectangle

  SPX.buildTerrain = function () {
    for (let x = -OX; x < NX - OX; x++) {
      for (let z = -OZ; z < NZ - OZ; z++) {
        const cx = x + 0.5, cz = z + 0.5, az = Math.abs(cz);
        const out = Math.hypot(Math.max(PIT.x0 - cx, cx - PIT.x1, 0), Math.max(az - PIT.z, 0));
        const wall = Math.min(cx - PIT.x0, PIT.x1 - cx, PIT.z - az);          // > 0 inside the pit
        const sd = (out > 0 ? out : -wall) + (vnoise(cx * 0.09, cz * 0.09) - 0.5) * 7;   // ragged quarry edge
        const border = Math.min(cx + OX, NX - OX - cx, cz + OZ, NZ - OZ - cz);
        let h, top, fill;
        if (cx > 143 && cx < 174 && az < 12) {                                             // stair down from the east
          h = clamp(Math.floor((cx - 146) / 2), 0, D); top = fill = M.PAVE;
        } else if (sd <= 0) {                                                  // bedrock floor with drifted sand
          h = Math.floor(clamp(1 + sd / 14, 0, 1) * 5 * vnoise(cx * 0.06, cz * 0.06 + 5));
          top = h > 0 ? M.SAND : (az < 8 && cx > 68 && cx < 122 ? M.PAVE : M.FLOOR);
          fill = h > 0 ? M.SAND : M.FLOOR;
        } else if (sd < 13) {                                                  // weathered rock terraces
          h = sd < 3 ? 5 : sd < 8 ? 9 : 11; top = fill = M.ROCK;
        } else {                                                               // open desert
          const mound = Math.max(0, vnoise(cx * 0.018, cz * 0.026 + 9) - 0.45) / 0.55;      // broad, low drifts
          h = D + Math.floor(clamp((border - 6) / 40, 0, 1) * 3.6 * mound);
          top = M.SAND; fill = M.ROCK;
        }
        for (let y = -OY; y < h; y++) set(x, y, z, y >= h - 2 ? top : (y < 0 ? M.FLOOR : fill));
      }
    }
  };

  const groundTop = (x, z) => { for (let y = NY - OY - 1; y >= -OY; y--) if (get(x, y, z)) return y + 1; return 0; };
  SPX.groundTop = groundTop;

  SPX.buildProps = function () {
    // Dream Stele of Thutmose IV: a red-granite slab on a low plinth between the paws.
    for (let x = 71; x < 76; x++) for (let z = -4; z < 4; z++) set(x, 0, z, M.PAVE);
    for (let y = 1; y < 12; y++) for (let x = 72; x < 74; x++) {
      const half = y === 11 ? 2 : 3;
      for (let z = -half; z < half; z++) set(x, y, z, M.GRANITE);
    }
    for (let x = 86; x < 89; x++) for (let z = -2; z < 2; z++) for (let y = 0; y < 3; y++) set(x, y, z, M.GRANITE);   // altar

    // Visitors, about 1.7 m tall.
    const people = [[97, 2, M.CLOTH_A, 0], [100, -5, M.CLOTH_B, 0], [127, 1, M.CLOTH_C, 1], [131, 3, M.CLOTH_A, 1],
                    [153, -6, M.CLOTH_B, 0], [22, 74, M.CLOTH_A, 1], [27, 76, M.CLOTH_C, 1], [-58, -75, M.CLOTH_B, 1],
                    [112, -40, M.CLOTH_C, 0], [-150, 8, M.CLOTH_A, 0]];
    for (const [x, z, cloth, alongX] of people) {
      const g = Math.max(groundTop(x, z), groundTop(x + alongX, z + 1 - alongX));
      for (let i = 0; i < 2; i++) {
        const px = x + i * alongX, pz = z + i * (1 - alongX);
        set(px, g, pz, M.CLOTH_C); set(px, g + 1, pz, M.CLOTH_C);
        set(px, g + 2, pz, cloth); set(px, g + 3, pz, cloth);
        set(px, g + 4, pz, M.SKIN);
      }
    }
  };
})();
