# Project ECHO Visitor Face Reconstruction V3

## Status and isolation

V3 is an experimental developer-only path inside the existing Project ECHO
application. It does not replace V2 and is disabled in the normal exhibition
flow. The original GLBs, `FaceMorphController`, `FaceTextureGenerator`, and V2
capture/application path remain unchanged.

Enable V3 in a development build with:

`?faceIdentity=reconstructionV3`

For the A01 comparison view after a real intro/webcam capture, use:

`?faceIdentity=reconstructionV3&faceQaTarget=A01`

After face application and world entry, the comparison helper uses
`CinematicCameraController`'s Character Focus tracking with a face-only framing
option. The camera therefore recomputes its pose from A01's animated head every
frame. A developer-only `A01 | Reconstruction V3` badge appears at the top.

The normal URL and `?faceIdentity=geometry` continue to use V2. Production
builds ignore the V3 query because developer query overrides are read only when
`import.meta.env.DEV` is true. `FACE_RECONSTRUCTION_V3_CONFIG.enabled` remains
`false` as the default rollout flag.

V3 is hard-limited to `A01`, which must also report base `A`. Other characters
retain their original face textures. V3 does not call V2 geometry morphing.

The equivalent V2 comparison URL is:

`?faceIdentity=geometry&faceQaTarget=A01`

It displays `A01 | Geometry V2` and uses the same A01 face framing. V2 and V3
remain separate URLs so switching cannot mutate a live capture or accidentally
mix the two synthesis paths. A new capture is required after navigation.

## Reconstruction pipeline

`VisitorFaceReconstruction` performs an independent single-image pipeline:

1. Validate landmark count, face scale, roll, yaw symmetry, and frame coverage.
2. Normalize visitor landmarks using the eye midpoint, eye distance, and roll.
3. Preserve constrained visitor-relative feature placement in a new canonical
   atlas. Interior features receive stronger preservation than the contour.
4. Reconstruct the atlas with piecewise-affine triangle sampling.
5. Match robust median skin samples to the A-base texture.
6. Composite skin and high-detail feature regions with a feathered contour.
7. Emit reconstruction and geometry-connection diagnostics.

The pipeline intentionally does not infer depth from a single RGB frame and
does not edit vertex positions. This makes the first V3 evaluation specifically
about reconstructed identity texture and its connection to the existing A face
geometry.

## Diagnostics

After an actual V3 capture, inspect:

`window.__ECHO_FACE_RECONSTRUCTION_V3__`

The record includes pose/quality values, triangle and pixel coverage, mean
composite alpha, mean seam alpha, tone samples, elapsed time, target identity,
and A-face UV compatibility.

A webcam-free integration smoke test is available only in development:

`?worldQa=1&orbitQa=1&focusQa=A01&faceIdentity=reconstructionV3&faceReconstructionQa=1`

It uses A's source face texture as a synthetic reconstruction input. It proves
pipeline, texture, geometry-UV, renderer, and one-character gating integration;
it does not prove visitor likeness.

The 2026-10-11 browser smoke test produced:

- applied characters: 1 (`A01`)
- canonical triangles: 898/898
- A face UV vertices: 752/752
- reconstructed pixel coverage: 65.04%
- mean contour seam alpha: 0.0115
- reconstruction time: about 419 ms on the tested browser
- browser warnings/errors: none

The synthetic input rendered without a visible FACE boundary break. The same
session re-ran the V2 wide-profile QA for A/B/C successfully, confirming the V2
route remains separate and operational.

The A01 comparison QA additionally verified both labels, automatic A01 focus,
face-centered framing, continuous `CHARACTER_FOCUS` state, normal-URL UI
absence, and coexistence with the existing `worldQa`, `orbitQa`, and `focusQa`
parameters without browser warnings or errors.

## Required validation before rollout

Do not enable V3 for the exhibition or additional characters until all of the
following are reviewed with consenting participants:

- front-facing likeness under consistent lighting;
- 45-degree head views and FACE-to-head boundary behavior;
- eyes, eyebrows, nose, and mouth placement on A;
- skin-tone transition under Nevada and Hamina lighting;
- walking, focus, dance, and world-jump animation stability;
- capture latency and memory on the exhibition hardware.

If any check fails, use the normal V2 URL. Removing the V3 query returns to V2
without migrating or altering captured data.

## Seamless integration pass

The seamless pass preserves the original V3 landmark normalization, target
landmarks, triangle topology, skin/feature opacity, and A01 geometry. The global
`FACE_SETTINGS.skinBlend` remains `0.56`; V2 files are not called or modified.

### Findings

- A has one skinned mesh with BODY and FACE primitives. FACE uses
  `TEXCOORD_1`, 752 vertices, and 810 geometry triangles.
- All 752 FACE UV vertices are within the atlas. The 209 coincident-position
  duplicate groups have identical UVs, so an inconsistent GLB UV seam was not
  found.
- The V3 reconstruction uses 898 independent piecewise-affine triangles. Their
  continuous vertices preserve feature placement, but triangle-to-triangle
  gradient changes remain visible in broad, low-detail skin regions.
- The deterministic QA measured no interior alpha cracks after the existing
  expanded triangle rasterization. Transparent cracks are therefore not
  established as the source of the reported bright forehead patches.
- A's original FACE atlas has an irregular triangular island boundary and an
  opaque brown exterior. Linear mipmapping can mix that exterior into the
  hairline/jaw samples unless the island receives color padding.
- V3 previously used only the face oval and raster alpha. Although a MediaPipe
  multiclass segmenter exists, the capture session sets segmentation to `null`.
  It is intentionally still not enabled: an unvalidated semantic mask could
  remove glasses, piercings, or visitor hair detail.
- Canvas textures and the renderer already use sRGB color space. The FACE
  material is a standard lit material with roughness `0.85`; its shader only
  adds the existing distance visibility fill.

### Changes

- Fill residual subpixel raster coverage from adjacent warped pixels as a
  conservative safety net.
- Smooth only low-frequency skin color at the forehead and jaw. Eyes, eyebrows,
  nose, lips, and glasses-shaped high-frequency content are excluded from skin
  smoothing and receive a conservative high-pass restoration.
- Reject only extreme isolated dark skin outliers; the threshold and repair
  strength are deliberately conservative to avoid removing identity marks.
- Use asymmetric contour feathering and stronger base-tone continuity at the
  hairline and jaw/neck boundary.
- Add six pixels of outward atlas color padding outside the rendered face oval
  to prevent the brown atlas exterior from entering mipmapped FACE samples.
- Explicitly retain sRGB, clamp wrapping, linear trilinear mipmapping, and
  moderate anisotropic filtering.
- Clear V3 diagnostic canvases when retaking or resetting so the experimental
  comparison does not retain session data.

### Developer comparison and rollback

Normal improved A01 test:

`?faceIdentity=reconstructionV3&faceQaTarget=A01`

Exact legacy V3 rollback:

`?faceIdentity=reconstructionV3&faceQaTarget=A01&faceReconstructionPipeline=legacy`

Generate legacy and seamless atlases from the same captured frame while
applying only seamless to A01:

`?faceIdentity=reconstructionV3&faceQaTarget=A01&faceReconstructionCompare=1`

The comparison is exposed at
`window.__ECHO_FACE_RECONSTRUCTION_V3_COMPARE__`. Add
`&faceReconstructionDebug=1` to expose warped, repaired, low-frequency, contour
mask, padded-atlas, and final canvases at
`window.__ECHO_FACE_RECONSTRUCTION_V3_DEBUG__`.

On the deterministic same-frame A-atlas QA, both paths retained 898/898 warp
triangles and the same 89,272 protected feature pixels. Mean contour alpha
changed from `0.0115` to `0.0063`; seamless added six-pixel atlas padding and
about 24 ms in that comparison run. These numbers confirm path isolation and
boundary behavior, not human likeness.

Browser regression confirmed A01 Character Focus tracking and Nevada-to-Hamina
arrival with no console warnings or errors. Real participant front/45-degree
likeness, glasses fidelity, and hairline/jaw appearance remain manual visual
checks and must not be inferred from the synthetic QA.
