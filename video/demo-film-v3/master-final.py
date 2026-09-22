"""Mux the v3 picture with the exact approved v2 AAC stream; never re-master audio."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v3'
SOURCE=OUT/'江城有灯-比赛Demo-1080p-v3-render.mp4'
AUDIO=ROOT/'output/demo-film-v2/江城有灯-比赛Demo-1080p-v2.mp4'
TARGET=OUT/'江城有灯-比赛Demo-1080p-v3.mp4'
FF='/opt/homebrew/bin/ffmpeg'
FP='/opt/homebrew/bin/ffprobe'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def audio_hash(p, mode):
    args=([FF,'-v','error','-i',str(p),'-map','0:a:0','-vn','-c:a','copy','-f','adts','-'] if mode=='aac' else [FF,'-v','error','-i',str(p),'-map','0:a:0','-vn','-acodec','pcm_s16le','-ar','48000','-ac','2','-f','s16le','-'])
    data=subprocess.run(args,check=True,capture_output=True).stdout
    return {'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
assert sha(AUDIO)=='3a64249377d2663f55300f9e7bf21f9560cb44b0bc360683ce97768ab13a8b80', 'The approved v2 source changed; review before replacing it.'
result=subprocess.run([FF,'-y','-hide_banner','-nostats','-i',str(SOURCE),'-i',str(AUDIO),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-movflags','+faststart','-metadata','title=江城有灯｜这一趟，不只是送东西。','-metadata','comment=118秒参赛片v3。新玩法实机精华；v2已验收完整音轨原样保留。',str(TARGET)],check=True,capture_output=True,text=True)
(OUT/'final-master.log').write_text(result.stderr)
checks={mode:{'original':audio_hash(AUDIO,mode),'final':audio_hash(TARGET,mode)} for mode in ('aac','pcm')}
def packet_timing(path):
    result=subprocess.run([FP,'-v','error','-select_streams','a:0','-show_packets','-show_entries','packet=pts,dts,duration,size,flags,side_data_list','-of','json',str(path)],check=True,capture_output=True,text=True)
    packets=json.loads(result.stdout)['packets']
    raw=json.dumps(packets,sort_keys=True,separators=(',',':')).encode()
    return {'sha256':hashlib.sha256(raw).hexdigest(),'packets':len(packets),'firstPTS':packets[0].get('pts'),'lastPTS':packets[-1].get('pts')}
checks['packetTiming']={'original':packet_timing(AUDIO),'final':packet_timing(TARGET)}
for check in checks.values(): assert check['original']==check['final'], 'The final audio differs from the approved v2 audio.'
old=json.loads((ROOT/'output/demo-film-v2/edit-decision.json').read_text())
new=json.loads((OUT/'edit-decision.json').read_text())
assert old['voice']==new['voice'] and old['captions']==new['captions']
voices=[{**v,'sha256':sha(ROOT/v['src'])} for v in new['voice']]
doc={'status':'bitstream-and-decoded-pcm-identical','source':str(AUDIO),'sourceSha256':sha(AUDIO),'target':str(TARGET),'targetSha256':sha(TARGET),'method':'Direct AAC stream copy from v2 final; no gain, EQ, time stretch, noise removal, new voice or re-encoding. Picture is stream-copied from Remotion v3 render.','audioChecks':checks,'narrationSourcesAndTimingIdentical':True,'spokenCaptionsIdentical':True,'narrationCues':voices,'nativeCharacterDialogue':'Original complete Xiao Xu receipt remains at 80 seconds in the unchanged soundtrack.','newCaptureAudio':'Muted in the edit; no added narrator or dialogue track.'}
(OUT/'final-audio-master.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'target':str(TARGET),'checks':checks},ensure_ascii=False))
