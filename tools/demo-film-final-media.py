#!/usr/bin/env python3
"""New 118-second-film AIGC assets. Never edit the game or shared manifests."""
from __future__ import annotations
import argparse, base64, hashlib, json, re, subprocess, time
from pathlib import Path
import httpx
import numpy as np
from media import ENV
import opening_narration_v1 as opening

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/demo-film-final/aigc'
FF='/opt/homebrew/bin/ffmpeg'; FP='/opt/homebrew/bin/ffprobe'
IMAGE=ROOT/'output/demo-film-v1/generation/output/imagegen/demo-ending-keyframe-v1.png'
CGPROMPT=ROOT/'media/prompts/demo-final-ending-cg-v1.txt'
CG=OUT/'demo-final-ending-seedance2-v1.mp4'
AUDIO_API='https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio'
CUES=[
 ('N01',.6,7,'本来，只打算在武汉住一晚。','C01 / 轮渡返乡，武汉江岸'),
 ('N02',7.3,16,'外公在姨妈家休养，托阿遥回来，给街坊送几件东西。','R01 / 外公电话与修理委托'),
 ('N03',16.3,25,'收音机送到了，小时候的画，也被她好好收着。','R02 / 婆婆收音机与童画'),
 ('N04',25.3,34,'路过蔡记，热干面还冒着气，街坊托的东西也备齐了。','R03 / 蔡记过早铺与物资'),
 ('N05',34.3,41,'骑车穿过里分，铃声一响，巷子就热闹起来。','R04 / 自行车过里分'),
 ('N06',41.3,49,'开车沿江走远一点，也在桥影下，停下来听一段往事。','R05 / 沿江驾驶与旧照'),
 ('N07',49.4,58,'借一只小木船，亲手划进江风里。换个方向，看看这座城。','R06 / 可操控桨舟'),
 ('N08',63.8,74,'划过浮标，转过街角。顺路比一场，绕回来，还有热的等你。','R07→R08 / 水上浮标过渡陆上计时'),
 ('N09',74.3,82.2,'天色变了，就回来照应街坊。核好物资，报清位置。','R09 / 社区准备，后接小许完整回执'),
 ('N10',88.5,101,'留下，还是告别？每一次选择，都在改变归途。走过的故事，收藏进画廊。','R10→R11 / 结局选择过渡画廊'),
 ('N11',101.2,109,'让AI参与画面和声音的制作，把武汉日常，变成能走进去的故事。','A01 / AI制作证据，不声称实时AI玩法'),
 ('N12',110,118,'总有人，替你留一盏灯。','C02 / 暖灯告别，尾声留白'),
]

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,d):
 p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');tmp.replace(p)
def run(args,**kw):return subprocess.run(args,capture_output=True,check=True,**kw)
def probe(p):
 d=json.loads(run([FP,'-v','error','-show_format','-show_streams','-of','json',str(p)]).stdout)
 return {'duration':float(d['format']['duration']),'bytes':Path(p).stat().st_size,'sha256':sha(p),'streams':d['streams']}
def ledger():
 p=OUT/'cg-task.json';return p,json.loads(p.read_text()) if p.exists() else {}
def cg_submit():
 OUT.mkdir(parents=True,exist_ok=True);p,old=ledger()
 payload={'model':ENV.get('SEEDANCE_MODEL','ep-20260623073342-2cwrv'),'content':[{'type':'text','text':CGPROMPT.read_text()},{'type':'image_url','image_url':{'url':'data:image/png;base64,'+base64.b64encode(IMAGE.read_bytes()).decode()},'role':'first_frame'}],'ratio':'16:9','duration':9,'resolution':'1080p','generate_audio':False,'watermark':False}
 fingerprint=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
 if old:
  if old['requestSha256']!=fingerprint:raise ValueError('Existing task has different parameters')
  print(json.dumps({'reused':True,'state':old['state'],'hasTaskId':bool(old.get('id'))}));return
 key=ENV.get('ARK_API_KEY');assert key
 old={'state':'submitting_uncertain','requestSha256':fingerprint,'sourceImage':str(IMAGE.relative_to(ROOT)),'sourceImageSha256':sha(IMAGE),'prompt':str(CGPROMPT.relative_to(ROOT)),'requestedDuration':9,'requestedResolution':'1080p','model':payload['model']};save(p,old)
 response=httpx.post('https://'+ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net')+'/api/v3/contents/generations/tasks',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},json=payload,timeout=120)
 if not response.is_success:
  old.update(state='rejected',httpStatus=response.status_code);save(p,old);raise RuntimeError('Seedance creation HTTP '+str(response.status_code))
 result=response.json();task=result.get('id') or result.get('data',{}).get('id')
 if not task:raise RuntimeError('Accepted request lacks task id; no automatic resubmit')
 old.update(id=task,state='submitted');save(p,old);print('Seedance 2 ending submitted; ledger saved')
def cg_poll(watch=False):
 p,d=ledger()
 if not d.get('id'):raise RuntimeError('No existing task id; polling never submits')
 if d['state']=='downloaded' and CG.exists():print('Existing CG reused');return
 for _ in range(80 if watch else 1):
  response=httpx.get('https://'+ENV.get('ARK_HOST','ark-i18n-tt.tiktok-row.net')+'/api/v3/contents/generations/tasks/'+d['id'],headers={'Authorization':'Bearer '+ENV['ARK_API_KEY']},timeout=60)
  if not response.is_success:raise RuntimeError('Seedance query HTTP '+str(response.status_code))
  r=response.json();r=r.get('data',r);d['state']=r.get('status','unknown');d['actualModel']=r.get('model','');save(p,d);print(d['state'],flush=True)
  if d['state']=='succeeded':
   u=r.get('content',{}).get('video_url');assert u
   media=httpx.get(u,timeout=180,follow_redirects=True);media.raise_for_status();tmp=CG.with_suffix('.part.mp4');tmp.write_bytes(media.content);tmp.replace(CG)
   run([FF,'-v','error','-xerror','-i',str(CG),'-f','null','-']);d.update(state='downloaded',asset=probe(CG),path=str(CG.relative_to(ROOT)));save(p,d);print(json.dumps({'downloaded':True,'duration':d['asset']['duration'],'bytes':d['asset']['bytes']}));return
  if d['state'] in ('failed','canceled','cancelled'):raise RuntimeError('Existing Seedance task '+d['state'])
  if watch:time.sleep(20)

def narration_prompt():
 head='''制作一段约88秒的完整普通话游戏宣传旁白，仅一个成年女性说话，12句之间各留0.7到0.9秒干净停顿。录音室纯干声，全程没有音乐、环境声、音效。
声音设定延续《江城有灯》宣传样片：自然温暖的普通话成年女声，对一米外朋友正常说话的音量，清楚有支撑，声带振动充分，亲近、平和、松弛。不耳语，不气声，不喘息，不广告腔、不播音腔、不朗诵、不演老年人、不模仿具体真人。12句都是同一个人的同一音色，一口气连续录制的完整旁白。
游戏是武汉老巷日常互助故事；阿遥读a1 yao2，是成年主角。外公健在，只是在姨妈家休养。蔡记读cai4 ji4，里分读li3 fen4。AI读英文字母A和I。不读编号或说明。
严格依次、逐字朗读下方引号里的12句，不加词、不漏词、不重复。整体轻快自然、短句有呼吸。每句自然3到8秒，较长句清楚略快但不赶；不要把一整段压成快报。开始留0.3秒、每句间0.8秒、最后留1秒纯静音。语句完整收尾，没有尾字截断。不要为达到88秒拉长某个字。
'''
 return head+'\n'.join('“'+c[3]+'”' for c in CUES)+'\n全程只输出这12句同一女声，没有钢琴、弦乐、歌声、噪声、混响、风声、水声或第二个人。'
def narration():
 folder=OUT/'narration';folder.mkdir(parents=True,exist_ok=True);prompt=narration_prompt();payload={'prompt':prompt};fingerprint=hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest();record=folder/'generation.json';raw=folder/'continuous-v1.raw.wav';canonical=folder/'continuous-v1.wav'
 if record.exists():
  d=json.loads(record.read_text())
  if d['requestSha256']!=fingerprint:raise ValueError('Narration request changed; use another take')
  if canonical.exists():print(json.dumps({'reused':True,'duration':probe(canonical)['duration']}));return
  raise RuntimeError('Existing generation outcome uncertain; no automatic retry')
 (ROOT/'media/prompts/demo-final-narration-v1.txt').write_text(prompt)
 save(folder/'cue-script.json',{'approvedBy':'root','targetFilmDuration':118,'narrator':'demo-promo-neutral-female-style-v1; prompt-defined, not a voice clone','cues':[{'id':c[0],'start':c[1],'visualEnd':c[2],'text':c[3],'visualAnchor':c[4]} for c in CUES]})
 d={'state':'submitting_uncertain','requestSha256':fingerprint,'provider':'project text_to_audio prompt-only endpoint','model':'not exposed','speakerId':None,'voiceConsistency':'single continuous take requested; subject to actual-file review'};save(record,d);started=time.monotonic()
 response=httpx.post(AUDIO_API,json=payload,timeout=600)
 if not response.is_success:d.update(state='rejected',httpStatus=response.status_code);save(record,d);raise RuntimeError('Narration HTTP '+str(response.status_code))
 result=response.json()
 if result.get('base_resp',{}).get('code') not in (None,0):d['state']='provider_failed';save(record,d);raise RuntimeError('Narration provider error')
 data=base64.b64decode(result.get('audio_base64',''),validate=True)
 if not data.startswith((b'RIFF',b'RF64')):raise RuntimeError('Narration response is not WAV')
 raw.write_bytes(data);run([FF,'-y','-v','error','-i',str(raw),'-ar','48000','-ac','1','-c:a','pcm_s24le','-map_metadata','-1',str(canonical)]);run([FF,'-v','error','-xerror','-i',str(canonical),'-f','null','-'])
 d.update(state='generated_needs_review',rawSha256=sha(raw),asset=probe(canonical),requestSeconds=round(time.monotonic()-started,3));save(record,d);print(json.dumps({'generated':True,'duration':d['asset']['duration'],'requestSeconds':d['requestSeconds']}),flush=True)
def listen(source,name):
 opening.WORK=OUT/'narration';opening.WORK.mkdir(parents=True,exist_ok=True);opening.listen(name,source)

def build():
 folder=OUT/'narration';source=folder/'continuous-v1.wav';review=json.loads((folder/'continuous-v1-listening.json').read_text());assert review['sourceSha256']==sha(source)
 obs=review['observation'];assert obs['audioAccessible'] and obs['voiceConsistency']['sameSpeaker'] and not obs['clippedWordsOrDistortion']
 # Boundaries combine actual blind transcript grouping and measured -38 dB
 # silence edges. N10 trims two inter-sentence silences only, never a phoneme.
 cuts=[[(.36,2.9)],[(3.56,8.85)],[(9.61,14.18)],[(14.76,19.88)],[(20.55,25.30)],[(25.90,31.37)],[(32.06,38.27)],[(38.93,45.35)],[(46.03,52.03)],[(52.74,54.79),(55.76,58.745),(59.68,62.43)],[(63.28,69.97)],[(70.71,73.58)]]
 starts=[.6,7.3,16.3,25.3,34.3,41.3,49.4,65.8,74.3,89.0,101.2,110.0]
 timeline=np.zeros(118*48000,dtype=np.float32);allclips=[];rows=[]
 for cue,intervals,start in zip(CUES,cuts,starts):
  ident,_,visual_end,text,anchor=cue;parts=[]
  for a,b in intervals:
   data=run([FF,'-v','error','-i',str(source),'-af',f'atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={b-a-.012}:d=0.012','-ar','48000','-ac','1','-f','f32le','-']).stdout
   parts.append(np.frombuffer(data,dtype='<f4'))
  pcm=np.concatenate(parts)
  if len(pcm)<3*48000:pcm=np.pad(pcm,(0,3*48000-len(pcm)))
  raw=folder/(ident+'-cut.wav');wav=folder/(ident+'.wav');mp3=folder/(ident+'.mp3')
  run([FF,'-y','-v','error','-f','f32le','-ar','48000','-ac','1','-i','pipe:0','-c:a','pcm_s24le',str(raw)],input=pcm.astype('<f4').tobytes())
  m=run([FF,'-hide_banner','-i',str(raw),'-af','loudnorm=I=-19:TP=-2.5:LRA=9:print_format=json','-f','null','-'])
  measure=json.loads(re.findall(r'\{\s*"input_i".*?\}',m.stderr.decode(),re.S)[-1])
  af='loudnorm=I=-19:TP=-2.5:LRA=9:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true'.format(**measure)
  run([FF,'-y','-v','error','-i',str(raw),'-af',af,'-ar','48000','-ac','1','-c:a','pcm_s24le','-map_metadata','-1',str(wav)])
  run([FF,'-y','-v','error','-i',str(wav),'-c:a','libmp3lame','-b:a','192k','-map_metadata','-1',str(mp3)])
  run([FF,'-v','error','-xerror','-i',str(wav),'-f','null','-'])
  actual=probe(wav);signal=np.frombuffer(run([FF,'-v','error','-i',str(wav),'-f','f32le','-']).stdout,dtype='<f4');levels=opening.voice.measure_encoded_loudness(wav)
  assert actual['duration']<=8.001 and start+actual['duration']<visual_end and np.isfinite(signal).all() and np.max(np.abs(signal))<1
  assert -20.5<=levels['integratedLufs']<=-17.5 and levels['truePeakDbtp']<=-2
  offset=round(start*48000);timeline[offset:offset+len(signal)]+=signal
  allclips.extend([signal,np.zeros(24000,dtype=np.float32)])
  rows.append({'id':ident,'text':text,'start':start,'end':round(start+actual['duration'],6),'duration':actual['duration'],'visualEnd':visual_end,'visualAnchor':anchor,'wav':str(wav.relative_to(ROOT)),'wavSha256':sha(wav),'mp3':str(mp3.relative_to(ROOT)),'mp3Sha256':sha(mp3),'sourceCuts':intervals,'sourceSha256':sha(source),'sampleRate':48000,'channels':1,'samples':len(signal),'loudness':levels,'fullDecode':True,'timeStretch':False})
 for name,pcm in [('narration-118s.wav',timeline),('clips-review.wav',np.concatenate(allclips[:-1]))]:
  run([FF,'-y','-v','error','-f','f32le','-ar','48000','-ac','1','-i','pipe:0','-c:a','pcm_s24le',str(folder/name)],input=pcm.astype('<f4').tobytes())
 def stamp(x):
  ms=round(x*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
 (folder/'narration-cues.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(r["start"])} --> {stamp(r["end"])}\n{r["text"]}' for i,r in enumerate(rows))+'\n')
 observed=''.join(s['heardChineseText'] for s in obs['spokenSegments']);normal=lambda x:re.sub(r'[^\u4e00-\u9fffA-Za-z]','',x).replace('修养','休养').replace('他','她').replace('里份','里分')
 expected=''.join(c[3] for c in CUES);assert normal(observed)==normal(expected)
 data={'version':'demo-final-narration-v1','status':'clips-built-awaiting-second-listening','source':str(source.relative_to(ROOT)),'sourceSha256':sha(source),'voice':'one consistent warm adult female, new continuous take matching prior A/B style; not identity clone','model':'not exposed by project text_to_audio endpoint','cues':rows,'stem':str((folder/'narration-118s.wav').relative_to(ROOT)),'stemDuration':118,'srt':str((folder/'narration-cues.srt').relative_to(ROOT)),'asr':{'blindReport':str((folder/'continuous-v1-listening.json').relative_to(ROOT)),'allWordsMatchAfterHomophoneNormalization':True,'homophoneSpellingDifferences':['休养 / 修养','她 / 他','里分 / 里份'],'actualLexicalDiscrepancies':[]},'edits':['N10: shortened only two silent sentence gaps, no time stretching','N01 and N12 padded trailing silence to 3 seconds','N08 starts 65.8 to align floating buoys then 67s driving shot','N10 starts 89.0 so gallery phrase begins after 94s'],'mix':'Dry voice only. BGM and game-character speech integrated by parent task.','finalVisualSync':'placement proposal tied to approved 118s plan; parent must confirm against actual edit'}
 save(folder/'clips.json',data);print(json.dumps({'clips':[{k:r[k] for k in ('id','start','end','duration','text')} for r in rows]},ensure_ascii=False,indent=2))

def captions():
 folder=OUT/'narration';manifest=json.loads((folder/'clips.json').read_text())
 # Spoken phrase windows measured from waveform silence edges, with phrase
 # identity independently recovered by the two transcript-hidden audio reviews.
 phrases={
 'N01':[(.504,2.695,'本来，只打算在武汉住一晚。')],
 'N02':[(3.702,5.246,'外公在姨妈家休养，'),(5.933,8.641,'托阿遥回来，给街坊送几件东西。')],
 'N03':[(9.749,13.974,'收音机送到了，小时候的画，也被她好好收着。')],
 'N04':[(14.902,17.343,'路过蔡记，热干面还冒着气，'),(17.951,19.674,'街坊托的东西也备齐了。')],
 'N05':[(20.686,25.091,'骑车穿过里分，铃声一响，巷子就热闹起来。')],
 'N06':[(26.042,27.637,'开车沿江走远一点，'),(28.283,31.161,'也在桥影下，停下来听一段往事。')],
 'N07':[(32.207,35.113,'借一只小木船，亲手划进江风里。'),(35.919,38.058,'换个方向，看看这座城。')],
 'N08':[(39.075,39.888,'划过浮标，'),(40.286,40.972,'转过街角。'),(41.927,43.646,'顺路比一场，绕回来，'),(44.198,45.146,'还有热的等你。')],
 'N09':[(46.175,48.884,'天色变了，就回来照应街坊。'),(49.831,51.826,'核好物资，报清位置。')],
 'N10':[(52.865,54.675,'留下，还是告别？'),(55.881,58.627,'每一次选择，都在改变归途。'),(59.796,62.235,'走过的故事，收藏进画廊。')],
 'N11':[(63.420,66.123,'让AI参与画面和声音的制作，'),(66.786,69.762,'把武汉日常，变成能走进去的故事。')],
 'N12':[(70.856,73.346,'总有人，替你留一盏灯。')],
 }
 result=[]
 for cue in manifest['cues']:
  authored=phrases[cue['id']]
  for index,(a,b,text) in enumerate(authored):
   offset=0
   for cut_a,cut_b in cue['sourceCuts']:
    if cut_a<=a<b<=cut_b:break
    offset+=cut_b-cut_a
   else:raise RuntimeError('Phrase not within one retained source interval')
   speech_start=cue['start']+offset+a-cut_a;speech_end=cue['start']+offset+b-cut_a
   result.append({'cueId':cue['id'],'phrase':index+1,'text':text,'speechStart':round(speech_start,3),'speechEnd':round(speech_end,3),'start':round(max(cue['start'],speech_start-.04),3),'end':round(min(cue['end'],speech_end+.14),3),'sourceSpeech':[a,b]})
 def stamp(x):
  ms=round(x*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
 save(folder/'phrase-subtitles.json',{'sourceSha256':manifest['sourceSha256'],'method':'source waveform/silence boundaries plus transcript-hidden ASR phrase identity; 40ms subtitle lead and 140ms tail','cues':result})
 (folder/'narration-phrases.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(r["start"])} --> {stamp(r["end"])}\n{r["text"]}' for i,r in enumerate(result))+'\n')
 manifest['phraseSubtitles']=str((folder/'phrase-subtitles.json').relative_to(ROOT));manifest['phraseSrt']=str((folder/'narration-phrases.srt').relative_to(ROOT));save(folder/'clips.json',manifest)
 print('Phrase subtitles prepared:',len(result))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['cg-submit','cg-poll','narration','listen','build','captions']);p.add_argument('--watch',action='store_true');p.add_argument('--source',type=Path,default=OUT/'narration/continuous-v1.wav');p.add_argument('--name',default='continuous-v1');a=p.parse_args()
 try:
  if a.action=='cg-submit':cg_submit()
  elif a.action=='cg-poll':cg_poll(a.watch)
  elif a.action=='narration':narration()
  elif a.action=='build':build()
  elif a.action=='captions':captions()
  else:listen(a.source,a.name)
 except Exception as e:
  # Never print HTTP request objects, signed media links, credentials or responses.
  print(type(e).__name__+': final media stage failed; details omitted');raise SystemExit(1)
