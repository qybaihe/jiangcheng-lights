"""Finish the explicit hard-subtitle revision without altering its soundtrack."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/demo-film-v4'
PREVIOUS = ROOT / 'output/demo-film-v3/江城有灯-比赛Demo-1080p-v3.mp4'
RENDER = OUT / '江城有灯-比赛Demo-1080p-v4-render.mp4'
FINAL = OUT / '江城有灯-比赛Demo-1080p-v4.mp4'
DEST = ROOT / 'output/江城有灯-参赛片交付-v4-大字硬字幕版'
FF = '/opt/homebrew/bin/ffmpeg'
FP = '/opt/homebrew/bin/ffprobe'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def audio_hash(path, copy):
    args = [FF, '-v', 'error', '-i', str(path), '-map', '0:a:0']
    args += ['-c:a', 'copy'] if copy else ['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2']
    return run(args + ['-f', 'hash', '-hash', 'sha256', '-']).stdout.strip()


def check_preservation():
    for item in json.loads((OUT / 'preserved-v3-baseline.json').read_text())['paths']:
        assert sha(ROOT / item['path']) == item['sha256'], item['path']
    old = json.loads((ROOT / 'output/demo-film-v3/final-props.json').read_text())
    new = json.loads((OUT / 'final-props.json').read_text())
    for key in ['shots', 'captions', 'voice', 'sounds', 'music', 'effects', 'lockedMix', 'duration']:
        assert old[key] == new[key], f'Unexpected {key} change'
    assert len(new['captions']) == 28 and new['duration'] == 118
    return new


def master():
    check_preservation()
    result = run([FF, '-y', '-hide_banner', '-nostats', '-i', str(RENDER), '-i', str(PREVIOUS),
                  '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart',
                  '-metadata', 'title=江城有灯｜参赛片｜大字硬字幕版',
                  '-metadata', 'comment=48px中文字幕直接烧录；原完整声轨保持不变。', str(FINAL)])
    (OUT / 'master.log').write_text(result.stderr)
    checks = {}
    for name, copy in [('aacPackets', True), ('decodedPCM', False)]:
        a, b = audio_hash(PREVIOUS, copy), audio_hash(FINAL, copy)
        assert a == b, name
        checks[name] = {'equal': True, 'sha256': a}
    def timing(path):
        value = json.loads(run([FP, '-v', 'error', '-select_streams', 'a:0', '-show_packets',
                               '-show_entries', 'packet=pts,dts,duration,size,flags,side_data_list',
                               '-of', 'json', str(path)]).stdout)['packets']
        return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    assert timing(PREVIOUS) == timing(FINAL)
    dump(OUT / 'audio-preservation.json', {'sourceSha256': sha(PREVIOUS), 'source': str(PREVIOUS),
         'finalSha256': sha(FINAL), 'checks': checks, 'packetTimingIdentical': True,
         'method': 'Direct stream copy of the approved v3 complete AAC; no new mix or voice generation.'})
    print(str(FINAL))


def verify():
    from PIL import Image, ImageDraw
    import numpy as np
    props = check_preservation()
    info = json.loads(run([FP, '-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', str(FINAL)]).stdout)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['codec_name'] == 'h264' and video['pix_fmt'] == 'yuv420p'
    assert video['color_space'] == 'bt709' and video['avg_frame_rate'] == '30/1'
    assert int(video['nb_read_frames']) == 3540
    assert audio['codec_name'] == 'aac' and audio['sample_rate'] == '48000' and audio['channels'] == 2
    assert 118 <= float(info['format']['duration']) < 118.1
    assert FINAL.stat().st_size < 500_000_000
    assert not run([FF, '-v', 'error', '-xerror', '-i', str(FINAL), '-f', 'null', '-']).stderr.strip()
    black = run([FF, '-hide_banner', '-nostats', '-i', str(FINAL), '-an', '-vf',
                 'blackdetect=d=0.07:pix_th=0.05:pic_th=0.98', '-f', 'null', '-']).stderr
    (OUT / 'black-frames.log').write_text(black)
    assert not re.findall(r'black_start:[^\n]+', black)
    loud = run([FF, '-hide_banner', '-nostats', '-i', str(FINAL), '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
    (OUT / 'loudness.log').write_text(loud)
    summary = loud.split('Summary:')[-1]
    integrated = float(re.search(r'I:\s*([-\d.]+) LUFS', summary)[1])
    peak = float(re.search(r'Peak:\s*([-\d.]+) dBFS', summary)[1])
    assert -17.2 < integrated < -14.8 and peak <= -1
    samples = OUT / 'review/actual-subtitles'
    samples.mkdir(parents=True, exist_ok=True)
    contact = Image.new('RGB', (1600, 14 * 88), '#102924')
    draw = ImageDraw.Draw(contact)
    captions = []
    for index, cue in enumerate(props['captions']):
        if index:
            previous = props['captions'][index - 1]
            assert previous['from'] + previous['duration'] <= cue['from'] + .002
        midpoint = (round(cue['from'] * 30) + round((cue['from'] + cue['duration']) * 30)) // 2 / 30
        frame = samples / f'{index + 1:02d}-{midpoint:06.2f}s.png'
        run([FF, '-y', '-v', 'error', '-ss', str(midpoint), '-i', str(FINAL), '-frames:v', '1', str(frame)])
        img = Image.open(frame).convert('RGB')
        band = img.crop((84, 930, 1836, 1002))
        pixels = np.array(band)
        glyph = (pixels[:, :, 0] > 225) & (pixels[:, :, 1] > 220) & (pixels[:, :, 2] > 195)
        yy, xx = np.where(glyph)
        assert len(xx) > 500, f'Caption not visibly burned in at cue {index + 1}'
        bounds = [int(xx.min()) + 84, int(yy.min()) + 930, int(xx.max()) + 84, int(yy.max()) + 930]
        assert bounds[0] > 84 and bounds[2] < 1836 and bounds[3] <= 1000
        band.resize((800, 33), Image.Resampling.LANCZOS).save(samples / f'{index + 1:02d}-band.png')
        x, y = index % 2 * 800, index // 2 * 88
        draw.text((x + 12, y + 6), f'ACTUAL MP4 / CUE {index + 1:02d} / {midpoint:.2f}s', fill='#e3cc8f')
        contact.paste(band.resize((800, 33), Image.Resampling.LANCZOS), (x, y + 28))
        captions.append({'cue': index + 1, 'text': cue['text'], 'from': cue['from'], 'duration': cue['duration'],
                         'sampleTime': midpoint, 'brightTextPixels': len(xx), 'textBounds': bounds,
                         'actualDecodedFrame': str(frame.relative_to(ROOT))})
    contact.save(OUT / 'review/actual-28-subtitles.jpg', quality=95)
    result = {'status': 'technical-pass', 'sha256': sha(FINAL), 'path': str(FINAL),
              'duration': float(info['format']['duration']), 'width': 1920, 'height': 1080, 'fps': 30, 'frames': 3540,
              'megabytes': round(FINAL.stat().st_size / 1e6, 2), 'fullDecode': 'passed', 'blackIntervals': [],
              'audio': {'integratedLUFS': integrated, 'truePeakDbTP': peak},
              'captions': 28, 'delivery': 'Burned-in text, no external subtitle file or player CC switch needed.',
              'subtitleDesign': {'fontPx': 48, 'bottomSafeMarginPx': 80, 'darkPlate': True, 'gameFrameBounds': [176, 42, 1744, 924]},
              'captionSamples': captions, 'v3Preserved': True, 'shotAndSoundTimingUnchanged': True,
              'scope': 'Full technical verification plus actual-file glyph-presence checks on all 28 cues. Visual proofreading remains a separate gate.'}
    dump(OUT / 'technical-acceptance.json', result)
    print(json.dumps({k: v for k, v in result.items() if k != 'captionSamples'}, ensure_ascii=False))


def package():
    tech = json.loads((OUT / 'technical-acceptance.json').read_text())
    review = json.loads((OUT / 'review/final-editorial-acceptance.json').read_text())
    assert tech['status'] == 'technical-pass' and review['status'] == 'accepted'
    assert tech['sha256'] == review['sourceSha256'] == sha(FINAL)
    check_preservation()
    DEST.mkdir(exist_ok=True)
    target = DEST / '江城有灯-参赛片-大字硬字幕版-1080P.mp4'
    shutil.copy2(FINAL, target)
    assert sha(target) == tech['sha256']
    for source, name in [('参赛片-旁白字幕.srt', '江城有灯-完整中文字幕.srt'),
                         ('参赛片-操作说明.srt', '江城有灯-玩法说明.srt'),
                         ('technical-acceptance.json', '技术与字幕验收.json'),
                         ('audio-preservation.json', '配音一致性核验.json'),
                         ('review/final-editorial-acceptance.json', '最终画面复核.json')]:
        shutil.copy2(OUT / source, DEST / name)
    run([FF, '-y', '-v', 'error', '-ss', '115', '-i', str(target), '-frames:v', '1', '-q:v', '2', str(DEST / '参赛片封面.jpg')])
    highlights = ROOT / 'output/江城有灯-游戏亮点-参赛提交.md'
    if highlights.exists():
        shutil.copy2(highlights, DEST / highlights.name)
    (DEST / '提交说明.md').write_text(f'''# 江城有灯 · 大字硬字幕版 v4

提交此目录的 **江城有灯-参赛片-大字硬字幕版-1080P.mp4**。

- 1 分 58 秒，1920×1080，30fps，H.264 / AAC；{tech['megabytes']} MB。
- 28 条旁白与关键对白字幕已直接烧录进画面，48px 大字、深色底板、距底部80px安全区。无须导入 SRT 或打开播放器字幕开关。
- 小许的完整平安回执也有字幕。玩法说明仍保留在画面上方；实机窗口等比缩放，字幕不盖游戏对话框。
- 同时附上可编辑 SRT。不要再叠加一遍外置字幕，以免重复。
- 片长、全部镜头和原配音/配乐/音效时间不变；AAC 字节、解码音频和包时间戳核验一致。
- 已从最终 MP4 解码检查28条字幕，并复核缩小预览、最长句、CG和实机画面。此前v3完整保留。

游戏正式体验地址：https://jcyd.classby.cn/

视频 SHA-256：`{tech['sha256']}`
''')
    print(str(target))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['master', 'verify', 'package'])
    args = parser.parse_args()
    {'master': master, 'verify': verify, 'package': package}[args.mode]()
