"""Generate and publish story music/SFX through the project's existing audio API.

The upstream accepts a prompt only. Requested duration and instrumentation are
directions, not API guarantees; measured output is always recorded separately.
No credentials are read, printed, or sent by this existing endpoint contract.
"""
from __future__ import annotations

import argparse
import array
import base64
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'output/story-audio/sources'
PUBLIC_DIR = ROOT / 'public/media/audio'
MANIFEST = ROOT / 'public/media/story-music-manifest.json'
API_URL = 'https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio'


def save_manifest(manifest: dict) -> None:
    manifest['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    temp = MANIFEST.with_suffix('.json.tmp')
    temp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    temp.replace(MANIFEST)

MUSIC_COMMON = (
    '制作一首真正连续发展、完整72秒的原创器乐游戏配乐，立体声、高保真录音。'
    '这是武汉老巷温暖群像游戏《江城有灯》的背景音乐。只输出音乐，绝对没有人声、'
    '说话、唱歌、哼唱、合唱、拟声口号或可辨歌词，不要朗读这份制作说明。'
    '旋律亲切但不煽情，保留对话频段空间，低密度、无突发重击、无广告或片头感。'
    '整首持续72秒，四段各18秒自然展开，不能只做10秒短音型重复。'
    '开头直接轻轻进入音乐，没有长空白；结尾维持同一调性、节奏与底层音色，'
    '可回接开头，不要终止式大收尾或淡出静音。不要环境音、雨声、脚步或音效。'
)

SPECS = {
    'explore': {
        'kind': 'bgm', 'title': '江风里的慢步', 'target': 72, 'trimEnd': 3,
        'prompt': MUSIC_COMMON +
        '主色彩是明亮清澈的午后武汉：芝麻酱香、潮润红砖、江面微光。'
        '固定音色：温暖原声钢琴为主，少量尼龙弦吉他拨弦，极轻木质打击，'
        '低音提琴少量长音，细而不甜腻的弦乐长音。不用合成器琶音，不用笛子独奏。'
        'D大调，72 BPM，4/4，松弛行走，音量和速度全程平稳。'
        '0至18秒：钢琴三四个音的轻巧问句与留白，吉他低声回应。'
        '18至36秒：保持同一动机，加入宽阔温柔的和声，音乐像拐进另一条小巷。'
        '36至54秒：钢琴中低区变奏，木质打击稍隐退，旋律仍轻盈明亮。'
        '54至72秒：首段动机有新变化地回归，最后落在适合继续行走的开放和声。',
    },
    'memory': {
        'kind': 'bgm', 'title': '有人替你留一碗', 'target': 72,
        'prompt': MUSIC_COMMON +
        '情绪是一个人发现小时候被街坊细心照顾过，温暖、克制、亲密、平静而不悲伤。'
        '固定音色：柔软原声钢琴中区为中心，轻柔大提琴长音与拨奏低音，'
        '少量尼龙弦吉他触弦质感，极薄弦乐。无鼓组，无史诗铜管，无催泪独奏。'
        'G大调带少量大六度和九度色彩，64 BPM，4/4。'
        '0至18秒：钢琴两个很轻的问句，音与音之间有安静空间，低音温暖支撑。'
        '18至36秒：大提琴加入温柔简短回应，不压过将来人物对白，保留呼吸。'
        '36至54秒：钢琴旋律换一个方向，和声像把一只碗转到对方面前。'
        '54至72秒：钢琴和大提琴共同回到起始温度，留有未讲完的一句话，平稳回接开头。',
    },
    'ending': {
        'kind': 'bgm', 'title': '灯下还有一个位置', 'target': 72,
        'prompt': MUSIC_COMMON +
        '情绪是雨夜回到亮着灯的家，听到健在的外公发来语音，理解自己从来不是一个人。'
        '温暖开阔、舒展、释然、希望，不能悲壮、诀别、追悼、哭泣或胜利凯旋。'
        '固定且唯一的编制是：真实原声三角钢琴、小提琴、中提琴、大提琴、低音提琴。'
        '钢琴必须清晰可辨且始终是主奏，弦乐拉奏的弓弦质感必须可辨，不能用合成器铺底替代。'
        '绝对不要吉他、电子琴、合成器、沙锤、鼓、钹、合唱、音墙或预告片上升音。'
        'D大调，68 BPM，4/4，空间比探索段开阔，动态只小幅渐宽。'
        '0至18秒：亲密钢琴旋律，从两个熟悉的短动机开始，有人回到桌边坐下。'
        '18至36秒：弦乐轻轻向两边展开，和声更明亮，旋律仍能在日常对白下存在。'
        '36至54秒：新的温柔回答句，不提高速度，不堆叠乐器，只让低音更安稳。'
        '54至72秒：回到首段音型，保留开阔的和声与清晰钢琴，仿佛明早还会一起过早，适合循环。',
    },
    'rain': {
        'kind': 'sfx', 'title': '檐外的小雨', 'target': 12, 'loop': True,
        'prompt': '生成12秒连续立体声纯环境音：从安全干燥的武汉老街屋内听到檐外温和小雨。'
        '细密轻雨落在旧瓦檐与石板，远一点的水滴，干净自然、柔和宽阔、层次稳定。'
        '全程没有说话、音乐、雷声、警笛、人群、洪水、风暴、脚步。'
        '没有开头或结尾的音效提示，没有淡出或静音。雨声连贯、适合自然循环。只输出环境音。',
    },
    'page': {
        'kind': 'sfx', 'title': '翻过一页旧相册', 'target': 4, 'loop': False,
        'trimStart': 1.35, 'trimEnd': 1.45,
        'prompt': '生成4秒近距离真实拟音：安静屋内，一只手轻轻翻过一页厚纸旧相册。'
        '开始留0.3秒安静，然后柔软纸边摩擦、一次清楚但轻柔的翻页，手掌把纸压平，之后安静。'
        '只有一次翻页，不连续重复，不用力撕纸，没有人声、呼吸声、音乐、铃声或任何其他音效。'
        '录音干净，细腻克制，峰值不尖锐，适合作为游戏阅读动作的短音效。只输出该音效。',
    },
    'radio': {
        'kind': 'sfx', 'title': '收音机旋钮的轻轻一格', 'target': 3, 'loop': False,
        'trimStart': 0.2, 'trimEnd': 2.1,
        'prompt': 'Create exactly 3 seconds of isolated close-up mechanical foley. '
        'A small vintage radio rotary power knob makes a crisp but quiet plastic-and-metal '
        'detent click at 0.15 seconds, then a second small dry mechanical click at 1.2 seconds. '
        'The two tiny clicks must clearly sound like a physical rotary switch, never a mouth. '
        'No radio static, hiss, wind, breaths, sniffles, mouth sounds, speech, singing, music, '
        'tones, reverberation or other effects. The background is silent. '
        'Do not read these directions aloud. Output only the two quiet mechanical switch clicks.',
    },
}


def run(args: list[str]) -> str:
    completed = subprocess.run(args, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed: {completed.stderr[-1200:]}')
    return completed.stdout + completed.stderr


def probe(path: Path) -> dict:
    result = json.loads(run(['ffprobe', '-v', 'error', '-show_entries',
                             'format=duration,size:stream=codec_name,sample_rate,channels',
                             '-of', 'json', str(path)]))
    return {'duration': float(result['format']['duration']),
            'bytes': int(result['format']['size']), **result['streams'][0]}


def loudness(path: Path, target: float = -23) -> dict:
    result = run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
                  f'loudnorm=I={target}:LRA=9:TP=-3:print_format=json', '-f', 'null', '-'])
    matches = re.findall(r'\{\s*"input_i".*?\}', result, flags=re.S)
    if not matches:
        raise RuntimeError('ffmpeg did not report loudness')
    stats = json.loads(matches[-1])
    return {key: float(value) for key, value in stats.items()
            if key != 'normalization_type'}


def signal_quality(path: Path) -> dict:
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ar', '48000',
                              '-ac', '2', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    samples = array.array('f')
    samples.frombytes(decoded)
    if sys.byteorder != 'little':
        samples.byteswap()
    peak = max(abs(value) for value in samples)
    boundary_step = max(abs(samples[channel] - samples[-2 + channel]) for channel in range(2))
    silence_log = run(['ffmpeg', '-hide_banner', '-i', str(path), '-af',
                       'silencedetect=noise=-55dB:d=0.4', '-f', 'null', '-'])
    silences = [{'event': event, 'seconds': float(value)} for event, value in
                re.findall(r'(silence_start|silence_end):\s*([\d.]+)', silence_log)]
    return {'decodedDuration': round(len(samples) / 2 / 48000, 6),
            'clippedSampleCount': sum(abs(value) >= 0.999 for value in samples),
            'samplePeakDbFS': round(20 * math.log10(max(peak, 1e-10)), 2),
            'loopBoundaryStepDbFS': round(20 * math.log10(max(boundary_step, 1e-10)), 2),
            'silenceEventsBelowMinus55dB': silences}


def generate(cue: str, version: str = 'v1') -> dict:
    spec = SPECS[cue]
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    path = SOURCE_DIR / f'{cue}-{version}.wav'
    meta_path = path.with_suffix('.json')
    prompt = spec['prompt']
    request_hash = hashlib.sha256(prompt.encode()).hexdigest()
    if path.exists():
        if not meta_path.exists() or json.loads(meta_path.read_text()).get('requestSha256') != request_hash:
            raise RuntimeError('Existing source is not the same request; choose another version')
        print(json.dumps({'event': 'source-reused', 'cue': cue, **probe(path)}, ensure_ascii=False), flush=True)
        return json.loads(meta_path.read_text())
    (SOURCE_DIR / f'{cue}-{version}-prompt.txt').write_text(prompt)
    payload = json.dumps({'prompt': prompt}, ensure_ascii=False).encode()
    print(json.dumps({'event': 'request-started', 'cue': cue, 'targetDuration': spec['target'],
                      'requestSha256': request_hash}, ensure_ascii=False), flush=True)
    started = time.monotonic()
    request = Request(API_URL, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    with urlopen(request, timeout=420) as response:
        result = json.load(response)
    if not isinstance(result, dict):
        raise RuntimeError('Audio response is not an object')
    if result.get('base_resp', {}).get('code') not in (None, 0):
        raise RuntimeError(f"Audio service failed with code {result.get('base_resp', {}).get('code')}")
    if str(result.get('output_format') or 'wav').lower() not in ('wav', 'wave'):
        raise RuntimeError('Audio response is not WAV')
    raw = base64.b64decode(result.get('audio_base64', ''), validate=True)
    if not raw.startswith((b'RIFF', b'RF64')):
        raise RuntimeError('Invalid WAV header')
    path.write_bytes(raw)
    metadata = {'cue': cue, 'title': spec['title'], 'kind': spec['kind'],
                'provider': 'text_to_audio', 'model': 'not exposed by endpoint',
                'requestedDuration': spec['target'], 'requestSha256': request_hash,
                'sourceSha256': hashlib.sha256(raw).hexdigest(),
                'sourcePath': str(path.relative_to(ROOT)),
                'requestSeconds': round(time.monotonic() - started, 2),
                'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'measured': probe(path)}
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'event': 'source-ready', **metadata}, ensure_ascii=False), flush=True)
    return metadata


def publish(cue: str, version: str = 'v1') -> dict:
    spec = SPECS[cue]
    source = SOURCE_DIR / f'{cue}-{version}.wav'
    metadata = json.loads(source.with_suffix('.json').read_text())
    listening_path = ROOT / 'output/story-audio/qa' / f'{cue}-{version}-listening.json'
    if not listening_path.exists():
        raise RuntimeError('Run story_music_qa.py for the full source before publishing')
    listening = json.loads(listening_path.read_text())['observation']
    if listening.get('humanSpeechOrSinging') is not False or listening.get('vocalEvidence'):
        raise RuntimeError('Source has unapproved or unverified voices')
    if spec['kind'] == 'bgm' and listening.get('instrumentalMusic') is not True:
        raise RuntimeError('Source is not verified instrumental music')
    generated_duration = probe(source)['duration']
    trim_start = spec.get('trimStart', 0)
    trim_end = spec.get('trimEnd', 0)
    effective_end = generated_duration - trim_end
    duration = effective_end - trim_start
    if spec['kind'] == 'bgm' and duration < 60:
        raise RuntimeError(f'Refusing to publish {duration:.2f}s as a full-length music cue')
    loop = spec.get('loop', spec['kind'] == 'bgm')
    seam = 1.5 if loop else 0
    prepared = SOURCE_DIR / f'{cue}-{version}-prepared.wav'
    if loop:
        # Each source moment plays once. Only the last and first 1.5 seconds
        # overlap; this is a circular seam edit, never a short-clip repeat.
        filters = (f'[0:a]atrim=start={trim_start}:end={effective_end},asetpts=PTS-STARTPTS,asplit=3[a][b][c];'
                   f'[a]atrim=start={seam}:end={duration-seam},asetpts=PTS-STARTPTS[body];'
                   f'[b]atrim=start={duration-seam},asetpts=PTS-STARTPTS[tail];'
                   f'[c]atrim=end={seam},asetpts=PTS-STARTPTS[head];'
                   f'[tail][head]acrossfade=d={seam}:c1=tri:c2=tri[seam];'
                   '[body][seam]concat=n=2:v=0:a=1[out]')
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(source), '-filter_complex', filters,
             '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', str(prepared)])
    else:
        filters = (f'atrim=start={trim_start}:end={effective_end},asetpts=PTS-STARTPTS,'
                   f'afade=t=in:d=0.015,afade=t=out:st={duration-0.03}:d=0.03')
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(source), '-af', filters, '-ar', '48000', '-ac', '2',
             '-c:a', 'pcm_s24le', str(prepared)])
    target = -23 if spec['kind'] == 'bgm' else -28 if cue == 'rain' else -22
    measured = loudness(prepared, target)
    if not math.isfinite(measured['input_i']):
        raise RuntimeError('Generated audio is silent or has invalid loudness')
    norm = (f"loudnorm=I={target}:LRA=9:TP=-3:measured_I={measured['input_i']}:"
            f"measured_LRA={measured['input_lra']}:measured_TP={measured['input_tp']}:"
            f"measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true")
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    basename = ('bgm-' if spec['kind'] == 'bgm' else 'sfx-') + cue
    out = PUBLIC_DIR / f'{basename}.ogg'
    mp3 = PUBLIC_DIR / f'{basename}.mp3'
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(prepared), '-af', norm, '-ar', '48000',
         '-c:a', 'libopus', '-b:a', '128k', '-vbr', 'on', '-application', 'audio', str(out)])
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(prepared), '-af', norm, '-ar', '48000',
         '-c:a', 'libmp3lame', '-b:a', '160k', str(mp3)])
    quality = loudness(out)
    info = probe(out)
    signal = signal_quality(out)
    track = {'url': '/media/audio/' + out.name, 'fallbackUrl': '/media/audio/' + mp3.name,
             'duration': round(signal['decodedDuration'], 3),
             'containerDuration': round(info['duration'], 3), 'title': spec['title'], 'loop': loop,
             'source': {'kind': 'api-generated', 'provider': 'text_to_audio',
                        'version': version,
                        'model': 'not exposed by endpoint', 'requestSha256': metadata['requestSha256'],
                        'sourceSha256': metadata['sourceSha256'],
                        'generatedDuration': metadata['measured']['duration'],
                        'generatedAt': metadata['generatedAt']},
             'loudness': {'integratedLUFS': quality['input_i'], 'truePeakDbTP': quality['input_tp'],
                          'rangeLU': quality['input_lra']},
             'bytes': info['bytes'], 'codec': info['codec_name'], 'sampleRate': int(info['sample_rate']),
             'channels': info['channels'], 'circularCrossfadeSeconds': seam,
             'sourceTrimStartSeconds': trim_start,
             'sourceTrimEndSeconds': trim_end,
             'processing': 'source trim, circular seam overlap and loudness normalization' if loop else 'source trim, edge fades and loudness normalization',
             'qa': {'measured': True, 'humanListened': False,
                    'modelAssistedListening': True,
                    'audibleSources': listening.get('instrumentsOrSoundSources', []),
                    'audibleHumanVoice': listening.get('humanSpeechOrSinging'),
                    'obviousRepeatedShortLoop': listening.get('obviousRepeatedShortLoop'),
                    'signal': signal}}
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {'version': 1, 'tracks': {}, 'sfx': {}}
    manifest['tracks' if spec['kind'] == 'bgm' else 'sfx'][cue] = track
    save_manifest(manifest)
    print(json.dumps({'event': 'published', 'cue': cue, **track}, ensure_ascii=False), flush=True)
    return track


def attach_seam_qa(cue: str, version: str = 'v1') -> None:
    report_path = ROOT / 'output/story-audio/qa' / f'{cue}-{version}-seam.json'
    observation = json.loads(report_path.read_text())['observation']
    manifest = json.loads(MANIFEST.read_text())
    track = manifest['tracks'].get(cue) or manifest['sfx'][cue]
    track['source'].setdefault('version', version)
    track.setdefault('sourceTrimStartSeconds', 0)
    track['qa']['loopSeamAudible'] = observation.get('loopSeamAudible')
    track['qa']['loopSeamEvidence'] = observation.get('seamEvidence', '')
    save_manifest(manifest)
    print(json.dumps({'event': 'seam-qa-attached', 'cue': cue,
                      'loopSeamAudible': track['qa']['loopSeamAudible']}), flush=True)


def finalize_manifest() -> None:
    """Refresh fallback from lossless preparation and verify final URLs offline."""
    manifest = json.loads(MANIFEST.read_text())
    for section in ('tracks', 'sfx'):
        for cue, track in manifest[section].items():
            version = track['source'].setdefault('version', 'v1')
            prepared = SOURCE_DIR / f'{cue}-{version}-prepared.wav'
            target = -23 if section == 'tracks' else -28 if cue == 'rain' else -22
            measured = loudness(prepared, target)
            norm = (f"loudnorm=I={target}:LRA=9:TP=-3:measured_I={measured['input_i']}:"
                    f"measured_LRA={measured['input_lra']}:measured_TP={measured['input_tp']}:"
                    f"measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true")
            ogg = ROOT / 'public' / track['url'].lstrip('/')
            mp3 = ROOT / 'public' / track['fallbackUrl'].lstrip('/')
            run(['ffmpeg', '-y', '-v', 'error', '-i', str(prepared), '-af', norm, '-ar', '48000',
                 '-c:a', 'libmp3lame', '-b:a', '160k', str(mp3)])
            ogg_info, mp3_info = probe(ogg), probe(mp3)
            track['containerDuration'] = round(ogg_info['duration'], 3)
            track['duration'] = track['qa']['signal']['decodedDuration']
            track['fallbackBytes'] = mp3_info['bytes']
            track['sha256'] = hashlib.sha256(ogg.read_bytes()).hexdigest()
            track['fallbackSha256'] = hashlib.sha256(mp3.read_bytes()).hexdigest()
            track.setdefault('sourceTrimStartSeconds', 0)
            if section == 'tracks' and not 60 <= track['duration'] <= 90:
                raise RuntimeError(f'{cue} is outside the promised music duration')
            if track['qa']['signal']['clippedSampleCount']:
                raise RuntimeError(f'{cue} contains clipped samples')
            if abs(mp3_info['duration'] - track['duration']) > 0.1:
                raise RuntimeError(f'{cue} fallback length differs from the primary')
            print(json.dumps({'event': 'delivery-verified', 'cue': cue, 'duration': track['duration'],
                              'bytes': track['bytes'], 'fallbackBytes': track['fallbackBytes']}), flush=True)
    save_manifest(manifest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['generate', 'publish', 'build', 'attach-seam-qa', 'finalize'])
    parser.add_argument('cue', choices=list(SPECS), nargs='?')
    parser.add_argument('--version', default='v1')
    args = parser.parse_args()
    if args.action != 'finalize' and args.cue is None:
        parser.error('a cue is required for this action')
    try:
        if args.action in ('generate', 'build'):
            generate(args.cue, args.version)
        if args.action in ('publish', 'build'):
            publish(args.cue, args.version)
        if args.action == 'attach-seam-qa':
            attach_seam_qa(args.cue, args.version)
        if args.action == 'finalize':
            finalize_manifest()
    except HTTPError as exc:
        print(f'Audio request HTTP {exc.code}; response body omitted', file=sys.stderr)
        sys.exit(1)
    except URLError:
        print('Audio connection failed; request details omitted', file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f'{type(exc).__name__}: {str(exc)[:500]}', file=sys.stderr)
        sys.exit(1)
