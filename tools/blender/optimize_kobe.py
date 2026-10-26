import bpy
import sys


def argument_after(flag):
    args = sys.argv[sys.argv.index("--") + 1:]
    return args[args.index(flag) + 1]


source = argument_after("--input")
destination = argument_after("--output")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

for image in bpy.data.images:
    if image.size[0] > 1024 or image.size[1] > 1024:
        scale = min(1024 / image.size[0], 1024 / image.size[1])
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))

for obj in list(bpy.context.scene.objects):
    if obj.type != "MESH":
        continue
    obj.data.calc_loop_triangles()
    triangles = len(obj.data.loop_triangles)
    if triangles <= 24000:
        continue
    if triangles > 1_000_000:
        target = 115_000
    elif triangles > 500_000:
        target = 90_000
    elif triangles > 180_000:
        target = 58_000
    elif triangles > 75_000:
        target = 42_000
    else:
        target = 28_000
    modifier = obj.modifiers.new(name="Runtime Decimate", type="DECIMATE")
    modifier.ratio = min(1.0, target / triangles)
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)

bpy.ops.export_scene.gltf(
    filepath=destination,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_lights=False,
    export_cameras=False,
)
