#!/usr/bin/env python3
"""Model-assisted listening of actual supplemental files through existing gateway.
Expected text/foley descriptions are deliberately withheld from the reviewer.
"""
import argparse,array,base64,hashlib,json,subprocess,sys
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from media import ROOT,ENV
from story_voice import atomic_json,now
RATE=48000;WORK=ROOT/'output/audio/town-audio-v1';MANIFEST=ROOT/'public/media/town-audio-v1/manifest.json'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def listen(name,mode,ids,seam=False):
 manifest=json.loads(MANIFEST.read_text());parts=[]
 for token in ids:
  ident,_,requested_variant=token.partition(':')
  if mode=='voice':
   row=manifest['lines'][ident];variant=requested_variant or ('default' if 'default' in row['variants'] else 'female');clip=row['variants'][variant]
  else:clip=manifest['effects'][ident];variant=None
  path=ROOT/'public'/clip['url'].lstrip('/');parts.append({'id':ident,'variant':variant,'path':path,'sha256':sha(path)})
 folder=WORK/'listening';folder.mkdir(parents=True,exist_ok=True);wave=folder/f'{name}.wav';montage=array.array('f');map=[]
 for part in parts:
  pcm=array.array('f');pcm.frombytes(subprocess.run(['ffmpeg','-v','error','-i',str(part['path']),'-ar',str(RATE),'-ac','2','-f','f32le','-'],capture_output=True,check=True).stdout)
  if seam:
   # Join the actual decoded tail and head; the midpoint is the real loop seam.
   edge=min(len(pcm)//2,int(RATE*3))*2;pcm=array.array('f',pcm[-edge:])+array.array('f',pcm[:edge])
  start=len(montage)/RATE/2;montage.extend(pcm);end=len(montage)/RATE/2
  map.append({'id':part['id'],'variant':part['variant'],'file':str(part['path'].relative_to(ROOT)),'sha256':part['sha256'],'start':round(start,3),'end':round(end,3)})
  montage.extend(array.array('f',[0])*int(RATE*.75)*2)
 subprocess.run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0','-c:a','pcm_s16le',str(wave)],input=montage.tobytes(),capture_output=True,check=True)
 carrier=folder/f'{name}.mp4';subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=0x171e24:s=320x180:r=1','-i',str(wave),'-c:v','libx264','-tune','stillimage','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(carrier)],capture_output=True,check=True)
 key=ENV.get('GPT_AK');host=ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')
 if not key:raise RuntimeError('Missing existing QA credential')
 prompt='Listen carefully to the actual audio throughout this neutral blank video. This is a sequence of separate short game audio assets separated by 0.75 seconds of intentional silence. Do not infer sounds from filenames, expected content, a script, or the blank image. Return a JSON object with audioAccessible:boolean, segments:[{start,end,heardChineseText,heardSoundSources,delivery,clippedOrCutOff,distortion,unwantedMusicOrSinging,confidence}], overallNotes, uncertainties. Only transcribe words actually heard. For spoken personal names, include heardPinyin syllables and tones when the written characters are uncertain; do not confidently substitute another name. Mark non-speech clips as such. Report specific timing when sound is abruptly cut, masked, or repeated. Natural mechanical clicks are not encoding glitches. No expected transcripts or sound descriptions are supplied. Acknowledge if audio is inaccessible.'
 if seam:prompt+=' Each non-silent 6-second block is an actual buffer loop join: its midpoint joins the last three seconds to the first three seconds. Listen specifically for clicks, sudden level changes, gaps, or unnatural discontinuity at each midpoint. Do not treat the 0.75-second spaces between clips as defects.'
 payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':6000,'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':1}})}}]}]}
 endpoint='https://'+host+'/api/modelhub/online/v2/crawl?'+urlencode({'ak':key})
 request=Request(endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST')
 with urlopen(request,timeout=240) as response:result=json.load(response)
 content=result['choices'][0]['message']['content']
 if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
 raw=str(content).strip()
 if raw.startswith('```'):raw=raw.split('\n',1)[1].rsplit('```',1)[0].strip()
 report={'name':name,'mode':mode,'reviewedAt':now(),'method':'model-assisted actual-file listening; neutral carrier; not human listening','expectedTranscriptHiddenFromReviewer':True,'sourceSha256':sha(wave),'carrierSha256':sha(carrier),'map':map,'observation':json.loads(raw)}
 atomic_json(folder/f'{name}.json',report);print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('name');parser.add_argument('--mode',choices=['voice','sfx'],default='voice');parser.add_argument('--ids',required=True);parser.add_argument('--seam',action='store_true');a=parser.parse_args()
 try:listen(a.name,a.mode,a.ids.split(','),a.seam)
 except HTTPError as exc:print('Listening HTTP '+str(exc.code)+'; request details omitted',file=sys.stderr);sys.exit(1)
 except Exception as exc:print(type(exc).__name__+': listening stage failed; request details omitted',file=sys.stderr);sys.exit(1)
