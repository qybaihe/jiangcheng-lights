"""Checks actual final MP4 and source ledger without reading environment secrets."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v3'
FILM=OUT/'江城有灯-比赛Demo-1080p-v3.mp4'
def run(args):return subprocess.run(args,check=True,capture_output=True,text=True)
def main():
 p=json.loads((OUT/'final-props.json').read_text());ledger=json.loads((OUT/'final-asset-ledger.json').read_text())
 assert p['duration']==118 and p['readyForFinal'] is True
 audio_master=json.loads((OUT/'final-audio-master.json').read_text())
 assert audio_master['status']=='bitstream-and-decoded-pcm-identical'
 assert audio_master['targetSha256']==hashlib.sha256(FILM.read_bytes()).hexdigest()
 for pair in audio_master['audioChecks'].values(): assert pair['original']==pair['final']
 for baseline in json.loads((OUT/'preserved-v2-baseline.json').read_text())['paths']:
  assert hashlib.sha256((ROOT/baseline['path']).read_bytes()).hexdigest()==baseline['sha256']
 cursor=0
 for s in p['shots']:
  assert abs(s['from']-cursor)<1e-6,s['id'];cursor=s['from']+s['duration']
 assert cursor==118
 gameplay=sum(s['duration'] for s in p['shots'] if s['type']=='game');assert gameplay>=85
 for a in ledger['assets']:
  b=(ROOT/'video/demo-film-v3/public'/a['asset']).read_bytes()
  assert hashlib.sha256(b).hexdigest()==a['sha256']
  assert hashlib.sha256(Path(a['source']).read_bytes()).hexdigest()==a['sha256']
 for c in p['captions']+p['voice']:assert c['from']>=0 and c['from']+c['duration']<=118.05
 for a,b in zip(p['voice'],p['voice'][1:]):assert a['from']+a['duration']<=b['from']+.02
 for a,b in zip(p['captions'],p['captions'][1:]):assert a['from']+a['duration']<=b['from']+.02
 info=json.loads(run(['/opt/homebrew/bin/ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(FILM)]).stdout)
 v=next(s for s in info['streams'] if s['codec_type']=='video');a=next(s for s in info['streams'] if s['codec_type']=='audio')
 assert (v['width'],v['height'])==(1920,1080)
 assert v['codec_name']=='h264' and v['pix_fmt']=='yuv420p' and v['color_space']=='bt709'
 assert v['avg_frame_rate']=='30/1' and int(v['nb_read_frames'])==3540
 assert a['codec_name']=='aac' and int(a['sample_rate'])==48000 and a['channels']==2
 assert 118<=float(info['format']['duration'])<118.1
 assert FILM.stat().st_size<500000000
 dec=run(['/opt/homebrew/bin/ffmpeg','-v','error','-xerror','-i',str(FILM),'-f','null','-']);assert not dec.stderr.strip()
 black=run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-nostats','-i',str(FILM),'-an','-vf','blackdetect=d=0.07:pix_th=0.05:pic_th=0.98','-f','null','-']);(OUT/'final-black-frame-check.log').write_text(black.stderr)
 events=re.findall(r'black_start:[^\n]+',black.stderr);assert not events,events
 loud=run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-nostats','-i',str(FILM),'-vn','-af','ebur128=peak=true','-f','null','-']);(OUT/'final-mix-loudness.log').write_text(loud.stderr)
 summary=loud.stderr.split('Summary:')[-1];integrated=float(re.search(r'I:\s*([-\d.]+) LUFS',summary)[1]);peak=float(re.search(r'Peak:\s*([-\d.]+) dBFS',summary)[1]);assert -17.2<integrated<-14.8 and peak<=-1.0,(integrated,peak)
 data=FILM.read_bytes();result={'status':'technical-pass','path':str(FILM),'bytes':len(data),'megabytes':round(len(data)/1e6,2),'sha256':hashlib.sha256(data).hexdigest(),'width':1920,'height':1080,'frames':3540,'fps':30,'duration':float(info['format']['duration']),'videoCodec':'h264','pixelFormat':'yuv420p','colorSpace':v.get('color_space'),'audioCodec':'aac','audioSampleRate':48000,'audioChannels':2,'fullDecode':'passed','unintendedBlackIntervals':events,'audio':{'integratedLUFS':integrated,'truePeakDbTP':peak},'sourceAssetsVerified':len(ledger['assets']),'actualGameplaySeconds':gameplay,'generatedCGSeconds':sum(s['duration'] for s in p['shots'] if s['type']=='cg'),'productionEvidenceSeconds':sum(s['duration'] for s in p['shots'] if s['type']=='evidence'),'captions':len(p['captions']),'narrationCues':len(p['voice']),'scope':'Technical file and ledger inspection. Does not substitute for subjective listening or full game QA.'}
 result['approvedV2Audio']='AAC bytes and decoded PCM SHA-256 identical';result['v2Preserved']=True
 (OUT/'final-technical-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
