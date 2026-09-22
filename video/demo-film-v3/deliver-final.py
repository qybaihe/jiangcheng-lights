"""Package a completed v3 master only after independent final review approval."""
from pathlib import Path
import hashlib,json,shutil,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/demo-film-v3'
DEST=ROOT/'output/江城有灯-参赛片交付-v3'
FILM=OUT/'江城有灯-比赛Demo-1080p-v3.mp4'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
tech=json.loads((OUT/'final-technical-acceptance.json').read_text())
assert tech['status']=='technical-pass' and tech['sha256']==sha(FILM)
audio=json.loads((OUT/'final-audio-master.json').read_text())
assert audio['status']=='bitstream-and-decoded-pcm-identical' and audio['targetSha256']==sha(FILM)
review=json.loads((OUT/'review/final-editorial-acceptance.json').read_text())
assert review['status']=='accepted' and review['sourceSha256']==sha(FILM), 'Independent final review is required.'
for baseline in json.loads((OUT/'preserved-v2-baseline.json').read_text())['paths']:
 assert sha(ROOT/baseline['path'])==baseline['sha256']
DEST.mkdir(parents=True,exist_ok=True)
target=DEST/'江城有灯-参赛片-新玩法精华版-1080P.mp4'
shutil.copy2(FILM,target)
assert sha(target)==tech['sha256']
for source,name in [
 (OUT/'参赛片-旁白字幕.srt','江城有灯-第一人称旁白字幕.srt'),
 (OUT/'参赛片-操作说明.srt','江城有灯-玩法说明.srt'),
 (OUT/'final-technical-acceptance.json','技术验收.json'),
 (OUT/'final-audio-master.json','配音一致性核验.json'),
 (OUT/'review/final-editorial-acceptance.json','视听验收.json'),
 (OUT/'edit-decision.json','剪辑决策.json')]:shutil.copy2(source,DEST/name)
subprocess.run(['/opt/homebrew/bin/ffmpeg','-y','-v','error','-ss','115','-i',str(target),'-frames:v','1','-q:v','2',str(DEST/'江城有灯-新玩法精华版封面.jpg')],check=True)
(DEST/'交付说明.md').write_text(f'''# 江城有灯 · 新玩法精华版 v3

主题：**这一趟，不只是送东西。**

本版在已认可的 v2 第一人称故事版上轻量换镜，不重写剧情、不更换音色。

- 主文件：江城有灯-参赛片-新玩法精华版-1080P.mp4
- 时长：1 分 58 秒；1920×1080，30fps，MP4 H.264 / AAC 48kHz 双声道。
- 实际大小：{tech['megabytes']} MB；满足两分钟内、1080P 及以上、推荐 500MB 内的要求。
- 新增实机精华：按口味分装热食、3D 旧照对景、携带餐盒送到街坊身边。
- 保留：骑车找人完整短链路、武汉意象、开车、划船与计时、风险上报、社区回执、四结局与画廊、AIGC 记录、Seedance 首尾 CG。
- 声音：完整复制 v2 已验收 AAC 声轨，12 段“我是阿遥”旁白、角色回执、音乐与音效均保持原时位；压缩字节及解码 PCM 的 SHA-256 均一致。
- 实测音频：{tech['audio']['integratedLUFS']} LUFS；真峰值 {tech['audio']['truePeakDbTP']} dBTP。
- 旁白和玩法说明已嵌入画面，同时提供可编辑 SRT。

实机、剧情 CG 与 AIGC 制作记录分别标注。晴川里为武汉生活意象的虚构街区；展示采用剪辑，不宣称所有功能来自一次无剪辑通关。

技术核验、音轨一致性核验及独立最终视听验收随包附上。Remotion 分层工程在 `video/demo-film-v3/`，原始新录制、源时码和素材证据在 `output/demo-film-v3/`。v1、v2 交付包原样保留。

SHA-256：`{tech['sha256']}`
''')
print(json.dumps({'delivered':str(target),'duration':tech['duration'],'megabytes':tech['megabytes'],'sha256':tech['sha256'],'v2Preserved':True},ensure_ascii=False))
