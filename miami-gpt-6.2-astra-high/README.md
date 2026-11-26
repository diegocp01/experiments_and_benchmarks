# Ocean Drive — A Blue Hour Flight

Open **ocean-drive.html** directly in a WebGL 2 browser. The 125-second northbound flight starts automatically and loops with a fade. Everything needed is embedded in that file; it works without a server or internet connection.

- **Space:** pause / resume. **R:** restart. **H:** hide / show the interface. **F:** fullscreen.
- Drag the timeline to explore the flight. Use **HIGH / BALANCED** to change rendering quality.
- Reduced-motion preferences start the flight paused; press Play to begin.

The scene is an architectural interpretation of Ocean Drive, rather than a surveyed reconstruction. All geometry, lettering, textures, palm leaflets, sky, water and road shaders are generated in code. No downloaded photographs, textures, fonts or 3D models are used. Three.js is bundled with its MIT license.

Implementation: physically based materials and procedural environment lighting; multisampled HDR rendering; bloom and film grain; distorted planar road reflections; moving classic cars; shader-animated palms; a smooth 450-metre camera route at 5.5–8 metres altitude.

`src/scene.js` and `src/shell.html` are the editable source. `build.mjs` uses the locally available Three.js / esbuild installation to produce the standalone HTML.

Review frames and offline browser checks are in `review/`. The final check recorded no page or shader errors, no external requests, working playback / pause / scrub / hide / quality controls, and no mobile layout overflow. Desktop rendering measured approximately 56–60 fps at 1600 × 1000 on this machine; performance depends on hardware.
