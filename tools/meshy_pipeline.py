"""Resumable official Meshy pipeline. Credentials stay in memory; no automatic POST retries."""
import argparse,base64,json,os,re,subprocess,sys,struct,time
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit

ROOT=Path(__file__).resolve().parents[1]

def credential():
    if os.environ.get('MESHY_API_KEY'):
        return os.environ['MESHY_API_KEY']
    for line in (Path.home()/'meshy-astra/.env').read_text().splitlines():
        m=re.match(r'^\s*(?:export\s+)?MESHY_API_KEY\s*=\s*(.*)$',line)
        if m:
            v=m[1].strip()
            if v.startswith(('"',"'")):v=v[1:v.find(v[0],1)]
            else:v=re.split(r'\s+#',v,1)[0].strip()
            if v and not any(c in v for c in '\r\n\0'):return v
    raise RuntimeError('MESHY_API_KEY unavailable')

KEY=None
def clean(obj):
    if isinstance(obj,dict):return {k:clean(v) for k,v in obj.items()}
    if isinstance(obj,list):return [clean(v) for v in obj]
    if isinstance(obj,str):
        if KEY:obj=obj.replace(KEY,'[REDACTED]')
        if obj.startswith('data:'):return '[embedded asset omitted]'
        if obj.startswith('https://'):
            u=urlsplit(obj);return urlunsplit((u.scheme,u.netloc,u.path,'',''))
    return obj

def save(p,obj):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(clean(obj),indent=2))

def api(endpoint,payload=None):
    global KEY
    if KEY is None:KEY=credential()
    config='header = "Authorization: Bearer '+KEY.replace('\\','\\\\').replace('"','\\"')+'"\n'
    args=['/usr/bin/curl','--disable','--config','-','--silent','--max-time','120','--write-out','\n%{http_code}','https://api.meshy.ai/openapi/v1/'+endpoint]
    if payload is not None:
        # Body is not secret. Pipe via a separate FD so neither key nor payload is in argv.
        import tempfile
        f=tempfile.NamedTemporaryFile(mode='w',delete=False);json.dump(payload,f);f.close()
        args+=['--request','POST','--header','Content-Type: application/json','--data-binary','@'+f.name]
    try:r=subprocess.run(args,input=config,text=True,capture_output=True,timeout=130)
    finally:
        if payload is not None:Path(f.name).unlink(missing_ok=True)
    if r.returncode:raise RuntimeError('Transport failure; POST outcome may be unknown. Do not resubmit automatically.')
    body,_,status=r.stdout.rpartition('\n')
    try:obj=json.loads(body)
    except ValueError:raise RuntimeError('Non-JSON API response; HTTP '+status)
    if status not in ('200','201','202'):
        raise RuntimeError('HTTP '+status+': '+json.dumps(clean(obj))[:1000])
    return obj

def download(url,path):
    if path.exists():return
    assert url.startswith('https://')
    config='url = "'+url.replace('\\','\\\\').replace('"','\\"')+'"\n'
    path.parent.mkdir(parents=True,exist_ok=True);partial=path.with_suffix('.part')
    r=subprocess.run(['/usr/bin/curl','--disable','--config','-','--silent','--fail','--location','--proto','=https','--proto-redir','=https','--max-time','180','--output',str(partial)],input=config,text=True,capture_output=True,timeout=190)
    if r.returncode:raise RuntimeError('Asset download failed; retry download only')
    b=partial.read_bytes();magic,v,n=struct.unpack_from('<4sII',b)
    assert magic==b'glTF' and v==2 and n==len(b),'Invalid downloaded GLB'
    partial.rename(path)

def stage(base,name,payload,endpoint=None):
    directory=ROOT/'artifacts/pipeline'/base;endpoint=endpoint or name
    taskfile=directory/(name+'-task.json');reqfile=directory/(name+'-request.json')
    if taskfile.exists():return json.loads(taskfile.read_text())['task_id']
    if reqfile.exists():raise RuntimeError('Request already attempted without saved task ID; inspect before retrying')
    save(reqfile,{'endpoint':endpoint,'payload':payload})
    response=api(endpoint,payload);save(directory/(name+'-submission.json'),response)
    task=response.get('result');assert isinstance(task,str) and re.fullmatch('[A-Za-z0-9_-]+',task)
    save(taskfile,{'task_id':task,'endpoint':endpoint})
    print(name,'submitted:',task,flush=True);return task

def poll(base,name):
    directory=ROOT/'artifacts/pipeline'/base
    task=json.loads((directory/(name+'-task.json')).read_text())
    obj=api(task['endpoint']+'/'+task['task_id']);save(directory/(name+'-status.json'),obj)
    print(name,obj.get('status'),obj.get('progress'),flush=True)
    if obj.get('status')=='FAILED':print('Task error:',clean(obj.get('task_error')),flush=True)
    if obj.get('status')=='SUCCEEDED':
        if name in ('remesh','generation'):url=obj['model_urls']['glb']
        elif name=='rigging':url=obj['result']['rigged_character_glb_url']
        elif name=='animations':url=obj['result']['animation_glb_url']
        else:raise ValueError(name)
        target=directory/(base+'_'+{'generation':'generated','remesh':'optimized','rigging':'rigged','animations':'animated'}[name]+'.glb')
        download(url,target);print('Saved:',target,flush=True)
    return obj

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['library','generation','source','remesh','rigging','animations','poll']);p.add_argument('--base',default='character_a');p.add_argument('--source-task');p.add_argument('--stage');p.add_argument('--images',nargs=3,type=Path);p.add_argument('--height-meters',type=float);p.add_argument('--action-ids',nargs='+',type=int);p.add_argument('--pose-mode',choices=['a-pose','t-pose'],default='a-pose');p.add_argument('--wait',action='store_true');a=p.parse_args()
    try:
        if a.command=='library':
            obj=api('animations/library');save(ROOT/'artifacts/pipeline/animation-library.json',obj)
            print(json.dumps([x for x in obj if any(t in x.get('name','').lower() for t in ('idle','walk','dance'))],indent=2))
        elif a.command=='generation':
            assert a.images and all(p.is_file() and p.suffix.lower()=='.png' for p in a.images),'Provide front, side, back PNG paths in that order'
            images=['data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode('ascii') for p in a.images]
            stage(a.base,'generation',{'image_urls':images,'ai_model':'meshy-7.1','geometry_resolution':'standard','should_texture':True,'enable_pbr':False,'texture_resolution':'2k','should_remesh':True,'topology':'triangle','target_polycount':50000,'pose_mode':a.pose_mode,'target_formats':['glb'],'remove_lighting':True},'multi-image-to-3d')
        elif a.command=='source':
            obj=api('multi-image-to-3d/'+a.source_task);save(ROOT/'artifacts/pipeline'/a.base/'source-task.json',obj);print('Original task:',obj.get('status'))
        elif a.command=='remesh':stage(a.base,'remesh',{'input_task_id':a.source_task,'target_formats':['glb'],'topology':'triangle','target_polycount':50000})
        elif a.command=='rigging':
            previous={'task_id':a.source_task} if a.source_task else json.loads((ROOT/'artifacts/pipeline'/a.base/'remesh-task.json').read_text())
            height=a.height_meters if a.height_meters else {'character_a':1.68,'character_b':1.8,'character_c':1.58}.get(a.base)
            assert height and 1.3<=height<=2.2,'New base requires --height-meters (1.3–2.2)'
            stage(a.base,'rigging',{'input_task_id':previous['task_id'],'height_meters':height})
        elif a.command=='animations':
            previous=json.loads((ROOT/'artifacts/pipeline'/a.base/'rigging-task.json').read_text())
            library=json.loads((ROOT/'artifacts/pipeline/animation-library.json').read_text());valid={x['action_id'] for x in library}
            assert a.action_ids and all(i in valid for i in a.action_ids),'IDs must come from current library'
            stage(a.base,'animations',{'rig_task_id':previous['task_id'],'action_ids':a.action_ids})
        elif a.command=='poll':
            for i in range(120 if a.wait else 1):
                obj=poll(a.base,a.stage)
                if obj.get('status') in ('SUCCEEDED','FAILED','CANCELED','EXPIRED'):break
                if a.wait:time.sleep(30)
    except Exception as e:
        print('PIPELINE STOPPED:',clean(str(e)),flush=True);sys.exit(1)
