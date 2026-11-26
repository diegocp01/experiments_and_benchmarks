#!/bin/sh
# assembles the single self-contained page from the source chunks
cd "$(dirname "$0")" && cat 01_head.html 02_common.glsl 03_world.glsl 04_near.glsl 05_objects.glsl 06_interior.glsl 07_main_post.glsl 08_gl.js 09_app.js > ../index.html && wc -c ../index.html
