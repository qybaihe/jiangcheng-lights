#!/usr/bin/env python3
"""Bind reviewed listening evidence to the precise final supplemental files."""
import json
from pathlib import Path
import town_audio as town
import story_voice as base

EVIDENCE={
 'mapFold':['paper-ui-details'], 'repairComplete':['paper-ui-details'], 'memoryCollect':['paper-ui-details'],
 'carDoorOpen':['sfx-foley'], 'carDoorClose':['sfx-foley'], 'carStart':['sfx-foley'],
 'bicycleFreewheel':['isolated-bicycle-freewheel'], 'chairSit':['isolated-chair-sit'],
 'ferryMooring':['retake-ferry'], 'breakfastStall':['retake-breakfast','breakfast-v2-seam'],
 'riverBreeze':['sfx-environments','sfx-loop-seams'], 'riverWater':['sfx-environments','sfx-loop-seams'],
 'bicycleBell':['sfx-environments'], 'carHorn':['sfx-environments'],
}
OBSERVATIONS={
 'mapFold':'轻纸摩擦与展开声；与车声音序列隔离后复核。',
 'repairComplete':'一声短而柔和的扣合/轻啵声，无旋律。',
 'memoryCollect':'轻纸滑动、细小摩擦。',
 'carDoorOpen':'车门锁扣打开。', 'carDoorClose':'一次车门关合。', 'carStart':'短启动与低沉怠速。',
 'bicycleFreewheel':'轻机械转动、细碎棘轮感。', 'chairSit':'椅面轻吱与衣料摩擦。',
 'ferryMooring':'小船边水轻轻晃动；未把未辨明的绳结细节当成听验结论。',
 'breakfastStall':'清楚细密的锅中煎制滋声，少量炊具轻碰。',
 'riverBreeze':'柔和风与空气流动。', 'riverWater':'水的轻拍与晃动。',
 'bicycleBell':'短车铃。', 'carHorn':'短汽车喇叭。',
}

def main():
 effects=base.read_json(town.WORK/'effects-manifest.json',{});checked=[]
 for key,record in effects['effects'].items():
  refs=[]
  for name in EVIDENCE[key]:
   path=town.WORK/'listening'/f'{name}.json';evidence=base.read_json(path,{})
   assert evidence.get('observation',{}).get('audioAccessible') is True, name
   assert any(item['sha256']==record['audioSha256'] for item in evidence['map']),f'Stale audio: {name}/{key}'
   refs.append({'path':str(path.relative_to(town.ROOT)),'sha256':base.file_digest(path)})
  record.update({'listeningStatus':'reviewed','qa':{'method':'model-assisted actual-file listening plus editorial comparison; not human listening','evidence':refs,'audibleDescription':OBSERVATIONS[key],'loopSeamReviewed':bool(record['loop'])}});checked.append(key)
 base.atomic_json(town.WORK/'effects-manifest.json',effects)
 source=town.lines();tasks=town.tasks_for(source);state=base.read_json(town.JOBS,{'jobs':{}});manifest=town.manifest(source,tasks,state)
 voices=base.read_json(town.WORK/'voice-verification.json',{});sfx=base.read_json(town.WORK/'sfx-verification.json',{})
 assert not voices.get('errors') and len(voices.get('measurements',[]))==194
 assert not sfx.get('errors') and sfx.get('count')==14
 for record in sfx['measurements']:
  assert manifest['effects'][record['id']]['audioSha256']==record['sha256']
 representative=set();voice_evidence=[]
 for name in ['resident-audition','character-names','street-voices']:
  path=town.WORK/'listening'/f'{name}.json';evidence=base.read_json(path,{})
  assert evidence['observation']['audioAccessible']
  for record in evidence['map']:
   entry=manifest['lines'][record['id']]['variants'][record['variant']];assert entry['audioSha256']==record['sha256'];representative.add((record['id'],record['variant']))
  voice_evidence.append({'path':str(path.relative_to(town.ROOT)),'sha256':base.file_digest(path)})
 result={'releasedAt':base.now(),'manifest':str(town.MANIFEST.relative_to(town.ROOT)),'manifestSha256':base.file_digest(town.MANIFEST),'coverage':manifest['coverage'],'voiceSeconds':voices['totalDuration'],'voiceBytes':voices['totalBytes'],'voiceMeasuredIntegratedLufsRange':[min(v['integratedLufs'] for v in voices['measurements']),max(v['integratedLufs'] for v in voices['measurements'])],'voiceMaxTruePeakDbtp':max(v['truePeakDbtp'] for v in voices['measurements']),'representativeVoicesListened':len(representative),'representativeVoiceEvidence':voice_evidence,'effectsReviewed':len(checked),'retakes':['breakfastStall v2','ferryMooring v2'],'noOldMainVoiceOrMusicOverwritten':True,'runtimeIntegration':'owned by root; this release only produces assets and mapping adapters'}
 base.atomic_json(town.WORK/'release-report.json',result);print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
