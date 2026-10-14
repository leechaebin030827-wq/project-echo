# Project ECHO Visitor Face Reconstruction V3

## Status and isolation

V3 is an experimental developer-only path inside the existing Project ECHO
application. It does not replace V2 and is disabled in the normal exhibition
flow. The original GLBs, `FaceMorphController`, `FaceTextureGenerator`, and V2
capture/application path remain unchanged.

Enable V3 in a development build with:

`?faceIdentity=reconstructionV3`

The normal URL and `?faceIdentity=geometry` continue to use V2. Production
builds ignore the V3 query because developer query overrides are read only when
`import.meta.env.DEV` is true. `FACE_RECONSTRUCTION_V3_CONFIG.enabled` remains
`false` as the default rollout flag.

V3 is hard-limited to `A01`, which must also report base `A`. Other characters
retain their original face textures. V3 does not call V2 geometry morphing.

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
