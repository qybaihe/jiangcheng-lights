#!/usr/bin/env python3
"""Two approved promotional narration clips. All new output stays beside this file."""
from __future__ import annotations
import argparse, base64, datetime as dt, hashlib, json, re, subprocess, sys, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError
import numpy as np
ROOT=Path(__file__).resolve().parents[3]
WORK=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools'))
import story_voice
from media import ENV
API='https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio'
RATE=48000
TEXTS=[{'id':'A','text':'本来，只打算在武汉住一晚。','placementStart':0.6,'visualWindow':[0,8],'visualAnchor':'Opening CG: return to Wuhan; final shot assembly owned by the parent task.'},
       {'id':'B','text':'总有人，替你留一盏灯。','placementStart':22.0,'visualWindow':[20,30],'visualAnchor':'Closing Image2 intent artwork: a light kept for someone; final image owned by the parent task.'}]
PROMPT='''制作一段约10.5秒的纯中文宣传旁白录音小样。只有两句人声，录音室干声，没有任何背景音乐、环境声、音效。
这是温暖的武汉老巷游戏《江城有灯》的宣传样片，声音像一位成年女性轻轻对朋友讲起一段日常回忆。
唯一说话者：柔和自然的普通话成年女声，吐字清楚、亲近、温暖、松弛。两句话必须全程是同一个人的同一音色。
不要播音腔、广告腔、朗诵腔、悬疑腔，不催泪，不哭，不耳语，不气声，不演老年人，不模仿具体真人。
只逐字说下面引号里的两句话，不读时间、编号或说明，不加词、不改词、不重复。
0.25秒至4.1秒，约3到4秒，自然地说，逗号处短暂停一下：
“本来，只打算在武汉住一晚。”
两句之间保持约两秒干净安静。6.0秒至9.4秒，约3到4秒，温和笃定但不抬高音量地说：
“总有人，替你留一盏灯。”
之后到10.5秒保持纯安静。两句都完整收尾，保留尾字，不截字，前后有少量干净留白。
任何时候都没有钢琴、吉他、弦乐、背景配乐、风声、河水、脚步、鸟鸣、杂音、混响或其他声音。
音量均衡，干净清楚，无削波，不处理成电话声。只输出上述两句相同女声的干声录音。'''

def now():return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,data):
 p=WORK/name;p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');return p

def run(cmd,**kwargs):return subprocess.run(cmd,check=True,capture_output=True,**kwargs)
def probe(p):
 d=json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(p)]).stdout)
 return {'duration':float(d['format']['duration']),'bytes':Path(p).stat().st_size,'sha256':sha(p),'streams':d['streams']}
def pcm(p):return np.frombuffer(run(['ffmpeg','-v','error','-xerror','-i',str(p),'-ar',str(RATE),'-ac','1','-f','f32le','pipe:1']).stdout,dtype='<f4').copy()
def generate():
 request_hash=hashlib.sha256(json.dumps({'prompt':PROMPT},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
 raw=WORK/'audition.raw.wav';canonical=WORK/'audition.wav'
 request_seconds=None
 if raw.exists():
  if (WORK/'generation.json').exists():
   prior=json.loads((WORK/'generation.json').read_text());assert prior['requestSha256']==request_hash
   print('Exact audition already exists; no generation requested');return
  if (WORK/'prompt.txt').read_text()!=PROMPT:raise ValueError('existing_raw_has_different_prompt')
 else:
  (WORK/'prompt.txt').write_text(PROMPT)
  request=Request(API,data=json.dumps({'prompt':PROMPT},ensure_ascii=False).encode(),headers={'Content-Type':'application/json'},method='POST');start=time.monotonic()
  with urlopen(request,timeout=420) as response:result=json.load(response)
  if result.get('base_resp',{}).get('code') not in (None,0):raise ValueError('audio_generation_failed')
  data=base64.b64decode(result.get('audio_base64',''),validate=True)
  if not data.startswith((b'RIFF',b'RF64')):raise ValueError('audio_not_wav')
  raw.write_bytes(data);request_seconds=round(time.monotonic()-start,2)
 # The existing endpoint returns a streaming WAV header; rewrap before strict decoding.
 run(['ffmpeg','-y','-v','error','-i',str(raw),'-ar',str(RATE),'-ac','1','-c:a','pcm_s24le','-map_metadata','-1',str(canonical)])
 run(['ffmpeg','-v','error','-xerror','-i',str(canonical),'-f','null','-'])
 row={'generatedAt':now(),'provider':'project text_to_audio endpoint','model':'not exposed by endpoint','requestSha256':request_hash,'requestSeconds':request_seconds,'voice':{'id':'demo-promo-neutral-female-v1','type':'prompt-defined warm adult female narrator','sameSpeakerWithinThisTake':True,'originalGameVoiceIdentity':'similar style only; no identity clone claim','providerSpeakerId':None},'rawSource':{'path':str(raw.relative_to(ROOT)),'sha256':sha(raw)},'canonical':probe(canonical),'lines':TEXTS,'status':'audition_requires_review'}
 save('generation.json',row);print(json.dumps({'duration':row['canonical']['duration'],'requestSeconds':row['requestSeconds']},indent=2))

def listen(source,name):
 source=source.resolve();out=WORK/f'{name}-listening.json'
 if out.exists() and json.loads(out.read_text())['sourceSha256']==sha(source):print(out.read_text());return
 duration=probe(source)['duration'];carrier=WORK/f'{name}-neutral.mp4'
 run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=0x171e24:s=320x180:r=24','-i',str(source),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-tune','stillimage','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-t',str(duration),'-movflags','+faststart',str(carrier)])
 prompt='''Listen throughout this actual audio, presented with a neutral blank image. No expected transcript or content description is supplied. Return only JSON: audioAccessible:boolean, spokenSegments:[{start,end,heardChineseText,delivery,intelligibility}], voiceConsistency:{sameSpeaker:boolean,description}, musicOrSinging, environmentalSounds, clippedWordsOrDistortion:[{at,evidence}], unnaturalDelivery:[{at,evidence}], confidence, uncertainties. Transcribe every actually audible Chinese word exactly. Describe whether the delivery sounds naturally warm and conversational or advert-like, tearful, whispered, rushed, stiff, or overly dramatic. Report any music, unwanted words, repeated words, cut final syllables, clicks, hum, or distortion. Do not invent missing speech. Intentional silence between sentences is not an error. Do not infer words or audio from the black image. Acknowledge if the audio is inaccessible.'''
 (WORK/f'{name}-listening-prompt.txt').write_text(prompt)
 key=ENV.get('GPT_AK');assert key
 endpoint='https://'+ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')+'/api/modelhub/online/v2/crawl?'+urlencode({'ak':key})
 payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':5000,'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':1}})}}]}]}
 with urlopen(Request(endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST'),timeout=240) as response:result=json.load(response)
 content=result['choices'][0]['message']['content']
 if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
 raw=str(content).strip()
 if raw.startswith('```'):raw=raw.split('\n',1)[1].rsplit('```',1)[0].strip()
 row={'reviewedAt':now(),'method':'model-assisted actual-audio blind listening; not human listening','expectedTranscriptHiddenFromReviewer':True,'source':str(source.relative_to(ROOT)),'sourceSha256':sha(source),'carrierSha256':sha(carrier),'observation':json.loads(raw)}
 save(out.name,row);print(json.dumps(row,ensure_ascii=False,indent=2))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['generate','listen']);p.add_argument('--source',type=Path,default=WORK/'audition.wav');p.add_argument('--name',default='audition');a=p.parse_args()
 try:
  if a.action=='generate':generate()
  else:listen(a.source,a.name)
 except HTTPError as e:print('Audio stage HTTP '+str(e.code)+'; request details omitted',file=sys.stderr);sys.exit(1)
 except Exception as e:print(type(e).__name__+': audio stage failed; request details omitted',file=sys.stderr);sys.exit(1)
