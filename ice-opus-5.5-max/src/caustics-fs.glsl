// energy conservation: a grid cell's light lands on the area its rays now cover
in vec2 vOld;
in vec2 vNew;
in vec3 vCol;
in float vValid;
out vec4 o;
void main() {
  if (vValid < 0.999) discard;
  float oldA = abs(determinant(mat2(dFdx(vOld), dFdy(vOld))));
  float newA = abs(determinant(mat2(dFdx(vNew), dFdy(vNew))));
  float ratio = oldA / max(newA, 1e-14);
  if (ratio < 0.015) discard;                 // degenerate sliver across a discontinuity
  o = vec4(vCol * min(ratio, 40.0), 1.0);
}
