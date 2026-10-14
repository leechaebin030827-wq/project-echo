"""Offline local MediaPipe detection with explicit validity and inspectable overlays."""
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/echo-matplotlib')
import json,argparse
from pathlib import Path
import mediapipe as mp
import numpy as np
from PIL import Image,ImageDraw
from scipy.spatial import Delaunay

ROOT=Path(__file__).resolve().parents[1]
VENDOR=ROOT/'public/vendor/mediapipe'
C=mp.tasks.vision.FaceLandmarksConnections
GROUPS={name:sorted({i for e in getattr(C,attr) for i in (e.start,e.end)}) for name,attr in {
 'contour':'FACE_LANDMARKS_FACE_OVAL','left_eye':'FACE_LANDMARKS_LEFT_EYE','right_eye':'FACE_LANDMARKS_RIGHT_EYE',
 'left_eyebrow':'FACE_LANDMARKS_LEFT_EYEBROW','right_eyebrow':'FACE_LANDMARKS_RIGHT_EYEBROW','lips':'FACE_LANDMARKS_LIPS'}.items()}
GROUPS.update(nose=[1,2,4,5,6,19,94,97,98,168,195,197,326,327],chin=[152])
CONTOUR=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]

def canonical():
    path=ROOT/'artifacts/semantic/canonical_face_model.obj';tex=[];uv=[None]*468;faces=[]
    for line in path.read_text().splitlines():
        s=line.split()
        if not s:continue
        if s[0]=='vt':tex.append([float(s[1]),1-float(s[2])])
        elif s[0]=='f':
            ids=[]
            for item in s[1:]:
                v,t,*_=map(int,item.split('/'));uv[v-1]=tex[t-1];ids.append(v-1)
            faces.append(ids)
    assert all(v is not None for v in uv)
    out=ROOT/'public/face';out.mkdir(parents=True,exist_ok=True)
    obj={'version':1,'size':1024,'uv_origin':'top-left','landmarks':uv,'triangles':faces,'groups':GROUPS,'contour':CONTOUR,'source':'Google MediaPipe canonical_face_model.obj'}
    (out/'canonical.json').write_text(json.dumps(obj))
    im=Image.new('RGB',(1024,1024),'#e4b898');d=ImageDraw.Draw(im)
    for x in range(0,1024,64):d.line((x,0,x,1024),fill='#98786b');d.line((0,x,1024,x),fill='#98786b')
    d.line([tuple(np.array(uv[i])*1024) for i in CONTOUR+[CONTOUR[0]]],fill='white',width=5)
    for name,ids in GROUPS.items():
        for i in ids:
            x,y=np.array(uv[i])*1024;d.ellipse((x-3,y-3,x+3,y+3),fill='cyan')
    for label,i in [('LEFT EYE',263),('RIGHT EYE',33),('NOSE',1),('MOUTH',13),('CHIN',152)]:
        x,y=np.array(uv[i])*1024;d.ellipse((x-7,y-7,x+7,y+7),fill='red');d.text((x,y-18),label,fill='black',stroke_width=1,stroke_fill='white')
    im.save(out/'diagnostic.png');return obj

def detect(path,out,segment=False):
    im=Image.open(path).convert('RGB');data=np.array(im)
    opt=mp.tasks.vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(VENDOR/'face_landmarker.task'),delegate=mp.tasks.BaseOptions.Delegate.CPU),num_faces=1,min_face_detection_confidence=.5,min_face_presence_confidence=.5)
    with mp.tasks.vision.FaceLandmarker.create_from_options(opt) as detector:
        result=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=data))
        # Full-body references may have tiny faces. Scan overlapping square tiles,
        # then convert detected points back to the original image coordinates.
        if not result.face_landmarks:
            w,h=im.size;side=min(w,h)
            for top in range(0,h,max(1,side//2)):
                for left in range(0,w,max(1,side//2)):
                    x=min(left,w-side);y=min(top,h-side)
                    tile=np.ascontiguousarray(data[y:y+side,x:x+side])
                    candidate=detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=tile))
                    if candidate.face_landmarks:
                        for point in candidate.face_landmarks[0]:point.x=(x+point.x*side)/w;point.y=(y+point.y*side)/h;point.z*=side/w
                        result=candidate;break
                if result.face_landmarks:break
    obj={'image':str(path),'resolution':list(im.size),'detector':'MediaPipe FaceLandmarker','thresholds':{'detection':.5,'presence':.5},'state':'FACE_DETECTION_FAILED','landmarks':[],'groups':GROUPS,'contour':CONTOUR,'review':'Automatic geometric checks; overlay requires visual review.'}
    if result.face_landmarks:
        lm=np.array([[p.x,p.y,p.z] for p in result.face_landmarks[0]])
        eye_distance=np.linalg.norm(lm[33,:2]-lm[263,:2]);valid=bool(np.isfinite(lm).all() and eye_distance>.02 and lm[152,1]>lm[1,1]>min(lm[33,1],lm[263,1]) and ((lm[:468,:2]>=0)&(lm[:468,:2]<=1)).all())
        obj.update(state='FACE_DETECTION_VALID' if valid else 'FACE_DETECTION_UNCERTAIN',landmarks=lm.tolist(),eye_distance_normalized=float(eye_distance))
        tri=Delaunay(lm[:468,:2]);obj['interpolation']={'simplices':tri.simplices.tolist(),'transforms':tri.transform.tolist()}
        overlay=im.copy();d=ImageDraw.Draw(overlay);w,h=im.size
        colors=['#00ffff','#ff6060','#60ff60','#ffaa00','#ffaaff','#ffff00','#a080ff','#ffffff']
        for (name,ids),color in zip(GROUPS.items(),colors):
            for i in ids:
                x,y=lm[i,:2]*[w,h];d.ellipse((x-2,y-2,x+2,y+2),fill=color)
        d.line([tuple(lm[i,:2]*[w,h]) for i in CONTOUR+[CONTOUR[0]]],fill='#00ffff',width=2)
        for label,i in [('L EYE',263),('R EYE',33),('NOSE',1),('MOUTH',13),('CHIN',152)]:
            d.text(tuple(lm[i,:2]*[w,h]),label,fill='yellow',stroke_width=1,stroke_fill='black')
        overlay.save(out.with_suffix('.overlay.png'))
    out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(obj,indent=2))
    if segment and obj['landmarks']:
        opt=mp.tasks.vision.ImageSegmenterOptions(base_options=mp.tasks.BaseOptions(model_asset_path=str(VENDOR/'selfie_multiclass.tflite'),delegate=mp.tasks.BaseOptions.Delegate.CPU),output_category_mask=True,output_confidence_masks=False)
        with mp.tasks.vision.ImageSegmenter.create_from_options(opt) as seg:
            result=seg.segment(mp.Image(image_format=mp.ImageFormat.SRGB,data=data));mask=np.squeeze(result.category_mask.numpy_view().copy())
        assert mask.ndim==2,'Expected a 2D segmentation category mask'
        Image.fromarray(mask.astype('uint8')).save(out.with_suffix('.categories.png'))
        debug=data.copy();debug[mask==1]=[200,30,150];debug[mask==3]=(debug[mask==3]*.5+[0,110,40]).astype('uint8');Image.fromarray(debug).save(out.with_suffix('.segmentation.png'))
    print(path.name,obj['state'],len(obj['landmarks']),flush=True)
    return obj

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--base',default='character_a');p.add_argument('--source',type=Path);a=p.parse_args()
    if not (ROOT/'public/face/canonical.json').exists():canonical()
    out=ROOT/'public/debug/semantic'/a.base;out.mkdir(parents=True,exist_ok=True)
    detect(out/'front.png',out/'front-landmarks.json',True)
    if a.source:detect(a.source,out/'astra-landmarks.json')
