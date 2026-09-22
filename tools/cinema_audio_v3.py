#!/usr/bin/env python3
"""Build reviewed chapter-film audio stems and an exact subtitle/voice manifest.

This local game-asset pipeline does not call any generation service. It reuses
the released dialogue recordings, existing three music cues, and explicitly
approved effect clips. A reviewed, source-hash-bound cue map is mandatory;
planned/equally-spaced shot windows are never converted to subtitles.

    .venv/bin/python tools/cinema_audio_v3.py inspect granny
    .venv/bin/python tools/cinema_audio_v3.py build granny
    .venv/bin/python tools/cinema_audio_v3.py publish
    .venv/bin/python tools/cinema_audio_v3.py verify
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile
import wave
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/cinema-audio-v3'
READY = ROOT / 'output/cinema-v3/ready'
MAPS = WORK / 'maps'
PUBLIC = ROOT / 'public/media'
MANIFEST = PUBLIC / 'cinema-v3-manifest.json'
FFMPEG = '/opt/homebrew/bin/ffmpeg'
FFPROBE = '/opt/homebrew/bin/ffprobe'
RATE = 48000
IDS = ('prologue', 'granny', 'chef', 'dock', 'ending')
TITLES = {'prologue': '门还没修', 'granny': '一碗面，一张竹床', 'chef': '红盖子的饭盒', 'dock': '箱子的另一边', 'ending': '那天你也在'}
CGS = {'prologue': [], 'granny': ['granny-table', 'granny-bamboo'], 'chef': ['chef-lamp', 'chef-extra-bowl'], 'dock': ['dock-shared-box'], 'ending': ['ending-reopen', 'ending-lamplit-child']}
MUSIC = {'prologue': 'explore', 'granny': 'memory', 'chef': 'memory', 'dock': 'memory', 'ending': 'ending'}
DEFAULT_MIX = {'music': .48, 'effects': .6, 'voice': .9}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    return json.loads(path.read_text())


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + path.name, dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def local(url):
    if not isinstance(url, str) or not url.startswith('/media/') or '..' in url:
        raise ValueError('Expected a local /media/ asset')
    path = ROOT / 'public' / url.lstrip('/')
    if not path.is_file():
        raise ValueError(f'Local asset is missing: {path.name}')
    return path


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def probe(path):
    data = json.loads(run([FFPROBE, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]).stdout)
    duration = float(data['format']['duration'])
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid media duration')
    return {'duration': duration, 'bytes': path.stat().st_size, 'sha256': sha(path), 'streams': data['streams']}


def decode(path, channels=2):
    # Mono voice goes to the stereo centre at -3 dB per side (constant power).
    streams = probe(path)['streams']
    stream = next(s for s in streams if s['codec_type'] == 'audio')
    args = [FFMPEG, '-v', 'error', '-xerror', '-i', str(path)]
    if channels == 2 and stream.get('channels') == 1:
        args += ['-af', 'pan=stereo|c0=0.7071067812*c0|c1=0.7071067812*c0']
    args += ['-ar', str(RATE), '-ac', str(channels), '-f', 'f32le', 'pipe:1']
    array = np.frombuffer(run(args).stdout, dtype='<f4').reshape(-1, channels).copy()
    if not np.isfinite(array).all():
        raise ValueError('Nonfinite decoded samples')
    return array


def encode(array, path, codec='mp3'):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name('.' + path.stem + '.part' + path.suffix)
    args = [FFMPEG, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', str(array.shape[1]), '-i', 'pipe:0', '-map_metadata', '-1']
    args += ['-c:a', 'libmp3lame', '-b:a', '192k'] if codec == 'mp3' else ['-c:a', 'pcm_s16le']
    args += [str(temp)]
    run(args, input=array.astype('<f4', copy=False).tobytes())
    run([FFMPEG, '-v', 'error', '-xerror', '-i', str(temp), '-f', 'null', '-'])
    os.replace(temp, path)


def fade(array, fade_in=0, fade_out=0):
    n = len(array)
    for length, tail in [(round(fade_in * RATE), False), (round(fade_out * RATE), True)]:
        length = min(max(length, 0), n)
        if length:
            gain = np.linspace(1, 0, length, dtype=np.float32) if tail else np.linspace(0, 1, length, dtype=np.float32)
            if tail:
                array[-length:] *= gain[:, None]
            else:
                array[:length] *= gain[:, None]
    return array


def fit_audio(source, frames, *, loop=False, crossfade=.65):
    if len(source) >= frames:
        return source[:frames].copy()
    if not loop:
        raise ValueError('Source audio is shorter than the authored placement')
    overlap = min(round(crossfade * RATE), len(source) // 4)
    if overlap < 1:
        raise ValueError('Loop source is too short')
    result = source.copy()
    ramp = np.linspace(0, 1, overlap, dtype=np.float32)[:, None]
    while len(result) < frames:
        # Linear overlap keeps correlated room/noise sources from a +3 dB bump.
        result[-overlap:] = result[-overlap:] * (1 - ramp) + source[:overlap] * ramp
        result = np.concatenate((result, source[overlap:]))
    return result[:frames]


def source_excerpt(source, source_in=0, source_duration=None):
    """Crop before looping, so an accepted excerpt cannot leak rejected audio."""
    start_seconds = float(source_in)
    duration_seconds = None if source_duration is None else float(source_duration)
    if not math.isfinite(start_seconds) or start_seconds < 0:
        raise ValueError('Source in-point must be finite and nonnegative')
    start = round(start_seconds * RATE)
    if start >= len(source):
        raise ValueError('Source in-point lies outside decoded audio')
    if duration_seconds is None:
        return source[start:].copy()
    if not math.isfinite(duration_seconds) or duration_seconds <= 0:
        raise ValueError('Source excerpt duration must be finite and positive')
    end = start + round(duration_seconds * RATE)
    if end <= start or end > len(source):
        raise ValueError('Source excerpt lies outside decoded audio')
    return source[start:end].copy()


def duck_envelope(frames, cues, floor=.4, attack=.18, release=.4):
    envelope = np.ones(frames, dtype=np.float32)
    for cue in cues:
        start = min(frames, max(0, round(cue['start'] * RATE)))
        end = min(frames, max(start, round(cue['end'] * RATE)))
        pre = max(0, start - round(attack * RATE))
        post = min(frames, end + round(release * RATE))
        if start > pre:
            envelope[pre:start] = np.minimum(envelope[pre:start], np.linspace(1, floor, start - pre, dtype=np.float32))
        envelope[start:end] = np.minimum(envelope[start:end], floor)
        if post > end:
            envelope[end:post] = np.minimum(envelope[end:post], np.linspace(floor, 1, post - end, dtype=np.float32))
    return envelope


def source_scene(ident):
    ready = read(READY / f'scene-{ident}.json')
    if ready.get('sceneId') != ident or ready.get('status') != 'silent_master_ready' or ready.get('audio') is not False:
        raise ValueError('The actual reviewed silent master is not ready')
    path = local(ready['silentUrl'])
    info = probe(path)
    if info['sha256'] != ready['silentSha256']:
        raise ValueError('Silent master changed after the visual review')
    videos = [s for s in info['streams'] if s['codec_type'] == 'video']
    if len(videos) != 1 or any(s['codec_type'] == 'audio' for s in info['streams']):
        raise ValueError('Silent master must contain one video and no audio')
    if videos[0]['width'] != 1280 or videos[0]['height'] != 720:
        raise ValueError('Expected the reviewed horizontal 720p master')
    fps_num, fps_den = videos[0]['avg_frame_rate'].split('/')
    if abs(float(fps_num) / float(fps_den) - 24) > .001:
        raise ValueError('Expected the reviewed 24 fps video clock')
    timeline = ready['timeline']
    cursor = 0
    for shot in timeline:
        if abs(shot['start'] - cursor) > .002 or shot['end'] <= shot['start']:
            raise ValueError('Actual shot timeline is not contiguous')
        cursor = shot['end']
    if abs(info['duration'] - cursor) > .09:
        raise ValueError('Actual video length differs from the reviewed shot timeline')
    return ready, path, info


def expected_lines(ident):
    frozen = read(ROOT / 'output/script-review-v3/runtime-freeze.json')
    return [line for cg in CGS[ident] for line in frozen['memorySegments'][cg]['lineIds']]


def validate_map(ident, ready, info, spec, voice):
    if spec.get('status') != 'reviewed' or spec.get('silentSha256') != info['sha256']:
        raise ValueError('A source-hash-bound reviewed cue map is required')
    if spec.get('actualTimeline') != ready['timeline']:
        raise ValueError('Cue map uses stale or planned shot windows')
    by_shot = {s['shotId']: s for s in ready['timeline']}
    cues = []
    prior_end = 0
    for entry in spec.get('cues', []):
        id = entry['id']
        line = voice['lines'].get(id)
        if not line:
            raise ValueError('Cue line is missing in the released voice manifest')
        clip = line['variants'].get('default')
        if not clip:
            raise ValueError('These five memories use common NPC/child speech only')
        path = local(clip['url'])
        if sha(path) != clip['audioSha256']:
            raise ValueError('Released voice audio hash mismatch')
        start = float(entry['start'])
        end = start + clip['duration']
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or start < prior_end - .001 or end > info['duration'] - .03:
            raise ValueError(f'Overlapping, late or invalid voice cue: {id}')
        shots = [by_shot[key] for key in entry.get('shotIds', [])]
        if not shots or start < shots[0]['start'] - .04 or end > shots[-1]['end'] + .04:
            raise ValueError(f'Voice cue leaves its reviewed visual window: {id}')
        evidence = entry.get('evidence', [])
        if not entry.get('visualAnchor') or not evidence:
            raise ValueError('Each cue needs inspected visual anchors, not evenly spaced timing')
        for item in evidence:
            if not (ROOT / item['frame']).is_file() or not shots[0]['start'] <= item['at'] < shots[-1]['end']:
                raise ValueError('Visual proof frame is missing or outside the authored shot')
        cues.append({'id': id, 'who': line['speaker'], 'text': line['text'], 'start': round(start, 3), 'end': round(end, 3),
            'audioUrl': clip['url'], 'audioSha256': clip['audioSha256'], 'shotIds': entry['shotIds'], 'visualAnchor': entry['visualAnchor']})
        prior_end = end
    if [cue['id'] for cue in cues] != expected_lines(ident):
        raise ValueError('Cues must cover the complete approved memory exactly once, in order')
    for entry in spec.get('effects', []):
        if entry.get('review') != 'accepted' or not entry.get('reviewEvidence'):
            raise ValueError('Effect source has no explicit listening acceptance')
        if not (ROOT / entry['reviewEvidence']).is_file():
            raise ValueError('Effect listening evidence file is missing')
        path = local(entry['url'])
        if sha(path) != entry['sha256']:
            raise ValueError('Effect asset changed after listening acceptance')
        if not all(math.isfinite(float(entry[k])) for k in ('start', 'duration')) or entry['start'] < 0 or entry['duration'] <= 0 or entry['start'] + entry['duration'] > info['duration'] + .001:
            raise ValueError('Effect placement falls outside the film')
        if not math.isfinite(float(entry.get('gainDb', 0))):
            raise ValueError('Effect gain must be finite')
        # Validate against decoded samples, not codec/container padding.
        source_excerpt(decode(path), entry.get('sourceIn', 0), entry.get('sourceDuration'))
    return cues


def loudness(path):
    result = run([FFMPEG, '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-20:TP=-2:LRA=9:print_format=json', '-f', 'null', '-'])
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)
    measured = json.loads(matches[-1])
    # Empty prologue voice/effect tracks legitimately have -inf levels.
    convert = lambda key: float(measured[key]) if math.isfinite(float(measured[key])) else None
    return {'integratedLufs': convert('input_i'), 'truePeakDbtp': convert('input_tp'), 'loudnessRange': convert('input_lra')}


def prepare_effects():
    """Losslessly close streaming WAV headers; preserve both source and PCM."""
    result = []
    for name in ('water', 'breeze'):
        source = PUBLIC / f'cinema-v3-sfx-{name}-v2.wav'
        target = PUBLIC / f'cinema-v3-sfx-{name}-v2-pcm.wav'
        with wave.open(str(source), 'rb') as reader:
            params = reader.getparams()
            data = reader.readframes(params.nframes)
        width = params.nchannels * params.sampwidth
        if not data or len(data) % width:
            raise ValueError('Streaming WAV contains incomplete PCM frames')
        with wave.open(str(target), 'wb') as writer:
            writer.setparams(params._replace(nframes=len(data) // width))
            writer.writeframes(data)
        with wave.open(str(target), 'rb') as reader:
            canonical = reader.readframes(reader.getnframes())
        if data != canonical:
            raise ValueError('Lossless WAV header repair changed PCM samples')
        decoded = decode(target)
        result.append({'effect': name, 'source': '/media/' + source.name, 'sourceSha256': sha(source),
            'url': '/media/' + target.name, 'sha256': sha(target), 'pcmSha256': hashlib.sha256(data).hexdigest(),
            'pcmUnchanged': True, 'strictDecode': True, 'duration': len(decoded) / RATE,
            'method': 'rewrite finite RIFF/data sizes only; unchanged PCM audio',
            'reviewEvidence': f'output/story-audio/qa/cinema-v3-{name}-v2-listening.json'})
    atomic_json(WORK / 'qa' / 'effects-lossless-rewrap.json', {'preparedAt': now(), 'effects': result})
    print(json.dumps(result, ensure_ascii=False, indent=2))


def srt_text(cues):
    def stamp(t):
        ms = round(t * 1000)
        return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
    return '\n\n'.join(f'{i + 1}\n{stamp(c["start"])} --> {stamp(c["end"])}\n{c["who"]}：{c["text"]}' for i, c in enumerate(cues)) + '\n'


def inspect(ident):
    ready, path, info = source_scene(ident)
    folder = WORK / 'visual-proof' / ident
    folder.mkdir(parents=True, exist_ok=True)
    frames = []
    for shot in ready['timeline']:
        for at in np.linspace(shot['start'] + .12, shot['end'] - .12, 4):
            frame = folder / f'{shot["shotId"]}-{at:.3f}.jpg'
            run([FFMPEG, '-y', '-v', 'error', '-ss', f'{at:.3f}', '-i', str(path), '-frames:v', '1', '-q:v', '2', str(frame)])
            frames.append({'shotId': shot['shotId'], 'at': round(float(at), 3), 'frame': str(frame.relative_to(ROOT))})
    report = {'sceneId': ident, 'silentSha256': info['sha256'], 'actualTimeline': ready['timeline'], 'frames': frames,
        'expectedVoiceLineIds': expected_lines(ident), 'status': 'frames_ready_for_visual_review; cue timing not assigned'}
    atomic_json(folder / 'inspection.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def build(ident):
    ready, video, info = source_scene(ident)
    spec = read(MAPS / f'{ident}.json')
    voice = read(PUBLIC / 'story-voice-manifest.json')
    cues = validate_map(ident, ready, info, spec, voice)
    frames = round(info['duration'] * RATE)
    arrays = {name: np.zeros((frames, 2), dtype=np.float32) for name in DEFAULT_MIX}
    for cue in cues:
        data = decode(local(cue['audioUrl']))
        offset = round(cue['start'] * RATE)
        if offset + len(data) > frames:
            raise ValueError('Decoded dialogue would be truncated')
        arrays['voice'][offset:offset + len(data)] += data
    music_manifest = read(PUBLIC / 'story-music-manifest.json')
    music = music_manifest['tracks'][MUSIC[ident]]
    music_path = local(music['url'])
    if sha(music_path) != music['sha256']:
        raise ValueError('Existing music asset hash mismatch')
    music_pcm = decode(music_path)
    music_pcm = source_excerpt(music_pcm, spec.get('musicSourceIn', 0), spec.get('musicSourceDuration'))
    arrays['music'] = fit_audio(music_pcm, frames, loop=True)
    arrays['music'] *= 10 ** (spec.get('musicGainDb', 0) / 20)
    fade(arrays['music'], .9, 1.2)
    arrays['music'] *= duck_envelope(frames, cues, floor=.4)[:, None]
    for entry in spec.get('effects', []):
        data = decode(local(entry['url']))
        data = source_excerpt(data, entry.get('sourceIn', 0), entry.get('sourceDuration'))
        count = round(entry['duration'] * RATE)
        data = fit_audio(data, count, loop=entry.get('loop', False), crossfade=entry.get('crossfade', .65))
        data *= 10 ** (entry.get('gainDb', 0) / 20)
        fade(data, entry.get('fadeIn', .2), entry.get('fadeOut', .35))
        offset = round(entry['start'] * RATE)
        arrays['effects'][offset:offset + count] += data
    arrays['effects'] *= duck_envelope(frames, cues, floor=.65)[:, None]
    stems = {}
    stem_qa = {}
    for channel, array in arrays.items():
        peak = float(np.max(np.abs(array)))
        if peak > .89:
            raise ValueError(f'{channel} exceeds pre-encode peak headroom; revise the mix, do not clip it')
        path = PUBLIC / f'cinema-v3-{ident}-{channel}.mp3'
        encode(array, path)
        measured = loudness(path)
        if measured['truePeakDbtp'] is not None and measured['truePeakDbtp'] > -1.5:
            raise ValueError('Encoded stem lost peak headroom')
        stems[channel] = '/media/' + path.name
        stem_qa[channel] = {'sha256': sha(path), 'duration': probe(path)['duration'], 'loudness': measured, 'samplePeak': peak}
    # Preview uses the game's default channel gains, so it represents the
    # shipped mix rather than misleadingly louder all-faders-at-one audio.
    mixed = sum(arrays[channel] * gain for channel, gain in DEFAULT_MIX.items())
    peak = float(np.max(np.abs(mixed)))
    if peak > .78:
        raise ValueError('Default runtime mix has insufficient headroom; revise the stems, not only the preview')
    preview_trim = 1.0
    wav = WORK / 'mixes' / f'{ident}.wav'
    encode(mixed, wav, codec='wav')
    subtitles = WORK / 'cues' / f'{ident}.srt'
    subtitles.parent.mkdir(parents=True, exist_ok=True)
    subtitles.write_text(srt_text(cues))
    target = PUBLIC / f'cinema-v3-{ident}-mixed.mp4'
    temporary = target.with_name('.' + target.stem + '.part.mp4')
    command = [FFMPEG, '-y', '-v', 'error', '-i', str(video), '-i', str(wav)]
    if cues:
        command += ['-i', str(subtitles)]
    command += ['-map', '0:v:0', '-map', '1:a:0']
    if cues:
        command += ['-map', '2:0', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=zho']
    command += ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', f'{info["duration"]:.6f}', '-movflags', '+faststart', str(temporary)]
    run(command)
    run([FFMPEG, '-v', 'error', '-xerror', '-i', str(temporary), '-f', 'null', '-'])
    os.replace(temporary, target)
    mixed_qa = loudness(target)
    if mixed_qa['truePeakDbtp'] is not None and mixed_qa['truePeakDbtp'] > -1.5:
        raise ValueError('Final preview AAC lost peak headroom')
    poster = PUBLIC / f'cinema-v3-{ident}-poster.jpg'
    run([FFMPEG, '-y', '-v', 'error', '-ss', '0.25', '-i', str(video), '-frames:v', '1', '-q:v', '2', str(poster)])
    record = {'id': ident, 'title': TITLES[ident], 'url': ready['silentUrl'], 'poster': '/media/' + poster.name,
        'duration': info['duration'], 'resolution': '1280x720', 'fps': 24, 'silentSha256': info['sha256'],
        'stems': stems, 'cues': cues, 'previewUrl': '/media/' + target.name, 'previewSha256': sha(target),
        'shots': ready['timeline'], 'voiceLineIds': [c['id'] for c in cues],
        'music': {'source': music['url'], 'sourceSha256': music['sha256'], 'kind': 'reused_existing_music', 'cue': MUSIC[ident]},
        'effects': spec.get('effects', []),
        'mix': {'defaultGains': DEFAULT_MIX, 'musicDuckFloor': .4, 'effectsDuckFloor': .65, 'attack': .18, 'release': .4, 'previewTrim': preview_trim},
        'qa': {'builtAt': now(), 'fullDecode': True, 'voiceTextMatchesReleasedManifest': True, 'cueMapSha256': sha(MAPS / f'{ident}.json'),
            'stems': stem_qa, 'mixedLoudness': mixed_qa, 'sourceVoiceManifestSha256': sha(PUBLIC / 'story-voice-manifest.json')},
    }
    atomic_json(WORK / 'built' / f'{ident}.json', record)
    print(f'{ident}: built {info["duration"]:.3f}s, {len(cues)} exact dialogue cues; not published yet')


def listen(ident):
    """Observe the actual shipped mix through the existing audio QA gateway.

    The neutral carrier deliberately hides both footage and expected transcript.
    Reports are observations, not automatic acceptance or human listening.
    """
    from media import ENV

    record = read(WORK / 'built' / f'{ident}.json')
    validate_record(record, full=True)
    source = local(record['previewUrl'])
    source_hash = sha(source)
    folder = WORK / 'listening'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f'{ident}-{source_hash[:12]}.json'
    if target.exists():
        print(target.read_text())
        return
    carrier = folder / f'{ident}-{source_hash[:12]}.mp4'
    run([FFMPEG, '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x171e24:s=320x180:r=1',
         '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-tune', 'stillimage',
         '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', str(carrier)])
    key = ENV.get('GPT_AK')
    if not key:
        raise ValueError('The configured multimodal QA credential is missing')
    endpoint = 'https://' + ENV.get('MODEL_GATEWAY_HOST', 'aidp-i18ntt-sg.tiktok-row.net') + '/api/modelhub/online/v2/crawl?' + urlencode({'ak': key})
    prompt = (
        'Listen throughout the actual audio in this video. The intentionally neutral blank image '
        'does not describe the sound. Do not infer from a title, expectation or script. Return one JSON '
        'object: audioAccessible (boolean), audibleContent (short description), '
        'speechSegments (array of approximate start/end seconds, actual heard Chinese words, '
        'and intelligibility clear/partial/unclear), '
        'unintendedSpeechOrSinging (boolean), musicSources (array), effectSources (array), '
        'speechMaskedByMusicOrEffects (array of timestamps and evidence), '
        'clicksGapsDistortionOrAbruptCuts (array of timestamps and evidence), '
        'unnaturalDialogueGapsOrOverlap (array of timestamps and evidence), '
        'beginningMiddleEnd (three brief listening observations), '
        'overallDialogueMix (clear/partly-masked/no-speech/not-accessible), '
        'confidence (low/medium/high), uncertainties. Do not invent speech in an instrumental clip. '
        'Report natural silence and intentional foley as such, not as encoding errors. '
        'Explicitly acknowledge if audio is not accessible. No expected transcript is provided.'
    )
    payload = {'model': ENV.get('GEMINI_MODEL', 'gemini-3.5-flash'), 'stream': False, 'max_tokens': 5000,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt},
            {'type': 'file_url', 'file_url': {'mime_type': 'video/mp4', 'url': base64.b64encode(carrier.read_bytes()).decode(),
                'extra': json.dumps({'videoMetaData': {'fps': 1}})}}]}]}
    request = Request(endpoint, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urlopen(request, timeout=240) as response:
            result = json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f'Mix listening HTTP {exc.code}; request details omitted') from None
    except URLError:
        raise RuntimeError('Mix listening connection failed; request details omitted') from None
    content = result['choices'][0]['message']['content']
    if isinstance(content, list):
        content = ''.join(p.get('text', '') for p in content if isinstance(p, dict))
    raw = str(content).strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    observation = json.loads(raw)
    report = {'sceneId': ident, 'source': str(source.relative_to(ROOT)), 'sourceSha256': source_hash,
        'reviewedAt': now(), 'method': 'model-assisted actual-mix listening; neutral video carrier; unchanged AAC audio; not human listening',
        'expectedTranscriptHiddenFromReviewer': True, 'measuredLoudness': record['qa']['mixedLoudness'],
        'status': 'observation_requires_editor_review', 'observation': observation}
    atomic_json(target, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def validate_record(record, *, full=False):
    ident = record['id']
    ready, video, info = source_scene(ident)
    if record['silentSha256'] != info['sha256'] or record['shots'] != ready['timeline']:
        raise ValueError('Built scene has stale visual timing')
    if record['qa']['cueMapSha256'] != sha(MAPS / f'{ident}.json'):
        raise ValueError('Cue map changed after the audio was assembled')
    voice = read(PUBLIC / 'story-voice-manifest.json')
    authored_cues = validate_map(ident, ready, info, read(MAPS / f'{ident}.json'), voice)
    if record['cues'] != authored_cues:
        raise ValueError('Built subtitles differ from the reviewed exact-duration cue map')
    if [c['id'] for c in record['cues']] != expected_lines(ident):
        raise ValueError('Memory voice coverage mismatch')
    prior_end = 0
    for cue in record['cues']:
        item = voice['lines'][cue['id']]
        if cue['who'] != item['speaker'] or cue['text'] != item['text'] or cue['audioSha256'] != item['variants']['default']['audioSha256']:
            raise ValueError('Voice cue differs from the current released script')
        if cue['start'] < prior_end - .001 or cue['end'] > info['duration'] - .02:
            raise ValueError('Subtitle overlaps or falls outside the film')
        prior_end = cue['end']
    for channel, url in record['stems'].items():
        path = local(url)
        if sha(path) != record['qa']['stems'][channel]['sha256'] or abs(probe(path)['duration'] - info['duration']) > .10:
            raise ValueError('Stem changed or does not cover the film clock')
        if full:
            run([FFMPEG, '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
    mixed = local(record['previewUrl'])
    if sha(mixed) != record['previewSha256'] or abs(probe(mixed)['duration'] - info['duration']) > .10:
        raise ValueError('Mixed preview changed or has a mismatched duration')
    if full:
        run([FFMPEG, '-v', 'error', '-xerror', '-i', str(mixed), '-f', 'null', '-'])


def require_final_review(record):
    review = record['qa'].get('finalReview', {})
    if review.get('status') != 'accepted' or review.get('listeningSourceSha256') != record['previewSha256']:
        raise ValueError('A final-mix-bound editorial listening acceptance is required for release')
    path = ROOT / review.get('listeningEvidence', '')
    if not path.is_file():
        raise ValueError('Final-mix listening evidence is missing')
    observation = read(path)
    if observation.get('sourceSha256') != record['previewSha256'] or not observation.get('observation', {}).get('audioAccessible'):
        raise ValueError('Listening evidence is stale or actual audio was not accessible')


def publish():
    scenes = {ident: read(WORK / 'built' / f'{ident}.json') for ident in IDS}
    for record in scenes.values():
        validate_record(record, full=True)
        require_final_review(record)
    payload = {'version': 3, 'publishedAt': now(), 'format': 'silent video clock with independent music/effects/voice stems', 'scenes': scenes}
    atomic_json(MANIFEST, payload)
    atomic_json(WORK / 'release.json', {'publishedAt': now(), 'manifestSha256': sha(MANIFEST), 'scenes': list(scenes), 'status': 'all_five_ready_and_verified'})
    print('Published five reviewed films with exact voice/subtitle timing')


def verify():
    manifest = read(MANIFEST)
    if set(manifest['scenes']) != set(IDS):
        raise ValueError('Final cinema manifest must contain all five films')
    for record in manifest['scenes'].values():
        validate_record(record, full=True)
        require_final_review(record)
    result = {'verifiedAt': now(), 'pass': True, 'manifestSha256': sha(MANIFEST), 'scenes': list(IDS),
        'checks': ['actual reviewed video hashes', 'actual shot boundaries', 'complete approved memory speech in order',
            'exact speaker/text/audio hashes', 'no subtitle overlap or voice truncation', 'three independent stems cover video clock', 'full MP3/MP4 decode',
            'final mix hash-bound editorial acceptance of actual-audio listening observations']}
    atomic_json(WORK / 'verification.json', result)
    print(json.dumps(result, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['inspect', 'build', 'listen', 'prepare-effects', 'publish', 'verify'])
    parser.add_argument('scenes', nargs='*')
    args = parser.parse_args()
    if any(ident not in IDS for ident in args.scenes):
        parser.error('Unknown chapter film ID')
    WORK.mkdir(parents=True, exist_ok=True)
    if args.action in ('inspect', 'build', 'listen'):
        if not args.scenes:
            parser.error('Choose one or more completed scene IDs')
        for ident in args.scenes:
            {'inspect': inspect, 'build': build, 'listen': listen}[args.action](ident)
    else:
        {'publish': publish, 'verify': verify, 'prepare-effects': prepare_effects}[args.action]()


if __name__ == '__main__':
    main()
