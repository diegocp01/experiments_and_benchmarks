import { random } from './layout.js';

const STONE = ['#d1c4a6', '#e0d1b5', '#c0b8a7', '#dcd8c7', '#aa9f8a', '#d1b895'];
const BRICK = ['#af7963', '#a25f49', '#c28c6c', '#995f4d', '#cc987e', '#b79c83', '#c5ad92'];
const GLASS = ['#467b87', '#659a9c', '#789daa', '#456b79', '#618491', '#76a2a3', '#708997', '#597f81'];
const HOUSE = ['#c3bd9b', '#dfccb0', '#b5c3b1', '#cfaa91', '#dbd2bc', '#a4b9b5', '#b58a74', '#cbbb9f'];
const ROOFS = ['#65706e', '#7b776b', '#897b6e', '#65696a', '#8b8980', '#647678'];
const GABLES = ['#74645a', '#8a6557', '#636c6b', '#78756c', '#986b55', '#617475', '#8c8170'];
const TRIM = ['#ddd5bd', '#cac7b9', '#c4bba6', '#e4dbc6'];
const MECH = ['#a5aaa2', '#b6b4a6', '#929b98', '#b9b9ad'];
const BASE = 0.32;

export function drawBuildings(batch, city) {
  for (const block of city.blocks)
    for (const b of block.buildings) {
      const r = random(b.detailSeed);
      const design = (style, pitch, floor = b.floorH) => [style, pitch, floor, r.between(0, 800)];
      const wall = (shape, x, z, w, d, base, h, tint, style, pitch, floor = b.floorH) => {
        batch.add(
          shape,
          'facade',
          x,
          BASE + base + h / 2,
          z,
          w,
          h,
          d,
          tint,
          0,
          true,
          design(style, pitch, floor),
        );
      };
      const slab = (shape, x, z, w, d, y, h, color) =>
        batch.add(shape, 'solid', x, BASE + y + h / 2, z, w, h, d, color);
      const trim = r.pick(TRIM),
        roof = r.pick(ROOFS),
        metal = r.pick(MECH);
      const { x, z, w, d, h } = b;
      b.solidTop = h + BASE;
      function roofDeck(cx, cz, rw, rd, y, shape = 'rect', equipment = true) {
        slab(shape, cx, cz, rw + 0.16, rd + 0.16, y, 0.26, trim);
        slab(shape, cx, cz, rw * 0.972, rd * 0.972, y + 0.255, 0.1, roof);
        if (shape === 'rect') {
          const t = 0.21,
            top = BASE + y + 0.45;
          batch.box(cx, top, cz - rd / 2 + t / 2, rw, 0.43, t, trim);
          batch.box(cx, top, cz + rd / 2 - t / 2, rw, 0.43, t, trim);
          batch.box(cx - rw / 2 + t / 2, top, cz, t, 0.43, rd, trim);
          batch.box(cx + rw / 2 - t / 2, top, cz, t, 0.43, rd, trim);
        }
        if (!equipment || Math.min(rw, rd) < 4) return;
        const scheme = r(),
          mw = Math.min(rw * 0.22, r.between(1.6, 3.7)),
          md = Math.min(rd * 0.23, r.between(1.5, 3.2)),
          mh = r.between(0.68, 1.53);
        const mx = cx + rw * r.between(-0.2, 0.22),
          mz = cz + rd * r.between(-0.22, 0.22);
        if (scheme < 0.72) {
          batch.box(mx, BASE + y + 0.35 + mh / 2, mz, mw, mh, md, metal);
          batch.add(
            'post',
            'solid',
            mx,
            BASE + y + 0.4 + mh,
            mz,
            mw * 0.56,
            0.13,
            Math.min(mw, md) * 0.6,
            '#697373',
          );
          if (scheme < 0.34) {
            for (let k = 0; k < 3; k++)
              batch.box(
                mx,
                BASE + y + 0.5 + mh * k * 0.2,
                mz + md * 0.505,
                mw * 0.81,
                0.09,
                0.06,
                '#687474',
              );
            batch.box(cx - rw * 0.23, BASE + y + 0.59, cz + rd * 0.17, 0.58, 0.46, rd * 0.4, '#b1b5ad');
          }
        } else if (scheme < 0.92 && Math.min(rw, rd) > 8) {
          for (let k = 0; k < 3; k++) {
            const px = cx + (k - 1) * rw * 0.18;
            batch.box(px, BASE + y + 0.49, mz, rw * 0.15, 0.23, rd * 0.26, '#b7bcb2');
            batch.box(px, BASE + y + 0.64, mz, rw * 0.137, 0.09, rd * 0.247, '#607d84');
          }
        }
        if (rw > 10 && r() < 0.54)
          batch.box(cx - rw * 0.22, BASE + y + 0.71, cz - rd * 0.22, rw * 0.14, 0.7, rd * 0.15, '#b2ada0');
      }
      function waterTower(y) {
        const cx = x - w * 0.2,
          cz = z + d * 0.16,
          size = Math.min(w, d) * 0.17,
          metal = '#596767';
        for (const ax of [-0.29, 0.29])
          for (const az of [-0.29, 0.29])
            batch.box(cx + ax * size, BASE + y + 0.95, cz + az * size, 0.16, 1.7, 0.16, metal);
        batch.add(
          'post',
          'solid',
          cx,
          BASE + y + 1.6 + size * 0.53,
          cz,
          size,
          size * 1.06,
          size,
          '#9b8268',
        );
        for (const f of [0.15, 0.8])
          batch.add(
            'post',
            'solid',
            cx,
            BASE + y + 1.63 + size * f,
            cz,
            size * 1.02,
            0.1,
            size * 1.02,
            '#65706b',
          );
        batch.add(
          'cone',
          'solid',
          cx,
          BASE + y + 1.6 + size * 1.22,
          cz,
          size * 1.11,
          size * 0.36,
          size * 1.11,
          '#687673',
        );
      }
      if (b.landmark) {
        const stone = r.pick(['#d8c9a5', '#d8cbb4', '#cdbfa3']),
          glass = '#688990';
        const tiers = [
          [0, 0.17, 1],
          [0.17, 0.53, 0.78],
          [0.7, 0.16, 0.63],
          [0.86, 0.095, 0.49],
          [0.955, 0.045, 0.32],
        ];
        for (const [base, fraction, span] of tiers) {
          wall('chamfer', x, z, w * span, d * span, h * base, h * fraction, stone, 0, 2.12);
          slab('chamfer', x, z, w * span + 0.24, d * span + 0.24, h * (base + fraction) - 0.45, 0.48, trim);
          if (base > 0.1) {
            const tw = w * span,
              td = d * span;
            for (const side of [-1, 1]) {
              for (const ax of [-0.26, 0, 0.26])
                batch.box(
                  x + tw * ax,
                  BASE + h * (base + fraction * 0.51),
                  z + side * td * 0.5,
                  0.42,
                  h * fraction * 1.03,
                  0.34,
                  '#e1d4b7',
                );
              for (const az of [-0.25, 0.25])
                batch.box(
                  x + side * tw * 0.5,
                  BASE + h * (base + fraction * 0.51),
                  z + td * az,
                  0.34,
                  h * fraction * 1.03,
                  0.42,
                  '#d8ccb2',
                );
            }
          }
        }
        const spireBase = h * 0.081;
        slab('chamfer', x, z, w * 0.22, d * 0.22, h, spireBase * 0.7, glass);
        batch.add(
          'cone',
          'solid',
          x,
          BASE + h + spireBase * 0.7 + 4.7,
          z,
          w * 0.2,
          9.4,
          d * 0.2,
          '#bcbfaf',
        );
        batch.add('post', 'solid', x, BASE + h + spireBase * 0.7 + 13.5, z, 0.36, 10, 0.36, '#9eaa9e');
        b.solidTop = BASE + h + spireBase * 0.7 + 18.5;
      } else if (b.type === 'tower') {
        const shape = r.pick(['rect', 'rect', 'rect', 'chamfer', 'chamfer', 'round', 'wedge']);
        const glass = r.pick(GLASS),
          warm = r() < 0.21,
          skin = warm ? r.pick(STONE) : glass;
        const style = warm ? 0 : r.pick([1, 1, 2]),
          pitch = warm ? 2.6 : r.between(1.7, 2.65);
        const podium = Math.min(h * 0.2, r.int(2, 4) * 3.45);
        wall('rect', x, z, w, d, 0, podium, r.pick(STONE), r.pick([0, 6]), 3.0);
        roofDeck(x, z, w, d, podium, 'rect', false);
        const tw = w * r.between(0.72, 0.95),
          td = d * r.between(0.74, 0.95),
          tx = x + (w - tw) * r.between(-0.3, 0.3),
          tz = z + (d - td) * r.between(-0.3, 0.3);
        const split = r() < 0.58,
          shoulder = split ? Math.round(b.floors * r.between(0.64, 0.83)) * b.floorH : h;
        wall(shape, tx, tz, tw, td, podium, shoulder - podium, skin, style, pitch);
        let topW = tw,
          topD = td,
          topX = tx,
          topZ = tz;
        if (split) {
          roofDeck(tx, tz, tw, td, shoulder, shape, false);
          topW = tw * r.between(0.64, 0.85);
          topD = td * r.between(0.66, 0.9);
          topX = tx + (tw - topW) * r.between(-0.36, 0.36);
          topZ = tz + (td - topD) * r.between(-0.36, 0.36);
          wall(shape, topX, topZ, topW, topD, shoulder, h - shoulder, skin, style, pitch);
        }
        if (style === 1 && shape === 'rect' && r() < 0.63) {
          const color = r.pick(['#9ba9a4', '#a6b7b4', '#b9bbae']);
          for (const ax of [-0.48, 0.48])
            for (const az of [-0.48, 0.48])
              batch.box(
                tx + tw * ax,
                BASE + (podium + shoulder) / 2,
                tz + td * az,
                0.42,
                shoulder - podium,
                0.42,
                color,
              );
        }
        roofDeck(topX, topZ, topW, topD, h, shape);
        const cap = r.between(2, 5);
        if (r() < 0.8) {
          const capColor = r() < 0.5 ? metal : skin;
          slab(shape, topX, topZ, topW * 0.56, topD * 0.57, h + 0.35, cap, capColor);
          for (let k = 1; k < 4; k++)
            slab(shape, topX, topZ, topW * 0.57, topD * 0.58, h + 0.36 + (cap * k) / 4, 0.16, '#899794');
          b.solidTop += cap + 0.4;
        }
        if (r() < 0.22)
          batch.add('post', 'solid', topX, BASE + h + cap + 4.1, topZ, 0.18, 8, 0.18, '#9aa69d');
      } else if (b.type === 'house') {
        wall('rect', x, z, w, d, 0, h, r.pick(HOUSE), 5, r.between(2.9, 3.8));
        const rh = Math.min(w, d) * r.between(0.23, 0.38),
          across = r() < 0.45;
        slab('rect', x, z, w + 0.32, d + 0.32, h - 0.12, 0.22, trim);
        batch.add(
          'gable',
          'solid',
          x,
          BASE + h + rh / 2,
          z,
          across ? d + 0.64 : w + 0.64,
          rh,
          across ? w + 0.64 : d + 0.64,
          r.pick(GABLES),
          across ? Math.PI / 2 : 0,
        );
        batch.box(x + w * 0.22, BASE + h + rh * 0.7, z - d * 0.21, 0.77, rh * 0.75, 0.87, '#9e7966');
        const side = z < block.z ? -1 : 1;
        batch.box(x, BASE + 1.12, z + side * (d / 2 + 0.035), 0.88, 2.15, 0.11, '#706f60');
        batch.box(x, BASE + 2.34, z + side * (d / 2 + 0.27), w * 0.32, 0.21, 0.62, trim);
        b.solidTop += rh;
      } else if (b.type === 'commercial') {
        const ground = Math.min(h, 3.65),
          skin = r.pick([...STONE, ...BRICK]);
        wall('rect', x, z, w, d, 0, ground, '#8e9790', 6, 2.65, ground);
        if (h > ground + 0.01) wall('rect', x, z, w, d, ground, h - ground, skin, r.pick([0, 3]), 2.7);
        const side = z < block.z ? -1 : 1,
          aw = r.pick(['#9a5e46', '#69877e', '#c89a62', '#65858c', '#a6a794']);
        const n = Math.max(2, Math.floor(w / 4.5));
        for (let i = 0; i < n; i++) {
          const ax = x + ((i + 0.5) / n - 0.5) * w;
          batch.box(ax, BASE + 2.82, z + side * (d * 0.5 + 0.24), (w / n) * 0.86, 0.22, 0.7, aw);
        }
        slab('rect', x, z, w + 0.22, d + 0.22, ground - 0.36, 0.34, trim);
        batch.add(
          'sign',
          'sign',
          x,
          BASE + 3.26,
          z + side * (d * 0.5 + 0.135),
          Math.min(w * 0.65, 6.5),
          0.69,
          1,
          '#ffffff',
          side > 0 ? 0 : Math.PI,
          false,
          [r.int(0, 15), 0, 0, 0],
        );
        batch.box(x, BASE + 1.16, z + side * (d * 0.5 + 0.05), 1.22, 2.32, 0.1, '#50686a');
        batch.box(x, BASE + 1.12, z + side * (d * 0.5 + 0.12), 0.055, 2.19, 0.05, trim);
        roofDeck(x, z, w, d, h);
      } else {
        const balcony = r() < 0.33,
          skin = balcony ? r.pick(STONE) : r.pick(BRICK),
          style = balcony ? 4 : r.pick([0, 3, 3]);
        const terrace = !balcony && b.floors >= 4 && r() < 0.38;
        const pitch = r.between(2.36, 3.25);
        if (terrace) {
          const lower = (b.floors - 2) * b.floorH;
          wall('rect', x, z, w, d, 0, lower, skin, style, pitch);
          roofDeck(x, z, w, d, lower, 'rect', false);
          const tx = x + w * 0.094,
            tz = z - d * 0.109;
          wall('rect', tx, tz, w * 0.79, d * 0.76, lower, h - lower, skin, style, pitch);
          roofDeck(tx, tz, w * 0.79, d * 0.76, h);
          for (const t of [-0.25, 0.21]) {
            batch.box(x + t * w, BASE + lower + 0.63, z + d * 0.39, w * 0.22, 0.56, 0.74, '#9c8d77');
            batch.add(
              'leafB',
              'leaf',
              x + t * w,
              BASE + lower + 1.0,
              z + d * 0.39,
              w * 0.21,
              0.65,
              0.76,
              '#7c8e5f',
            );
          }
        } else wall('rect', x, z, w, d, 0, h, skin, style, pitch);
        const side = z < block.z ? -1 : 1;
        if (balcony) {
          for (let f = 1; f < b.floors; f++) {
            const by = BASE + f * b.floorH,
              bz = z + side * (d / 2 + 0.28);
            batch.box(x, by, bz, w * 0.78, 0.2, 0.67, trim);
            batch.box(x, by + 0.5, bz + side * 0.27, w * 0.78, 0.45, 0.12, '#87968e');
          }
        } else if (!terrace) {
          slab('rect', x, z, w + 0.32, d + 0.32, h - 0.57, 0.28, trim);
          if (b.floors > 3) slab('rect', x, z, w + 0.23, d + 0.23, 3.12, 0.23, trim);
        }
        if (!terrace) roofDeck(x, z, w, d, h);
        if (!balcony && !terrace && b.floors >= 5 && r() < 0.3) waterTower(h);
        batch.box(x, BASE + 1.15, z + side * (d / 2 + 0.04), 1.45, 2.3, 0.1, '#666f63');
        if (r() < 0.62) batch.box(x, BASE + 2.47, z + side * (d / 2 + 0.27), 2.5, 0.22, 0.75, trim);
        b.solidTop += 2;
      }
    }
}
