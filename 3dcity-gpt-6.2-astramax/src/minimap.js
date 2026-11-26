import { Vector3 } from 'three';

export class CityMap {
  constructor(canvas, navigation) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nav = navigation;
    this.base = document.createElement('canvas');
    this.base.width = canvas.width;
    this.base.height = canvas.height;
    this.forward = new Vector3();
    canvas.addEventListener('click', (event) => {
      const bounds = canvas.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) * canvas.width) / bounds.width,
        z = ((event.clientY - bounds.top) * canvas.height) / bounds.height;
      this.nav.aimAt((x - this.ox) / this.scale, (z - this.oz) / this.scale);
      this.update();
    });
    canvas.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && this.city) {
        e.preventDefault();
        this.nav.aimAt(this.city.focus.x, this.city.focus.z);
        this.update();
      }
    });
  }
  setCity(city) {
    this.city = city;
    const { width, height } = this.base,
      ctx = this.base.getContext('2d');
    this.scale = Math.min(
      (width - 34) / (city.xs.at(-1) - city.xs[0]),
      (height - 22) / (city.zs.at(-1) - city.zs[0]),
    );
    this.ox = width / 2;
    this.oz = height / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#334c50';
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oz);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    for (const b of city.blocks) {
      const x = city.xs[b.i],
        z = city.zs[b.j];
      ctx.fillStyle = '#adb09b';
      ctx.fillRect(x - 6, z - 6, city.xs[b.i + 1] - x + 12, city.zs[b.j + 1] - z + 12);
    }
    for (const b of city.blocks) {
      ctx.fillStyle = b.park ? '#7f9c71' : '#a5aa96';
      ctx.fillRect(b.x0, b.z0, b.w, b.d);
      for (const h of b.buildings) {
        ctx.fillStyle = h.type === 'tower' ? '#707e73' : h.type === 'house' ? '#8c9a83' : '#869180';
        ctx.fillRect(h.x - h.w / 2, h.z - h.d / 2, h.w, h.d);
      }
    }
    for (const e of city.edges) {
      ctx.strokeStyle = '#d6d5b9';
      ctx.lineWidth = e.width * 0.66;
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.z);
      ctx.lineTo(e.b.x, e.b.z);
      ctx.stroke();
    }
    ctx.strokeStyle = '#a4a48b';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(city.bridgeStart.x, city.bridgeStart.z);
    ctx.lineTo(city.bridgeStart.x + 550, city.bridgeStart.z);
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.update();
  }
  update() {
    if (!this.city) return;
    const { canvas, ctx, nav, scale, ox, oz } = this,
      w = canvas.width,
      h = canvas.height;
    const eye = nav.camera.position;
    nav.camera.getWorldDirection(this.forward);
    const heading = Math.atan2(this.forward.x, -this.forward.z);
    document
      .getElementById('needle')
      .setAttribute('transform', 'rotate(' + (-heading * 180) / Math.PI + ' 21 21)');
    const dist = nav.mode === 'orbit' ? eye.distanceTo(nav.controls.target) : Math.max(12, eye.y) * 1.7;
    const metresPerPixel =
      (2 * dist * Math.tan((nav.camera.fov * Math.PI) / 360)) / Math.max(1, nav.canvas.clientHeight);
    const metres = [2, 5, 10, 20, 50, 100, 200, 500].reduce(
      (best, value) =>
        Math.abs(value / metresPerPixel - 54) < Math.abs(best / metresPerPixel - 54) ? value : best,
      2,
    );
    document.getElementById('scale-line').style.width = metres / metresPerPixel + 'px';
    document.getElementById('scale-label').textContent = metres + ' m';
    if (!canvas.offsetWidth) return;
    ctx.drawImage(this.base, 0, 0);
    const rawX = ox + eye.x * scale,
      rawZ = oz + eye.z * scale;
    const ex = Math.max(7, Math.min(w - 7, rawX)),
      ez = Math.max(7, Math.min(h - 7, rawZ));
    const spread = 0.39,
      length = nav.mode === 'orbit' ? 66 : 31;
    ctx.fillStyle = 'rgba(239,146,82,.27)';
    ctx.strokeStyle = '#fac293';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(ex, ez);
    ctx.lineTo(ex + Math.sin(heading - spread) * length, ez - Math.cos(heading - spread) * length);
    ctx.lineTo(ex + Math.sin(heading + spread) * length, ez - Math.cos(heading + spread) * length);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fa9c60';
    ctx.strokeStyle = '#283934';
    ctx.lineWidth = 2.3;
    ctx.beginPath();
    ctx.arc(ex, ez, 4.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (nav.mode === 'orbit') {
      const x = ox + nav.controls.target.x * scale,
        z = oz + nav.controls.target.z * scale;
      ctx.beginPath();
      ctx.arc(x, z, 6.4, 0, Math.PI * 2);
      ctx.strokeStyle = '#e47c43';
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.fillStyle = '#fff0d0';
      ctx.beginPath();
      ctx.arc(x, z, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#eeeeda';
    ctx.fillText('N', w - 17, 21);
    ctx.beginPath();
    ctx.moveTo(w - 17, 26);
    ctx.lineTo(w - 21, 36);
    ctx.lineTo(w - 17, 33);
    ctx.lineTo(w - 13, 36);
    ctx.closePath();
    ctx.fill();
  }
}
