# Project ECHO — Nevada N03–N10 developer face QA

## Open and use

Run `npm run dev` and open `http://127.0.0.1:5176/?npcBatchQa=nevada`. The route exists only when Vite is in development mode. It does not register any N character in either exhibition world. The pre-existing `?npcFaceQa=N01` route and A/B/C experience are unchanged.

Capture with the webcam or upload a local image once. The Face Session remains in memory while switching N03–N10. For each character, compare `ORIGINAL`, `V2 GEOMETRY` and `V3 RECONSTRUCTION`; change front/left 45°/right 45°/full body, Idle/Walk/Dance, and neutral/Nevada light. `RESET` clears the visitor session, generated face texture, sheet, and QA controls. V2 uses the unchanged `skinBlend: 0.56` and existing morph settings. V3 invokes the existing reconstructor with the **currently loaded character's own FACE base texture**; the exhibition's A01-only V3 target logic remains untouched.

`RENDER 8` builds a Contact Sheet with the same Face Session, current mode and lighting, FRONT, Idle held at time 0, square 420 px frames, 38° FOV, and camera distance proportional to each model's measured skinned FACE height. One GLB is loaded and rendered at a time; cards retain only PNG blobs. The selected character, view and motion are restored afterward. `DOWNLOAD PNG` exports the 4 × 2 sheet. Captured visitor photos and sheet blobs remain local to the browser until the user chooses to download.

`CHECK CURRENT MOTIONS` samples the FACE vertices at three points of each Idle, Walk and Dance clip. It checks finite skinned positions and the relative distances between representative eye, nose, mouth and chin vertices. A separate `EDGE REVIEW` warns about larger changes among sampled peripheral FACE vertex pairs. This is a deformation signal, not a visual release decision. GPU geometry/texture counts update after rendering to help spot resident-resource growth during model switches.

## Static asset verification

The existing GLB and validator reports were read without modifying them. Current GLB SHA-256 values match every character's prior pipeline manifest. All eight candidates have `FACE`, texture channel 1 / `TEXCOORD_1`, UV0, skin weights, 24 bones, and Idle/Walk/Dance; the prior topology/UV/weight/animation preservation and glTF checks pass. Detailed per-character results: `artifacts/qa/nevada_batch/static_validation.json`.

| ID | FACE triangles | FACE vertices | UV1 | Clips / bones | Contract |
| --- | ---: | ---: | --- | --- | --- |
| N03 | 816 | 753 | 753/753 | 3 / 24 | pass |
| N04 | 912 | 736 | 736/736 | 3 / 24 | pass |
| N05 | 440 | 379 | 379/379 | 3 / 24 | pass |
| N06 | 759 | 748 | 748/748 | 3 / 24 | pass |
| N07 | 689 | 679 | 679/679 | 3 / 24 | pass |
| N08 | 717 | 714 | 714/714 | 3 / 24 | pass |
| N09 | 857 | 826 | 826/826 | 3 / 24 | pass |
| N10 | 935 | 890 | 890/890 | 3 / 24 | pass |

The source semantic mapping places the eye, nose and lip group landmarks on selected FACE polygons for all eight candidates. N07 has 8/10 and 9/10 selected eyebrow samples; N09 has 9/10 on one brow. The forehead contour point and chin tip are outside selected FACE polygons in **all eight** mapping reports; a point outside the selected polygon is not proof that the entire nearby region is missing, but it highlights a boundary that needs visual review. The runtime's nearest-UV-vertex diagnostic also warns about sparse forehead samples on N07 and N10; this does not alone invalidate a FACE contract.

## Browser QA performed

- The development URL loaded N03 and all eight candidate GLBs. A single uploaded **N01 diagnostic render** produced one Face Session; switching models did not request recapture.
- V3 reconstruction applied to N03–N10 using each model's own base image; all reported 100% canonical atlas triangle draw coverage. V2 texture and geometry morph also ran for all eight, with 514–1595 changed vertices in this test session.
- The Contact Sheet rendered 8/8 models sequentially. Original, V2 and V3, front and a 45° view, Idle/Walk/Dance, full body and both lighting controls were exercised. After repeated model switches the displayed settled GPU counts returned to 2 geometries / 4 textures; no monotonic increase was seen in this short browser run.
- The local saved V3 sample is `artifacts/qa/nevada_batch/n01_reference_v3_neutral_contact_sheet.png`. It was downloaded before the final FACE-height camera normalization; the current QA screen renders with normalized zoom. The sample source is a 3D N01 diagnostic render, **not an actual visitor photograph**.
- Automatic clip and asset preservation evidence is in each `public/debug/semantic/character_nXX/preservation-validation.json`. A QA motion sample found N07 and N10 central eye/nose/mouth/chin distances stable under all three clips (maximum 0.9 mm and 0.6 mm respectively). Their broader peripheral sampled pairs changed up to about 13.0 mm and 13.8 mm during Idle, so these two require contour/seam review at motion time. The check is conservative and does not by itself prove a visible defect.

### Visual result and release status

The synthetic N01-face V3 sheet exposes **visible polygonal/triangular artifacts** around the forehead and eyes on several characters; V2 under Nevada light also shows uneven facial patches. Original faces are visibly cleaner. This test therefore does **not** approve facial identity quality or release of any N03–N10 candidate. The artifact cause is not established from one synthetic input: candidate causes include source image texture, canonical warp, sparse FACE boundary, or per-model projection. Do not equate the FACE contract pass or 100% atlas draw coverage with correct facial alignment.

Before any exhibition placement, repeat Original/V2/V3 with several consented visitor photos, including hair and varied skin tones, in front and both 45° views. Compare likeness, eye/nose/mouth placement, forehead triangles, hairline, jaw/neck color, seams and hair occlusion under both lights. Inspect Walk and Dance at multiple times, especially N07/N10 peripheral face edges. Keep all N03–N10 on QA hold until a person approves the results.

## Held characters: diagnosis only

**N02 — hair occlusion.** The existing front diagnostic visibly shows strands over the left brow, eye and nose. The face-ready GLB has one `char1` mesh with `BakedMaterial` and `FACE` primitives; there is no separately named hair mesh or hair material to hide safely. The hair shares the body material, and the BakedMaterial geometry has many small disconnected components, so a global material toggle or automatic component deletion is unsafe. A Blender repair is plausible on a **copy**: manually select the offending strand polygons in orthographic front and 45° views, move/reshape them behind the face, preserve UV0, skin weights and clips, then rerun contract/preservation and composite QA. No repair was applied; N02 stays HOLD.

**N11 — low FACE density.** Its selected region has 280 triangles, below the unchanged 300 minimum. Existing diagnostic front/left/right views show broad coverage over eyes, nose, lips and central cheeks, but a coarse, jagged upper-forehead edge. Mapping samples include 16/16 left-eye, 16/16 right-eye, 14/14 nose and 40/40 lips; one brow has 8/10 selected samples. Its canonical UV area sum is 0.456 versus N05's 0.474, while N11 uses 280 versus N05's 440 triangles; median UV triangle area is 0.001047 versus 0.000704. Only 17 N11 triangles have upper-forehead UV centroids compared with 48 for N05. This supports a **coarse mesh/selected boundary** explanation rather than a simple missing central feature area, but the exact split between source topology and segmentation mask is not proven. Blind subdivision or expanding into hair/neck would not establish safe coverage. N11 stays HOLD; a manually reviewed local geometry/mask candidate would need the original contract and full visual QA before consideration.

## Scope and checks

Source edits are limited to `src/main.js`, `src/qa/NevadaBatchFaceQa.js`, `src/qa/nevada-batch-face-qa.css` and this document. Local QA outputs are under `artifacts/qa/nevada_batch/`; `npm run build` also regenerated `dist/`. Original GLBs, N01 QA, A/B/C, V2/V3 compositor modules, world registration and backups were not edited. No Meshy API calls or generation stages were used.

`npm run test:face`: 10/10 pass. `npm run build`: pass; Vite reports the pre-existing large main chunk warning. The dev-only batch module was loaded and exercised in the local browser, because production dead-code elimination excludes that route from the build. Actual visitor-face likeness and longer-duration GPU profiling remain pending.
