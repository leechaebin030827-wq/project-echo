"""Controlled rest-pose renders. Bone location is used only for camera framing."""
import sys,json,argparse,hashlib
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from validate_character import import_character,inspect,write_report
from inspect_head import setup_render
p=argparse.ArgumentParser();p.add_argument('--base',default='character_a');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
root=Path(__file__).resolve().parents[2];source=root/'artifacts/pipeline'/a.base/(a.base+'_animated.glb')
out=root/'public/debug/semantic'/a.base;out.mkdir(parents=True,exist_ok=True)
import_character(source)
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.data.pose_position='REST'
bpy.context.view_layer.update()
report=inspect(source);write_report(out/'asset-inspection.json',report)
height=report['approximate_height'];head=rig.matrix_world@rig.data.bones['Head'].head_local
target=head+Vector((0,0,height*.06));scale=height*.23
cam=setup_render((target.x,-height*2,target.z),target,scale,(1024,1024))
scene=bpy.context.scene
for name,offset in [('front',(0,-height*2,0)),('left',(-height,height*-2,0)),('right',(height,height*-2,0))]:
    cam.location=target+Vector(offset);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
    data={'type':'ORTHO','matrix_world':[list(r) for r in cam.matrix_world],'ortho_scale':scale,'resolution':[1024,1024],'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'coordinate_system':'Blender Z up; image origin top-left','pose':'REST'}
    (out/(name+'-camera.json')).write_text(json.dumps(data,indent=2))
    scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
print('Controlled semantic renders:',out)
