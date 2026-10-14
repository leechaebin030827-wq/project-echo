"""Render an inspectable front/profile preview of a N01 stage GLB."""
import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
from validate_character import import_character, inspect, write_report
from inspect_head import setup_render

parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

source = args.input.resolve()
out = args.output.resolve()
out.mkdir(parents=True, exist_ok=True)
import_character(source)
report = inspect(source)
write_report(out / 'asset-inspection.json', report)
low = Vector(report['bounds']['min'])
high = Vector(report['bounds']['max'])
center = (low + high) / 2
height = high.z - low.z
camera = setup_render((center.x, center.y - 3 * height, center.z), center,
                      height * 1.14, (768, 1024))
for name, offset in [('front', Vector((0, -3 * height, 0))),
                     ('side', Vector((-3 * height, 0, 0)))]:
    camera.location = center + offset
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.render.filepath = str(out / f'{name}.png')
    bpy.ops.render.render(write_still=True)
print(json.dumps({'source': str(source), 'triangles': report['triangle_count'],
                  'renders': [str(out / 'front.png'), str(out / 'side.png')]}))
