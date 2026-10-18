# Performance and asset cleanup — 2026-10-18

The Nevada load previously started decoding Hamina 1.8 seconds after entering Nevada. That loaded a second world and its textures during live interaction. Hamina now loads when the user starts the world jump, before ECHO's takeoff animation. The travel ECHO rig and the three Hamina character bases also load on demand.

The 14 semantic character GLBs now use 1024 px body color images. Their 1024 px face images, skeletons, UVs, and Idle/Walk/Dance animation clips are unchanged. Combined GLB size dropped from 125.5 MiB to 82.7 MiB. This also reduces body texture GPU allocations by roughly three quarters per distinct character. Character and Hamina texture anisotropy is capped at 4. World rendering now uses at most 1× device pixel ratio and 1.5 million pixels without MSAA; the world blend's two scene targets render at 75% width and height. Bloom and all interactive effects remain enabled.

Unused runtime assets removed: the old full-size narration-1 video, four height maps, a diagnostic face image, and the dated `backups/` snapshots. Face diagnostic files moved from `public/debug/` to `artifacts/debug/`, with tool and manifest paths updated. They remain available for offline QA but are no longer copied into `dist/`. `artifacts/pipeline/` remains because it contains the character authoring sources used by the semantic pipeline.

On the in-app Nevada NPC QA route, all 15 NPCs loaded and navigation warnings were empty. The QA overlay now counts all render calls across composer passes and shows CPU update and render submission timings. Hidden browser FPS is subject to background-tab throttling, so it should not be used as a direct full-screen performance benchmark.
