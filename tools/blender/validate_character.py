"""Read-only GLB inspection inside a fresh Blender process. Run with --background."""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


def import_character(path, fps=None):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if fps is not None:bpy.context.scene.render.fps=fps
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects if obj.type == 'MESH' for corner in obj.bound_box]
    if not points:
        raise ValueError('No mesh bounds found')
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    if not all(math.isfinite(v) for v in low + high):
        raise ValueError('Non-finite mesh bounds')
    return {'min': low, 'max': high, 'size': [high[i] - low[i] for i in range(3)]}


def inspect(path):
    objects = list(bpy.context.scene.objects)
    # glTF importer may create hidden bone display shapes; they are not asset geometry.
    shapes = {b.custom_shape for o in objects if o.type == 'ARMATURE' for b in o.pose.bones if b.custom_shape}
    meshes = [obj for obj in objects if obj.type == 'MESH' and obj not in shapes]
    box = bounds(meshes)
    mesh_info = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        mesh_info.append({
            'name': obj.name, 'data_name': obj.data.name,
            'vertex_count': len(obj.data.vertices), 'triangle_count': len(obj.data.loop_triangles),
            'uv_layers': [uv.name for uv in obj.data.uv_layers],
            'materials': [s.material.name if s.material else None for s in obj.material_slots],
            'armature_modifiers': [m.object.name if m.object else None for m in obj.modifiers if m.type == 'ARMATURE'],
            'shape_keys': [k.name for k in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else [],
            'surface_uv_signature': surface_uv_signature(obj.data),
        })
    return {
        'source': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'blender_version': bpy.app.version_string,
        'coordinate_system': 'Blender: Z up; exported glTF/Three.js: Y up',
        'bounds': box, 'approximate_height': box['size'][2],
        'height_units': 'Blender units; raw scale is not proof of real-world dimensions',
        'mesh_names': [o.name for o in meshes], 'meshes': mesh_info,
        'vertex_count': sum(m['vertex_count'] for m in mesh_info),
        'triangle_count': sum(m['triangle_count'] for m in mesh_info),
        'material_names': [m.name for m in bpy.data.materials],
        'armatures': [{'name':o.name, 'bones':[b.name for b in o.data.bones]} for o in objects if o.type == 'ARMATURE'],
        'animation_clips': [a.name for a in bpy.data.actions],
        'hierarchy': [{'name':o.name, 'type':o.type, 'parent':o.parent.name if o.parent else None,
                       'children':[c.name for c in o.children], 'world_matrix':[list(row) for row in o.matrix_world]} for o in objects],
        'images': [{'name':i.name, 'size':list(i.size), 'packed':bool(i.packed_file)} for i in bpy.data.images],
        'face_materials': [m.name for m in bpy.data.materials if m.name.upper() == 'FACE'],
    }


def surface_uv_signature(mesh):
    """Order/index independent triangle-corner position + UV fingerprint.

    Exporters may split vertices at seams. Compare actual triangle corners
    instead of requiring their internal vertex indexing to stay identical.
    Local coordinates and UVs are quantized to 1e-6 for float32 roundtrips.
    """
    positions = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get('co', positions)
    positions = positions.reshape(-1, 3)
    vertices = np.empty(len(mesh.loop_triangles) * 3, dtype=np.int32)
    loops = np.empty_like(vertices)
    mesh.loop_triangles.foreach_get('vertices', vertices)
    mesh.loop_triangles.foreach_get('loops', loops)
    parts = [positions[vertices]]
    for layer in mesh.uv_layers:
        uv = np.empty(len(mesh.loops) * 2, dtype=np.float64)
        layer.data.foreach_get('uv', uv)
        parts.append(uv.reshape(-1, 2)[loops])
    corners = np.rint(np.concatenate(parts, axis=1) * 1e6).astype('<i8')
    corner_size = corners.shape[1] * 8
    records = np.ascontiguousarray(corners).view(f'V{corner_size}').reshape(-1, 3)
    records.sort(axis=1)
    triangles = records.reshape(-1).view(f'V{corner_size * 3}')
    triangles.sort()
    return hashlib.sha256(triangles.tobytes()).hexdigest()


def write_report(path, report):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    import_character(args.input.resolve())
    report = inspect(args.input.resolve())
    write_report(args.report.resolve(), report)
    print(json.dumps({k:report[k] for k in ['mesh_names','vertex_count','triangle_count','approximate_height','material_names','armatures','animation_clips']}, indent=2))
