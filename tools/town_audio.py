#!/usr/bin/env python3
"""Resumable supplemental street voices, using the exact existing Edge profiles.

uv run --with edge-tts==7.2.8 --with httpx --with python-dotenv python tools/town_audio.py voice --concurrency 4
No original dialogue, released voice/BGM, or runtime source is modified.
"""
from __future__ import annotations
import argparse, asyncio, copy, fcntl, hashlib, importlib.metadata, json, math, os, subprocess, sys
from pathlib import Path
import story_voice as base

ROOT=base.ROOT
WORK=ROOT/'output/audio/town-audio-v1'
PUBLIC=ROOT/'public/media/town-audio-v1'
MANIFEST=PUBLIC/'manifest.json'
JOBS=WORK/'voice-jobs.json'
PROFILES=copy.deepcopy(base.VOICES)
PROFILES.update({
 'walker0':{**PROFILES['granny'],'rate':'-7%','pitch':'-5Hz','description':'陈姐：固定普通话女声，温和利落'},
 'walker1':{**PROFILES['grandpa'],'rate':'-6%','pitch':'-3Hz','description':'贺师傅：固定普通话男声，从容低缓'},
 'walker2':{**PROFILES['ayao-female'],'rate':'+1%','pitch':'+0Hz','description':'罗娟：固定普通话女声，轻快生活口吻'},
 'walker3':{**PROFILES['community'],'rate':'-3%','pitch':'+1Hz','description':'程岚：固定普通话女声，清楚舒缓'},
 'walker4':{**PROFILES['ayao-male'],'rate':'-3%','pitch':'+1Hz','description':'宋远：固定普通话男声，年轻自然'},
})
base.WORK=WORK;base.PUBLIC=PUBLIC/'voice'

def lines():
 source="import {SUPPLEMENTAL_AUDIO_LINES} from './src/supplemental-audio-lines.js';console.log(JSON.stringify(SUPPLEMENTAL_AUDIO_LINES));"
 result=subprocess.run(['node','--input-type=module','-e',source],cwd=ROOT,capture_output=True,text=True,check=True)
 return json.loads(result.stdout)

def tasks_for(lines):
 tasks=[]
 for line in lines:
  for variant,profile_id in ({'female':'ayao-female','male':'ayao-male'} if line['profileId']=='hero' else {'default':line['profileId']}).items():
   profile=PROFILES[profile_id];sha=base.digest(line['text'])
   spec={'provider':base.PROVIDER,'client':base.CLIENT,'clientVersion':base.CLIENT_VERSION,'voice':profile,'textSha256':sha,'encoding':base.ENCODING,'normalization':base.NORMALIZATION}
   job_sha=base.digest(json.dumps(spec,sort_keys=True,ensure_ascii=False))
   tasks.append({'key':f"{line['id']}:{variant}:{job_sha[:16]}",'line':line,'variant':variant,'profileId':profile_id,'profile':profile,'sha256':sha,'jobSha256':job_sha,'filename':f"{line['id']}.{variant}.{job_sha[:12]}.mp3"})
 return tasks

def manifest(lines,tasks,state):
 # SFX generation owns a separate file; this merger is its only publication path.
 records={}
 for task in tasks:
  job=state['jobs'].get(task['key'])
  if not base.job_valid(task,job,full=True):continue
  line=task['line'];record=records.setdefault(line['id'],{'text':line['text'],'sha256':task['sha256'],'speaker':line['who'],'scene':line['scene'],'time':'present','variants':{}})
  record['variants'][task['variant']]={'url':f"/media/town-audio-v1/voice/{task['filename']}",'duration':job['duration'],'voiceId':task['profile']['voiceId'],'profileId':task['profileId'],'rate':task['profile']['rate'],'pitch':task['profile']['pitch'],'audioSha256':job['audioSha256'],'bytes':job['bytes'],'provider':base.PROVIDER,'clientVersion':base.CLIENT_VERSION,'loudness':job['normalization']['encodedMeasurement']}
 effect_ids={'mapFold':'map-fold','repairComplete':'ui-confirm','memoryCollect':'collect','carDoorOpen':'car-door-open','carDoorClose':'car-door-close','carStart':'engine','bicycleFreewheel':'bicycle-freewheel','chairSit':'chair-sit','ferryMooring':'ferry','breakfastStall':'breakfast','riverBreeze':'breeze','riverWater':'water','bicycleBell':'bicycle-bell','carHorn':'car-horn'}
 effects={effect_ids.get(k,k):v for k,v in base.read_json(WORK/'effects-manifest.json',{}).get('effects',{}).items()}
 result={'version':1,'pack':'town-audio-v1','generatedAt':base.now(),'source':'src/supplemental-audio-lines.js; authored text remains in resident-stories.js, wuhan-district-layout.js, adventure.js, story.js:LORE','sourceSha256':base.digest(json.dumps(lines,sort_keys=True,ensure_ascii=False)),'voices':PROFILES,'encoding':base.ENCODING,'normalization':base.NORMALIZATION,'lines':records,'effects':effects,'coverage':{'expectedLines':len(lines),'availableLines':len(records),'expectedVariants':len(tasks),'availableVariants':sum(len(x['variants']) for x in records.values()),'availableEffects':len(effects)}}
 base.atomic_json(MANIFEST,result);return result

async def generate(args):
 if importlib.metadata.version(base.CLIENT)!=base.CLIENT_VERSION:raise RuntimeError('Use pinned edge-tts==7.2.8')
 WORK.mkdir(parents=True,exist_ok=True);source=lines();tasks=tasks_for(source);state=base.read_json(JOBS,{'version':1,'createdAt':base.now(),'jobs':{}})
 chosen=[t for t in tasks if not args.ids or t['line']['id'] in args.ids.split(',')]
 if args.limit:chosen=chosen[:args.limit]
 def save():base.atomic_json(JOBS,state)
 semaphore=asyncio.Semaphore(min(4,max(1,args.concurrency)))
 pending=[base.synthesize(t,state,semaphore,save) for t in chosen if not base.job_valid(t,state['jobs'].get(t['key']),full=True)]
 print(f'Expected total {len(source)} lines / {len(tasks)} variants; selected {len(chosen)} / pending {len(pending)}',flush=True)
 results=await asyncio.gather(*pending);save();result=manifest(source,tasks,state);print(json.dumps(result['coverage']),flush=True)
 return 0 if all(results) else 2

def verify():
 source=lines();tasks=tasks_for(source);state=base.read_json(JOBS,{'jobs':{}});errors=[];measurements=[]
 old=base.read_json(ROOT/'public/media/story-voice-manifest.json',{}).get('lines',{})
 for t in tasks:
  if t['line']['id'] in old:errors.append('old-line-collision:'+t['line']['id'])
  job=state['jobs'].get(t['key'])
  if not base.job_valid(t,job,full=True):errors.append('missing:'+t['key']);continue
  path=base.PUBLIC/t['filename'];info=base.probe(path,decode=True);measured=base.measure_encoded_loudness(path)
  if measured['truePeakDbtp']>-2 or abs(measured['integratedLufs']+19)>2.5:errors.append('level:'+t['key'])
  measurements.append({'lineId':t['line']['id'],'variant':t['variant'],**info,**measured,'sha256':base.file_digest(path)})
 payload=manifest(source,tasks,state);report={'checkedAt':base.now(),'coverage':payload['coverage'],'errors':errors,'measurements':measurements,'totalDuration':round(sum(m['duration'] for m in measurements),3),'totalBytes':sum(m['bytes'] for m in measurements)}
 base.atomic_json(WORK/'voice-verification.json',report);print(json.dumps({k:v for k,v in report.items() if k!='measurements'},ensure_ascii=False,indent=2));return 1 if errors else 0

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['voice','publish','verify']);parser.add_argument('--concurrency',type=int,default=4);parser.add_argument('--ids');parser.add_argument('--limit',type=int);args=parser.parse_args()
 try:
  if args.action=='voice':
   WORK.mkdir(parents=True,exist_ok=True)
   with (WORK/'generation.lock').open('w') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    code=asyncio.run(generate(args))
  elif args.action=='verify':code=verify()
  else:
   source=lines();print(json.dumps(manifest(source,tasks_for(source),base.read_json(JOBS,{'jobs':{}}))['coverage']));code=0
  sys.exit(code)
 except Exception as exc:print(f'{type(exc).__name__}: offline supplemental audio stage failed; request details omitted',file=sys.stderr);sys.exit(1)
