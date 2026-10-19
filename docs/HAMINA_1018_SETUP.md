# Hamina 1018 handoff

The runtime uses `public/models/Hamina1018.runtime.glb`, generated from the supplied
`Hamina1018.glb`. The source is unchanged. The first pass limits embedded images to
1024 px. The second pass preserves the authored scene graph while applying Meshopt
geometry compression and WebP textures:

```sh
/Users/chaebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
  tools/optimize_hamina_glb.py /path/to/Hamina1018.glb public/models/Hamina1018.optimized.glb
node /path/to/@gltf-transform/cli/bin/cli.js optimize \
  public/models/Hamina1018.optimized.glb public/models/Hamina1018.runtime.glb \
  --compress meshopt --texture-compress webp --texture-size 1024 \
  --flatten false --join false --instance false --simplify false --palette false
```

The two passes preserve nodes, geometry, UVs, and click volumes. Runtime size falls
from 309.8 MB to 21.9 MB. The browser also precompiles Hamina shaders before travel.

Runtime mapping:

- `Main_Base` and `Outer`: `Forest` faces seed spatial GPU instancing batches
  from `Tree1` and `Tree2`. Scale variants are 0.6, 0.8, 1.2, and 1.4,
  with the overall tree size halved. `Outer` carries 5,200 trees and uses
  simplified source geometry for the distant forest.
- `Land` on both terrain nodes and `Snow1`–`Snow3` share the
  `Hamina_Snow` base color and roughness textures. Land uses world-space
  triplanar mapping; the smaller snow meshes also use the snow normal texture.
  `Outer` Forest ground uses this same snow texture.
- `Ocean` is a reflective water surface with moving normal-map ripples,
  low swells, cool sea color, and winter sun glints. The authored plane sets
  its footprint and level; the distant tree layer is excluded from its
  reflection pass to keep rendering responsive.
- `Main_Base` `Land` faces: walking surface for the same 15 A/B/C visitor
  characters carried from Nevada. Existing face identities are retained.
- `Project_Echo`: mounts the shared animated Echo rig. The Nevada lift, in-air
  spin, and Hamina landing use this same rig without switching its appearance.
- `Data_Center_Click`, `Cooler_Click`, `Forest_Click`, `Timer_Click`,
  `Finland_Click`, `Ocean_Click`: exact interaction regions. Korean narration
  v1, hover questions, and Finnish subtitles live in
  `HAMINA_CONFIG.interactions` in `src/config.js`.
- Nine `Industrial_Light_Pole_A*` objects use emissive light materials;
  six receive practical point lights in addition to sky and sun fill.

The developer route `?worldQa=1&jumpQa=1` exercises the full transition.
