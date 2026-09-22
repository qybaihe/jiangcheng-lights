"""Package only the completed, reviewed v2 master. Never overwrite the v1 package."""
from pathlib import Path
import hashlib,json,shutil,subprocess

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v2'
DEST=ROOT/'output/江城有灯-参赛片交付-v2'
FILM=OUT/'江城有灯-比赛Demo-1080p-v2.mp4'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tech=json.loads((OUT/'final-technical-acceptance.json').read_text())
assert tech['status']=='technical-pass' and tech['sha256']==sha(FILM)
mix=json.loads((OUT/'review/mix-actual-master-review.json').read_text())
task=json.loads((OUT/'review/task-route-actual-master-review.json').read_text())
assert mix['sourceSha256']==task['sourceSha256']==sha(FILM)
root_review=json.loads((OUT/'review/final-editorial-acceptance.json').read_text())
assert root_review['status']=='accepted' and root_review['sourceSha256']==sha(FILM)
v1=ROOT/'output/江城有灯-参赛片交付/江城有灯-参赛片-1080P.mp4'
assert sha(v1)=='b9e6d48efbd943284e66efa0e80f26b5b9615ae07fa27b10b6701b4475d8fdf5'
DEST.mkdir(parents=True,exist_ok=True)
target=DEST/'江城有灯-参赛片-第一人称故事版-1080P.mp4'
shutil.copy2(FILM,target)
assert sha(target)==tech['sha256']
for source,name in [
    (OUT/'参赛片-旁白字幕.srt','江城有灯-第一人称旁白字幕.srt'),
    (OUT/'参赛片-操作说明.srt','江城有灯-玩法说明.srt'),
    (OUT/'final-technical-acceptance.json','技术验收.json'),
    (OUT/'review/final-editorial-acceptance.json','视听验收.json')]:shutil.copy2(source,DEST/name)
subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-v','error','-ss','115','-i',str(target),'-frames:v','1','-q:v','2',str(DEST/'江城有灯-第一人称故事版封面.jpg')],check=True)
cues=json.loads((OUT/'narration/clips.json').read_text())['cues']
(DEST/'阿遥-第一人称旁白.md').write_text('# 阿遥 · 这一趟，不只是送东西\n\n'+'\n\n'.join(f'**{c["start"]:.1f} 秒**\n\n{c["text"]}' for c in cues)+'\n\n80 秒起保留小许的实机原声：\n\n> 到了，跟陈姐坐里面。饭也到了，周伯刚报了平安。\n\n101–109 秒为 AIGC 制作卡，只保留音乐。\n')
(DEST/'交付说明.md').write_text(f'''# 江城有灯 · 第一人称故事版 v2

主题：**这一趟，不只是送东西。**

- 时长：1 分 58 秒；1920×1080，30fps，MP4 H.264 / AAC 48k 立体声。
- 实际文件大小：{tech['megabytes']} MB。
- 全新阿遥第一人称旁白，从“我是阿遥”讲起；补足外公在姨妈家休养、托她送东西的缘由。
- 新增同一存档连续实机：借车、地图认路、骑行穿巷、停稳下车、步行进院、与林婆婆交谈并送回收音机。成片省去重复操作，不使用静止画面凑骑行。
- 保留修理与记忆解谜、蔡姨物资、驾车与划船、计时挑战、社区互助、去留选择、四结局画廊与 Seedance 片尾。
- 12 句旁白来自同一条新录音，不变速、不剪字；字幕按实际分句边界制作。保留小许完整实机回执原声。
- 101–109 秒制作卡只保留配乐；整体响度 {tech['audio']['integratedLUFS']} LUFS，真峰值 {tech['audio']['truePeakDbTP']} dBTP。

旁白与玩法说明已嵌入画面，另附 SRT。封面提取自本版最终 MP4 的第 115 秒。原 v1 交付包完整保留。

实机、剧情 CG、AIGC 制作记录分别标注；晴川里为武汉生活意象的虚构街区。自由探索为独立章节，不宣称整片是一次无剪辑通关。AI 用于素材与声音制作，不宣称实时 AI NPC。

已检查完整解码、3540 帧、字幕和配音边界、黑帧、响度及素材哈希；另完成最终实际音轨及新任务链的模型辅助视听检查、关键帧视觉复核。验收记录附于本目录，原始录制与工程保留在项目中。

SHA-256：`{tech['sha256']}`
''')
print(json.dumps({'delivered':str(target),'duration':tech['duration'],'megabytes':tech['megabytes'],'sha256':tech['sha256'],'v1Preserved':True},ensure_ascii=False))
