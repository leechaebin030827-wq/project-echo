# Nevada world interactions

## QA

Run `npm run dev` and open `http://127.0.0.1:5176/?nevadaInteractionQa=1` to enter the Nevada world directly for development QA. Click the visible object itself; no QA button panel is shown. The interaction's `RETURN TO WORLD` button or Escape restores the world. The five effects share `WorldInteractionExperience`; only one may run at a time.

The narration uses the existing `#echo-caption` area. Each cue shows a complete Korean and English pair on one line per language; its type scales with the portrait stage. The next pair replaces it after a length-based reading interval of about 1.75–2.45 seconds. Nevada's local language is English. There is no separate narration text layer. The source card is optional and becomes available after the final phrase. These are screen captions; no narration voice file is supplied. The Cooler uses a fan sound effect, not spoken audio.

## Actual GLB mapping

The five named nodes in the Nevada GLB are export markers. They are removed after loading. Picking uses the actual visible meshes. The Cooler alone also accepts a ray hit within its visible module bounds expanded by 1.15 world units, so the narrow fins can be selected reliably from the orbit view. This is a local picking tolerance, not a change to the GLB. Three.js may sanitize periods in GLB node names on load.

| Interaction | Visible GLB mesh name(s) | Visual effect |
| --- | --- | --- |
| Data Center | `Citadel_Main_Entrance` | Original camera frame copied into a top-to-bottom grid |
| Cooler | `TSC_Cooling_Module.002` | Full rendered scene inversion and `water_cooler.mp3` fade |
| Billboard | `Mesh_0` | SOLD flip and $11 billion |
| Cable | `Mesh_0.002`, `Mesh_0.001` | Conceptual Las Vegas–Tahoe Reno connection |
| Money | `money` | Lightweight bill glyphs and $27 million |

The camera approach takes about 1.2–2.55 seconds according to travel distance and follows a gentle elevated arc. The Data Center is framed closer from a side approach that keeps the ECHO out of the center view; its follow-up focus moves closer again. The Cooler is framed farther back so the full module remains readable. Hovering a selectable object temporarily brightens its actual mesh and shows a high-contrast cursor label. The visual effect starts near the end of the approach. Effect duration lasts at least 0.45 seconds beyond the captions; the research button appears after the last phrase. With no interaction, the focus closes about 12 seconds later. Timing is derived from phrase length in `WorldInteractionExperience.js` and may be tuned there; content and paired wording live in `NevadaInteractionContent.js`.

## Facts and interpretation

- **Data Center:** [Switch Tahoe Reno](https://www.switch.com/tahoe-reno/) describes the facility. The photo multiplication is an artistic simulation, not a claim that a visitor image is sent there.
- **Cooler:** [Switch TSC cooling](https://www.switch.com/switch-tsc-1000/) describes cooling infrastructure. Color inversion is an artistic effect.
- **Billboard:** [SEC-hosted acquisition announcement](https://www.sec.gov/Archives/edgar/data/1710583/000119312522298966/d356989dex991.htm) records the December 2022 completion and approximate $11 billion enterprise value including repayment of outstanding debt. This concerns company ownership, not a visitor's photo rights.
- **Money:** [Switch 2017 Form 10-K](https://www.sec.gov/Archives/edgar/data/1710583/000171058318000034/swch12311710-k.htm) records the $27 million NV Energy impact fee paid on May 31, 2017. It is not a monthly power bill.
- **Cable:** [Switch SUPERLOOP](https://www.switch.com/switch-superloop/) describes the Las Vegas and Tahoe Reno connection and distance exceeding 500 miles. The line in the effect is a conceptual diagram, not a traced cable route or visitor-photo transfer.

The common research card separates the recorded fact from the artistic simulation or interpretation. External sources open only when selected.

## Image and resource lifecycle

The Data Center effect reads `FaceCaptureController.session.frame`, the original 2D webcam canvas. It makes one in-memory data URL for 20 DOM images and removes the grid and URL reference on exit. It never uses the synthesized face atlas, sends the image to a server, or writes a new persistent copy. The former automatic IndexedDB photo archive call has been disabled for new captures. Previously stored browser records are untouched.

The Cooler adds one uniform to the existing postprocessing pass, so the WebGL world is inverted while DOM captions retain their layout. The existing caption gets a temporary contrast style during strong inversion. Its volume peaks at 0.28 and returns to zero; the sound is paused and rewound on effect end or cancellation. Temporary mesh materials are restored and disposed on exit. The existing render loop drives all effects.

## Ambient character gatherings

In Nevada, the original A/B/C walkers now pause briefly between walking stretches. When three or four available characters form a compact gathering (every pair within 5.8 world units for about 1.15 seconds), they stop moving and play their existing rigged Dance clips. Up to two gatherings can coexist. Each lasts about 13 seconds and participants have a 24-second cooldown, preventing continuous dancing. Hamina does not start new gatherings.

Clicking anywhere within a gathering's bounded pick sphere enters a full-body group camera view, with a gentle arc on approach and a small lateral sway while watching. The dance remains active while this view is open. Clicking the group or background returns to the ECHO orbit; the group dances for four more seconds before resuming its prior idle/walk behavior. No permanent mesh, animation, face data, or exhibition UI is added. Development diagnostics are available in the stage's `data-qa-dance-groups` attribute.

## Deferred work and visual review

The brief's security, passerby, and visitor NPC dialogue is not activated. The available NPCs have no verified security role, location, or badge animation, and their existing selection, focus, and face behavior remain in place. No new NPC or Meshy task was created.

Browser QA still needs a real visitor webcam frame for the Data Center image grid and an exhibition-display review of phrase readability, visual similarity, and audio level. A headless browser cannot establish those perceptual results. The QA route can trigger each object even when the normal camera does not currently show it.
