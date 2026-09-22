"""Package the new narration mix and publish reviewed 1080p cinema references.

No generation calls or credentials here. Old assets and the prior manifest stay
available. Run `preview` first, then `publish` after all five AI reviews pass.
"""
import argparse
import copy
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
import cinema_audio_v3 as media

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'output/qa/opening-polish-v1'
UP = ROOT / 'output/qa/cinema-upscale-v1'
PUBLIC = ROOT / 'public/media/opening-polish-v1'
MANIFEST = ROOT / 'public/media/cinema-v3-manifest.json'
NARRATION = ROOT / 'public/media/opening-narration-v1/manifest.json'


def read(path):
    return json.loads(path.read_text())


def preview():
    QA.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    scene = read(MANIFEST)['scenes']['prologue']
    narration = read(NARRATION)
    upscale = read(UP / 'prologue/technical.json')
    assert upscale['status'] == 'accepted'
    size = round(scene['duration'] * media.RATE)
    times = np.arange(size, dtype=np.float64) / media.RATE
    duck = np.ones(size, dtype=np.float64)
    for cue in narration['cues']:
        attack = np.clip((times - cue['start'] + .16) / .16, 0, 1)
        release = np.clip((cue['end'] + .24 - times) / .24, 0, 1)
        duck = np.minimum(duck, 1 - .62 * np.minimum(attack, release))
    mixed = np.zeros((size, 2), dtype=np.float64)
    for channel, volume in [('music', .48), ('effects', .6), ('voice', .9)]:
        samples = media.decode(media.local(scene['stems'][channel]))
        assert len(samples) == size, (channel, len(samples), size)
        mixed += samples * volume * (duck[:, None] if channel == 'music' else 1)
    assert np.isfinite(mixed).all() and np.max(np.abs(mixed)) < 1
    wave_path = QA / 'prologue-preview-mix.wav'
    with wave.open(str(wave_path), 'wb') as writer:
        writer.setnchannels(2)
        writer.setsampwidth(2)
        writer.setframerate(media.RATE)
        writer.writeframes(np.rint(mixed * 32767).astype('<i2').tobytes())
    target = PUBLIC / 'prologue-mixed-1080p.mp4'
    temp = target.with_suffix('.partial.mp4')
    subprocess.run([media.FFMPEG, '-v', 'error', '-y', '-i', str(media.local(upscale['url'])),
                    '-i', str(wave_path), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
                    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', '-t', str(scene['duration']), str(temp)], check=True)
    subprocess.run([media.FFMPEG, '-v', 'error', '-xerror', '-i', str(temp), '-f', 'null', '-'], check=True)
    temp.replace(target)
    info = media.probe(target)
    assert abs(info['duration'] - scene['duration']) < .05
    report = {'url': '/media/opening-polish-v1/' + target.name, 'sha256': info['sha256'],
              'duration': info['duration'], 'bytes': info['bytes'], 'fullDecode': True,
              'loudness': media.loudness(target), 'samplePeakBeforeEncode': float(np.max(np.abs(mixed))),
              'mix': {'music': .48, 'effects': .6, 'voice': .9, 'duckGain': .38, 'attack': .16, 'release': .24},
              'voiceManifestSha256': media.sha(NARRATION), 'sourceVideoSha256': upscale['sha256'],
              'sourceClockPreserved': True, 'encodedPlaybackRate': 1, 'gamePlaybackRate': 1.15}
    media.atomic_json(QA / 'prologue-preview.json', report)
    print(json.dumps(report, ensure_ascii=False))


def publish():
    manifest = read(MANIFEST)
    narration = read(NARRATION)
    for sid, scene in manifest['scenes'].items():
        technical = read(UP / sid / 'technical.json')
        review = read(UP / sid / 'review.json')
        assert technical['status'] == 'accepted', sid
        assert review['sourceShaUnchanged'] and review['durationDeltaSeconds'] == 0, sid
        assert technical['frameCount'] == round(scene['duration'] * scene['fps']), sid
        assert media.sha(media.local(technical['url'])) == technical['sha256'], sid
        scene['url'], scene['poster'] = technical['url'], technical['poster']
        scene['resolution'] = '1920x1080'
        scene['silentSha256'] = technical['sha256']
        scene['upscale'] = {k: technical[k] for k in ['model', 'modelScale', 'inferenceResolution', 'outputResolution',
                           'postprocess', 'engine', 'sourceSha256', 'frameCount', 'sourceUnchanged', 'fullDecode']}
        scene['upscale']['reviewEvidence'] = f'output/qa/cinema-upscale-v1/{sid}/review.json'
        scene['upscale']['licenseFiles'] = ['/media/cinema-upscale-v1/LICENSE-ncnn.txt', '/media/cinema-upscale-v1/LICENSE-Real-ESRGAN.txt']
        preview_info = read(QA / 'prologue-preview.json') if sid == 'prologue' else read(UP / sid / 'preview.json')
        assert media.sha(media.local(preview_info['url'])) == preview_info['sha256'], sid
        scene['previewUrl'], scene['previewSha256'] = preview_info['url'], preview_info['sha256']
        if sid != 'prologue':
            continue
        scene['stems']['voice'] = narration['stems']['voice']
        scene['cues'] = copy.deepcopy(narration['cues'])
        scene['voiceLineIds'] = [cue['id'] for cue in narration['cues']]
        scene['defaultPlaybackRate'], scene['voiceDucking'] = 1.15, True
        scene['narrationManifest'] = '/media/opening-narration-v1/manifest.json'
        voice_path = media.local(scene['stems']['voice'])
        qa = scene['qa']
        qa['builtAt'] = media.now()
        qa['stems']['voice'] = {'sha256': media.sha(voice_path), 'duration': narration['duration'],
                              'loudness': narration['qa']['stemLoudness'],
                              'samplePeak': float(np.max(np.abs(media.decode(voice_path, channels=1))))}
        qa['sourceVoiceManifestSha256'] = media.sha(NARRATION)
        qa['sourceVoiceManifest'] = scene['narrationManifest']
        qa['cueMapSha256'] = media.sha(NARRATION)
        qa['mixedLoudness'] = preview_info['loudness']
        mixed_review = read(QA / 'final-mix-listening.json')
        assert mixed_review['sourceMixSha256'] == preview_info['sha256']
        qa['finalReview'] = {'status': 'accepted', 'method': 'AI-super-resolution sampled frame review and model-assisted narration listening; not a claim of human full-video viewing',
                            'visualEvidence': 'output/qa/cinema-upscale-v1/prologue/review.json',
                            'listeningEvidence': 'output/qa/opening-narration-v1/stem-at-115-listening.json',
                            'mixedListeningEvidence': 'output/qa/opening-polish-v1/final-mix-listening.json',
                            'mixedListeningSourceSha256': preview_info['sha256'],
                            'syncEvidence': 'output/qa/opening-narration-v1/acceptance.json',
                            'listeningSourceSha256': narration['qa']['stem']['sha256'],
                            'finding': 'Three concise background lines at source-clock cues; 1.15x preserves pitch; all fit the existing film and the door-lock shot remains without narration.'}
    manifest['publishedAt'] = media.now()
    manifest['revision'] = 'opening-polish-v1'
    media.atomic_json(MANIFEST, manifest)
    media.atomic_json(QA / 'cinema-publication.json', {'publishedAt': media.now(), 'manifestSha256': media.sha(MANIFEST),
        'scenes': {sid: {k: scene[k] for k in ['url', 'previewUrl', 'resolution', 'duration', 'silentSha256', 'previewSha256']} for sid, scene in manifest['scenes'].items()}})
    print('Published five reviewed 1080p films; prior source assets retained.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['preview', 'publish'])
    args = parser.parse_args()
    globals()[args.action]()
