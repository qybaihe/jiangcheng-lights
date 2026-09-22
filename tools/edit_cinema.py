"""Package real generated sources and an original-speed three-shot review reel."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/cinema'


def ffprobe(path):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))


def run(args):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*args],check=True)


def main():
    edit=json.loads((ROOT/'media/cinema/edit-decisions-v1.json').read_text())
    if edit['status']!='reviewed':raise RuntimeError('Review generated motion and confirm edit decisions before packaging')
    (OUT/'videos').mkdir(exist_ok=True)
    (OUT/'posters').mkdir(exist_ok=True)
    clips=[];cuts=[];checks=[]
    for item in edit['clips']:
        name=item['job_name'];src=ROOT/'public/media'/f'{name}.mp4'
        info=ffprobe(src);stream=next(s for s in info['streams'] if s['codec_type']=='video')
        source_duration=float(stream.get('duration',info['format']['duration']))
        if not 0<=item['start']<source_duration or item['start']+item['duration']>source_duration+.05:
            raise RuntimeError('Selected edit exceeds actual source length')
        if (stream['width'],stream['height'],stream['avg_frame_rate'])!=(1280,720,'24/1'):
            raise RuntimeError('Unexpected source format; inspect before editing')
        target=OUT/'videos'/src.name;shutil.copy2(src,target)
        cut=OUT/'videos'/f'{name}-cut.mp4'
        run(['-ss',str(item['start']),'-i',str(src),'-t',str(item['duration']),'-map','0:v:0','-an','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(cut)])
        poster=OUT/'posters'/f'{name}.jpg'
        run(['-ss',str(item['start']),'-i',str(src),'-frames:v','1','-q:v','2',str(poster)])
        checks.append({'id':item['id'],'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'source_duration':source_duration,'edit_start':item['start'],'edit_duration':item['duration'],'speed':1,'cut_sha256':hashlib.sha256(cut.read_bytes()).hexdigest(),'audio':'silent_visual_master'})
        notes=item.get('notes','')+f' 合辑使用原片 {item["start"]:g}–{item["start"]+item["duration"]:g} 秒，保持原速。'
        clips.append({'id':item['id'],'title':item['title'],'src':f'videos/{cut.name}','poster':f'posters/{name}.jpg','duration':item['duration'],'label':'Seedance 2.0 · 720p / 24 fps · 无声画面版','status':'ready','notes':notes,'sourceDuration':round(source_duration,2)})
        cuts.append(cut)
    concat=ROOT/'tmp/cinema-concat.txt';concat.parent.mkdir(exist_ok=True)
    concat.write_text(''.join("file '"+str(path).replace("'","'\\''")+"'\n" for path in cuts))
    reel=OUT/'videos/jiangcheng-three-shots-v1.mp4'
    run(['-f','concat','-safe','0','-i',str(concat),'-map','0:v:0','-an','-c','copy','-movflags','+faststart',str(reel)])
    reel_info=ffprobe(reel);duration=float(reel_info['format']['duration'])
    expected=sum(c['duration'] for c in edit['clips'])
    if abs(duration-expected)>.1:raise RuntimeError('Unexpected reel duration')
    video_data={'status':'ready','title':'把停顿剪短，让故事向前','summary':'三镜已按动作重新剪辑：江面建立武汉，热面落到街坊，灯亮简短收尾。以下均为原速、无声的节奏样片；现有画面沿用旧版写实绘画风，明亮动漫风尚待统一。','clips':clips,
        'reel':{'src':'videos/'+reel.name,'poster':clips[0]['poster'],'duration':round(duration,2),'label':'三镜原速剪辑 · 无声画面版 · 720p / 24 fps','title':edit['reel_name'],'notes':'从轮渡上的归来，到小院里的一碗面，再到雨后亮起的灯。只保留动作有变化的区段，亮灯不再占满生成素材。旧版 78 秒、10 镜方案待重编，完整影片尚未完成。'}}
    (OUT/'videos.js').write_text('window.CINEMA_VIDEOS = '+json.dumps(video_data,ensure_ascii=False,indent=2)+';\n')
    (OUT/'video-delivery.json').write_text(json.dumps({'clips':checks,'reel':{'path':str(reel.relative_to(ROOT)),'duration':duration,'sha256':hashlib.sha256(reel.read_bytes()).hexdigest()},'generated_video':True,'complete_film':False,'storyboard_status':'previous_78s_draft_to_be_revised','art_direction':'previous_painterly_style_pending_bright_anime_revision'},ensure_ascii=False,indent=2))
    print(f'Packaged 3 real video sources and {duration:g}-second original-speed reel.')


if __name__=='__main__':main()
