"""Transfer the existing four-leg ECHO rig onto a replacement Meshy GLB.

Blender 3.2+ background usage:
  blender -b --factory-startup --python tools/blender/rig_echo_from_meshy.py -- \
    SOURCE.glb public/intro/assets/opening/echo-opening-rig.glb OUTPUT.glb
"""

import sys
from pathlib import Path

import bpy


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 3:
        raise SystemExit("Expected SOURCE.glb REFERENCE_RIG.glb OUTPUT.glb")
    return [Path(value).resolve() for value in argv]


source_path, reference_path, output_path = arguments()
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bpy.ops.import_scene.gltf(filepath=str(reference_path))
reference = bpy.data.objects.get("ECHO_Mesh")
armature = bpy.data.objects.get("ECHO_Rig")
if reference is None or armature is None or reference.type != "MESH" or armature.type != "ARMATURE":
    raise RuntimeError("Reference GLB must contain ECHO_Mesh and ECHO_Rig")

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(source_path))
added = set(bpy.data.objects) - before
meshes = [obj for obj in added if obj.type == "MESH"]
if len(meshes) != 1:
    raise RuntimeError(f"Expected one replacement mesh, found {len(meshes)}")
replacement = meshes[0]

# The supplied metallic/roughness JPEG makes ECHO read as chrome under the
# colored world lights. Keep the color and normal images and give the pastel
# surface a controlled gloss without the original map's extreme reflections.
for material in replacement.data.materials:
    if not material or not material.use_nodes:
        continue
    shader = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader is None:
        continue
    for name, value in (("Metallic", 0.32), ("Roughness", 0.29)):
        socket = shader.inputs[name]
        for link in tuple(socket.links):
            material.node_tree.links.remove(link)
        socket.default_value = value

# Both GLBs use the same centered ECHO pose and scale. Transfer interpolated
# surface weights, including the separate foot/strut regions, before parenting.
for group in reference.vertex_groups:
    replacement.vertex_groups.new(name=group.name)
transfer = replacement.modifiers.new("Transfer ECHO weights", "DATA_TRANSFER")
transfer.object = reference
transfer.use_vert_data = True
transfer.data_types_verts = {"VGROUP_WEIGHTS"}
transfer.vert_mapping = "POLYINTERP_NEAREST"
transfer.layers_vgroup_select_src = "ALL"
transfer.layers_vgroup_select_dst = "NAME"
bpy.context.view_layer.objects.active = replacement
replacement.select_set(True)
bpy.ops.object.modifier_apply(modifier=transfer.name)

groups_with_weights = 0
unweighted = 0
for vertex in replacement.data.vertices:
    weights = [assignment.weight for assignment in vertex.groups if assignment.weight > 1e-5]
    if not weights:
        unweighted += 1
    else:
        groups_with_weights += 1
if unweighted:
    raise RuntimeError(f"{unweighted} vertices have no rig weights")

reference_name = reference.name
bpy.data.objects.remove(reference, do_unlink=True)
replacement.name = reference_name
replacement.parent = armature
replacement.matrix_parent_inverse.identity()
replacement.matrix_basis.identity()
skin = replacement.modifiers.new("Armature", "ARMATURE")
skin.object = armature

for obj in bpy.context.selected_objects:
    obj.select_set(False)
armature.select_set(True)
replacement.select_set(True)
bpy.context.view_layer.objects.active = armature
output_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_yup=True,
)
print(f"ECHO rigged: {groups_with_weights} weighted vertices, {len(replacement.vertex_groups)} groups -> {output_path}")
