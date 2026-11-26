# Render review — 2026-11-11

The finished `index.html` was rendered in Chrome through a loopback-only preview server. The server exposes only the HTML; it is not required by the artifact.

## Visual iterations

1. Established the full procedural alley, reflected geometry, lit sign atlas, rain and steam. The first render revealed overly stretched lettering, uniform facades and broad water distortion.
2. Corrected sign aspect ratios; reduced capillary-wave displacement; blurred rough reflections; darkened unlit surfaces; added grime, lantern ribbing and stronger depth contrast.
3. Narrowed the alley, varied building setbacks, added service cables and small storefront details, and introduced depth-based contact occlusion. Kept camera sway and step height subtle and removed the pause-height discontinuity.
4. Corrected wall-sign orientation and replaced flat shop window panels with recessed interiors, counters, stools, shelves and bottles. Checked the opening, the 30-second view and the 132-second view; inspected later motion during playback. Fixed the interface-hide rule after catching a lingering hint.

## Verified

- JavaScript syntax passes; all shaders compile and link in the tested browser.
- Final active playback: approximately 60 fps at 2228 × 1166 internal resolution on this machine, HDR enabled, 162,538 world triangles, 31 local lights, WebGL error 0.
- High, Balanced and Low modes rebuild their render targets and remain functional. Observed 59–60 fps in the sampled views; these measurements are not guarantees for other GPUs.
- Play/pause, drag-to-look, restart and interface hiding respond as intended.
- Sound enable/mute states toggle without browser errors. Audio is synthesized locally and starts muted.
- Console review returned no error/warning entries during the final playback check.
- Static resource audit found no external `src`/`href`, imports, fetches, WebSockets or XHR. All geometry, shaders, textures and audio generation are inline.
- Final browser captures: `final-opening.jpg`, `final-midwalk.jpg`, `final-clean.jpg`.

## Scope of verification

The browser automation environment declined the Fullscreen API request; the button now supplies a browser-fullscreen hint when unavailable. Fullscreen requires a supported browser and user activation. No mobile-device or non-Chrome browser render was performed. Direct `file://` navigation is unsupported by the browser tool, so rendering was checked over loopback HTTP and standalone completeness was checked from the file itself. No network dependencies or server APIs are present.

This is a real-time procedural approximation: reflections are planar, contact occlusion is screen-space, steam is layered noise rather than a fluid simulation, and the lighting is not path-traced.
