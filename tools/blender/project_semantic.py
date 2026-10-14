"""Semantic contour + visible-surface ray projection; preserves official rig/topology.

Inputs are inspectable/correctable MediaPipe points and the exact render camera.
No mesh bounding boxes or fixed head coordinates determine the FACE region.
"""
import sys,json,argparse,hashlib
from pathlib import Path
import bpy,numpy as np
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
from validate_character import import_character,inspect,write_report
from inspect_head import setup_render

ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--base',default='character_a');p.add_argument('--landmarks',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=ROOT/'public/debug/semantic'/a.base;source=ROOT/'artifacts/pipeline'/a.base/(a.base+'_animated.glb')
det=json.loads((a.landmarks or out/'front-landmarks.json').read_text());camera=json.loads((out/'front-camera.json').read_text());canonical=json.loads((ROOT/'public/face/canonical.json').read_text())
assert det['state']=='FACE_DETECTION_VALID','Landmarks need correction before projection'
assert hashlib.sha256(source.read_bytes()).hexdigest()==camera['source_sha256'],'Camera belongs to a different asset'
lm=np.array(det['landmarks'])[:468,:2];cu=np.array(canonical['landmarks']);contour=lm[det['contour']]
simplex=np.array(det['interpolation']['simplices']);transform=np.array(det['interpolation']['transforms'])
cam=Matrix(camera['matrix_world']);inv=cam.inverted();scale=camera['ortho_scale'];direction=cam.to_3x3()@Vector((0,0,-1))
import_character(source,fps=30);rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.data.pose_position='REST';bpy.context.view_layer.update()
shapes={b.custom_shape for b in rig.pose.bones if b.custom_shape};meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and o not in shapes]
before=inspect(source)
def digest_weights():
    return hashlib.sha256(repr([(o.name,[(v.index,[(g.group,g.weight) for g in v.groups]) for v in o.data.vertices]) for o in meshes]).encode()).hexdigest()
weights_before=digest_weights();uv_before={o.name:np.array([x.uv[:] for x in o.data.uv_layers[0].data]).tobytes() for o in meshes}
verts=[];triangles=[];lookup=[]
for o in meshes:
    offset=len(verts);verts.extend([o.matrix_world@v.co for v in o.data.vertices]);o.data.calc_loop_triangles()
    for t in o.data.loop_triangles:triangles.append(tuple(offset+i for i in t.vertices));lookup.append((o,t.polygon_index,tuple(t.vertices)))
bvh=BVHTree.FromPolygons(verts,triangles,all_triangles=True)
def ray(xy):
    origin=cam@Vector(((xy[0]-.5)*scale,(.5-xy[1])*scale,0));return bvh.ray_cast(origin,direction)
def project(v):
    q=inv@v;return np.array([q.x/scale+.5,.5-q.y/scale])
def inside(p):
    x,y=p;result=False
    for i in range(len(contour)):
        ax,ay=contour[i];bx,by=contour[i-1]
        if ((ay>y)!=(by>y)) and x<(bx-ax)*(y-ay)/(by-ay)+ax:result=not result
    return result
def uv_for(xy):
    b=np.einsum('nij,nj->ni',transform[:,:2,:],xy-transform[:,2,:]);bc=np.column_stack((b,1-b.sum(axis=1)));valid=np.where(np.min(bc,axis=1)>=-1e-5)[0]
    if not len(valid):return None
    i=valid[0];return bc[i]@cu[simplex[i]]
seg=bpy.data.images.load(str(out/'front-landmarks.categories.png'),check_existing=False);sw,sh=seg.size
pixels=np.array(seg.pixels[:]).reshape(sh,sw,4)
def face_skin(xy):
    x=int(np.clip(xy[0]*sw,0,sw-1));y=int(np.clip((1-xy[1])*sh,0,sh-1))
    # Non-color category PNG stores integer labels, not an sRGB color image.
    return round(float(pixels[y,x,0])*255)==3
seg.colorspace_settings.name='Non-Color';pixels=np.array(seg.pixels[:]).reshape(sh,sw,4)
mapping=[]
for i,xy in enumerate(lm):
    hit,normal,index,distance=ray(xy)
    entry={'index':i,'semantic_regions':[k for k,ids in det['groups'].items() if i in ids],'image_xy':xy.tolist(),'canonical_uv':cu[i].tolist(),'hit':hit is not None}
    if hit is not None:
        o,pi,vi=lookup[index];v=np.array([verts[j][:] for j in triangles[index]]);ab=np.column_stack((v[1]-v[0],v[2]-v[0]));b=np.linalg.lstsq(ab,np.array(hit)-v[0],rcond=None)[0]
        entry.update(mesh=o.name,polygon=pi,triangle=index,vertex_indices=list(vi),position=list(hit),barycentric=[float(1-b.sum()),float(b[0]),float(b[1])],face_skin=face_skin(xy))
    mapping.append(entry)
assert all(mapping[i]['hit'] for i in [33,263,1,13,152]),'Critical semantic ray missed character'
selected={o.name:[] for o in meshes};uv_records=[]
for o in meshes:
    mesh=o.data;uv=mesh.uv_layers.new(name='FACE_UV');old=mesh.uv_layers[0]
    for poly in mesh.polygons:
        world=[o.matrix_world@mesh.vertices[i].co for i in poly.vertices];center=sum(world,Vector())/len(world);xy=project(center)
        if not inside(xy) or not face_skin(xy):continue
        hit,normal,index,distance=ray(xy)
        if hit is None or (hit-center).length>1e-4:continue
        points=[project(v) for v in world];uvs=[uv_for(v) for v in points]
        if any(v is None for v in uvs):continue
        # Exclude polygons crossing the detected hair or contour boundary.
        if sum(face_skin(v) for v in points)<2:continue
        selected[o.name].append(poly.index)
        for loop,tex in zip(poly.loop_indices,uvs):uv.data[loop].uv=(tex[0],1-tex[1])
        uv_records.append({'mesh':o.name,'polygon':poly.index,'canonical':np.array(uvs).tolist(),'body_uv':[list(old.data[i].uv) for i in poly.loop_indices]})
assert sum(map(len,selected.values()))>50,'Insufficient semantic FACE polygons'
face=bpy.data.materials.new('FACE');face.use_nodes=True;nodes=face.node_tree.nodes;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.85
tex=nodes.new('ShaderNodeTexImage');uvnode=nodes.new('ShaderNodeUVMap');uvnode.uv_map='FACE_UV';face.node_tree.links.new(uvnode.outputs['UV'],tex.inputs['Vector']);face.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
# Rasterize source atlas colors into the semantic UV. No lighting is baked in.
size=1024;canvas=np.zeros((size,size,4),dtype=np.float32);canvas[:]=[.6,.4,.3,1]
atlas={}
for o in meshes:
    material=o.data.materials[0];img=next(n.image for n in material.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
    w,h=img.size;atlas[o.name]=(np.array(img.pixels[:]).reshape(h,w,4),w,h)
for rec in uv_records:
    pts=np.array(rec['canonical'])*size;body=np.array(rec['body_uv']);image,w,h=atlas[rec['mesh']]
    lo=np.maximum(0,np.floor(pts.min(axis=0)).astype(int));hi=np.minimum(size-1,np.ceil(pts.max(axis=0)).astype(int))
    xx,yy=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));q=np.stack((xx.ravel()+.5,yy.ravel()+.5),axis=1)
    mat=np.column_stack((pts[1]-pts[0],pts[2]-pts[0]))
    if abs(np.linalg.det(mat))<1e-8:continue
    b=(q-pts[0])@np.linalg.inv(mat).T;bc=np.column_stack((1-b.sum(axis=1),b));valid=(bc.min(axis=1)>=-.002)
    texuv=bc[valid]@body;cx=np.clip((texuv[:,0]*w).astype(int),0,w-1);cy=np.clip((texuv[:,1]*h).astype(int),0,h-1)
    canvas[size-1-yy.ravel()[valid],xx.ravel()[valid]]=image[cy,cx]
base=bpy.data.images.new(a.base+'_canonical_base',width=size,height=size,alpha=True);base.pixels.foreach_set(canvas.ravel());base.filepath_raw=str(out/'canonical-base.png');base.file_format='PNG';base.save();base.pack();tex.image=base
for o in meshes:
    o.data.materials.append(face);index=len(o.data.materials)-1
    for i in selected[o.name]:o.data.polygons[i].material_index=index
assert digest_weights()==weights_before,'Skin weights changed'
assert all(uv_before[o.name]==np.array([x.uv[:] for x in o.data.uv_layers[0].data]).tobytes() for o in meshes),'Body UV changed'
report={'version':1,'base':a.base,'method':'MediaPipe contour + face-skin segmentation + exact orthographic ray projection','detection_state':det['state'],'camera':camera,'landmarks':mapping,'face_polygons':selected,'face_polygon_count':sum(map(len,selected.values())),'canonical':'/face/canonical.json','uv_channel':1,'body_uv_preserved':True,'skin_weights_preserved':True,'topology_unchanged':True,'visual_review':'PENDING'}
(out/(a.base+'_face_mapping.json')).write_text(json.dumps(report,indent=2))
(out/'uv-rasterization.json').write_text(json.dumps(uv_records))
rig.data.pose_position='POSE'
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=rig
target=ROOT/'public/models/semantic'/(a.base+'_face_ready.glb');target.parent.mkdir(parents=True,exist_ok=True)
# Blender 3.2 exports imported actions by default and does not expose
# export_animation_mode; later Blender versions accept the explicit mode.
export_options=dict(filepath=str(target),export_format='GLB',use_selection=True,
                    export_animations=True,export_skins=True,
                    export_all_influences=True,export_yup=True)
if 'export_animation_mode' in bpy.ops.export_scene.gltf.get_rna_type().properties.keys():
    export_options['export_animation_mode']='ACTIONS'
bpy.ops.export_scene.gltf(**export_options)
rig.data.pose_position='REST'
rendercam=setup_render();rendercam.matrix_world=cam;rendercam.data.ortho_scale=scale;bpy.context.scene.render.resolution_x=1024;bpy.context.scene.render.resolution_y=1024
bpy.context.scene.render.filepath=str(out/'face-ready-front.png');bpy.ops.render.render(write_still=True)
tex.image=bpy.data.images.load(str(ROOT/'public/face/diagnostic.png'))
bpy.context.scene.render.filepath=str(out/'diagnostic-front.png');bpy.ops.render.render(write_still=True)
for view in ['left','right']:
    params=json.loads((out/(view+'-camera.json')).read_text());rendercam.matrix_world=Matrix(params['matrix_world'])
    bpy.context.scene.render.filepath=str(out/('diagnostic-'+view+'.png'));bpy.ops.render.render(write_still=True)
tex.image=base
print(json.dumps({'output':str(target),'face_polygons':report['face_polygon_count'],'weights_preserved':True,'body_uv_preserved':True}))
