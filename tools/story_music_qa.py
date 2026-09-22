"""Model-assisted listening through the existing multimodal gateway contract.

Uses a neutral video carrier because the local gateway documents video/mp4.
The audio is unchanged apart from AAC encoding. This is not human listening.
"""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from media import ENV, ROOT
from story_music import probe, loudness, run


def listen(cue, version='v1', loop_seam=False):
    source = ROOT / 'output/story-audio/sources' / f'{cue}-{version}.wav'
    outdir = ROOT / 'output/story-audio/qa'
    outdir.mkdir(parents=True, exist_ok=True)
    suffix = 'seam' if loop_seam else 'listening'
    carrier = outdir / f'{cue}-{version}-{suffix}.mp4'
    result_path = outdir / f'{cue}-{version}-{suffix}.json'
    if result_path.exists():
        print(result_path.read_text())
        return
    if loop_seam:
        manifest = json.loads((ROOT / 'public/media/story-music-manifest.json').read_text())
        track = manifest['tracks'].get(cue) or manifest['sfx'][cue]
        original = ROOT / 'public' / track['url'].lstrip('/')
        length = track['qa']['signal']['decodedDuration']
        source = outdir / f'{cue}-{version}-seam.wav'
        filters = (f'[0:a]asplit=2[a][b];'
                   f'[a]atrim=start={length-7},asetpts=PTS-STARTPTS[tail];'
                   '[b]atrim=end=7,asetpts=PTS-STARTPTS[head];'
                   '[tail][head]concat=n=2:v=0:a=1[out]')
        run(['ffmpeg', '-y', '-v', 'error', '-i', str(original), '-filter_complex', filters,
             '-map', '[out]', '-c:a', 'pcm_s16le', str(source)])
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i',
                    'color=c=0x171e24:s=320x180:r=1', '-i', str(source),
                    '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', str(carrier)], check=True)
    key = ENV.get('GPT_AK')
    if not key:
        raise RuntimeError('GPT_AK is missing')
    host = ENV.get('MODEL_GATEWAY_HOST', 'aidp-i18ntt-sg.tiktok-row.net')
    endpoint = f'https://{host}/api/modelhub/online/v2/crawl?' + urlencode({'ak': key})
    prompt = (
        'Listen carefully to the actual audio throughout this video. The image is an intentionally '
        'neutral blank carrier and gives no information about the sound. Do not infer content from '
        'the blank frame, filename, expectations or musical stereotypes. Report only what you hear. '
        'Return one JSON object with: audibleContent, instrumentalMusic (boolean), '
        'humanSpeechOrSinging (boolean), vocalEvidence (timestamps and words or sounds, empty if none), '
        'instrumentsOrSoundSources (array), mood (array), beginningMiddleEnd (three short actual listening notes), '
        'obviousRepeatedShortLoop (boolean), loopEvidence, suddenClicksGapsOrDistortion (array with timestamps), '
        'suitableAsQuietDialogueUnderscore (boolean), confidence (low/medium/high), uncertainties. '
        'Acknowledge if the audio was not actually accessible; do not invent a listening report. '
        'For a sound effect rather than music, simply describe the effects, count distinct events, '
        'and set instrumentalMusic and suitableAsQuietDialogueUnderscore false. Distinguish a mechanical '
        'click that is part of an intentional effect from an encoding glitch.'
    )
    if loop_seam:
        prompt += (' This is a 14-second seam test: the final 7 seconds of a finished music loop '
                   'are joined to its first 7 seconds, with the actual playback boundary at exactly '
                   '7 seconds. Specifically describe whether there is a conspicuous musical restart, '
                   'click, silence, tempo disruption or loudness jump at 7 seconds. Add loopSeamAudible '
                   '(boolean) and seamEvidence fields. Do not mistake a normal new musical phrase '
                   'for an encoding error; report whether the join is distracting during quiet dialogue.')
    payload = {'model': ENV.get('GEMINI_MODEL', 'gemini-3.5-flash'), 'stream': False, 'max_tokens': 4000,
               'messages': [{'role': 'user', 'content': [
                   {'type': 'text', 'text': prompt},
                   {'type': 'file_url', 'file_url': {'mime_type': 'video/mp4',
                       'url': base64.b64encode(carrier.read_bytes()).decode(),
                       'extra': json.dumps({'videoMetaData': {'fps': 1}})}}]}]}
    request = Request(endpoint, data=json.dumps(payload).encode(),
                      headers={'Content-Type': 'application/json'}, method='POST')
    with urlopen(request, timeout=240) as response:
        data = json.load(response)
    content = data['choices'][0]['message']['content']
    if isinstance(content, list):
        content = ''.join(p.get('text', '') for p in content if isinstance(p, dict))
    raw = str(content).strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    observation = json.loads(raw)
    result = {'cue': cue, 'method': 'model-assisted listening; neutral MP4 carries ' +
              ('published loop seam' if loop_seam else 'full source audio'),
              'source': str(source.relative_to(ROOT)), 'measured': probe(source),
              'loudness': loudness(source), 'observation': observation}
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('cue')
    parser.add_argument('--version', default='v1')
    parser.add_argument('--loop-seam', action='store_true')
    args = parser.parse_args()
    try:
        listen(args.cue, args.version, args.loop_seam)
    except HTTPError as exc:
        print(f'Audio listening HTTP {exc.code}; response body omitted', file=sys.stderr)
        sys.exit(1)
    except URLError:
        print('Audio listening connection failed; request details omitted', file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        # Auth is in the gateway query. Do not print request exceptions/URLs.
        safe = str(exc)
        for name in ('GPT_AK', 'ARK_API_KEY'):
            if ENV.get(name):
                safe = safe.replace(ENV[name], '[redacted]')
        print(f'{type(exc).__name__}: {safe[:350]}', file=sys.stderr)
        sys.exit(1)
