# Project ECHO Nevada NPC N01 — winter traveler

N01 is a woman in her early thirties passing through a Nevada roadside stop in winter. She wears an open cream quilted jacket, coral sweatshirt, mustard scarf, pale blue jeans, and tan ankle boots. These everyday clothes give her a clear silhouette and bright color without suggesting an occupation. Her hair is tied behind the face, and the face is intended to have average proportions, a soft jaw, modest cheekbones and nose, and a relaxed expression for visitor-face replacement.

## Turnaround input

The `turnaround/sheet.png` was generated with the built-in `image_gen` tool and cropped into three independent 512 × 1024 PNG images without redrawing:

1. `turnaround/front.png`
2. `turnaround/side.png` — strict left profile, nose points toward image left
3. `turnaround/back.png`

All three images originate from one sheet, so clothing, colors, scale, and hairstyle remain consistent. The source prompt required orthographic full-body views, the same A-pose, a light gray background, an unobstructed average face, and bright Nevada winter casual clothing. Human review of the generated sheet found a slight closed-mouth smile in the front view; geometry and expression in the Meshy output still require inspection.

## Pipeline

The scripts in `/tools` are copies of the existing Project ECHO Composition Kit semantic pipeline. Only `tools/meshy_pipeline.py` was changed to accept three PNG files as embedded Meshy image inputs, an explicit height for a new base ID, and an environment-variable credential. A/B/C files and the exhibition runtime are untouched.

The stage records live under `/artifacts/pipeline/character_n01/`. Each `*-request.json` omits embedded images and credentials; each task and status JSON stores the returned task ID and status. The generation payload uses `multi-image-to-3d`, `meshy-7.1`, triangle topology, `target_polycount: 50000`, and `should_remesh: true`. Rigging and animation are submitted only after the preceding asset is inspected.

The semantic output location is `/public/models/semantic/character_n01_face_ready.glb`, with diagnostics under `/public/debug/semantic/character_n01/`. The new asset is held outside `AVAILABLE_BASES` until the final FACE coverage, UV, rig, and motion validation pass and a human reviews the diagnostic renders.

## Completed Meshy stages

| Stage | Endpoint under `https://api.meshy.ai/openapi/v1/` | Task ID | Output |
| --- | --- | --- | --- |
| Generate | `multi-image-to-3d` | `01a133c3-8985-75b4-af5d-89859863e8af` | `artifacts/pipeline/character_n01/character_n01_generated.glb` |
| Remesh | `remesh` | `01a133c7-4e89-71be-80af-75fd8ba2ca68` | `artifacts/pipeline/character_n01/character_n01_optimized.glb` |
| Rig | `rigging` | `01a133c9-1d6b-74e5-acc5-7e529f037707` | `artifacts/pipeline/character_n01/character_n01_rigged.glb` |
| Animate | `animations` | `01a133c9-f38e-7174-83f8-a1252e59dd2d` | `artifacts/pipeline/character_n01/character_n01_animated.glb` |

The animation action IDs came from the current library: `0` Idle, `613` Casual Walk in place, and `64` All Night Dance. All four tasks reported `SUCCEEDED`. The generated mesh contained 51,635 triangles; the explicit remesh and all subsequent assets contain 51,574.

## Face-ready result and verification

The main output is `public/models/semantic/character_n01_face_ready.glb`. An identical package copy is `assets/characters/character_n01/face_ready.glb`. The Blender projector assigned 831 triangles to `FACE`, wrote `FACE_UV`, and exported it as glTF `TEXCOORD_1`; the FACE texture references UV channel 1. Both body and FACE primitives include position, normal, UV0, UV1, joint, and weight attributes. The GLB has 24 bones and exactly the three expected animation clips.

`public/debug/semantic/character_n01/preservation-validation.json` passes topology, body UV0, weights, and sampled animation deformation comparison against the Meshy animated GLB. `contract-validation.json` passes the runtime material and UV checks. `gltf-validation.json` reports zero errors and one `NODE_SKINNED_MESH_NON_ROOT` warning, the same warning present in existing A/B/C assets. Diagnostic front, left, and right renders show the selected face region; ears, hair, and neck are excluded while eyes, nose, mouth, cheeks, and chin are included.

The source face keeps a subtle closed-mouth smile. The selected FACE area stops below the hairline, so the upper forehead retains the source texture. Those are visual review risks for a strong visitor likeness. Test a representative visitor photo on the final GLB in exhibition lighting before adding N01 to the application's `AVAILABLE_BASES`. No existing A/B/C character or ECHO face runtime was edited.

For ten future bases, keep three aligned orthographic views, an unobstructed average face, bright everyday winter clothing, the same 50k triangle/24-bone/three-clip contract, and per-character diagnostic review of forehead, ears, neck, UV1, and the preserved animation deformation.
