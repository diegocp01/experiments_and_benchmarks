'use strict';
// WebGL2 renderer: a sky pass, then one draw call for every voxel face in the scene.
(() => {
  const SKY = `
    uniform vec3 uSun;
    vec3 sky(vec3 d) {
      float h = max(d.y, 0.0);
      vec3 c = mix(vec3(0.90, 0.82, 0.68), vec3(0.20, 0.43, 0.78), 1.0 - pow(1.0 - h, 4.0));
      float s = max(dot(d, uSun), 0.0);
      return c + vec3(1.0, 0.80, 0.52) * (0.24 * pow(s, 6.0));
    }`;
  const SKY_VS = `#version 300 es
    uniform vec3 uRight, uUp, uFwd;
    out vec3 vDir;
    void main() {
      vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
      vDir = uFwd + uRight * p.x + uUp * p.y;
      gl_Position = vec4(p, 0.0, 1.0);
    }`;
  const SKY_FS = `#version 300 es
    precision highp float;
    in vec3 vDir; out vec4 o;
    ${SKY}
    void main() {
      vec3 d = normalize(vDir);
      float s = max(dot(d, uSun), 0.0);
      vec3 c = sky(d) + vec3(1.0, 0.93, 0.78) * (smoothstep(0.99955, 0.9998, s) + 0.5 * pow(s, 260.0));
      o = vec4(c, 1.0);
    }`;
  const VS = `#version 300 es
    layout(location = 0) in vec3 aPos;
    layout(location = 1) in vec4 aCol;
    layout(location = 2) in vec3 aNrm;
    uniform mat4 uVP;
    out vec3 vCol; out vec3 vPos; flat out vec3 vN;
    void main() { vCol = aCol.rgb; vPos = aPos; vN = aNrm; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS = `#version 300 es
    precision highp float;
    in vec3 vCol; in vec3 vPos; flat in vec3 vN;
    uniform vec3 uCam;
    out vec4 o;
    ${SKY}
    float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
    void main() {
      float px = length(fwidth(vPos));                       // world units per pixel
      float fade = 1.0 - smoothstep(0.25, 0.9, px);          // voxel detail melts away with distance
      float grain = hash(floor(vPos - vN * 0.5)) - 0.5;      // each cube gets its own slight tone
      vec3 f = fract(vPos), e = min(f, 1.0 - f) + abs(vN);
      float seam = 1.0 - smoothstep(0.0, 0.03 + px * 1.2, min(e.x, min(e.y, e.z)));   // joints between cubes
      vec3 c = vCol * (1.0 + 0.10 * grain * fade) * (1.0 - 0.13 * seam * fade);
      vec3 v = vPos - uCam;
      float haze = 1.0 - exp(-length(v) * 0.00022);
      o = vec4(mix(c, sky(normalize(vec3(v.x, 0.0, v.z))), haze), 1.0);
    }`;

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }

  SPX.FOV = 40 * Math.PI / 180;                              // vertical field of view

  SPX.createRenderer = function (canvas, mesh) {
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) return null;
    const skyProg = program(gl, SKY_VS, SKY_FS), prog = program(gl, VS, FS);
    const skyVao = gl.createVertexArray(), vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = (loc, data, size, type, normalized, stride) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, normalized, stride, 0);
    };
    buffer(0, mesh.pos.subarray(0, mesh.n * 12), 3, gl.FLOAT, false, 0);
    buffer(1, mesh.col.subarray(0, mesh.n * 16), 4, gl.UNSIGNED_BYTE, true, 0);
    buffer(2, mesh.nrm.subarray(0, mesh.n * 16), 3, gl.BYTE, true, 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices(), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const count = mesh.n * 6, FOV = SPX.FOV, sun = SPX.SUN;

    return {
      gl,
      resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
        return false;
      },
      draw(eye, target) {
        const aspect = canvas.width / canvas.height, t = Math.tan(FOV / 2);
        const V = SPX.lookAt(eye, target), VP = SPX.mul(SPX.perspective(FOV, aspect, 1, 90000), V);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        gl.useProgram(skyProg.p); gl.bindVertexArray(skyVao);
        gl.uniform3f(skyProg.u.uRight, V[0] * t * aspect, V[4] * t * aspect, V[8] * t * aspect);
        gl.uniform3f(skyProg.u.uUp, V[1] * t, V[5] * t, V[9] * t);
        gl.uniform3f(skyProg.u.uFwd, -V[2], -V[6], -V[10]);
        gl.uniform3fv(skyProg.u.uSun, sun);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(prog.p); gl.bindVertexArray(vao);
        gl.uniformMatrix4fv(prog.u.uVP, false, VP);
        gl.uniform3fv(prog.u.uCam, eye);
        gl.uniform3fv(prog.u.uSun, sun);
        gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
      },
    };
  };
})();
