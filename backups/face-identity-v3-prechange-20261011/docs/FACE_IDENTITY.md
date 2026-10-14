# Project ECHO face identity extension

## Runtime flow

`FaceCaptureController` reuses the existing MediaPipe result for two independent paths:

1. `FaceTextureGenerator` keeps the canonical piecewise-affine warp and existing
   skin blend, then optionally restores unblurred detail only inside the existing
   eye, eyebrow, nose, and lip masks.
2. `FaceShapeEstimator` produces a pose-gated, dimensionless profile which
   `FaceMorphController` compares with each GLB's measured face geometry.

If estimation or UV mapping is insufficient, texture generation still runs and
geometry is reset to its original position buffer.

## Landmark measurements

Coordinates are first converted from normalized MediaPipe coordinates to image
pixels so non-square captures do not distort ratios. They are rotated about the
eye midpoint to make the eye line horizontal. No landmark `z` value is treated
as metric depth.

| Output | MediaPipe indices | Formula after roll correction |
| --- | --- | --- |
| `faceAspectRatio` | temple 234–454, forehead 10, chin 152 | temple distance / forehead-to-chin distance |
| `jawWidth` | 172–397 | jaw distance / face width |
| `chinLength` | lower lip 17, chin 152 | distance / face height |
| `cheekWidth` | 93–323 | cheek distance / face width |
| `eyeSpacing` | inner corners 133–362 | distance / face width |
| `eyeWidth` | 33–133 and 362–263 | mean eye width / face width |
| `noseWidth` | 98–327 | nostril distance / face width |
| `noseLength` | bridge 168, tip 2 | distance / face height |
| `mouthWidth` | 61–291 | mouth-corner distance / face width |
| `mouthPosition` | eye line, mouth midpoint 61/291 | vertical distance / face height |

Quality combines minimum face size, roll, left/right facial symmetry as a yaw
proxy, and a conservative pitch proxy. Profiles outside plausible ranges are
not sent to geometry deformation.

## GLB inspection and deformation boundary

The three supplied assets have no morph targets. Each has one separate skinned
`FACE` primitive with canonical `TEXCOORD_1`, `POSITION`, `NORMAL`, `JOINTS_0`,
and `WEIGHTS_0` attributes:

| Base | FACE vertices | FACE triangles |
| --- | ---: | ---: |
| A | 752 | 810 |
| B | 402 | 357 |
| C | 767 | 740 |

The FACE UV-to-position correlations are strong on all three assets (absolute
X/U and Y/V correlation above 0.98), so canonical UV is used as the semantic
mapping. Raw XYZ ranges are not used to guess eye, nose, or mouth membership.

Each character clones its FACE geometry and only the deformable position/normal
attributes of neighboring skinned meshes. The original buffers are retained,
every update starts from those buffers, and reset is exact. Skin indices,
weights, skeletons, animations, UVs, and the source GLBs are unchanged.

Coincident duplicate FACE vertices are spatially welded during deformation so
they receive one displacement. FACE-boundary displacement is then copied to
exactly matching BODY/HEAD seam vertices and propagated through a short,
Head-bone-weighted radial band. This extends the visible cheek, jaw, and chin
silhouette without opening the FACE/BODY seam. Normals and bounding volumes are
recomputed only for affected geometry.

Displacement uses soft UV masks for global mid-face proportions, jaw, cheek,
chin, eye spacing/width, nose width/length, and mouth width/position. The V1
fallback fades deformation to zero at the canonical FACE contour. V2 instead
keeps useful contour displacement and transfers it to the adjacent head mesh.
Depth deformation remains omitted because one image does not provide a reliable
metric depth measurement.

Texture warping uses the same deformation parameters as geometry. Destination
eye/eyebrow spacing and width, nose width/length, and lip width/vertical
position are adjusted before piecewise-affine UV mapping. This reduces the
previous mismatch where geometry moved a feature but the captured feature
texture remained at the canonical location. The configured skin blend remains
`0.56`.

## Developer comparison

In development builds, append one of these query values to the normal capture
flow. There is no visitor-facing control.

- `?faceIdentity=baseline`: existing texture, original geometry
- `?faceIdentity=feature`: feature-detail texture, original geometry
- `?faceIdentity=geometryV1`: feature-detail texture and the previous FACE-only
  deformation, for comparison
- `?faceIdentity=geometry`: adaptive feature texture and V2 silhouette geometry

Development-only synthetic QA can be opened without a webcam:

- `?worldQa=1&orbitQa=1&focusQa=A01&faceMorphQa=wide`
- change `wide` to `narrow` or `long`
- add `&faceMorphQaCharacter=A01` to isolate one character
- add `&faceMorphDebug=heatmap` or `wireframe` to inspect affected vertices

The latest measurements are exposed at `window.__ECHO_FACE_IDENTITY__` during
the capture flow and `window.__ECHO_FACE_MORPH_QA__` during synthetic QA.

The default uses the feature and geometry paths configured in
`FACE_IDENTITY_CONFIG`. Set either flag to `false` for a production fallback.

## Validation scope

`npm run test:face` contains five tests covering resolution/roll stability,
distinct face-width profiles, invalid input fallback, independent geometry
cloning, localized deformation, exact reset, source immutability, FACE/BODY seam
transfer, and adaptive feature landmark mapping. `npm run build` checks
production bundling.

With the exaggerated `wide` profile, the three bases measured:

| Base | FACE changed | Adjacent changed | Boundary mean | FACE mean / max (face width) | Representative update |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 752 | 2,384 | 5.31% | 3.75% / 9.22% | 17–22 ms |
| B | 402 | 246 | 5.84% | 3.78% / 8.61% | 10.2 ms |
| C | 767 | 938 | 5.35% | 4.38% / 8.54% | 11.4 ms |

Approximate cloned geometry memory for all 15 spawned characters was 32.15 MiB.
All 15 synthetic deformations completed in about 259 ms in the tested browser
session; this is a one-time identity application, not a per-frame update.

Browser QA confirmed all A/B/C bases, the existing 9:16 world render,
15-character spawn, walking/focus behavior, and Nevada-to-Hamina arrival without
console errors or visible FACE/BODY cracks. A real camera capture was not
available to the automated test, so likeness, dance motion, and
texture-to-geometry aesthetics still require front/45-degree review with
consenting participants under consistent lighting.
