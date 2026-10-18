# Project ECHO — Nevada winter NPC N02–N11 production report

## Result

- Exactly 10 new Meshy generation submissions: N02–N11, five masculine and five feminine presentations. N01 and A/B/C were not submitted or replaced.
- All 30 standalone turnaround PNGs and all 40 Meshy stage outputs were saved. The four Meshy stages succeeded for every character. Actual Meshy credit consumption: 490 total.
- Ten candidate `face_ready.glb` files were exported. Topology, UV0, weights, and sampled clip deformation preservation passed for all ten; glTF Validator found zero errors for all ten.
- Eight characters (N03–N10) pass the existing FACE contract and are packaged for developer QA. N02 is held for hair geometry crossing the face. N11 is held because its FACE region has 280 triangles, below the existing 300-triangle contract.
- No new character was added to exhibition `AVAILABLE_BASES`; actual visitor-face composites in exhibition lighting remain pending.

## Roster

| ID | Age / presentation | Concept | Bright winter clothing | Neutral face intent | Review |
| --- | --- | --- | --- | --- | --- |
| N02 | 24 / masculine | Young road-trip passenger stopping for snacks at a highway convenience store | pale teal lightweight winter shell open over an ivory hoodie, sand chinos, cream sneakers | Average oval face, soft jaw, restrained brow and nose, relaxed closed mouth; no beard or eyewear. | HOLD |
| N03 | 27 / feminine | Diner visitor on a winter drive between Nevada towns | sky-blue short puffer jacket open over a warm white sweater, light denim jeans, cream ankle boots | Moderate face width and length, rounded jaw, modest cheeks and lips, neutral expression; no facial accessories. | QA_READY |
| N04 | 33 / masculine | Local resident picking up coffee at a gas-station forecourt | light khaki canvas jacket open over a coral henley, faded blue straight jeans, tan casual boots | Ordinary proportional features, soft lower face, unobtrusive cheekbones and nose, clean-shaven. | QA_READY |
| N05 | 36 / feminine | Suburban-edge motel guest heading out for breakfast | light sage quilted vest over an ivory long-sleeve knit, beige casual trousers, light tan sneakers | Average soft oval structure, gentle jaw, medium lips and nose, relaxed expression; no bangs or glasses. | QA_READY |
| N06 | 42 / masculine | Rest-stop traveler stretching his legs after a drive | sand fleece zip jacket open over a pale blue sweatshirt, light olive chinos, warm tan walking shoes | Subtle age cues with smooth average bone structure, unremarkable jaw and brow, clean-shaven neutral face. | QA_READY |
| N07 | 44 / feminine | Local diner customer on a bright cold morning | soft coral padded jacket open over a cream crewneck, light warm-gray jeans, taupe ankle boots | Moderate facial proportions, gently rounded jaw, soft cheeks, relaxed mouth; no glasses or earrings. | QA_READY |
| N08 | 51 / masculine | Parking-lot visitor outside a roadside motel | light denim jacket open over a muted orange crewneck sweater, cream chinos, sand boots | Age shown mainly through hair; face keeps average proportions, soft jaw, modest nose and cheeks, no beard. | QA_READY |
| N09 | 53 / feminine | Small-town shopper stopping at a convenience store | pale blue casual winter coat open over an ivory sweatshirt, light beige pants, tan low boots | Soft middle-aged face with ordinary width, light cheek definition, rounded jaw, neutral mouth and brows. | QA_READY |
| N10 | 29 / masculine | Driver taking a quick break at a highway service area | soft red quilted vest over a cream hoodie, washed light-blue jeans, off-white sneakers | Balanced average face, gently rounded chin, moderate features, clean-shaven and relaxed. | QA_READY |
| N11 | 23 / feminine | Young traveler walking back to a parked car after a diner stop | sand zip jacket open over a pale teal sweatshirt, ivory casual pants, light beige sneakers | Unaccented average face shape, softly rounded jaw, modest brow and lips, neutral expression without accessories. | HOLD |

## Asset locations

For each ID, the individual PNGs are `assets/characters/character_nXX/turnaround/front.png`, `side.png`, and `back.png`; the generating prompt is `prompt.txt` beside them. Every character has `assets/characters/character_nXX/pipeline-manifest.json` with exact endpoints, task IDs, hashes, output paths, and QA status. Meshy outputs are `artifacts/pipeline/character_nXX/character_nXX_generated.glb`, `_optimized.glb`, `_rigged.glb`, and `_animated.glb`. Candidate FACE output is `public/models/semantic/character_nXX_face_ready.glb`. N03–N10 also have a packaged copy at `assets/characters/character_nXX/face_ready.glb`.

The per-character diagnostic directory is `artifacts/debug/semantic/character_nXX/`. It contains `front.png`, `front-landmarks.overlay.png`, `diagnostic-front.png`, `diagnostic-left.png`, `diagnostic-right.png`, `character_nXX_face_mapping.json`, `preservation-validation.json`, `contract-validation.json`, `gltf-validation.json`, and `visual-review.json`. The combined diagnostic contact sheet is `artifacts/debug/semantic/nevada_winter_n02_n11_diagnostic_contact.png`.

## Meshy task record

All endpoints below use `https://api.meshy.ai/openapi/v1/`. The generation request used `multi-image-to-3d`, `meshy-7.1`, `pose_mode=t-pose`, triangle topology, and a 50,000 triangle target. Animation action IDs were `0` Idle, `613` Casual Walk in place, and `64` All Night Dance.

| ID | multi-image-to-3d | remesh | rigging | animations | Credits |
| --- | --- | --- | --- | --- | ---: |
| N02 | `01a13406-9102-75d7-8207-e31302100cf2` | `01a1340b-b226-7455-a930-660417c8a228` | `01a1340e-9f21-7016-aeb5-4b51bbcebea1` | `01a13411-e9f7-7053-a437-00d6407b227f` | 49 |
| N03 | `01a1340c-6c37-77b3-98cb-f108fc91a868` | `01a13412-9287-74b1-b714-70068cd3e556` | `01a13422-08f0-748f-a6a5-35f1568aeb9c` | `01a1342b-fd3c-7607-8aa5-6adf8f569d5a` | 49 |
| N04 | `01a1340c-810a-77d1-a7d6-1d62891668a6` | `01a13412-a272-7413-a455-bf9b605b8dfc` | `01a13422-2444-72c5-a520-85f742752826` | `01a1342c-131e-7771-b70a-2d0b30ad0d8c` | 49 |
| N05 | `01a1340c-9386-7643-bb29-6126d4bd1507` | `01a13412-b764-760e-9b58-23cbe4e5736f` | `01a13422-3bfd-752a-b0a1-10870ca86d81` | `01a1342c-2186-77ae-b054-49c0e197009b` | 49 |
| N06 | `01a13415-01f2-743d-9d7a-d9827e6bfed5` | `01a13422-a680-7038-9093-f5ee78a4216c` | `01a13427-8b52-7572-8bdd-657e58236d98` | `01a1342c-dc47-76f2-8908-2fb43980de06` | 49 |
| N07 | `01a13415-148c-7772-b7e3-e4dd1839d853` | `01a13422-b37c-7318-b8f2-bc47e87a8f97` | `01a13427-acd3-77ba-942e-3ded327daf23` | `01a1342c-e8aa-7284-902e-502626a2502a` | 49 |
| N08 | `01a13415-2c04-7340-b981-362b29f68de3` | `01a13422-c085-7530-843a-1c032a1a74f2` | `01a13427-c7fe-767d-bad0-ce624cc166f6` | `01a1342c-ff35-7524-ab8f-49f56de45618` | 49 |
| N09 | `01a13418-1992-7729-a99d-55524cdd0723` | `01a13423-6805-7318-9bba-a42f745b51e3` | `01a13427-ea67-775a-8f7f-df89e800ab8c` | `01a1342d-0db9-76d1-82eb-622bf722a27f` | 49 |
| N10 | `01a13418-2ef3-72e0-b95a-8a185805eeb9` | `01a13423-7099-72fb-8e3b-5781e9f28d2c` | `01a13428-122b-7611-84cf-b24af053c53e` | `01a1342d-18a9-702a-b00e-052ebaa85db3` | 49 |
| N11 | `01a13418-4107-7743-988f-c536cb13a663` | `01a13423-7e87-77f8-b6e1-d8c5750a1037` | `01a13428-2901-7167-83ca-7b36c4ac9ce0` | `01a1342d-2b25-77ac-8d59-82f53428aa8c` | 49 |

## Validation

| ID | Triangles | FACE triangles | Bones | Clips | Preservation | FACE contract | glTF errors |
| --- | ---: | ---: | ---: | ---: | --- | --- | ---: |
| N02 | 50,737 | 555 | 24 | 3 | pass | pass | 0 |
| N03 | 51,310 | 816 | 24 | 3 | pass | pass | 0 |
| N04 | 51,186 | 912 | 24 | 3 | pass | pass | 0 |
| N05 | 46,944 | 440 | 24 | 3 | pass | pass | 0 |
| N06 | 51,403 | 759 | 24 | 3 | pass | pass | 0 |
| N07 | 51,784 | 689 | 24 | 3 | pass | pass | 0 |
| N08 | 51,128 | 717 | 24 | 3 | pass | pass | 0 |
| N09 | 51,076 | 857 | 24 | 3 | pass | pass | 0 |
| N10 | 51,412 | 935 | 24 | 3 | pass | pass | 0 |
| N11 | 50,911 | 280 | 24 | 3 | pass | fail | 0 |

Each glTF result has one `NODE_SKINNED_MESH_NON_ROOT` warning, also present in the existing N01 asset. All ten have `FACE` material and `FACE_UV` exported as `TEXCOORD_1`; N11 is below the current minimum FACE triangle count. The Blender exporter added an auxiliary `char1` action, which was removed from the exported FACE GLB using the existing `prune_glb_animations.py`; the original Meshy `_animated.glb` is unchanged.

## Visual QA and release decisions

- **Best first visitor-composite candidates:** N03 and N07 have unobstructed, average-looking faces and clean facial contours. N05 is also promising, though its FACE region is smaller (440 triangles).
- **Review more closely:** N04 has subtle source facial hair; N06 and N09 carry visible age cues; N08 has irregular gray hair at the upper forehead; N10 has a jagged FACE edge near the hairline. These are technical passes, not approvals for exhibition.
- **Hold N02:** The Meshy 3D hair has strands crossing the left brow, eye, and nose. Its 555 FACE triangles and preservation checks pass, but the geometry would occlude visitor texture. A new Meshy submission would consume additional credits and was not made.
- **Hold N11:** The selected region visually covers eyes, nose, mouth, cheeks, and chin and excludes hair, ears, and neck. It has 280 FACE triangles, so the unmodified 300-triangle contract fails. No topology-changing subdivision or unsafe mask expansion was applied.
- All candidates still need developer QA with representative visitor photos in front and 45-degree views, including the actual exhibition lighting and skin blend.

## Pipeline reuse and changes

- `tools/meshy_pipeline.py`: added `--pose-mode` with default `a-pose`; this batch explicitly selected `t-pose`. Existing A/B/C/N01 calls retain their default.
- `tools/detect_semantic.py`: squeezed the category mask to 2D for the installed MediaPipe version, preserving the same category labels and segmentation rule.
- Reused `tools/blender/render_semantic.py`, `tools/blender/project_semantic.py`, `tools/prune_glb_animations.py`, `tools/validate_semantic.py`, and `tools/validate_face_contract.py` without changing their selection or contract thresholds.
- Used Blender 3.2.1 for the existing projector. Blender 5.1.2 crashed on startup in this environment; MediaPipe required host graphics access for its Metal context. The first sandboxed Meshy submission had a DNS failure before connection; after checking this, N02 was submitted once with network access. No duplicate Meshy generation task was created.
- The core ECHO face compositor and exhibition runtime were not edited. N01 Meshy outputs and FACE GLB still match the checksums in its pre-existing manifest.

## Rules for any later expansion

Keep a fixed roster before Meshy submission; use exactly three aligned full-body T-pose PNGs per person; keep foreheads and brows unobstructed in both 2D and generated 3D; use bright everyday Nevada winter clothing; limit generation to authorized IDs; preserve the 24-bone, UV0, FACE_UV, and three-clip contract; review forehead, ears, neck, front and 45-degree renders before adding any model to exhibition selection.
