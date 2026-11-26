// ===== Caustics pass 2: splat the traced grid as a mesh (attribute-less) =====
uniform int uGridN;
uniform float uCausHalf;
uniform highp sampler2D uRayHit;
uniform highp sampler2D uRayCol;
out vec2 vOld;
out vec2 vNew;
out vec3 vCol;
out float vValid;
void main() {
  ivec2 id = ivec2(gl_VertexID % uGridN, gl_VertexID / uGridN);
  vec4 h = texelFetch(uRayHit, id, 0);
  vOld = (vec2(id) / float(uGridN - 1) * 2.0 - 1.0) * uCausHalf;
  vNew = h.xy;
  vValid = h.z;
  vCol = texelFetch(uRayCol, id, 0).rgb;
  gl_Position = vec4(h.xy / uCausHalf, 0.0, 1.0);
}
