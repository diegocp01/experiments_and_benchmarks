'use strict';
// ===== WebGL2 plumbing: programs, render targets, passes =====
const $ = id => document.getElementById(id);
const canvas = $('c');
function fail(msg) {
  const e = $('err'); e.hidden = false; e.textContent = msg;
  $('hint').style.display = 'none';
  throw new Error(msg);
}
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) fail('This scene needs a browser with WebGL 2.');
if (!gl.getExtension('EXT_color_buffer_float')) fail('This scene needs floating-point render targets (EXT_color_buffer_float).');
const parallelExt = gl.getExtension('KHR_parallel_shader_compile');

const Q = new URLSearchParams(location.search);
const qn = (k, d) => (Q.has(k) && Q.get(k) !== '' && isFinite(+Q.get(k))) ? +Q.get(k) : d;

const HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';
const VS_TRI = HEAD + 'void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }';
const src = id => $(id).textContent;

function compile(type, code) { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); return s; }
function program(vs, fs, name) {
  const p = gl.createProgram();
  const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  const cache = {};
  p.u = n => (n in cache) ? cache[n] : (cache[n] = gl.getUniformLocation(p, n));
  p.check = () => {
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) return;
    const log = [v, f].map(s => gl.getShaderInfoLog(s)).join('\n') + gl.getProgramInfoLog(p);
    console.error(name, log);
    fail('Shader error (' + name + '):\n' + log.slice(0, 600));
  };
  p.ready = () => !parallelExt || gl.getProgramParameter(p, parallelExt.COMPLETION_STATUS_KHR);
  return p;
}

const COMMON = src('common');
const progs = {
  scene: program(VS_TRI, HEAD + COMMON + src('scene'), 'scene'),
  causTrace: program(VS_TRI, HEAD + COMMON + src('caustics-trace'), 'caustics-trace'),
  caus: program(HEAD + src('caustics-vs'), HEAD + src('caustics-fs'), 'caustics'),
  taa: program(VS_TRI, HEAD + src('taa'), 'taa'),
  dof: program(VS_TRI, HEAD + src('dof'), 'dof'),
  final: program(VS_TRI, HEAD + src('final'), 'final'),
  env: program(VS_TRI, HEAD + COMMON + src('env'), 'env'),
  cond: program(VS_TRI, HEAD + COMMON + src('cond'), 'cond'),
};

function makeTarget(w, h, mip) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const levels = mip ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
  gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA16F, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Float render targets are not supported here.');
  return { tex, fb, w, h, free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); } };
}

// ---- caustic grid: one light ray per vertex, attribute-less (gl_VertexID) ----
const GRID = Math.max(64, qn('grid', 300) | 0);
const CAUS_HALF = 20.0;                         // map covers +-20 cm around the glass
const caus = makeTarget(qn('cmap', 512) | 0, qn('cmap', 512) | 0, false);
// multisampled accumulation so tiny, focused triangles still land
const causMS = (() => {
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) | 0);
  if (samples < 2) return null;
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, caus.w, caus.h);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE ? fb : null;
})();
// ray buffer: one texel per light ray (landing point + transmittance)
const rays = (() => {
  const mk = (fmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, GRID, GRID);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
  const hit = mk(gl.RGBA32F), col = mk(gl.RGBA16F), fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hit, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, col, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Float render targets are not supported here.');
  return { hit, col, fb };
})();
const vaoGrid = gl.createVertexArray();
gl.bindVertexArray(vaoGrid);
const gridIdx = new Uint32Array((GRID - 1) * (GRID - 1) * 6);
for (let z = 0, k = 0; z < GRID - 1; z++) for (let x = 0; x < GRID - 1; x++) {
  const a = z * GRID + x, b = a + 1, c = a + GRID, d = c + 1;
  gridIdx[k++] = a; gridIdx[k++] = b; gridIdx[k++] = c; gridIdx[k++] = b; gridIdx[k++] = d; gridIdx[k++] = c;
}
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIdx, gl.STATIC_DRAW);
const vaoTri = gl.createVertexArray();
gl.bindVertexArray(null);

const LIGHT = new Float32Array([-45, 40, -25]);

// ---- condensation map wrapped around the glass (u: angle, v: height), refreshed every frame ----
const condT = makeTarget(2048, 768, true);
gl.bindTexture(gl.TEXTURE_2D, condT.tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
function renderCond(st) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, condT.fb);
  gl.viewport(0, 0, condT.w, condT.h);
  const p = progs.cond; gl.useProgram(p);
  setCommon(p, st);
  gl.uniform2f(p.u('uSize'), condT.w, condT.h);
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, condT.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
}

// ---- background: baked once into a mipmapped equirect map ----
const envT = makeTarget(2048, 1024, true);
gl.bindTexture(gl.TEXTURE_2D, envT.tex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
function bakeEnv() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, envT.fb);
  gl.viewport(0, 0, envT.w, envT.h);
  const p = progs.env; gl.useProgram(p);
  gl.uniform2f(p.u('uSize'), envT.w, envT.h);
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindTexture(gl.TEXTURE_2D, envT.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
}

// ---- sizing / dynamic resolution ----
const view = { w: 1, h: 1, scale: qn('scale', 0.75), fixed: Q.has('scale'), scene: null, dof: null, hist: [], hi: 0, reset: true, taaOut: null };
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
  if (w !== canvas.width || h !== canvas.height) { canvas.width = w; canvas.height = h; }
  const sw = Math.max(2, Math.round(w * view.scale)), sh = Math.max(2, Math.round(h * view.scale));
  if (!view.scene || view.scene.w !== sw || view.scene.h !== sh) {
    if (view.scene) { view.scene.free(); view.dof.free(); view.hist.forEach(t => t.free()); }
    view.scene = makeTarget(sw, sh, false);
    view.dof = makeTarget(sw, sh, true);
    view.hist = [makeTarget(sw, sh, false), makeTarget(sw, sh, false)];
    view.reset = true;
  }
  view.w = w; view.h = h;
}

function setCommon(p, st) {
  gl.uniform1f(p.u('uTime'), st.time);
  gl.uniform1f(p.u('uMelt'), st.melt);
  gl.uniform1f(p.u('uLevel'), st.level);
  gl.uniform3fv(p.u('uIceP'), st.iceP);
  gl.uniformMatrix3fv(p.u('uIceR'), false, st.iceR);
  gl.uniform4fv(p.u('uIceS'), st.iceS);
  gl.uniform4fv(p.u('uRip'), st.rip);
  gl.uniform3fv(p.u('uLightPos'), LIGHT);
}

function renderCaustics(st) { causTrace(st); causSplat(); causResolve(); }
function causTrace(st) {
  const p = progs.causTrace;
  gl.bindFramebuffer(gl.FRAMEBUFFER, rays.fb);
  gl.viewport(0, 0, GRID, GRID);
  gl.useProgram(p);
  setCommon(p, st);
  gl.uniform1i(p.u('uGridN'), GRID);
  gl.uniform1f(p.u('uCausHalf'), CAUS_HALF);
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function causSplat() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, causMS || caus.fb);
  gl.viewport(0, 0, caus.w, caus.h);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  const p = progs.caus; gl.useProgram(p);
  gl.uniform1i(p.u('uGridN'), GRID);
  gl.uniform1f(p.u('uCausHalf'), CAUS_HALF);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rays.hit);
  gl.uniform1i(p.u('uRayHit'), 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rays.col);
  gl.uniform1i(p.u('uRayCol'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(vaoGrid);
  gl.drawElements(gl.TRIANGLES, gridIdx.length, gl.UNSIGNED_INT, 0);
  gl.disable(gl.BLEND);
}
function causResolve() {
  if (causMS) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, causMS);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, caus.fb);
    gl.blitFramebuffer(0, 0, caus.w, caus.h, 0, 0, caus.w, caus.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}

function renderScene(st, cam) {
  const T = view.scene;
  gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
  gl.viewport(0, 0, T.w, T.h);
  const p = progs.scene; gl.useProgram(p);
  setCommon(p, st);
  gl.uniform2f(p.u('uRes'), T.w, T.h);
  gl.uniform3fv(p.u('uCamPos'), cam.pos);
  gl.uniformMatrix3fv(p.u('uCamRot'), false, cam.rot);
  gl.uniform1f(p.u('uTanHalf'), cam.tanHalf);
  gl.uniform1f(p.u('uCausHalf'), CAUS_HALF);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, caus.tex);
  gl.uniform1i(p.u('uCaustic'), 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, envT.tex);
  gl.uniform1i(p.u('uEnv'), 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, condT.tex);
  gl.uniform1i(p.u('uCond'), 2);
  gl.uniform1f(p.u('uPixAng'), 2 * cam.tanHalf / T.h);
  gl.uniform2fv(p.u('uJitter'), cam.jitter);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderPost(st, cam) { renderTAA(cam); postDof(cam); postMip(); postFinal(st); }
function renderTAA(cam) {
  const S = view.scene, W = view.hist[view.hi], R = view.hist[1 - view.hi];
  gl.bindFramebuffer(gl.FRAMEBUFFER, W.fb);
  gl.viewport(0, 0, W.w, W.h);
  const p = progs.taa; gl.useProgram(p);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.tex); gl.uniform1i(p.u('uHist'), 1);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex); gl.uniform1i(p.u('uCur'), 0);
  gl.uniform2f(p.u('uRes'), S.w, S.h);
  gl.uniform3fv(p.u('uCamPos'), cam.pos);
  gl.uniformMatrix3fv(p.u('uCamRot'), false, cam.rot);
  gl.uniform3fv(p.u('uPrevPos'), cam.prevPos);
  gl.uniformMatrix3fv(p.u('uPrevRot'), false, cam.prevRot);
  gl.uniform1f(p.u('uTanHalf'), cam.tanHalf);
  gl.uniform1f(p.u('uReset'), view.reset || Q.has('notaa') ? 1 : 0);
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  view.reset = false;
  view.taaOut = W;
  view.hi = 1 - view.hi;
}
function postDof(cam) {
  const S = view.taaOut, D = view.dof;
  gl.bindFramebuffer(gl.FRAMEBUFFER, D.fb);
  gl.viewport(0, 0, D.w, D.h);
  const p = progs.dof; gl.useProgram(p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.tex);
  gl.uniform1i(p.u('uScene'), 0);
  gl.uniform2f(p.u('uTexel'), 1 / S.w, 1 / S.h);
  gl.uniform1f(p.u('uFocus'), cam.focus);
  gl.uniform1f(p.u('uAperture'), cam.aperture * S.h);
  gl.uniform1f(p.u('uMaxCoc'), Math.max(1.5, 0.014 * S.h));
  gl.bindVertexArray(vaoTri);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function postMip() {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, view.dof.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
}
function postFinal(st) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, view.w, view.h);
  const p = progs.final; gl.useProgram(p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, view.dof.tex);
  gl.uniform1i(p.u('uImg'), 0);
  gl.uniform2f(p.u('uRes'), view.w, view.h);
  gl.uniform1f(p.u('uTime'), st.time);
  gl.uniform1f(p.u('uExposure'), qn('exposure', 5.0));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
