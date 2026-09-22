"""Offline media production. Credentials never enter browser bundles or logs.
Image generation uses the installed imagegen CLI through a loopback protocol adapter.
Video/audio contracts were read from the user's local model_gateway integration.
"""
import argparse, base64, hashlib, json, mimetypes, os, subprocess, sys, threading, time, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import httpx
from dotenv import dotenv_values
ROOT=Path(__file__).resolve().parents[1]
ENV={**dotenv_values(ROOT/'.env'),**os.environ}
JOBS=ROOT/'tmp/media-jobs.json'

def image(name, reference=None, size="1792x1008", mask=None):
    key=ENV.get('GPT_AK')
    if not key: raise RuntimeError('GPT_AK is missing')
    host=ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')
    class Bridge(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            # Only two exact image paths can reach the model gateway.
            route={'/v1/images/generations':'/api/modelhub/online/v2/crawl/openai/images/generations','/v1/images/edits':'/gpt/openapi/online/v2/crawl/openai/images/edits'}.get(self.path)
            if not route:self.send_error(404);return
            body=self.rfile.read(int(self.headers.get('Content-Length','0')))
            try:
                r=httpx.post('https://'+host+route,content=body,headers={'Content-Type':self.headers.get('Content-Type','application/json'),'api-key':key,'X-TT-LOGID':'jiangcheng-'+uuid.uuid4().hex[:16]},timeout=600)
                data=r.content if r.is_success else json.dumps({'error':{'message':f'Image gateway returned HTTP {r.status_code}; credentials omitted','type':'gateway_error'}}).encode()
                self.send_response(r.status_code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            except Exception:
                self.send_error(502,'Gateway connection failed; credentials omitted')
    server=ThreadingHTTPServer(('127.0.0.1',0),Bridge)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    cli=Path.home()/'.codex/skills/.system/imagegen/scripts/image_gen.py'
    dest=ROOT/'output/imagegen'/f'{name}.png'
    if dest.exists():print('Image already exists:',name);return
    child={**os.environ,'OPENAI_API_KEY':'local-adapter','OPENAI_BASE_URL':f'http://127.0.0.1:{server.server_port}/v1'}
    try:
        args=[sys.executable,str(cli),'edit' if reference else 'generate','--model','gpt-image-2','--prompt-file',str(ROOT/'media/prompts'/f'{name}.txt'),'--size',size,'--quality','high','--out',str(dest),'--no-augment']
        if reference:
            for source in ([reference] if isinstance(reference,str) else reference):
                args.extend(['--image',str(ROOT/source)])
        if mask:args.extend(['--mask',str(ROOT/mask)])
        subprocess.run(args,env=child,check=True)
        from PIL import Image
        Image.open(dest).save(ROOT/'public/media'/f'{name}.webp',quality=90)
        print('Saved browser asset:',name,flush=True)
    finally:server.shutdown()

def read_jobs():return json.loads(JOBS.read_text()) if JOBS.exists() else {}
def save_jobs(jobs):JOBS.parent.mkdir(exist_ok=True);JOBS.write_text(json.dumps(jobs,indent=2))
def video(name,poll=False,silent=False,first_frame=None,last_frame=None,duration=10,resolution=None,dry_run=False):
    prompt_path=ROOT/'media/prompts'/f'{name}-video.txt'
    content=[{'type':'text','text':prompt_path.read_text()}]
    src=ROOT/first_frame if first_frame else ROOT/'public/media'/f'{name}.webp'
    if first_frame and not src.is_file():raise RuntimeError('First-frame file does not exist')
    if last_frame and not src.is_file():raise RuntimeError('A last frame requires a first frame')
    frames=[]
    for role,path in [('first_frame',src),('last_frame',ROOT/last_frame if last_frame else None)]:
        if path is None or (role=='first_frame' and not path.exists()):continue
        if not path.is_file():raise RuntimeError(f'{role} file does not exist')
        mime=mimetypes.guess_type(path.name)[0]
        if mime not in ('image/png','image/jpeg','image/webp'):raise RuntimeError('Frame must be PNG, JPEG, or WebP')
        raw=path.read_bytes()
        content.append({'type':'image_url','image_url':{'url':f'data:{mime};base64,'+base64.b64encode(raw).decode()},'role':role})
        frames.append({'role':role,'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
    if not 1<=duration<=15:raise RuntimeError('Duration must be within 1–15 seconds; endpoint support still applies')
    payload={'model':ENV.get('SEEDANCE_MODEL','ep-20260623073342-2cwrv'),'content':content,'ratio':'16:9','duration':duration,'generate_audio':not silent,'watermark':False}
    if resolution:payload['resolution']=resolution
    fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
    if dry_run:
        # Summarize a prepared request without credentials, data URLs, or any network call.
        print(json.dumps({'name':name,'mode':'dry-run; no request submitted','model':payload['model'],'prompt':str(prompt_path.relative_to(ROOT)),'frames':frames,'duration':duration,'resolution':resolution or 'endpoint default','ratio':'16:9','generate_audio':not silent,'request_sha256':fingerprint},ensure_ascii=False,indent=2))
        return
    jobs=read_jobs();key=ENV.get('ARK_API_KEY');host=ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net');url=f'https://{host}/api/v3/contents/generations/tasks'
    headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'}
    if not key:raise RuntimeError('ARK_API_KEY is missing')
    if name in jobs and jobs[name].get('request_sha256') not in (None,fingerprint):
        raise RuntimeError('This job name already belongs to a different request; use a new versioned name')
    if name not in jobs:
        r=httpx.post(url,headers=headers,json=payload,timeout=90)
        if not r.is_success:raise RuntimeError(f'Video creation HTTP {r.status_code}')
        d=r.json();task=d.get('id') or d.get('data',{}).get('id')
        if not task:raise RuntimeError('Video response missing task ID')
        jobs[name]={'id':task,'status':'submitted','request_sha256':fingerprint};save_jobs(jobs);print(name,'submitted',flush=True)
    if not poll:return
    deadline=time.monotonic()+1500
    while time.monotonic()<deadline:
        r=httpx.get(url+'/'+jobs[name]['id'],headers=headers,timeout=40)
        if not r.is_success:raise RuntimeError(f'Video query HTTP {r.status_code}')
        d=r.json();d=d.get('data',d);status=d.get('status','unknown')
        if jobs[name].get('status')!=status:
            jobs=read_jobs();jobs[name]['status']=status;save_jobs(jobs);print(name,status,flush=True)
        if status=='succeeded':
            link=d.get('content',{}).get('video_url')
            if not link:raise RuntimeError('Video completed without content.video_url')
            data=httpx.get(link,timeout=120,follow_redirects=True)
            if not data.is_success:raise RuntimeError(f'Video download HTTP {data.status_code}')
            (ROOT/'public/media'/f'{name}.mp4').write_bytes(data.content)
            print(name,'saved',len(data.content),'bytes',flush=True);return
        if status in ('failed','canceled','cancelled'):
            code=d.get('error',{}).get('code','unknown');raise RuntimeError(f'Video task {status}; code={code}')
        time.sleep(25)
    raise RuntimeError('Video poll timeout; task saved for resume')

def make_mp3(wav):
    mp3=wav.with_suffix('.mp3')
    if mp3.exists():return
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(wav),'-codec:a','libmp3lame','-q:a','3',str(mp3)],check=True)

def audio(name):
    out=ROOT/'public/media'/f'{name}.wav'
    if out.exists():
        make_mp3(out);print('Audio already exists:',name);return
    prompt=(ROOT/'media/prompts'/f'{name}-audio.txt').read_text()
    r=httpx.post('https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio',json={'prompt':prompt},timeout=180,follow_redirects=True)
    if not r.is_success:raise RuntimeError(f'Audio HTTP {r.status_code}')
    d=r.json()
    if d.get('base_resp',{}).get('code') not in (None,0):raise RuntimeError('Audio provider returned failure')
    data=base64.b64decode(d.get('audio_base64',''),validate=True)
    if not data.startswith((b'RIFF',b'RF64')):raise RuntimeError('Audio response is not WAV')
    out.write_bytes(data);make_mp3(out);print(name,'saved WAV and MP3',len(data),'bytes',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('kind',choices=['image','video','audio']);p.add_argument('name');p.add_argument('--poll',action='store_true');p.add_argument('--silent',action='store_true');p.add_argument('--reference',action='append');p.add_argument('--mask');p.add_argument('--size',default='1792x1008');p.add_argument('--first-frame');p.add_argument('--last-frame');p.add_argument('--duration',type=int,default=10);p.add_argument('--resolution',choices=['480p','720p','1080p']);p.add_argument('--dry-run',action='store_true');a=p.parse_args()
    if a.dry_run and a.kind!='video':p.error('--dry-run is supported for video requests only')
    try:
        if a.kind=='image':image(a.name,a.reference,a.size,a.mask)
        elif a.kind=='video':video(a.name,a.poll,a.silent,a.first_frame,a.last_frame,a.duration,a.resolution,a.dry_run)
        else:audio(a.name)
    except Exception as e:
        # Do not print request objects or authenticated URLs.
        msg=str(e)
        for k in ('GPT_AK','ARK_API_KEY','TOS_ACCESS_KEY'):
            if ENV.get(k):msg=msg.replace(ENV[k],'[redacted]')
        print(type(e).__name__+': '+msg[:400],file=sys.stderr);sys.exit(1)
