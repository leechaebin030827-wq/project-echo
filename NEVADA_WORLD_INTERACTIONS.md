# Nevada world interactions

## QA

Run `npm run dev` and open `http://127.0.0.1:5176/?nevadaInteractionQa=1` to enter the Nevada world directly for development QA. Click the visible object itself; no QA button panel is shown. The return control or Escape restores the world. Data Center opens `DataCenterArchive`; Cooler, Billboard, Flag, and Money share `WorldInteractionExperience`. Only one focus may run at a time.

The Ver.2 Nevada dialogue is text only. All world dialogue recordings and their duration manifest were removed. Caption timing is estimated from the Korean line length. The Cooler, Billboard, Flag, and Money dialogue uses the existing `#echo-caption` area with a Korean and English pair. Their source card is optional and becomes available after the final phrase, except for the short Cooler effect. The Cooler fan sound effect and the separate entry audio remain.

## Nevada1017 GLB mapping

`public/models/Nevada.glb` is the optimized Nevada1017 export. The source file is `Nevada1017.glb` in the user's Project Echo Worlds/Nevada folder. Exported `*_Click` boxes are removed from the visible scene after their bounds are captured; visible meshes still receive hover and focus effects. The two coolers share the existing Cooler experience. Three.js may sanitize spaces and periods in GLB node names on load.

| Interaction | Visible GLB mesh name(s) | Visual effect |
| --- | --- | --- |
| Data Center | `Data_Center` / `Data Center_Click` | Existing Data Center archive |
| Cooler (north) | `TSC_Cooling_Module.001`, `.002` / `Cooler1_Click` | Full rendered scene inversion and `water_cooler.mp3` fade |
| Cooler (south) | `TSC_Cooling_Module.003` / `Cooler2_Click` | Same Cooler experience |
| Billboard | `output_unwrapped` / `Billboard_Click` | SOLD flip and $11 billion |
| Flag | `USA` / `USA_Click` | Introduces Nevada and the physical data center |
| Money | `Money`, `Money_Cover` / `Money_Click` | Lightweight bill glyphs and $27 million |

The export no longer contains a `Land_Grass` collection node. It contains three `Dry_Grass_A` variants and three `Sagebrush` variants. `NevadaGrass` samples only the upward-facing triangles assigned the `Land` material and scatters these source geometries with a deterministic seed. It caps grass at 360 and shrubs at 36, and uses one `InstancedMesh` per variant rather than cloning individual draw calls. The original placed plants remain visible. The generated group is excluded from NPC obstacle detection.

The unused `Base_Save_Don'tShow` mesh is removed at runtime. The served GLB is 15.4 MiB (16,159,376 bytes), down from the 214 MiB source in the user's Nevada folder. glTF Transform 4.5.1 simplified the meshes (`--ratio 0.3 --error 0.004`), converted PNGs to near-lossless WebP (`--quality 95 --effort 90`), deduplicated equivalent materials (148 to 25) and mesh data (113 to 25), capped textures at 1024 pixels, and applied Meshopt compression (`--level high`). Estimated decoded RGBA texture storage fell from about 479 MiB to 166 MiB before mipmaps. `NevadaWorld` installs `MeshoptDecoder` before loading. The 16 repeated light poles are rendered in three GPU batches; `Light` material uses warm emission and bloom, with two local point lights for nearby illumination. Browser QA recorded all six pick regions, 15/15 NPCs grounded with no route warnings, and 148 generated plant instances on this export. FPS varies by view and display hardware.

The renderer now caps pixel ratio at 1.25 and rendered pixels at 2.8 million. The merged terrain shader samples neighbouring color and normal textures only at blend boundaries. These limits target GPU work while preserving the existing interactions and terrain transitions.

The merged `Base` has two mountain primitives: `Mountain` and `Material.003`. Both are mapped to the Nevada mountain color, normal, and roughness textures; `Material.003` is an export alias for the same mountain surface.

## ECHO replacement

`public/models/EchoMeshyRig.glb` is rigged from the supplied `Meshy_AI__1018064223_texture.glb` with the existing four-leg ECHO armature. `tools/blender/rig_echo_from_meshy.py` transfers interpolated weights to every vertex and keeps the new color and normal textures. The supplied metallic/roughness image made the surface overly reflective under the world lights, so the rig uses metallic 0.32 and roughness 0.29 for a controlled glossy finish. Meshopt reduces the rig to 6.4 MiB. Nevada mounts it under the original `Echo` node at its authored position and 4× scale. Hamina keeps its own authored ECHO transform. The opening and world-travel animations load the same rig so the character does not switch appearance during travel.

The camera approach takes about 1.2–2.55 seconds according to travel distance and follows a gentle elevated arc. The Data Center is framed from a side approach that keeps the ECHO out of the center view. The Cooler is framed farther back so the full module remains readable. Hovering a selectable object temporarily brightens its actual mesh and shows a cursor label. `WorldInteractionExperience.js` controls the four captioned effects; `DataCenterArchive.js` controls the Data Center grid.

## Facts and interpretation

- **Data Center:** [Google Cloud locations and replication](https://docs.cloud.google.com/storage/docs/locations) describes data replication. The photo multiplication is an artistic simulation, not a claim that a visitor image is sent to Switch.
- **Cooler:** [Switch TSC cooling](https://www.switch.com/switch-tsc-1000/) describes cooling infrastructure. Color inversion is an artistic effect.
- **Billboard:** [DigitalBridge's acquisition announcement](https://www.digitalbridge.com/news/2022-12-06-digitalbridge-and-ifm-investors-complete-11-billion-take-private-of-switch) records the December 2022 completion and approximate $11 billion transaction including debt repayment. This concerns company ownership, not a visitor's photo rights.
- **Money:** [Switch 2017 Form 10-K](https://www.sec.gov/Archives/edgar/data/1710583/000171058318000034/swch12311710-k.htm) records the $27 million NV Energy impact fee paid on May 31, 2017. It is not a monthly power bill.
- **Flag:** [Switch Tahoe Reno](https://www.switch.com/tahoe-reno/) describes a physical Nevada data center. The flag introduces the world's location.

The research cards for Billboard, Money, and Flag separate the recorded fact from artistic interpretation. External sources open only when selected.

## Image and resource lifecycle

The Data Center archive uses the current original webcam frame when available, otherwise the last previously archived photo. It draws 20 canvas portraits in memory and clears the grid on exit. New captures are not automatically archived. The image is not sent to a server by this interaction.

The Cooler adds one uniform to the existing postprocessing pass, so the WebGL world is inverted while DOM captions retain their layout. Its sound fades out and is paused and rewound on effect end or cancellation. Temporary mesh materials are restored and disposed on exit. The existing render loop drives all effects.

## Ambient character gatherings

In Nevada, the original A/B/C walkers now pause briefly between walking stretches. When three or four available characters form a compact gathering (every pair within 5.8 world units for about 1.15 seconds), they stop moving and play their existing rigged Dance clips. Up to two gatherings can coexist. Each lasts about 13 seconds and participants have a 24-second cooldown, preventing continuous dancing. Hamina does not start new gatherings.

Clicking anywhere within a gathering's bounded pick sphere enters a full-body group camera view, with a gentle arc on approach and a small lateral sway while watching. The dance remains active while this view is open. Clicking the group or background returns to the ECHO orbit; the group dances for four more seconds before resuming its prior idle/walk behavior. No permanent mesh, animation, face data, or exhibition UI is added. Development diagnostics are available in the stage's `data-qa-dance-groups` attribute.

## Visual review

The three NPC dialogue variants and dance captions use the Ver.2 text. Their timing is based on caption length because world dialogue recordings have been removed.

QA still needs a real visitor webcam frame for the Data Center image grid and an exhibition-display review of phrase readability, visual similarity, and sound-effect level.
