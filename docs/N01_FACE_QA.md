# N01 facial integration QA

Run `npm run dev` and open <http://127.0.0.1:5176/?npcFaceQa=N01>. This route is available only in Vite development mode. The production build uses the normal ECHO entry path, even if the query string is present.

## Test workflow

1. Turn on the camera and capture a front-facing face, or use **Upload Image**. Uploaded images stay in browser memory. Nothing is posted to the server or written to disk.
2. Keep the same capture while switching **Original**, **V2 Geometry**, and **V3 Recon**.
3. Check **Front**, both **45°** views, and **Full Body** with **Idle**, **Walk**, and **Dance**. Use **Neutral** first, then **Nevada** lighting.
4. Use **Retake** to clear the captured session and applied face. **Reset** also restores the original camera, idle pose, and neutral lighting. Closing or navigating away disposes the renderer, MediaPipe detector, animation controller, textures, geometry copies, listeners, and camera stream.

The QR/visitor-facing exhibition path is not used by this route. N01 is not registered in Nevada or Hamina. The exhibition V3 target remains A01 only.

Portrait views follow the animated head while keeping the camera distance fixed. Dance can turn the face away or put a hand in front of it; pause on useful moments or use Full Body to inspect the pose.

## Integration

The QA route loads `public/models/semantic/character_n01_face_ready.glb` through `GLTFLoader`, clones it with `SkeletonUtils.clone`, and finds its actual `FACE` mesh and original texture. V2 runs the existing `FaceShapeEstimator`, `FaceMorphController`, and `FaceTextureGenerator` on N01's own UV1 geometry. V3 calls the existing `VisitorFaceReconstruction` on the same captured session and N01 base texture, then applies its output through `FaceMaterialController` to N01's FACE material. V3 changes the FACE texture; it does not morph geometry. The A01-only rule in `FaceCaptureController.applyReconstructionV3` is untouched.

The UV diagnostic checks all FACE UV1 vertices for finite coordinates in `[0, 1]` and checks six landmark positions against the N01 UV map. The maximum nearest-vertex distance is displayed as `Δ` in normalized UV units.

## 2026-10-13 verification

- Model load: 51,574 total triangles; one FACE primitive with 831 triangles and 697 UV1 vertices; 24 bones; Idle, Casual Walk, and All Night Dance clips. Structural and preservation reports are in `artifacts/debug/semantic/character_n01/`.
- Browser: N01 loaded in the isolated 9:16 QA screen. No world view appeared. FACE UV1 was 100% in range, and the largest checked landmark offset was 0.019 UV units.
- Local N01 front render: face detection passed at 100% landmark quality. The same session drove V2 and V3 without another upload. V2 morphed 1,150 vertices; V3 reported 100% atlas triangle coverage. Both 45° views, full-body view, all three animation selections, both light settings, and Reset responded.
- Webcam: the local browser camera started, Capture produced a valid face session at 73% landmark quality, and both V2 and V3 applied. The capture was cleared with Reset. No webcam image was saved to the project.
- V2 visual finding with the N01 front render: thin triangular lines appeared on the upper forehead and a line at the lower face boundary. Both 45° views also showed visible forehead and jaw color/boundary seams. The matching V3 side view appeared smoother. Setting only the QA morph strength to zero temporarily removed the V2 lines; restoring morph brought them back. A weaker morph reduced but did not remove the forehead mark, and disabling silhouette propagation made it stronger. The QA route retains the existing V2 settings so this problem remains visible for review.
- V3 on the N01 source render looked similar to Original, as expected from a self-image test. This does **not** establish visitor likeness.
- `npm run test:face`: 10/10 passed. `npm run build`: passed. The production output contained no N01 QA route or UI strings.

## Deployment gate

Do not register N01 in Nevada yet. Human review is still needed with several consented, front-facing visitor images in neutral and Nevada light, at the front and both 45° angles, and during each animation. Assess eye/nose/mouth identity, skin-tone transition, hairline, the forehead triangles, jaw/neck seam, and the source mesh's slight smile. The V2 finding points to the N01 face boundary and its morph propagation; repair should be tested on a *new* GLB/QA copy or through an N01-specific morph mapping, without overwriting the current asset or changing A/B/C behavior. V3 identity quality also needs direct visual approval.
