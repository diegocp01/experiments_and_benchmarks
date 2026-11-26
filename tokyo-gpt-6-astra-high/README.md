# After Hours — Tokyo, in the rain

Open **index.html** in a browser with WebGL 2. This one HTML file is the complete experience: no installation, internet connection, libraries, external fonts, images or models are required.

The camera walks automatically along a 94-metre route, with a brief fade at the loop boundary. Drag to look. **Space** pauses/resumes; **H** hides the interface; **M** toggles synthesized rain audio; **F** requests fullscreen; **R** restarts. **W/S** move forward/backward and **A/D** turn. The quality control cycles High → Balanced → Low. Reduced-motion preferences start the scene paused. Sound starts muted.

## Rendering

Custom WebGL 2 renderer with generated mesh geometry, a canvas-drawn Japanese sign atlas, 31 local lights, half-resolution planar reflections, procedural wet asphalt, individual impact-ring ripples, depth-based contact occlusion, instanced rain ribbons and noise-shaped steam particles. HDR bloom, filmic tone mapping, subtle grain and vignetting finish the image. HDR falls back to an ordinary color buffer when float render targets are unavailable.

The scene contains recessed shop interiors, shelves and bottles, counters and stools, wooden lattice fronts, shutters, lanterns, condenser units, drainpipes, sagging wires, vending machines, bicycles, crates and distant umbrella silhouettes. All of these are constructed by code. It is an illustrative Tokyo alley, not a surveyed reconstruction of a specific street.

## Review

`review/final-opening.jpg` and `review/final-midwalk.jpg` are browser captures. Iteration snapshots preserve the major visual passes. See `review/VALIDATION.md` for the checks and limitations.

For repeatable stills, append `?t=4` or `?t=132` to the URL; this sets the simulation time in seconds and pauses it. `?quality=1` selects Balanced and `?quality=2` selects Low. These parameters also work when opening the HTML directly.
