#!/usr/bin/env python3
"""Local, source-hash-bound clipping of the two reviewed promo lines."""
from pathlib import Path
import json, re, sys, hashlib
import numpy as np
import produce as p
W=p.WORK
S=W/'take-v2'
CUTS=[{'id':'A','sourceIn':.36,'sourceOut':4.16},{'id':'B','sourceIn':5.96,'sourceOut':9.52}]

def loudness(path):
 r=p.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-19:TP=-2.5:LRA=9:print_format=json','-f','null','-'])
 matches=re.findall(r'\{\s*"input_i".*?\}',r.stderr.decode(),re.S)
 return json.loads(matches[-1])
def normalize(raw,dest):
 m=loudness(raw)
 af='loudnorm=I=-19:TP=-2.5:LRA=9:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true'.format(**m)
 p.run(['ffmpeg','-y','-v','error','-xerror','-i',str(raw),'-af',af,'-ar','48000','-ac','1','-c:a','pcm_s24le','-map_metadata','-1',str(dest)])
 p.run(['ffmpeg','-v','error','-xerror','-i',str(dest),'-f','null','-'])
 return m,loudness(dest)
def main():
 source=S/'audition.wav';generation=json.loads((S/'generation.json').read_text());review=json.loads((S/'audition-listening.json').read_text());obs=review['observation']
 assert generation['canonical']['sha256']==p.sha(source)==review['sourceSha256']
 norm=lambda x:re.sub(r'[^\u4e00-\u9fff]','',x)
 actual=''.join(norm(x['heardChineseText']) for x in obs['spokenSegments']);expected=''.join(norm(x['text']) for x in p.TEXTS)
 assert obs['audioAccessible'] is True and actual==expected
 assert obs['voiceConsistency']['sameSpeaker'] is True
 assert not obs['clippedWordsOrDistortion']
 parts=[];records=[]
 for text,cut in zip(p.TEXTS,CUTS):
  a,b=cut['sourceIn'],cut['sourceOut'];raw=W/(text['id']+'-excerpt.wav');dest=W/(text['id']+'.wav');mp3=W/(text['id']+'.mp3')
  p.run(['ffmpeg','-y','-v','error','-xerror','-i',str(source),'-af',f'atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={b-a-.012}:d=0.012','-ar','48000','-ac','1','-c:a','pcm_s24le',str(raw)])
  before,after=normalize(raw,dest)
  p.run(['ffmpeg','-y','-v','error','-xerror','-i',str(dest),'-ar','48000','-ac','1','-c:a','libmp3lame','-b:a','192k','-map_metadata','-1',str(mp3)])
  data=p.pcm(dest);duration=len(data)/48000;peak=float(np.max(np.abs(data)));levels={'integratedLufs':float(after['input_i']),'truePeakDbtp':float(after['input_tp'])}
  assert abs(duration-(b-a))<1/48000
  assert -20 <= levels['integratedLufs'] <= -18 and levels['truePeakDbtp'] <= -2
  assert np.isfinite(data).all() and peak<1
  assert text['placementStart']>=text['visualWindow'][0] and text['placementStart']+duration < text['visualWindow'][1]
  records.append({**text,**cut,'wav':str(dest.relative_to(p.ROOT)),'wavSha256':p.sha(dest),'mp3':str(mp3.relative_to(p.ROOT)),'mp3Sha256':p.sha(mp3),'duration':duration,'samples':len(data),'sampleRate':48000,'channels':1,'loudness':levels,'clippedSamples':0,'placementEnd':round(text['placementStart']+duration,6),'sourceSha256':p.sha(source),'normalization':{'targetIntegratedLufs':-19,'targetTruePeakDbtp':-2.5,'method':'two-pass measured loudnorm; PCM 24-bit master; one MP3 derivative','sourceMeasurement':before}})
  parts.extend([data,np.zeros(round(.8*48000),dtype=np.float32)])
 montage=W/'clips-review.wav';data=np.concatenate(parts[:-1]);p.run(['ffmpeg','-y','-v','error','-f','f32le','-ar','48000','-ac','1','-i','pipe:0','-c:a','pcm_s24le',str(montage)],input=data.astype('<f4').tobytes())
 p.save('reviewed-cuts.json',{'reviewedAt':p.now(),'sourceSha256':p.sha(source),'status':'reviewed','method':'blind audio review + measured waveform silence edges; cuts leave >120 ms clean head and >140 ms clean tail','silenceEvidence':'output/demo-film-v1/narration/take-v2/silence-boundaries.txt','cuts':CUTS})
 p.save('clips.json',{'createdAt':p.now(),'provider':generation['provider'],'model':generation['model'],'voice':generation['voice'],'requestSha256':generation['requestSha256'],'sourceSha256':p.sha(source),'clips':records,'preview':{'path':str(montage.relative_to(p.ROOT)),'sha256':p.sha(montage),'gapSeconds':.8},'syncStatus':'Audio fits parent-assigned windows; final visual sync remains pending final parent assembly. No video/audio mix created here.','onlyNewPromoLines':True,'publicAssetsModified':False,'dryVoice':True})
 print(json.dumps({'clips':[{k:r[k] for k in ['id','text','wav','duration','placementStart','placementEnd','loudness']} for r in records]},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
