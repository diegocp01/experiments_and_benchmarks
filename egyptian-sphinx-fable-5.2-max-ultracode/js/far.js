'use strict';
// Everything beyond the dense grid: open desert to the horizon and the three pyramids of Giza,
// placed at their true bearing, distance and size relative to the Sphinx (same 3 voxels per metre).
(() => {
  const { NX, NZ, OX, OZ, D, toLin, hash3 } = SPX;
  const lin = (c) => [toLin(c[0]), toLin(c[1]), toLin(c[2])];
  const blend = (a, b, t) => lin([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);

  SPX.buildFar = function (mesh) {
    const lg = [0, 0, 0], p = new Float32Array(12), c = new Float32Array(12);
    const emit = (pts, n, rgb) => {
      SPX.light(n, 1, 1, lg);
      for (let v = 0; v < 4; v++) for (let i = 0; i < 3; i++) { p[v * 3 + i] = pts[v][i]; c[v * 3 + i] = rgb[i] * lg[i]; }
      mesh.quad(p, n, c, false);
    };
    const top = (x0, x1, z0, z1, y, rgb) => emit([[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], rgb);
    const sides = (x0, x1, z0, z1, y0, y1, rgb) => {
      emit([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], rgb);
      emit([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], rgb);
      emit([[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], rgb);
      emit([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], rgb);
    };

    // Desert floor: four huge slabs around the grid, tucked a hair under its rim to hide the seam.
    const R = 40000, y = D - 0.05, sand = lin([228, 198, 143]);
    const gx0 = -OX + 1, gx1 = NX - OX - 1, gz0 = -OZ + 1, gz1 = NZ - OZ - 1;
    top(-R, gx0, -R, R, y, sand); top(gx1, R, -R, R, y, sand);
    top(gx0, gx1, -R, gz0, y, sand); top(gx0, gx1, gz1, R, y, sand);

    // A stepped pyramid: courses 4 voxels high, each set back by inset(k) voxels.
    const pyramid = (cx, cz, half, inset, colour) => {
      let a = half, y0 = D - 1;
      for (let k = 0; a > 3; k++) {
        const y1 = y0 + 4, b = Math.max(a - inset(k), 0), rgb = colour(k, y1, hash3(k, 7, cx));
        sides(cx - a, cx + a, cz - a, cz + a, y0, y1, rgb);
        if (b > 3) {                                                    // exposed ledge around the next course
          top(cx - a, cx + a, cz - a, cz - b, y1, rgb); top(cx - a, cx + a, cz + b, cz + a, y1, rgb);
          top(cx - a, cx - b, cz - b, cz + b, y1, rgb); top(cx + b, cx + a, cz - b, cz + b, y1, rgb);
        } else top(cx - a, cx + a, cz - a, cz + a, y1, rgb);
        a = b; y0 = y1;
      }
    };
    const stone = (t) => blend([174, 146, 106], [204, 176, 132], t);
    // Khafre: slope 4:3, with the last of its smooth Tura-limestone casing near the summit.
    pyramid(-1968, -267, 323, () => 3, (k, y1, t) => (y1 > 306 ? blend([214, 198, 168], [232, 218, 190], t) : stone(t)));
    // Khufu, the Great Pyramid: slope 14:11.
    pyramid(-984, -1296, 345, (k) => (k % 7 === 6 ? 4 : 3), (k, y1, t) => stone(t));
    // Menkaure: slope 5:4, lower courses still sheathed in red granite.
    pyramid(-2691, 930, 155, (k) => (k % 5 === 4 ? 4 : 3), (k, y1, t) => (k < 14 ? blend([138, 104, 86], [162, 124, 100], t) : stone(t)));
  };
})();
