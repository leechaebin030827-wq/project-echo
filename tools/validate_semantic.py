"""Compare exported topology, body UV, skin weights, clips and sampled skin motion."""
import json,struct,argparse,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation, Slerp
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[1]
class GLB:
    def __init__(self,path):
        self.path=path;b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];self.g=json.loads(b[20:20+n]);self.data=b[28+n:];self.bytes=len(b)
    def accessor(self,index):
        a=self.g['accessors'][index];v=self.g['bufferViews'][a['bufferView']];dt={5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];cols={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];item=np.dtype(dt).itemsize;stride=v.get('byteStride',cols*item);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
        arr=np.ndarray((a['count'],cols),dtype=dt,buffer=self.data,offset=offset,strides=(stride,item)).copy()
        if a.get('normalized'):arr=arr.astype(float)/np.iinfo(dt).max
        return arr
    def vertices(self):
        result=[];triangles=[];names=sorted({self.g['nodes'][j]['name'] for s in self.g['skins'] for j in s['joints']});name_index={n:i for i,n in enumerate(names)}
        for ni,node in enumerate(self.g['nodes']):
            if 'mesh' not in node or 'skin' not in node:continue
            skin=self.g['skins'][node['skin']];bone_map=np.array([name_index[self.g['nodes'][j]['name']] for j in skin['joints']])
            for primitive in self.g['meshes'][node['mesh']]['primitives']:
                attrs=primitive['attributes'];pos=self.accessor(attrs['POSITION']);uv=self.accessor(attrs['TEXCOORD_0']);joints=self.accessor(attrs['JOINTS_0']).astype(int);weights=self.accessor(attrs['WEIGHTS_0']);dense=np.zeros((len(pos),len(names)))
                for k in range(joints.shape[1]):dense[np.arange(len(pos)),bone_map[joints[:,k]]]+=weights[:,k]
                records=np.concatenate((pos,uv,dense),axis=1);offset=len(result)
                for i,row in enumerate(records):result.append({'record':row,'position':pos[i],'joints':joints[i],'weights':weights[i],'node':ni,'skin':node['skin']})
                ids=self.accessor(primitive['indices']).ravel().astype(int).reshape(-1,3)
                triangles.extend(tuple(offset+i for i in tri) for tri in ids)
        return result,sorted(triangles),names
    def worlds(self,clip,time):
        nodes=self.g['nodes'];local=[{'translation':np.array(n.get('translation',[0,0,0]),float),'rotation':np.array(n.get('rotation',[0,0,0,1]),float),'scale':np.array(n.get('scale',[1,1,1]),float)} for n in nodes]
        for channel in clip['channels']:
            sampler=clip['samplers'][channel['sampler']];times=self.accessor(sampler['input']).ravel();values=self.accessor(sampler['output']);t=float(np.clip(time,times[0],times[-1]));i=min(len(times)-2,max(0,np.searchsorted(times,t,side='right')-1));path=channel['target']['path'];assert sampler.get('interpolation','LINEAR') in ('LINEAR','STEP')
            if len(times)==1 or sampler.get('interpolation')=='STEP':value=values[max(i,0)]
            elif path=='rotation':value=Slerp(times[i:i+2],Rotation.from_quat(values[i:i+2]))([t]).as_quat()[0]
            else:value=values[i]+(values[i+1]-values[i])*(t-times[i])/(times[i+1]-times[i])
            local[channel['target']['node']][path]=value
        matrices=[]
        for n,trs in zip(nodes,local):
            if 'matrix' in n:matrices.append(np.array(n['matrix']).reshape(4,4).T);continue
            m=np.eye(4);m[:3,:3]=Rotation.from_quat(trs['rotation']).as_matrix()@np.diag(trs['scale']);m[:3,3]=trs['translation'];matrices.append(m)
        parent={child:i for i,n in enumerate(nodes) for child in n.get('children',[])};cache={}
        def world(i):
            if i not in cache:cache[i]=world(parent[i])@matrices[i] if i in parent else matrices[i]
            return cache[i]
        return [world(i) for i in range(len(nodes))]
    def posed(self,vertices,clip,t):
        worlds=self.worlds(clip,t);skins=[]
        for skin in self.g['skins']:
            bind=self.accessor(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1);skins.append(np.array([worlds[j]@inverse for j,inverse in zip(skin['joints'],bind)]))
        return np.array([sum(w*(skins[v['skin']][j]@np.r_[v['position'],1]) for j,w in zip(v['joints'],v['weights']))[:3] for v in vertices])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base',default='character_a');a=p.parse_args();source=GLB(ROOT/'artifacts/pipeline'/a.base/(a.base+'_animated.glb'));target=GLB(ROOT/'public/models/semantic'/(a.base+'_face_ready.glb'))
    sv,st,sn=source.vertices();tv,tt,tn=target.vertices();assert sn==tn,'Bones differ'
    sr=np.array([v['record'] for v in sv]);tr=np.array([v['record'] for v in tv]);tree=cKDTree(sr[:,:5]);dist,indices=tree.query(tr[:,:5]);assert dist.max()<1e-5,'Geometry/body UV changed beyond export precision'
    weight_error=float(np.max(np.abs(tr[:,5:]-sr[indices,5:])));assert weight_error<1e-5,'Skin weights changed'
    _,source_alias=tree.query(sr[:,:5]);source_tri=sorted(tuple(sorted(source_alias[list(t)])) for t in st);target_tri=sorted(tuple(sorted(indices[list(t)])) for t in tt);assert source_tri==target_tri,'Triangle topology changed'
    sample_indices=np.linspace(0,len(sv)-1,min(200,len(sv))).astype(int);_,target_indices=cKDTree(tr[:,:5]).query(sr[sample_indices,:5]);sample=[sv[i] for i in sample_indices];other=[tv[i] for i in target_indices]
    errors={};tc={c['name']:c for c in target.g['animations']}
    for clip in source.g['animations']:
        name=clip['name'];assert name in tc;duration=max(float(source.accessor(s['input']).max()) for s in clip['samplers']);errors[name]=max(float(np.linalg.norm(source.posed(sample,clip,t)-target.posed(other,tc[name],t),axis=1).max()) for t in np.linspace(0,duration,5));assert errors[name]<.002,f'Animation deformation changed: {name}'
    report={'base':a.base,'triangle_count':len(tt),'vertex_count':len(tv),'materials':[m['name'] for m in target.g['materials']],'bone_count':len(tn),'glb_bytes':target.bytes,'clips':list(tc),'original_triangle_geometry_body_uv_and_skin_weights_preserved':True,'maximum_geometry_uv_numeric_error':float(dist.max()),'maximum_weight_numeric_error':weight_error,'sampled_vertices':len(sample),'sampled_times_per_clip':5,'maximum_animation_position_error_m':errors,'passed':True}
    (ROOT/'artifacts/debug/semantic'/a.base/'preservation-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
