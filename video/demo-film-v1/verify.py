"""Inspect actual MP4 bytes and the editable timeline; never expose credentials."""
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/demo-film-v1'
FILM = OUT / '江城有灯-30秒风格样片-1080p-v1.mp4'


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def main():
    plan = json.loads((OUT/'proof-props.json').read_text())
    ledger = json.loads((OUT/'proof-asset-ledger.json').read_text())
    final_plan = json.loads((ROOT/'video/demo-film-v1/production-plan.json').read_text())
    for shots, end in ((plan['shots'], 30), (final_plan['segments'], 110)):
        cursor = 0
        for shot in shots:
            assert abs(shot['from'] - cursor) < 1e-7, shot['id']
            cursor += shot['duration']
        assert cursor == end
    assert sum(s['duration'] for s in final_plan['segments'] if s['type']=='gameplay') == 92
    assert sum(s['duration'] for s in plan['shots'] if s['type']=='game') == 12
    for asset in ledger['assets']:
        original = ROOT / asset['source']
        local = ROOT / 'video/demo-film-v1/public' / asset['asset']
        assert original.read_bytes() == local.read_bytes()
        assert hashlib.sha256(local.read_bytes()).hexdigest() == asset['sha256']
    for cue in plan['captions'] + plan['voice']:
        assert cue['from'] >= 0 and cue['from'] + cue['duration'] <= 30
    for a, b in zip(plan['voice'], plan['voice'][1:]):
        assert a['from'] + a['duration'] <= b['from']
    info = json.loads(run(['/opt/homebrew/bin/ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(FILM)]).stdout)
    video = next(s for s in info['streams'] if s['codec_type']=='video')
    audio = next(s for s in info['streams'] if s['codec_type']=='audio')
    assert (video['width'],video['height']) == (1920,1080)
    assert video['codec_name']=='h264' and video['pix_fmt']=='yuv420p'
    assert video['avg_frame_rate']=='30/1' and int(video['nb_read_frames'])==900
    assert audio['codec_name']=='aac' and int(audio['sample_rate'])==48000
    assert 30 <= float(info['format']['duration']) < 30.1
    assert FILM.stat().st_size < 500_000_000
    decode = run(['/opt/homebrew/bin/ffmpeg','-v','error','-xerror','-i',str(FILM),'-f','null','-'])
    assert not decode.stderr.strip()
    black = run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-nostats','-i',str(FILM),'-an','-vf','blackdetect=d=0.07:pix_th=0.05:pic_th=0.98','-f','null','-'])
    (OUT/'black-frame-check.log').write_text(black.stderr)
    black_events = re.findall(r'black_start:[^\n]+',black.stderr)
    assert not black_events, black_events
    loud = run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-nostats','-i',str(FILM),'-vn','-af','ebur128=peak=true','-f','null','-'])
    (OUT/'mix-loudness.log').write_text(loud.stderr)
    text = loud.stderr.split('Summary:')[-1]
    integrated = float(re.search(r'I:\s*([-\d.]+) LUFS',text)[1])
    peak = float(re.search(r'Peak:\s*([-\d.]+) dBFS',text)[1])
    assert -30 < integrated < -10 and peak < -1
    data = FILM.read_bytes()
    result = {'status':'technical-pass','kind':'30-second style proof, not final competition video',
        'path':str(FILM),'bytes':len(data),'megabytes':round(len(data)/1e6,2),'sha256':hashlib.sha256(data).hexdigest(),
        'width':1920,'height':1080,'fps':30,'frames':900,'duration':float(info['format']['duration']),
        'videoCodec':'h264','pixelFormat':'yuv420p','colorSpace':video.get('color_space'),'colorRange':video.get('color_range'),'audioCodec':'aac','audioSampleRate':48000,
        'fullDecode':'passed','unintendedBlackIntervals':black_events,
        'audio':{'integratedLUFS':integrated,'truePeakDbTP':peak},
        'sourceAssetsVerified':len(ledger['assets']),'actualGameplaySeconds':12,
        'fullCompetitionPlan':{'seconds':110,'gameplaySeconds':92,'status':'planned, not yet fully recorded'},
        'scope':['Genuine current-build 12-second gameplay navigation recording, checkpoint fixture disclosed in capture manifest.',
                 'Opening reused approved Seedance CG; ending is newly generated Image2 still with graphic motion, not new Seedance video.',
                 'Technical inspection does not claim human headphone listening or completed full-story recording.']}
    (OUT/'proof-technical-acceptance.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    main()
