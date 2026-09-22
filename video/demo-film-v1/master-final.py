"""Two-pass dialogue-forward final audio mastering; stream-copy the reviewed video."""
from pathlib import Path
import json, subprocess, re, sys
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v1'
SOURCE=OUT/'江城有灯-比赛Demo-1080p-v1-render.mp4'
TARGET=OUT/'江城有灯-比赛Demo-1080p-v1.mp4'
FF='/opt/homebrew/bin/ffmpeg'
AUDIO=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else SOURCE
first=subprocess.run([FF,'-hide_banner','-nostats','-i',str(AUDIO),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],check=True,capture_output=True,text=True)
(OUT/'final-master-pass1.log').write_text(first.stderr)
measure=json.loads(re.findall(r'\{\s*"input_i".*?\}',first.stderr,re.S)[-1])
af='loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true:print_format=json,aresample=48000'.format(**measure)
second=subprocess.run([FF,'-y','-hide_banner','-nostats','-i',str(SOURCE),'-i',str(AUDIO),'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',af,'-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t','118','-movflags','+faststart','-metadata','title=江城有灯｜这一趟，不只是送东西。','-metadata','comment=118秒参赛片。实机录制与AIGC剧情在画面中分别标注。',str(TARGET)],check=True,capture_output=True,text=True)
(OUT/'final-master-pass2.log').write_text(second.stderr)
(OUT/'final-audio-master.json').write_text(json.dumps({'source':str(SOURCE),'audioSource':str(AUDIO),'target':str(TARGET),'pass1':measure,'video':'stream copy, no recompression','audioTarget':{'LUFS':-16,'truePeak':-1.5,'LRA':11}},ensure_ascii=False,indent=2)+'\n')
print(TARGET)
