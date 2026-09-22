"""Package the offline storyboard and reviewed keyframes; no network or API calls."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/cinema'
PAIRS = [('c01', '江面归来', 6), ('c04', '一碗面的位置', 8), ('c09', '留一盏灯', 8)]

def frame_name(shot_id, endpoint):
    revision = 'v2' if (shot_id, endpoint) == ('c09', 'end') else 'v1'
    return f'cinema-{shot_id}-{endpoint}-{revision}'


def main():
    data = json.loads((ROOT / 'media/cinema/storyboard-v1.json').read_text())
    plan_path = ROOT / 'media/cinema/seedance-requests-v1.json'
    previous_plan = json.loads(plan_path.read_text()) if plan_path.exists() else {}
    previous_requests = {request['job_name']: request for request in previous_plan.get('requests', [])}
    assert len(data['shots']) == 10
    assert sum(shot['duration'] for shot in data['shots']) == data['totalSeconds'] == 78
    (OUT / 'frames').mkdir(parents=True, exist_ok=True)
    (OUT / 'prompts').mkdir(exist_ok=True)
    assets, requests = [], []
    for shot_id, title, target in PAIRS:
        for endpoint in ('start', 'end'):
            name = frame_name(shot_id, endpoint)
            png = ROOT / f'output/imagegen/{name}.png'
            with Image.open(png) as im:
                assert im.size == (2048, 1152), (name, im.size)
            webp = ROOT / f'public/media/{name}.webp'
            shutil.copy2(webp, OUT / 'frames' / webp.name)
            shutil.copy2(ROOT / f'media/prompts/{name}.txt', OUT / 'prompts' / f'{name}.txt')
            assets.append({'name': name, 'master': str(png.relative_to(ROOT)), 'width': 2048, 'height': 1152,
                           'sha256': hashlib.sha256(png.read_bytes()).hexdigest(),
                           'reference': f'output/imagegen/cinema-{shot_id}-start-v1.png' if endpoint == 'end' else None,
                           'local_correction': 'Original closed shutters composited from the first frame; see tools/retouch_cinema.py' if name.endswith('c09-end-v2') else None})
        name = f'cinema-{shot_id}-' + ('v2' if shot_id == 'c09' else 'v1')
        prompt = f'media/prompts/{name}-video.txt'
        shutil.copy2(ROOT / prompt, OUT / 'prompts' / Path(prompt).name)
        requests.append({'shot_id': shot_id.upper(), 'job_name': name, 'state': 'prepared_not_submitted',
            'prompt_path': prompt, 'first_frame': f'public/media/cinema-{shot_id}-start-v1.webp',
            'last_frame': f'public/media/{frame_name(shot_id, "end")}.webp',
            'generation_duration': 15, 'edit_target_duration': target, 'ratio': '16:9', 'resolution': '720p',
            'generate_audio': False, 'edit_rule': 'Complete the action within the edit target, then hold. Verify the result before trimming at original speed; no implied successful generation.',
            'command_preview': f'.venv/bin/python tools/media.py video {name} --first-frame public/media/cinema-{shot_id}-start-v1.webp --last-frame public/media/{frame_name(shot_id, "end")}.webp --duration 15 --resolution 720p --silent --dry-run'})
        for field in ['state', 'result', 'source_path', 'error_code', 'review']:
            if field in previous_requests.get(name, {}):requests[-1][field] = previous_requests[name][field]
    (OUT / 'frames/cinema-c09-end-v1.webp').unlink(missing_ok=True)
    shutil.copy2(ROOT / 'media/prompts/cinema-c09-end-v1.txt', OUT / 'prompts/cinema-c09-end-v1.txt')
    (OUT / 'manifest.js').write_text('window.CINEMA = ' + json.dumps(data, ensure_ascii=False, indent=2) + ';\n')
    (OUT / 'asset-manifest.json').write_text(json.dumps({'image_model': 'gpt-image-2', 'mode': 'installed imagegen CLI through existing project adapter', 'assets': assets}, ensure_ascii=False, indent=2))
    production = {'version': 1, 'status': previous_plan.get('status', 'prepared_not_submitted'), 'requests': requests,
                  'observed_existing_model': 'dreamina-seedance-2.0-260128',
                  'notes': '15s first/last-frame input has prior successful evidence, but these exact horizontal silent shots have not been submitted. Submit sequentially because the existing task ledger has no interprocess lock.'}
    if previous_plan.get('last_checked_at'):
        production.update(last_checked_at=previous_plan['last_checked_at'], notes=previous_plan.get('notes', production['notes']))
    (ROOT / 'media/cinema/seedance-requests-v1.json').write_text(json.dumps(production, ensure_ascii=False, indent=2))
    (OUT / 'seedance-requests-v1.json').write_text(json.dumps(production, ensure_ascii=False, indent=2))
    for name in ['剧情短片导演案.md', 'Seedance接口核对.md']:
        shutil.copy2(ROOT / 'docs' / name, OUT / name)

    font_path = '/System/Library/Fonts/PingFang.ttc'
    if not Path(font_path).exists():
        font_path = '/System/Library/Fonts/STHeiti Medium.ttc'
    title_font = ImageFont.truetype(font_path, 40)
    label_font = ImageFont.truetype(font_path, 24)
    small_font = ImageFont.truetype(font_path, 20)
    sheet = Image.new('RGB', (1640, 1648), '#102b28')
    draw = ImageDraw.Draw(sheet)
    draw.text((44, 28), '江城有灯 · 剧情短片首尾帧', font=title_font, fill='#f0e6ce')
    draw.text((46, 91), '78 秒 / 10 镜规划     3 组 2K 关键帧 · 静态画面，非视频成片', font=small_font, fill='#bfbcaa')
    for row, (shot_id, title, target) in enumerate(PAIRS):
        top = 152 + row * 486
        draw.text((44, top), f'{shot_id.upper()}   {title}   /   剪辑目标 {target} 秒', font=label_font, fill='#e4c287')
        for col, endpoint in enumerate(('start', 'end')):
            with Image.open(ROOT / f'output/imagegen/{frame_name(shot_id, endpoint)}.png') as im:
                thumb = im.convert('RGB').resize((768, 432), Image.Resampling.LANCZOS)
            x = 44 + col * 784
            sheet.paste(thumb, (x, top + 38))
            draw.rectangle((x+12,top+50,x+84,top+83),fill='#15322d')
            draw.text((x+23,top+52), '首帧' if col == 0 else '尾帧', font=small_font, fill='#f0e6ce')
    sheet.save(OUT / 'keyframes-contact-sheet.jpg', quality=94)
    print('Packaged 6 keyframes, 10 shots / 78 seconds; video state:', production['status'])


if __name__ == '__main__':
    main()
