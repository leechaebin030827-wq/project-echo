"""Create a draw-friendly GLB from the authored LightCable world.

Run with Blender in background mode, passing source and destination after `--`.
The originals remain untouched; all UVs and materials are retained.
"""

import bpy
import sys


def main():
    source, destination = sys.argv[sys.argv.index('--') + 1:]
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=source)

    for obj in list(bpy.data.objects):
        if obj.type != 'MESH':
            continue
        triangles = sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)
        if obj.name.startswith('LightCable'):
            target = 6500
        elif obj.name.startswith('SeaBottom'):
            target = 5200
        elif obj.name.startswith('Fish'):
            target = 1000
        elif obj.name.startswith('Plant'):
            target = 1200
        else:
            continue
        if triangles <= target:
            continue
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        modifier = obj.modifiers.new('Runtime LOD', 'DECIMATE')
        modifier.decimate_type = 'COLLAPSE'
        modifier.ratio = target / triangles
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        result = sum(max(1, len(poly.vertices) - 2) for poly in obj.data.polygons)
        print(f'LOD {obj.name}: {triangles:,} -> {result:,} triangles')

    bpy.ops.export_scene.gltf(filepath=destination, export_format='GLB',
                              export_yup=True, export_image_format='AUTO')


if __name__ == '__main__':
    main()
