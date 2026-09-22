"""Build the v2 timeline from independently reviewed actual narration boundaries."""
from pathlib import Path
import hashlib, json, subprocess
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v2'
decision=OUT/'edit-decision.json'
p=json.loads(decision.read_text())
m=json.loads((OUT/'narration/clips.json').read_text())
phrases=json.loads((OUT/'narration/phrase-subtitles.json').read_text())
assert len(m['cues'])==12
assert phrases['sourceSha256']==m['sourceSha256']
for row in m['cues']:
    assert hashlib.sha256((ROOT/row['wav']).read_bytes()).hexdigest()==row['wavSha256']
    assert row['timeStretch'] is False
p['voice']=[{'id':r['id'],'from':r['start'],'duration':r['duration'],'src':r['wav'],'volume':.95} for r in m['cues']]
p['captions']=[{'from':r['start'],'duration':round(r['end']-r['start'],6),'text':r['text'],'who':'阿遥','presentation':'subtitle'} for r in phrases['cues']]
original=json.loads((ROOT/'output/demo-film-final/edit-decision.json').read_text())
xu=next(c for c in original['captions'] if c.get('who')=='小许')
p['captions'].append({**xu,'from':80.0})
p['captions'].sort(key=lambda x:x['from'])
for a,b in zip(p['captions'],p['captions'][1:]):assert a['from']+a['duration']<=b['from']+.001
assert all(not(101<=r['from']<109) for r in p['voice'])
wavefile=ROOT/m['cues'][2]['wav']
pcm=np.frombuffer(subprocess.check_output(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(wavefile),'-ac','1','-ar','16000','-f','f32le','-']),dtype='<f4')
bins=np.array([np.sqrt(np.mean(s*s)) for s in np.array_split(pcm,64)])
bars=np.clip(bins/max(float(bins.max()),1e-9),0,1)**.7
card=next(s for s in p['shots'] if s['type']=='evidence')
card['waveform']=[round(float(v),4) for v in bars]
card['waveformSource']={'path':str(wavefile.relative_to(ROOT)),'sha256':hashlib.sha256(wavefile.read_bytes()).hexdigest(),'method':'decoded float32 PCM, 64 RMS bins, display-normalized'}
p['evidence']=[e for e in p['evidence'] if 'aigc/narration/' not in e]
for e in ['output/demo-film-v2/narration/clips.json','output/demo-film-v2/narration/phrase-subtitles.json','output/demo-film-v2/narration/acceptance.json','output/demo-film-v2/audio/score-edit.json']:
    if e not in p['evidence']:p['evidence'].append(e)
p['reviewed']=False
decision.write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'voices':len(p['voice']),'captions':len(p['captions']),'voiceSeconds':sum(v['duration'] for v in p['voice']),'waveformSource':str(wavefile)},ensure_ascii=False))
