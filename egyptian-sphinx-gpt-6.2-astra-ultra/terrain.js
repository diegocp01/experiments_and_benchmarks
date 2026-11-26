(() => {
  "use strict";

  // The floor of the enclosure follows the natural bedrock, with small
  // terraces cut into its edges. Coordinates use the statue's voxel scale.
  window.buildTerrain = function buildTerrain(addBox) {
    let seed = 634204;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    const bedrock = [
      { halfWidth: 35, halfLength: 68, top: -2.03, color: "#d4b38a" },
      { halfWidth: 32, halfLength: 64, top: -1.28, color: "#cfac81" },
      { halfWidth: 28, halfLength: 61, top: -0.50, color: "#dab98f" }
    ];
    const rowDepth = 3;
    const ground = -2.8;
    const rows = bedrock.map(() => []);

    function floorAt(x, z) {
      const row = Math.floor(z / rowDepth);
      for (let i = rows.length - 1; i >= 0; i--) {
        const range = rows[i][row + 25];
        if (range && x >= range[0] && x < range[1]) return bedrock[i].top;
      }
      return ground;
    }

    bedrock.forEach((layer, i) => {
      const bottom = i === 0 ? ground - 0.03 : bedrock[i - 1].top;
      for (let row = -24; row <= 23; row++) {
        const z = (row + 0.5) * rowDepth;
        const axial = Math.abs((z + 1.5) / layer.halfLength);
        if (axial >= 1) continue;
        const width = layer.halfWidth * Math.pow(1 - axial ** 3.5, 1 / 3.5);
        const west = 2.2 * Math.sin(z * 0.095) + 1.7 * Math.sin(z * 0.21 + 2);
        const east = 2.6 * Math.sin(z * 0.078 + 0.8) + 1.4 * Math.sin(z * 0.30);
        const left = Math.round((-width + west) / 1.5) * 1.5;
        const right = Math.round((width + east) / 1.5) * 1.5;
        rows[i][row + 25] = [left, right];
        addBox((left + right) / 2, (bottom + layer.top) / 2, z,
          right - left, layer.top - bottom, rowDepth, layer.color);
      }
    });

    // Limestone pieces stay light on top and expose a warmer bed underneath.
    const stone = ["#d4b58f", "#d7b791", "#d0b08b", "#dfc19a", "#cfaf89"];
    const ledge = ["#c4a27c", "#c9a882", "#cfad87"];
    function pick(palette) {
      return palette[Math.floor(random() * palette.length)];
    }
    function chip(x, z, w, h, d, stepped) {
      const base = floorAt(x, z) - 0.12;
      const first = stepped ? h * 0.54 : h;
      addBox(x, base + first / 2, z, w, first, d, pick(stepped ? ledge : stone));
      if (stepped) {
        const shift = (random() - 0.5) * w * 0.16;
        addBox(x + shift, base + (first + h) / 2, z,
          w * (0.70 + random() * 0.15), h - first, d * 0.77, pick(stone));
      }
    }

    // A narrow fringe of spalls gathers below the cut edges of the enclosure.
    const spalls = [
      [-32, -40, 7, 14], [-33, 13, 8, 12], [-18, 59, 8, 7],
      [34, -22, 8, 13], [29, 39, 7, 11], [13, -62, 8, 7]
    ];
    spalls.forEach(([cx, cz, count, length]) => {
      for (let i = 0; i < count; i++) {
        const x = cx + (random() - 0.5) * 8;
        const z = cz + (random() - 0.5) * length;
        const size = 0.55 + random() ** 2 * 2.3;
        chip(x, z, size * (1 + random()), size * 0.40 + 0.20,
          size * (0.65 + random() * 0.6), size > 1.5);
      }
    });

    // Exposed strata from the surrounding plateau break the back horizon.
    function outcrop(cx, cz, scale, profile) {
      const colors = ["#d2b48d", "#c9aa83", "#d7bb95", "#cfb18b"];
      const beds = [
        [-1, 0, 1.23, 0.72, 1.3], [0, 0, 1.05, 0.56, 1.1],
        [1, -0.08, 0.84, 0.48, 0.85], [1.4, -0.02, 0.60, 0.37, 0.68]
      ];
      let base = ground - 0.03;
      beds.slice(0, profile).forEach(([x, z, width, depth, thickness], i) => {
        const h = thickness * scale;
        addBox(cx + x * scale, base + h / 2, cz + z * scale,
          19 * scale * width, h, 15 * scale * depth, colors[i]);
        base += h;
      });
    }
    outcrop(-80, -72, 1.05, 3);
    outcrop(-66, -75, 0.74, 2);
    outcrop(63, -112, 1.18, 4);
    outcrop(80, -115, 0.80, 2);
  };
})();
