#!/bin/bash
# Assembles src/* into one self-contained whiskey.html
set -e
cd "$(dirname "$0")"
OUT=whiskey.html
shader() { printf '<script type="x-shader" id="%s">\n' "$1"; shift; cat "$@"; printf '</script>\n'; }
{
  cat src/head.html
  shader common      src/common.glsl
  shader scene       src/scene-a.glsl src/scene-b.glsl
  shader caustics-trace src/caustics-trace.glsl
  shader caustics-vs src/caustics-vs.glsl
  shader caustics-fs src/caustics-fs.glsl
  shader taa         src/taa.glsl
  shader dof         src/dof.glsl
  shader final       src/final.glsl
  shader env         src/env.glsl
  shader cond        src/cond.glsl
  printf '<script>\n'
  cat src/main-a.js src/main-b.js
  printf '</script>\n</body>\n</html>\n'
} > "$OUT"
echo "built $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
