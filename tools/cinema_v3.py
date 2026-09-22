"""Resumable silent Seedance 2 production, with local locks and honest QA gates.
Images are always produced by tools/media.py through the bundled Image2 CLI.
No authentication fields or signed media URLs are written to public manifests/logs.
"""
from __future__ import annotations
import argparse,base64,fcntl,hashlib,json,mimetypes,os,subprocess,sys,time
from pathlib import Path
import httpx
from PIL import Image
import media
ROOT=Path(__file__).resolve().parents[1]
PLAN=ROOT/'media/cinema/story-v3-production.json'
OUT=ROOT/'output/cinema-v3'
JOBS=OUT/'private/jobs.json'

def atomic(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_name(path.name+'.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');tmp.replace(path)
def locked_change(path,fn):
 lock=path.with_suffix(path.suffix+'.lock');lock.parent.mkdir(parents=True,exist_ok=True)
 with lock.open('a+') as f:
  fcntl.flock(f,fcntl.LOCK_EX)
  data=json.loads(path.read_text()) if path.exists() else {}
  result=fn(data);atomic(path,data);return result

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def shot(ident):return next(s for s in json.loads(PLAN.read_text())['shots'] if s['id']==ident)
def setshot(ident,**fields):
 def change(d):next(s for s in d['shots'] if s['id']==ident).update(fields)
 locked_change(PLAN,change)
def payload(s):
 prompt=(ROOT/s['prompt']).read_text();items=[{'type':'text','text':prompt}]
 for role,key in [('first_frame','firstFrame'),('last_frame','lastFrame')]:
  if s.get(key):
   p=ROOT/s[key];raw=p.read_bytes();mime=mimetypes.guess_type(p.name)[0]
   items.append({'type':'image_url','image_url':{'url':f'data:{mime};base64,'+base64.b64encode(raw).decode()},'role':role})
 return {'model':media.ENV.get('SEEDANCE_MODEL','ep-20260623073342-2cwrv'),'content':items,'ratio':'16:9','duration':s['requestSeconds'],'resolution':'720p','generate_audio':False,'watermark':False}
def submit(ident):
 s=shot(ident)
 if s.get('reuse'):print(ident,'existing source');return
 if s.get('frameReview')!='accepted':raise RuntimeError('First frame has not been visually accepted')
 p=payload(s);fingerprint=hashlib.sha256(json.dumps(p,sort_keys=True).encode()).hexdigest()
 host=media.ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net');key=media.ENV.get('ARK_API_KEY')
 if not key:raise RuntimeError('Configured Ark credential missing')
 def create(jobs):
  prior=jobs.get(s['name'])
  if prior:
   if prior['request_sha256']!=fingerprint:raise RuntimeError('Existing name belongs to different parameters')
   if prior.get('state')=='submitting_uncertain':raise RuntimeError('Creation outcome uncertain; never automatically POST again')
   return prior
  # Persist preflight before POST. If interrupted, do not create a duplicate.
  jobs[s['name']]={'state':'submitting_uncertain','request_sha256':fingerprint,'created_at':time.time()}
  atomic(JOBS,jobs)
  try:r=httpx.post(f'https://{host}/api/v3/contents/generations/tasks',json=p,headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},timeout=100)
  except Exception:raise RuntimeError('Creation transport error; saved as uncertain, no automatic retry')
  if not r.is_success:
   jobs[s['name']]['state']='rejected';jobs[s['name']]['http_status']=r.status_code
   atomic(JOBS,jobs);raise RuntimeError(f'Creation HTTP {r.status_code}; no retry submitted')
  d=r.json();tid=d.get('id') or d.get('data',{}).get('id')
  if not tid:raise RuntimeError('Accepted response lacks task ID; inspect before any retry')
  jobs[s['name']].update(id=tid,state='submitted');return jobs[s['name']]
 job=locked_change(JOBS,create)
 setshot(ident,status=job['state'],requestSha256=fingerprint)
 print(ident,job['state'],flush=True)
def poll_once(ident):
 s=shot(ident)
 if s.get('reuse'):return 'downloaded'
 jobs=json.loads(JOBS.read_text());job=jobs.get(s['name'])
 if not job or not job.get('id'):raise RuntimeError('No submitted task for this shot; polling never submits')
 target=ROOT/s['source']
 if job.get('state')=='downloaded' and target.exists():return 'downloaded'
 host=media.ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net');key=media.ENV.get('ARK_API_KEY')
 r=httpx.get(f'https://{host}/api/v3/contents/generations/tasks/{job["id"]}',headers={'Authorization':f'Bearer {key}'},timeout=45)
 if not r.is_success:raise RuntimeError(f'Query HTTP {r.status_code}; retain existing task')
 d=r.json();d=d.get('data',d);state=d.get('status','unknown')
 actual_model=d.get('model','')
 if actual_model and 'seedance-2' not in actual_model and actual_model!=media.ENV.get('SEEDANCE_MODEL','ep-20260623073342-2cwrv'):
  raise RuntimeError('Unexpected returned model; halt before use')
 fields={'state':state,'checked_at':time.time(),'actual_model':actual_model}
 if state=='succeeded':
  link=d.get('content',{}).get('video_url')
  if not link:raise RuntimeError('Succeeded task lacks media URL')
  data=httpx.get(link,timeout=180,follow_redirects=True)
  if not data.is_success:raise RuntimeError(f'Download HTTP {data.status_code}; existing task retained')
  target.parent.mkdir(parents=True,exist_ok=True)
  tmp=target.with_suffix('.part.mp4');tmp.write_bytes(data.content);tmp.replace(target)
  fields.update(state='downloaded',bytes=target.stat().st_size,sha256=sha(target))
  setshot(ident,status='downloaded',actualModel=actual_model,sourceSha256=fields['sha256'])
 else:setshot(ident,status=state,actualModel=actual_model)
 def update(j):j[s['name']].update(fields)
 locked_change(JOBS,update)
 return fields['state']
def image_job(ident):
 s=shot(ident);args=[sys.executable,str(ROOT/'tools/media.py'),'image',s['frameName'],'--size','2048x1152']
 for ref in s.get('imageReferences',[]):args+=['--reference',ref]
 # All future cinema image invocations share one slot, even under a caller's pool.
 lock=OUT/'private/image-generation.lock';lock.parent.mkdir(parents=True,exist_ok=True)
 with lock.open('a+') as f:
  fcntl.flock(f,fcntl.LOCK_EX)
  subprocess.run(args,cwd=ROOT,check=True)
 setshot(ident,frameReview='awaiting_visual_review')
 print(ident,'frame ready for review',flush=True)
def inspect(ident):
 s=shot(ident);q=OUT/'qa'/ident;q.mkdir(parents=True,exist_ok=True)
 command=[sys.executable,str(ROOT/'tools/inspect_cinema.py'),str(ROOT/s['source']),'--output-dir',str(q),'--report',str(q/'technical.json'),'--interval','1','--columns','4','--thumb-width','400']
 with (q/'inspection.log').open('w') as f:subprocess.run(command,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT,check=True)
 # Review copies stay below a single-screen width; originals remain on disk.
 for contact in q.glob('video-*.jpg'):
  preview=Image.open(contact);preview.thumbnail((1100,1000))
  small=OUT/'qa'/'small'/f'{ident}.jpg';small.parent.mkdir(parents=True,exist_ok=True)
  preview.convert('RGB').save(small,quality=87)
 setshot(ident,technicalReview='passed',visualReview='pending')
 atomic(OUT/'ready'/f'{ident}.json',{'shotId':ident,'source':s['source'],'technical':str((q/'technical.json').relative_to(ROOT)),'visualReview':'pending','status':'ready_for_independent_review'})
 print(ident,'technical passed; visual review pending',flush=True)
def accept(ident):setshot(ident,visualReview='accepted',status='accepted')
def assemble(sceneid):
 plan=json.loads(PLAN.read_text());scene=next(s for s in plan['scenes'] if s['id']==sceneid);allshots={s['id']:s for s in plan['shots']}
 pieces=[];cursor=0;timeline=[]
 for ident in scene['shots']:
  s=allshots[ident]
  if s.get('visualReview')!='accepted':raise RuntimeError(f'{ident} has not passed visual review')
  p=OUT/'pieces'/f'{ident}.mp4';p.parent.mkdir(parents=True,exist_ok=True)
  subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-v','error','-ss',str(s.get('in',0)),'-i',str(ROOT/s['source']),'-t',str(s['usedSeconds']),'-an','-vf','scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1','-r','24','-c:v','libx264','-crf','18','-preset','medium','-movflags','+faststart',str(p)],check=True)
  pieces.append(p);timeline.append({'shotId':ident,'start':cursor,'end':cursor+s['usedSeconds'],'memoryCG':s.get('memoryCG'),'source':s['source'],'sourceIn':s.get('in',0),'sourceOut':s.get('in',0)+s['usedSeconds']});cursor+=s['usedSeconds']
 listing=OUT/f'{sceneid}-concat.txt';listing.write_text('\n'.join("file '"+str(p)+"'" for p in pieces)+'\n')
 dest=ROOT/scene['silentUrl'].lstrip('/')
 # URL roots are /media, disk roots are public/media.
 dest=ROOT/'public'/scene['silentUrl'].lstrip('/')
 subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',str(listing),'-an','-c','copy','-movflags','+faststart',str(dest)],check=True)
 check=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-xerror','-i',str(dest),'-f','null','-'],capture_output=True)
 if check.returncode or check.stderr:raise RuntimeError('Final movie decode failed')
 fields={'status':'silent_master_ready','duration':cursor,'timeline':timeline,'silentSha256':sha(dest),'resolution':'1280x720','audio':False}
 def update(p):next(s for s in p['scenes'] if s['id']==sceneid).update(fields)
 locked_change(PLAN,update);atomic(OUT/'ready'/f'scene-{sceneid}.json',{'sceneId':sceneid,**fields,'silentUrl':scene['silentUrl']})
 print(sceneid,'silent master ready',cursor,'seconds',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['image','submit','poll','inspect','frame-accept','accept','assemble']);p.add_argument('ids',nargs='+');p.add_argument('--watch',action='store_true');a=p.parse_args()
 try:
  if a.action=='poll':
   while True:
    states=[]
    for ident in a.ids:
     try:state=poll_once(ident)
     except Exception as e:state='query_error';print(ident,type(e).__name__,str(e)[:120],flush=True)
     states.append(state);print(ident,state,flush=True)
    if not a.watch or all(s in ('downloaded','failed','canceled','cancelled') for s in states):break
    time.sleep(30)
  else:
   for ident in a.ids:
    if a.action=='frame-accept':setshot(ident,frameReview='accepted')
    else:{'image':image_job,'submit':submit,'inspect':inspect,'accept':accept,'assemble':assemble}[a.action](ident)
 except Exception as e:
  msg=str(e)
  for key in ('ARK_API_KEY','GPT_AK'):
   if media.ENV.get(key):msg=msg.replace(media.ENV[key],'[redacted]')
  print(type(e).__name__+': '+msg[:250],file=sys.stderr);sys.exit(1)
