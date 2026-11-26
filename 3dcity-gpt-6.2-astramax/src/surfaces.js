import * as THREE from 'three';

export const surfaceUniforms = {
  uCitySurface: { value: null },
  uCityBounds: { value: new THREE.Vector4() },
};

// One small, city-specific texture serves two purposes. Ground surfaces get
// contact shading, and windows can look up the height and tint of nearby blocks.
export function surveyCity(city) {
  const width = 512,
    height = 384,
    x0 = city.xs[0] - 18,
    z0 = city.zs[0] - 18;
  const dx = (city.xs.at(-1) + 18 - x0) / width,
    dz = (city.zs.at(-1) + 18 - z0) / height;
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 2; i < pixels.length; i += 4) pixels[i] = 255;
  for (const b of city.buildings) {
    const reach = Math.min(14, 2.6 + b.h * 0.15),
      hw = b.w * 0.5,
      hd = b.d * 0.5;
    const ix0 = Math.max(0, Math.floor((b.x - hw - reach - x0) / dx)),
      ix1 = Math.min(width - 1, Math.ceil((b.x + hw + reach - x0) / dx));
    const iz0 = Math.max(0, Math.floor((b.z - hd - reach - z0) / dz)),
      iz1 = Math.min(height - 1, Math.ceil((b.z + hd + reach - z0) / dz));
    const tint =
      (b.type === 'tower' ? 0.16 : b.type === 'apartment' ? 0.63 : 0.5) + (b.detailSeed % 99) / 340;
    for (let j = iz0; j <= iz1; j++)
      for (let i = ix0; i <= ix1; i++) {
        const x = Math.abs(x0 + (i + 0.5) * dx - b.x),
          z = Math.abs(z0 + (j + 0.5) * dz - b.z);
        const gap = Math.hypot(Math.max(0, x - hw), Math.max(0, z - hd)),
          index = (j * width + i) * 4;
        const strength = (1 - Math.min(gap / reach, 1)) ** 2 * (0.25 + Math.min(0.22, b.h / 170));
        pixels[index + 2] = Math.min(pixels[index + 2], Math.round((1 - strength) * 255));
        if (x > hw || z > hd) continue;
        const edge = Math.max(x / hw, z / hd);
        const h = b.type === 'tower' ? (edge > 0.85 ? b.h * 0.25 : edge > 0.7 ? b.h * 0.75 : b.h) : b.h;
        pixels[index] = Math.round(Math.min(1, h / 200) * 255);
        pixels[index + 1] = Math.round(tint * 255);
      }
  }
  for (const lamp of city.lamps) {
    const lx = lamp.x + lamp.dx * 1.35,
      lz = lamp.z + lamp.dz * 1.35,
      radius = lamp.height * 2.1;
    const ix0 = Math.max(0, Math.floor((lx - radius - x0) / dx)),
      ix1 = Math.min(width - 1, Math.ceil((lx + radius - x0) / dx));
    const iz0 = Math.max(0, Math.floor((lz - radius - z0) / dz)),
      iz1 = Math.min(height - 1, Math.ceil((lz + radius - z0) / dz));
    for (let j = iz0; j <= iz1; j++)
      for (let i = ix0; i <= ix1; i++) {
        const distance = Math.hypot(x0 + (i + 0.5) * dx - lx, z0 + (j + 0.5) * dz - lz);
        const intensity = Math.max(0, 1 - (distance / radius) ** 1.35) ** 2,
          index = (j * width + i) * 4 + 3;
        pixels[index] = Math.min(255, pixels[index] + Math.round(intensity * 255));
      }
  }
  const tex = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  surfaceUniforms.uCitySurface.value?.dispose();
  surfaceUniforms.uCitySurface.value = tex;
  surfaceUniforms.uCityBounds.value.set(x0, z0, 1 / (width * dx), 1 / (height * dz));
}
