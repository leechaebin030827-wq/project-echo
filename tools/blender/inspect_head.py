"""Inspect the existing static asset and render orthographic head references."""
import sys, json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/debug/face-rig'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(Path(__file__).parent))
from validate_character import import_character

def load_static():
    import_character(ROOT / 'public/models/processed/character_a_processed.glb')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if any(o.type == 'ARMATURE' for o in bpy.context.scene.objects):
        raise ValueError('Expected the unrigged source for this phase')
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.data.transform(world)
        obj.matrix_world = Matrix.Identity(4)
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH': bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    return meshes

def setup_render(location=(0,-3,1.55), target=(0,0,1.55), scale=.31, size=(800,800)):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.world = bpy.data.worlds.new('InspectionWorld')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.7,.7,.7,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    scene.view_settings.view_transform = 'Standard'
    for name, pos, power in [('Key',(2,-3,3),120),('Fill',(-2,-2,2),80)]:
        data = bpy.data.lights.new(name,'AREA'); data.energy = power; data.shape='DISK'; data.size=3
        obj = bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=pos
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    cam_data=bpy.data.cameras.new('InspectionCamera'); cam=bpy.data.objects.new('InspectionCamera',cam_data)
    scene.collection.objects.link(cam); cam.location=location
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam_data.type='ORTHO'; cam_data.ortho_scale=scale; scene.camera=cam
    return cam

if __name__ == '__main__':
    obj=load_static()[0]
    mesh=obj.data
    coords=np.array([v.co[:] for v in mesh.vertices])
    head=(coords[:,2]>1.44)
    bins=[]
    for low in np.arange(1.44,1.68,.02):
        pts=coords[(coords[:,2]>=low)&(coords[:,2]<low+.02)]
        central=pts[np.abs(pts[:,0])<.06]
        bins.append({'z':[float(low),float(low+.02)],'count':len(pts),'x':[float(pts[:,0].min()),float(pts[:,0].max())], 'y':[float(pts[:,1].min()),float(pts[:,1].max())], 'central_front_y':float(np.quantile(central[:,1],.05))})
    report={'mesh_count':1,'head_separate':False,'head_and_body_one_mesh':True,'head_vertex_count_above_1_44m':int(head.sum()),'total_vertices':len(mesh.vertices),'polygons':len(mesh.polygons),'uv_layers':[u.name for u in mesh.uv_layers],'materials':[m.name for m in mesh.materials], 'front_direction':'Blender -Y / glTF +Z','topology_note':'Dense existing triangles support material assignment; no semantic facial loops or blendshapes.', 'horizontal_slices':bins}
    (OUT/'head-inspection.json').write_text(json.dumps(report,indent=2))
    cam=setup_render()
    bpy.context.scene.render.filepath=str(OUT/'head-original-front.png'); bpy.ops.render.render(write_still=True)
    cam.location=(2,-3,1.55);cam.rotation_euler=(Vector((0,0,1.55))-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.render.filepath=str(OUT/'head-original-oblique.png');bpy.ops.render.render(write_still=True)
    print(json.dumps(report,indent=2))
