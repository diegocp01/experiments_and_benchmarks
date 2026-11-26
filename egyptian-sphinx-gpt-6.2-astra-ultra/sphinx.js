// The block grid uses Y for height and +Z for the direction of the forepaws.
(function () {
  "use strict";

  function interpolate(stations, position, axis) {
    for (let i = 1; i < stations.length; i++) {
      if (position <= stations[i][0]) {
        const a = stations[i - 1];
        const b = stations[i];
        const t = Math.max(0, (position - a[0]) / (b[0] - a[0]));
        return a[axis] + (b[axis] - a[axis]) * t;
      }
    }
    return stations[stations.length - 1][axis];
  }

  function noise(x, y, z) {
    let h = Math.imul(x + 103, 1597334677) ^ Math.imul(y + 19, 3812015801) ^ Math.imul(z + 69, 2246822519);
    h = Math.imul(h ^ h >>> 16, 2246822507);
    return ((h ^ h >>> 13) >>> 0) / 4294967296;
  }

  const BODY = 1, HAUNCH = 2, PAW = 3, TAIL = 4, CHEST = 5;
  const CLOTH = 6, RIDGE = 7, FACE = 8, BROW = 9, EYE = 10, LIP = 11, CREASE = 12, EAR = 13, PALE = 14, IRIS = 15, HEM = 16;
  const paints = [
    null, [207, 164, 112], [211, 170, 121], [219, 181, 133], [201, 157, 106],
    [209, 166, 113], [211, 169, 116], [160, 130, 97], [224, 176, 127],
    [143, 98, 66], [108, 75, 52], [201, 145, 103], [160, 105, 77], [215, 163, 113],
    [236, 195, 144], [85, 60, 47], [187, 146, 93]
  ];
  const colors = paints.map(rgb => rgb && Array.from({length: 81}, (_, i) => {
    return "#" + rgb.map((c, ch) => Math.max(0, Math.min(255, Math.round(c + (i - 40) * [1, .93, .8][ch]))).toString(16).padStart(2, "0")).join("");
  }));

  function stone(material, x, y, z) {
    const grain = (noise(x, y, z) - .5) * 10;
    const course = Math.floor((y + .8 * Math.sin(z * .083) + .25 * Math.cos(x * .26)) / 2.7);
    const block = Math.floor((z + ((course & 1) ? 3.3 : 0) + x * .18) / 5.3);
    const patch = noise(Math.floor(x / 3), course, block) - .5;
    let variation;
    if (material < CLOTH) {
      const height = y + .95 * Math.sin(z * .084 + x * .05) + .34 * Math.sin(z * .25);
      const seam = Math.cos(height * 2.03 + .65 * Math.sin(z * .09));
      variation = 6.5 * Math.sin(height * 1.16) + 4.5 * Math.sin(.48 * height) + patch * 17;
      if (seam > .85 && material !== PAW) variation -= 13;
      if (material === PAW) variation += 3 * Math.cos(z * .43) - y * .38;
    } else {
      variation = 3.1 * Math.cos(y * .82 + z * .31) + 2.2 * Math.sin(x * .47 + y * .19) + patch * 7;
      if (material === CLOTH) variation += 3 * Math.cos(z * .75);
    }
    return colors[material][Math.max(0, Math.min(80, 40 + Math.round(variation + grain)))];
  }

  window.buildSphinx = function buildSphinx(add) {
    const width = 47, depth = 116, layer = width * depth, height = 56;
    const grid = new Uint8Array(layer * height);
    const index = (x, y, z) => y * layer + (z + 56) * width + x + 23;
    const put = (x, y, z, mat) => { grid[index(x, y, z)] = mat; };

    function ellipsoid(cx, cy, cz, rx, ry, rz, mat) {
      for (let y = Math.max(0, Math.ceil(cy - ry)); y <= cy + ry; y++) {
        for (let z = Math.ceil(cz - rz); z <= cz + rz; z++) {
          const section = 1 - ((y - cy) / ry) ** 2 - ((z - cz) / rz) ** 2;
          if (section < 0) continue;
          const radius = Math.sqrt(section) * rx;
          for (let x = Math.ceil(cx - radius); x <= cx + radius; x++) put(x, y, z, mat);
        }
      }
    }

    // Rump, barrel, shoulder blades and the forward slope of the breast.
    // Each section gives the half-width and the height of the original bedrock.
    const back = [
      [-48,2.4,4],[-46,7.5,10],[-42,11.3,15],[-35,13.5,18],[-27,13.6,19],
      [-17,12.5,17.3],[-8,12.6,17.5],[1,13.8,20],[9,14.8,23.6],
      [16,14.4,25.4],[21,13.5,23.8],[25,12.2,19.8],[28,9.7,13.5],[30,5.7,6],[31,2.3,3]
    ];
    for (let z = -48; z <= 31; z++) {
      const w = interpolate(back, z, 1);
      const h = interpolate(back, z, 2);
      for (let y = 0; y <= h; y++) {
        const radius = w * Math.pow(Math.max(0, 1 - ((y - h * .26) / (h * .75)) ** 2), .43);
        const bedding = .48 * Math.sin(y * 1.33 + .8 * Math.sin(.11 * z)) + .38 * Math.sin(.95 * y + .12 * z);
        for (let x = Math.ceil(-radius - bedding); x <= radius + bedding; x++) put(x, y, z, BODY);
      }
    }

    // Folded hind limbs with low feet returning forward against the rib cage.
    for (const side of [-1, 1]) {
      ellipsoid(side * 10.9, 5.1, -32.7, 6.7, 8.8, 13.9, HAUNCH);
      ellipsoid(side * 13.4, 2.45, -23.5, 4.6, 3.6, 12.9, HAUNCH);
      ellipsoid(side * 13.5, 1.55, -13.4, 3.5, 2.2, 6.4, PAW);
    }

    // The surviving tail wraps around the hindquarters and follows the bedrock.
    const tail = [
      [-6,9.3,-43.9],[-5,7,-46.5],[.4,4.8,-48.7],[6,3.3,-47.5],
      [10.7,2,-44.8],[14.7,1.7,-42],[16.6,2,-38],[17.3,2.1,-32]
    ];
    for (let i = 1; i < tail.length; i++) {
      const a = tail[i - 1], b = tail[i];
      for (let step = 0; step <= 8; step++) {
        const t = step / 8;
        ellipsoid(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t, 1.7, 1.7, 1.7, TAIL);
      }
    }
    ellipsoid(17.1, 2.3, -31, 1.9, 2.2, 3.1, TAIL);

    const arm = [
      [6,10.7,3.1,10],[13,10.9,4.3,13.2],[19,10.7,4.7,12],
      [25,10.5,4.55,9.3],[31,10.3,4.2,6.7],[39,10.3,4,5.7],[45,10.5,4.3,5.4],
      [49,10.6,4.9,5.75],[52,10.6,4.8,5.4],[54,10.6,4,4.25],[55,10.5,2.8,3]
    ];
    for (let z = 6; z <= 55; z++) {
      const center = interpolate(arm, z, 1);
      const w = interpolate(arm, z, 2), h = interpolate(arm, z, 3);
      for (const side of [-1, 1]) {
        for (let offset = -6; offset <= 6; offset++) {
          const lateral = offset / w;
          if (Math.abs(lateral) >= 1) continue;
          let top = h * Math.pow(1 - lateral * lateral, .42);
          if (z >= 49 && (offset === -2 || offset === 1)) top -= .7 + .33 * (z - 49);
          if (z === 55 && (offset === -2 || offset === 1)) continue;
          for (let y = 0; y <= top; y++) put(side * (Math.round(center) + offset), y, z, PAW);
        }
      }
    }

    // The taper from the broad lion's breast into the throat supports the chin.
    const throat = [
      [9,12.9,15,14.7],[18,13.4,16.3,12.8],[22,12.1,17.4,10.9],
      [25,9.1,18.8,8.6],[28,6.8,19.8,7.1],[31,6.25,21.1,6.45],[36,7.2,21.2,7]
    ];
    for (let y = 9; y <= 36; y++) {
      const w = interpolate(throat, y, 1), cz = interpolate(throat, y, 2), d = interpolate(throat, y, 3);
      for (let x = Math.ceil(-w); x <= w; x++) {
        const dz = d * Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
        for (let z = Math.ceil(cz - dz); z <= cz + dz; z++) put(x, y, z, CHEST);
      }
    }

    // A continuous nemes drapes over the crown. The paired lappets fall beside
    // the cheeks and terminate on the breast, leaving a clear undercut at the jaw.
    const hood = [
      [24,3.1,12.7,3.5],[27,4.9,12.9,5.35],[30,6.5,13.3,6.1],
      [33,8.4,14.2,7.15],[36,10.6,15.25,7.9],[39,12.4,16.9,8.9],
      [42,11.9,17.85,9.3],[45,11.0,18.5,9.45],[47,10.1,19.5,9.15],
      [49,8.85,19.7,8.2],[51,6.8,19.9,6.2],[52,4.3,19.8,4.35]
    ];
    const flaps = [
      [21,9.1,11.3,21.2,2.5],[22,8.8,13.4,21.25,3.4],[25,7.9,15.4,21.45,4.0],[28,7.5,15.6,21.35,4.45],
      [32,7.45,14.9,20.85,5.25],[36,7.8,13.75,20.3,5.9],[39,8.0,12.85,19.9,6.2],
      [42,8.1,11.75,19.2,6.1],[45,7.5,10.9,19.1,5.7],[47,7.1,10.15,19.3,5]
    ];
    for (let y = 24; y <= 52; y++) {
      const w = interpolate(hood, y, 1), cz = interpolate(hood, y, 2), d = interpolate(hood, y, 3);
      for (let x = Math.ceil(-w); x <= w; x++) {
        const dz = d * Math.pow(Math.max(0, 1 - (x / w) ** 2), .49);
        for (let z = Math.ceil(cz - dz); z <= cz + dz; z++) {
          const channel = Math.cos((z - .33 * y - .23 * Math.abs(x)) * 1.55);
          put(x, y, z, channel > .74 ? RIDGE : CLOTH);
        }
      }
    }
    for (let y = 21; y <= 47; y++) {
      const inner = interpolate(flaps, y, 1), outer = interpolate(flaps, y, 2);
      const cz = interpolate(flaps, y, 3), d = interpolate(flaps, y, 4);
      for (let x = Math.floor(inner); x <= outer; x++) {
        const t = (x - inner) / (outer - inner);
        const angle = (y + t * 1.65) * 1.55;
        const channel = Math.cos(angle);
        const fold = channel > .75 ? -.65 : .25;
        const front = cz + d - t * 1.7 + fold;
        const backZ = cz - d + Math.max(0, t - .52) * 5.2;
        for (let z = Math.ceil(backZ); z <= front; z++) {
          const sideChannel = Math.cos((y + 1.65 - (front - z) * .21) * 1.55);
          const groove = (channel > .62 && z >= front - 1.4) || (t > .65 && sideChannel > .57);
          const mat = groove ? RIDGE : CLOTH;
          put(x, y, z, mat); put(-x, y, z, mat);
        }
      }
    }

    // The nose is broken low across the bridge. The broad cheek planes last
    // several blocks before turning at the temples, as in a carved stone mask.
    // Each entry gives the height, half-width of the face and frontal plane.
    const mask = [
      [29,2.9,28],[30,4.5,30],[31,6.05,31],[32,6.95,30.5],
      [33,7.45,30.5],[35,7.95,31],[37,8.55,31],[39,9.05,31],
      [41,9.5,30.5],[43,9.45,30.5],[45,9.05,30.5],[47,8.6,30],[48,7.5,29]
    ];
    for (let y = 29; y <= 48; y++) {
      const w = interpolate(mask, y, 1);
      for (let x = Math.ceil(-w); x <= w; x++) {
        const ax = Math.abs(x);
        const turn = y <= 35 ? Math.min(4,w*.65) : 5.7;
        const cheek = Math.max(0, ax-turn);
        let front = interpolate(mask,y,2)-cheek*.67-Math.max(0,ax-w+.9)*.65;
        let paint = FACE;
        if (y >= 40 && y <= 42 && ax >= 2 && ax <= 7) {
          if (y === 42 && ax >= 3 && ax <= 6) {
            paint = EYE;
          } else if (y === 41) {
            if (ax === 2 || ax === 7) paint = EYE;
            else paint = ax === 4 ? IRIS : PALE;
          } else if (y === 40 && ax >= 3 && ax <= 6) {
            paint = BROW;
          }
        }
        if ((y === 44 && ax >= 2 && ax <= 5) || (y === 43 && ax >= 6 && ax <= 8)) {
          paint = BROW;
          front += .45;
        }
        if (y === 42 && ax === 8) paint = BROW;
        // Low projection along the medial ridge widens at the surviving base.
        if (y >= 37 && y <= 44) {
          if (ax <= 1) front += y >= 42 ? 1.2 : y >= 38 ? 2.4 : 1.1;
          if (y === 38 && ax === 2) front += 1.45;
          if (y === 37 && ax === 2) {front += .7; paint = BROW;}
          if (y === 37 && ax <= 1) paint = HEM;
        }
        // A softened cupid's bow and closed mouth around one continuous crease.
        if (y === 35 && ax <= 3) {
          front += 1.15;
          paint = ax === 0 || ax === 3 ? LIP : HEM;
        }
        if (y === 34 && ax <= 4) {front += ax < 4 ? 1.25 : .65; paint = ax < 4 ? CREASE : LIP;}
        if (y === 33 && ax <= 2) {front += 1.45; paint = LIP;}
        if (y === 31 && ax < 4) front += .4;
        const last = Math.floor(front+.12);
        const first = Math.ceil(19-3.7*Math.sqrt(Math.max(0,1-(x/w)**2)));
        for (let z = first; z <= last; z++) put(x,y,z,z >= last-1 ? paint : FACE);
      }
    }
    // A shallow straight hem outlines the nemes immediately above the forehead.
    for(let x=-9;x<=9;x++) {
      const ax=Math.abs(x), corner=Math.max(0,ax-5)*.73;
      const z=Math.floor(30.55-corner);
      for(let depth=z-1;depth<=z;depth++) {
        put(x,46,depth,HEM);
        put(x,47,depth,ax===9?HEM:CLOTH);
      }
    }
    // The ears sit in front of both side folds, with a shallow central hollow.
    for (const side of [-1, 1]) {
      ellipsoid(9.55 * side, 39.25, 24.85, 1.4, 3.15, 2.25, EAR);
      for (let y = 38; y < 42; y++) put(side * 10, y, 26, y === 38 ? EAR : HEM);
    }
    // The surviving root of the royal emblem sits over the brow band.
    ellipsoid(0, 47.0, 29.7, 1.05, 1.25, 1.15, FACE);
    ellipsoid(0, 48.25, 28.75, 1.05, 1.25, 1.25, CLOTH);

    for (let y = 0; y < height - 1; y++) {
      for (let z = -53; z <= 56; z++) {
        for (let x = -21; x <= 21; x++) {
          const i = index(x, y, z), mat = grid[i];
          if (!mat) continue;
          if (y && grid[i - 1] && grid[i + 1] && grid[i - width] && grid[i + width] && grid[i - layer] && grid[i + layer]) continue;
          add(x, y, z, stone(mat, x, y, z));
        }
      }
    }
  };
})();
