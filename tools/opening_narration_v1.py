#!/usr/bin/env python3
"""Generate/inspect the short, approved prologue narration without editing runtime.

The project's prompt-only text_to_audio contract generates one consistent dry
narrator. The result is an audition, never automatically published. Three
editor-reviewed excerpts are then placed on the unchanged 29.25 s video clock.
Credentials are read only for the blind listening API and are never logged.
"""
from __future__ import annotations

import argparse
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
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

import story_voice as voice
from media import ENV

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/qa/opening-narration-v1'
PUBLIC = ROOT / 'public/media/opening-narration-v1'
API = 'https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio'
VIDEO = ROOT / 'public/media/cinema-v3-prologue.mp4'
VIDEO_SHA = '9e78b2ea342da9e5514a90ee84bb749e3345cdd12580011a5a0bc1a4d4fef77e'
DURATION = 29.25
RATE = 48000
LINES = [
    {'id': 'opening-return', 'text': '离开武汉以后，阿遥很少再坐这趟轮渡。',
     'start': .5, 'visualEnd': 5, 'shotIds': ['P01'],
     'visualAnchor': '阿遥乘轮渡面对江汉关与汉口江岸，建立回武汉的时间与地点。',
     'evidence': ['P01-0.120.jpg', 'P01-3.293.jpg', 'P01-4.880.jpg']},
    {'id': 'opening-errand', 'text': '外公在姨妈家休养，托阿遥回来，给街坊送几件东西。',
     'start': 5.3, 'visualEnd': 14.25, 'shotIds': ['P02', 'P03'],
     'visualAnchor': '手中的修理铺钥匙与渡船江景，说明这趟回来的委托；不把外公写成逝者。',
     'evidence': ['P02-5.120.jpg', 'P02-7.793.jpg', 'P03-10.957.jpg', 'P03-14.130.jpg']},
    {'id': 'opening-one-night', 'text': '原本想着，明天就走。',
     'start': 16, 'visualEnd': 24.25, 'shotIds': ['P04'],
     'visualAnchor': '走进生活气息仍在的里份小巷，说出短暂停留的原本打算；门锁段留白。',
     'evidence': ['P04-14.370.jpg', 'P04-17.623.jpg', 'P04-20.877.jpg']},
]
PROMPT = '''制作一段约18秒的纯中文旁白配音小样，录音室干声，没有任何音乐、环境声或音效。
这是温暖的武汉老巷游戏《江城有灯》里的局外旁白，不是主角本人，也不是悲伤的追悼。
唯一说话者是一位自然、柔和、清楚的普通话成年女声；轻松克制，像向朋友讲一件家常事。
三句全程必须是同一个音色，同一个人的连续叙述。不要播音腔、广告腔、刻意煽情、耳语、唱歌。
阿遥读作 a1 yao2，是成年主角的名字；外公健在，暂时在姨妈家休养。
只逐字朗读下面三句引号里的文字，不朗读时间、编号、说明，不添字，不改字，不重复。
0.2秒至4.4秒，完整、自然、不拖长地说：
“离开武汉以后，阿遥很少再坐这趟轮渡。”
之后留至少0.6秒干净安静；5.0秒至11.8秒，以家常语气完整地说：
“外公在姨妈家休养，托阿遥回来，给街坊送几件东西。”
之后留至少0.8秒干净安静；13.0秒至15.8秒，轻轻说，不用悬疑腔：
“原本想着，明天就走。”
结尾到18秒保持纯安静。每句完整收尾，没有尾字截断。音量均衡、吐字清楚、无削波、无混响。
只有上述一个说话者的三句旁白，绝对没有钢琴、弦乐、背景配乐、风声、船声、脚步、杂音。
'''


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, obj):
    voice.atomic_json(path, obj)


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def probe(path):
    info = json.loads(run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]).stdout)
    return {'duration': float(info['format']['duration']), 'bytes': Path(path).stat().st_size,
            'sha256': sha(path), 'streams': info['streams']}


def generate():
    WORK.mkdir(parents=True, exist_ok=True)
    raw = WORK / 'audition-v1.raw.wav'
    payload = {'prompt': PROMPT}
    fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if raw.exists():
        old = json.loads((WORK / 'generation.json').read_text())
        if old['requestSha256'] != fingerprint:
            raise ValueError('Existing audition belongs to another request')
        print('Reused exact audition; no new generation request')
        return
    (WORK / 'generation-prompt.txt').write_text(PROMPT)
    request = Request(API, data=json.dumps(payload, ensure_ascii=False).encode(),
                      headers={'Content-Type': 'application/json'}, method='POST')
    start = time.monotonic()
    with urlopen(request, timeout=420) as response:
        result = json.load(response)
    if result.get('base_resp', {}).get('code') not in (None, 0):
        raise ValueError('Audio API reported failure')
    data = base64.b64decode(result.get('audio_base64', ''), validate=True)
    if not data.startswith((b'RIFF', b'RF64')):
        raise ValueError('Audio API response is not WAV')
    raw.write_bytes(data)
    canonical = WORK / 'audition-v1.wav'
    run(['ffmpeg', '-y', '-v', 'error', '-i', str(raw), '-map_metadata', '-1', '-ar', str(RATE),
         '-ac', '1', '-c:a', 'pcm_s16le', str(canonical)])
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(canonical), '-f', 'null', '-'])
    save(WORK / 'generation.json', {'generatedAt': voice.now(), 'provider': 'text_to_audio',
         'model': 'not exposed by endpoint', 'contract': 'project model_gateway/text_to_audio.py',
         'authentication': 'No credentials sent; the configured text_to_audio contract is prompt-only.',
         'voice': {'id': 'opening-neutral-female-v1', 'type': 'prompt-defined consistent dry narrator',
                   'fixedProviderSpeakerId': None, 'note': 'Not a clone and not represented as an exact match to Xiaoxiao.'},
         'requestSha256': fingerprint, 'requestSeconds': round(time.monotonic() - start, 2),
         'rawSha256': sha(raw), 'canonical': probe(canonical), 'status': 'audition_needs_listening'})
    print(json.dumps({'generated': True, 'duration': probe(canonical)['duration'], 'requestSeconds': round(time.monotonic() - start, 2)}))


def listen(name, source):
    source = source.resolve()
    WORK.mkdir(parents=True, exist_ok=True)
    source_hash = sha(source)
    dest = WORK / f'{name}-listening.json'
    if dest.exists() and json.loads(dest.read_text()).get('sourceSha256') == source_hash:
        print(dest.read_text())
        return
    carrier = WORK / f'{name}-neutral.mp4'
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x171e24:s=320x180:r=1',
         '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-tune', 'stillimage',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', str(carrier)])
    key = ENV.get('GPT_AK')
    if not key:
        raise ValueError('Existing QA gateway credential missing')
    endpoint = 'https://' + ENV.get('MODEL_GATEWAY_HOST', 'aidp-i18ntt-sg.tiktok-row.net') + '/api/modelhub/online/v2/crawl?' + urlencode({'ak': key})
    prompt = ('Listen throughout this actual audio, carried in an intentionally blank video. Do not infer content '
              'from filenames or expectations. No transcript is supplied. Return only JSON: audioAccessible:boolean, '
              'spokenSegments:[{start,end,heardChineseText,heardNamePinyin,delivery,intelligibility}], '
              'voiceConsistency:{sameSpeaker:boolean,description}, musicOrSinging, environmentalSounds, '
              'clippedWordsOrDistortion:[{at,evidence}], silenceGaps:[{start,end}], confidence, uncertainties. '
              'Transcribe every audible Chinese word exactly. If spelling a name is uncertain provide its heard '
              'Pinyin syllables and tones rather than assuming the characters. Report real complete-sentence '
              'start/end times and whether speech is rushed, natural, overdramatic, or mechanical. '
              'Do not label intentional silence as an error. Acknowledge if audio is inaccessible.')
    payload = {'model': ENV.get('GEMINI_MODEL', 'gemini-3.5-flash'), 'stream': False, 'max_tokens': 6000,
               'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt},
                 {'type': 'file_url', 'file_url': {'mime_type': 'video/mp4', 'url': base64.b64encode(carrier.read_bytes()).decode(),
                 'extra': json.dumps({'videoMetaData': {'fps': 1}})}}]}]}
    request = Request(endpoint, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    with urlopen(request, timeout=240) as response:
        result = json.load(response)
    content = result['choices'][0]['message']['content']
    if isinstance(content, list):
        content = ''.join(x.get('text', '') for x in content if isinstance(x, dict))
    raw = str(content).strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    report = {'reviewedAt': voice.now(), 'method': 'model-assisted actual-file blind listening; not human listening',
              'expectedTranscriptHiddenFromReviewer': True, 'source': str(source.relative_to(ROOT)),
              'sourceSha256': source_hash, 'carrierSha256': sha(carrier), 'observation': json.loads(raw)}
    save(dest, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def build(cuts_path):
    """Cuts must come from actual audition + silence/word inspection, not prompt windows."""
    cuts_path = cuts_path.resolve()
    if sha(VIDEO) != VIDEO_SHA:
        raise ValueError('Reviewed visual master changed; remap before building')
    cuts = json.loads(cuts_path.read_text())
    source = WORK / 'audition-v1.wav'
    if cuts.get('sourceSha256') != sha(source) or cuts.get('status') != 'reviewed':
        raise ValueError('A source-hash-bound, reviewed excerpt map is required')
    if len(cuts.get('segments', [])) != 3:
        raise ValueError('Exactly three approved utterances are required')
    PUBLIC.mkdir(parents=True, exist_ok=True)
    stems = np.zeros(round(DURATION * RATE), dtype=np.float32)
    records = []
    for line, cut in zip(LINES, cuts['segments']):
        if cut['id'] != line['id'] or cut['text'] != line['text']:
            raise ValueError('Authored line changed')
        a, b = float(cut['sourceIn']), float(cut['sourceOut'])
        if not 0 <= a < b <= probe(source)['duration']:
            raise ValueError('Invalid audio excerpt')
        raw = WORK / f"{line['id']}.wav"
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(source), '-af', f'atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={b-a-.015}:d=0.015',
             '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s16le', str(raw)])
        output = PUBLIC / f"{line['id']}.mp3"
        info = voice.normalize(raw, output)
        pcm = np.frombuffer(run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(output), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', 'pipe:1']).stdout, dtype='<f4').copy()
        actual = len(pcm) / RATE
        end = round(line['start'] + actual, 6)
        if end > line['visualEnd'] - .03:
            raise ValueError(f"Utterance leaves its visual window: {line['id']}")
        offset = round(line['start'] * RATE)
        stems[offset:offset + len(pcm)] += pcm
        records.append({**line, 'who': '旁白', 'end': end, 'audioUrl': '/media/opening-narration-v1/' + output.name,
                        'audioSha256': sha(output), 'duration': actual, 'encodedDuration': info['duration'],
                        'sourceIn': a, 'sourceOut': b, 'loudness': info['normalization']['encodedMeasurement'],
                        'evidence': ['output/cinema-audio-v3/visual-proof/prologue/' + name for name in line['evidence']]})
    stem = PUBLIC / 'prologue-voice.mp3'
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0',
         '-c:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1', str(stem)], input=stems.astype('<f4').tobytes())
    stem_info = probe(stem)
    decoded = np.frombuffer(run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(stem), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', 'pipe:1']).stdout, dtype='<f4')
    decoded_duration = len(decoded) / RATE
    if abs(decoded_duration - DURATION) > 1 / RATE or not np.isfinite(decoded).all() or np.max(np.abs(decoded)) >= 1:
        raise ValueError('Stem duration or decoded signal mismatch')
    gen = json.loads((WORK / 'generation.json').read_text())
    manifest = {'version': 1, 'id': 'opening-narration-v1', 'sceneId': 'prologue', 'generatedAt': voice.now(),
       'provider': gen['provider'], 'model': gen['model'], 'voice': gen['voice'], 'requestSha256': gen['requestSha256'],
       'scope': 'Three new background-narration lines only; no approved dialogue, music, endings or film length changed.',
       'sourceVideoUrl': '/media/cinema-v3-prologue.mp4', 'sourceVideoSha256': VIDEO_SHA,
       'timebase': 'original video seconds; player playbackRate may change wall-clock duration only',
       'duration': DURATION, 'suggestedPlaybackRate': 1.15, 'preservesPitch': True,
       'stems': {'voice': '/media/opening-narration-v1/prologue-voice.mp3'}, 'cues': records,
       'qa': {'fullDecode': True, 'stem': stem_info, 'stemDecodedDuration': decoded_duration,
              'stemLoudness': voice.measure_encoded_loudness(stem), 'clippedSamples': int(np.sum(np.abs(decoded) >= 1)),
              'auditionListening': 'output/qa/opening-narration-v1/audition-listening.json',
              'cuts': str(cuts_path.relative_to(ROOT)), 'noAdditionalVideoTime': True,
              'visualFit': 'all three cues within inspected source-shot windows; door-lock shot intentionally voice-free'},
       'integration': {'replaceOnly': ['scenes.prologue.stems.voice', 'scenes.prologue.cues', 'scenes.prologue.voiceLineIds'],
                       'voiceLineIds': [line['id'] for line in LINES], 'musicDucking': 'runtime by cue windows; original music stem unchanged'}}
    save(PUBLIC / 'manifest.json', manifest)
    print(json.dumps({'built': True, 'stemDecodedDuration': decoded_duration, 'cues': [{k: c[k] for k in ('id', 'start', 'end', 'duration')} for c in records]}, indent=2))


def verify():
    manifest = json.loads((PUBLIC / 'manifest.json').read_text())
    if manifest['sourceVideoSha256'] != VIDEO_SHA or manifest['duration'] != DURATION:
        raise ValueError('Narration targets another visual clock')
    if len(manifest['cues']) != len(LINES):
        raise ValueError('Missing or added narration line')
    reports = []
    previous_end = 0
    for authored, cue in zip(LINES, manifest['cues']):
        if any(cue[key] != authored[key] for key in ('id', 'text', 'start', 'visualEnd', 'shotIds')):
            raise ValueError('Narration differs from approved text or visual mapping')
        path = ROOT / 'public' / cue['audioUrl'].lstrip('/')
        if sha(path) != cue['audioSha256']:
            raise ValueError('Narration asset checksum differs')
        run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
        pcm = np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(path), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', 'pipe:1']).stdout, dtype='<f4')
        duration = len(pcm) / RATE
        if abs(duration - cue['duration']) > 1 / RATE or abs(cue['start'] + duration - cue['end']) > 1 / RATE:
            raise ValueError('Narration cue duration differs from real decoded media')
        if cue['start'] < previous_end or cue['end'] > cue['visualEnd'] - .03:
            raise ValueError('Narration overlaps or leaves visual window')
        levels = voice.measure_encoded_loudness(path)
        if not -20.5 <= levels['integratedLufs'] <= -17.5 or levels['truePeakDbtp'] > -2:
            raise ValueError('Narration voice level or headroom out of range')
        if not all((ROOT / frame).is_file() for frame in cue['evidence']):
            raise ValueError('Narration visual evidence is missing')
        previous_end = cue['end']
        reports.append({'id': cue['id'], 'decodedDuration': duration, 'visualFit': True, 'loudness': levels,
                        'wallClockAt115': {'start': round(cue['start']/1.15, 3), 'end': round(cue['end']/1.15, 3)}})
    stem = PUBLIC / 'prologue-voice.mp3'
    if sha(stem) != manifest['qa']['stem']['sha256']:
        raise ValueError('Narration stem checksum differs')
    run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(stem), '-f', 'null', '-'])
    pcm = np.frombuffer(run(['ffmpeg', '-v', 'error', '-i', str(stem), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', 'pipe:1']).stdout, dtype='<f4')
    if len(pcm) != round(DURATION * RATE) or not np.isfinite(pcm).all() or np.max(np.abs(pcm)) >= 1:
        raise ValueError('Narration stem has invalid duration or decoded signal')
    tail = pcm[round(24.25 * RATE):]
    if np.max(np.abs(tail)) > 1e-6:
        raise ValueError('Door shot should contain no narration')
    listening = json.loads((WORK / 'audition-listening.json').read_text())
    observation = listening['observation']
    actual = [re.sub(r'[^\u4e00-\u9fff]', '', row['heardChineseText']) for row in observation['spokenSegments']]
    expected = [re.sub(r'[^\u4e00-\u9fff]', '', row['text']) for row in LINES]
    if observation.get('audioAccessible') is not True or actual != expected or observation.get('musicOrSinging') is not False:
        raise ValueError('Audition blind transcript or dry-voice validation failed')
    report = {'verifiedAt': voice.now(), 'status': 'pass', 'sourceVideoSha256': VIDEO_SHA,
              'stemSha256': sha(stem), 'stemDecodedDuration': len(pcm) / RATE, 'clippedSamples': 0,
              'auditionTranscriptExactlyMatches': True, 'sameSpeaker': observation['voiceConsistency']['sameSpeaker'],
              'doorShotNarrationSilent': True, 'checks': reports,
              'note': 'Actual-timing and audio checks only; runtime integration/pause/skip remain the root task responsibility.'}
    save(WORK / 'verification.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['generate', 'listen', 'build', 'verify'])
    parser.add_argument('--name', default='audition')
    parser.add_argument('--source', type=Path, default=WORK / 'audition-v1.wav')
    parser.add_argument('--cuts', type=Path, default=WORK / 'reviewed-cuts.json')
    args = parser.parse_args()
    try:
        if args.action == 'generate':
            generate()
        elif args.action == 'listen':
            listen(args.name, args.source)
        elif args.action == 'build':
            build(args.cuts)
        else:
            verify()
    except HTTPError as exc:
        print(f'Audio stage HTTP {exc.code}; request details omitted', file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        # Avoid authenticated URLs/request bodies in any failure or traceback.
        print(type(exc).__name__ + ': opening narration stage failed; request details omitted', file=sys.stderr)
        sys.exit(1)
