#!/usr/bin/env python3
"""A-Yao's first-person 118s-film narration, separate from every v1 asset.

The prompt-only project audio endpoint has no exposed speaker/model control.
Generate a single continuous acting take, then cut only at reviewed speech
boundaries. One possible retake is supported, never an automatic retry.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
import numpy as np
from media import ENV

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/demo-film-v2/narration'
FF = '/opt/homebrew/bin/ffmpeg'
FP = '/opt/homebrew/bin/ffprobe'
API = 'https://lv-api.ulikecam.com/cc_ads_api/v1/audio/text_to_audio'
RATE = 48000
CUES = [
 ('V01', .5, 7, '我是阿遥。这次回武汉，本来只打算住一晚。', 'C01 / 成年阿遥乘轮渡回武汉'),
 ('V02', 7.2, 16, '外公在姨妈家休养，还惦记着铺子里的东西，让我替他给街坊送回去。', 'R01 / 接外公电话，修理委托'),
 ('V03', 16.5, 30.8, '先去找林婆婆。借辆车，还是走小时候那条路。', '新增实机 / 借车、骑车寻路去婆婆家；不是已经送到'),
 ('V04', 31.2, 39, '她一眼就认出了我，还翻出我小时候画的画。原来，她一直留着。', 'R02 / 林婆婆与童画'),
 ('V05', 39.2, 47, '蔡姨忙不过来，我就去杂货铺，帮她把东西带齐。', 'R03 / 蔡姨委托与杂货铺物资'),
 ('V06', 47.2, 54.5, '开车到了江边，我又停了下来。那张老照片，还是头一回见。', '驾驶到江边 / 桥影与旧照'),
 ('V07', 54.8, 61.8, '我还借了条小船。桨一划开，连赶路的事都忘了。', '可操作小木船 / 亲手划桨'),
 ('V08', 63.7, 71, '本来就想划一会儿，结果，还认真比起赛来了。', '浮标划船比赛'),
 ('V09', 71.2, 79.7, '快下雨了，我得回去看看。婆婆有人接没有？蔡姨的饭送到了没？', '社区雨前准备 / 确认街坊有人照应'),
 ('V10', 86.5, 95, '听见她说平安，我才松了口气。要不，就再住两天吧。', '小许完整报平安后 / 留下的选择'),
 ('V11', 96, 101, '这一趟带回来的，好像比送出去的还多。', '故事画廊 / 收获的记忆'),
 ('V12', 109.5, 117, '小时候，是他们照应我。这回，换我给他们留盏灯。', '新片尾CG / 成年阿遥、门前街坊与灯'),
]


def now(): return datetime.now(timezone.utc).isoformat()
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def run(args, **kwargs): return subprocess.run(args, capture_output=True, check=True, **kwargs)
def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def probe(path):
    info = json.loads(run([FP, '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)]).stdout)
    return {'duration': float(info['format']['duration']), 'bytes': path.stat().st_size,
            'sha256': sha(path), 'streams': info['streams']}


def prompt(take):
    direction = '''你是一位年轻的成年女性阿遥，二十多岁，刚在武汉的老巷子里过完这一天。你不是解说员，下面是你自己的经历。想象吃完晚饭，你对坐在一米外的熟悉朋友讲今天的小事：不用表演给观众听，不用推销游戏，不是读散文。
只录你一个人的普通话口语干声。同一说话人、同一个连续录音take、自然中声量、清楚结实的发声，不要气声耳语。像平常聊天，语气从想起具体的人和东西里长出来，有轻微的自我调侃、好奇和关切。不是每句都要温柔下坠，不要固定逗号停顿。句子长短不同，停顿随意思走。轻快但不赶，不吞字、不拖腔，不故意把每个字说重。
开头“我是阿遥”是一句随口自我介绍。“本来只打算住一晚”稍带笑意，像自己也没想到。提外公像家常，不是缅怀；外公健在、在姨妈家休养。想起婆婆一直留着童画时，先是小小惊讶，然后心里一暖，不要悲情。说借船和认真比赛时轻松有趣，像玩得忘了时间。快下雨那段真正在惦记街坊，两个问题是真心想问，不要变成播报。听到平安后松口气，“要不”像刚有这个念头。“这一趟”回想一下，话不要讲满。最后自然地把照应传下去，温柔而平实，不升华、不哭、不朗诵、不喊口号。
人物读音：阿遥读 ā yáo，蔡姨读 cài yí，林婆婆读 lín pó po（第二个婆轻声），武汉读 wǔ hàn。照应读 zhào ying，末字自然轻读。所有字词清楚可懂，标准普通话而不是方言表演。
把下面十二个引号里的段落按顺序逐字说出，任何编号、说明都不读；不增删词、不重复。段落之间留0.65秒左右的干净停顿，段落内部按自然意思讲，别按标点机械切开。整体是自然稍轻快的日常说话速度，大约4.5到5个汉字每秒，不追赶时码。开头留0.25秒，最后一句尾字完整落下后留0.7秒。不要添加“嗯”“啊”等剧本外词语。
全程纯录音室干声，完全没有配乐、钢琴、弦乐、节拍、背景气氛、人群、风雨、河水、音效、混响、第二个人或演唱。不要在停顿或结尾偷偷铺音乐。
台词：
'''
    if take == 2:
        extra = OUT / 'take-2-direction.txt'
        if not extra.exists(): raise ValueError('A reviewed concrete retake direction is required')
        # The first take's long cinematic direction encouraged breathy intimacy.
        # Use a plain voice-message acting situation, not more lyrical adjectives.
        direction = '''录制一条成年年轻女生给好朋友发的普通话语音消息。她叫阿遥，二十多岁，刚回武汉玩了一天，现在在轻松地聊自己今天的事。听者就坐在一米远，按面对面聊天的正常中声量说，不要靠近耳朵压低声音。声音明亮、扎实、声带正常闭合、有支撑，元音是实声，不是气声；不要耳语或文艺音频的沙沙漏气感。
不是宣传解说，不是电影旁白，不是读散文，也不是配音腔。句子连起来说，像念头自然往下走，清楚而松弛。不是每个逗号都停，别刻意拉长尾字或固定往下落；情绪主要来自刚想起那件事，不需要表演给观众看。轻快、自然而非刻意温柔。约4.5到5个汉字每秒，真实说话节奏，不赶字。
“我是阿遥”正常随口介绍自己，不要宣布名字。说只住一晚时略微觉得好笑；说婆婆留着画时有一点意外；说比赛时自己也觉得好玩；两个问句真正在关心人，声音仍清楚实在；“要不”是刚想到多住几天；最后一句就平常而亲切地说完，不升华、不煽情、不朗诵。
以下十二段必须按顺序逐字说全，不增删词，不加语气词，不读引号或说明。阿遥是 ā yáo；蔡姨是 cài yí；林婆婆是 lín pó po。外公健在，只在姨妈家休养。“蔡姨的饭送到了没”里的“的”也要正常说出来。普通话儿化“划一会儿”自然说完整。
录音室纯干声，完全没有音乐、伴奏、旋律、节奏、环境声、底噪、混响、风雨水声或第二个人。开始留0.25秒，十二段之间约0.65秒干净静音，段内按意思自然讲话，不要逐逗号机械停顿。最后“灯”说完后留0.7秒。声音保持同一人、同一连续take。
具体重试要求：''' + extra.read_text() + '\n只说以下台词：\n'
    return direction + '\n'.join('“' + c[3] + '”' for c in CUES)


def generate(take):
    OUT.mkdir(parents=True, exist_ok=True)
    text = prompt(take)
    payload = {'prompt': text}
    fingerprint = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    record = OUT / f'take-{take}-generation.json'
    canonical = OUT / f'take-{take}.wav'
    if record.exists():
        previous = json.loads(record.read_text())
        if previous['requestSha256'] != fingerprint: raise ValueError('Do not overwrite an existing take')
        if canonical.exists(): print(json.dumps({'reused': True, 'take': take, 'duration': probe(canonical)['duration']})); return
        raise RuntimeError('Recorded submission exists; do not automatically resubmit an uncertain outcome')
    (OUT / f'take-{take}-prompt.txt').write_text(text)
    save(OUT / 'cue-script.json', {
        'approvedBy': 'parent director; exact supplied first-person revision', 'targetFilmDuration': 118,
        'visualMapSource': 'parent director-provided revision, V03 newly captured; final image alignment owned by parent',
        'voice': 'one young adult female A-Yao, prompt-defined; not an identity clone',
        'cues': [{'id': c[0], 'start': c[1], 'visualEnd': c[2], 'text': c[3], 'visualAnchor': c[4],
                  'targetDuration': round(c[2]-c[1], 3), 'estimatedSpeechSeconds': round(len(re.sub(r'[^\u4e00-\u9fff]', '', c[3]))/4.7, 2)} for c in CUES]})
    ledger = {'state': 'submitting_uncertain', 'submittedAt': now(), 'requestSha256': fingerprint,
              'provider': 'project text_to_audio prompt-only endpoint', 'model': 'not exposed by endpoint',
              'speakerId': None, 'take': take, 'characters': sum(len(c[3]) for c in CUES)}
    save(record, ledger)
    start = time.monotonic()
    response = httpx.post(API, json=payload, timeout=600)
    if not response.is_success:
        ledger.update(state='rejected', httpStatus=response.status_code); save(record, ledger)
        raise RuntimeError('Audio generation HTTP error')
    result = response.json()
    if result.get('base_resp', {}).get('code') not in (None, 0):
        ledger['state'] = 'provider_failed'; save(record, ledger); raise RuntimeError('Audio provider failed')
    data = base64.b64decode(result.get('audio_base64', ''), validate=True)
    if not data.startswith((b'RIFF', b'RF64')): raise RuntimeError('Audio response is not WAV')
    raw = OUT / f'take-{take}.raw.wav'; raw.write_bytes(data)
    run([FF, '-y', '-v', 'error', '-i', str(raw), '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s24le', '-map_metadata', '-1', str(canonical)])
    run([FF, '-v', 'error', '-xerror', '-i', str(canonical), '-f', 'null', '-'])
    ledger.update(state='generated_needs_review', rawSha256=sha(raw), asset=probe(canonical), requestSeconds=round(time.monotonic()-start, 3))
    save(record, ledger)
    print(json.dumps({'generated': True, 'take': take, 'duration': ledger['asset']['duration'], 'requestSeconds': ledger['requestSeconds']}), flush=True)


def listen(source, name, prompt_file=None):
    """Actual-file blind listening with an EXACT-duration carrier, never -shortest."""
    source = source.resolve(); OUT.mkdir(parents=True, exist_ok=True)
    duration = probe(source)['duration']; dest = OUT / f'{name}-listening.json'
    prompt_text = prompt_file.read_text() if prompt_file else '''Listen to ALL of this actual audio, presented with an intentionally blank video. Do not infer a script from any filename or context. No expected transcript is supplied. Return only JSON with audioAccessible:boolean; spokenSegments:[{start,end,heardChineseText,heardNamePinyin,delivery,intelligibility}]; voiceConsistency:{sameSpeaker:boolean,description}; musicOrSinging; environmentalSounds; clippedWordsOrDistortion:[{at,evidence}]; naturalness:{ratingOutOf10,description,specificUnnaturalMoments:[{at,evidence}],soundsLikeCharacterChatOrPromo}; silenceGaps:[{start,end}]; confidence; uncertainties. Transcribe EVERY Chinese word actually audible, including particles, additions, omissions and repetitions. Give pinyin for uncertain names instead of guessing their spelling. Segment at actual spoken phrase boundaries, with accurate relative timestamps. Assess whether this is a young adult woman recalling her own day to a friend, or generic promotional/announcer/poetry reading. Specifically describe variation of cadence and sentence endings, if it sounds whispery, breathy, rushed, melodramatic or mechanical. Listen for real music or noise and do not assume faint consonants or breaths are background music. Intentional silent gaps are not defects. Acknowledge inaccessible audio. Do not invent precision beyond what you hear.'''
    prompt_text += f'\nThe carrier and audio last exactly {duration:.6f} seconds. All timestamps must be decimal seconds in [0, {duration:.6f}], never a mm:ss string with the colon removed. There is no content after that duration.'
    fingerprint = hashlib.sha256(prompt_text.encode()).hexdigest()
    if dest.exists():
        existing = json.loads(dest.read_text())
        if existing.get('sourceSha256') == sha(source) and existing.get('promptSha256') == fingerprint:
            print(dest.read_text()); return
        raise ValueError('Existing review has a different source or prompt; use a new review name')
    carrier = OUT / f'{name}-neutral.mp4'
    run([FF, '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x171e24:s=320x180:r=24',
         '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'ultrafast',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', f'{duration:.6f}', '-movflags', '+faststart', str(carrier)])
    carrier_probe = probe(carrier)
    if abs(carrier_probe['duration']-duration) > .05: raise RuntimeError('Carrier duration mismatch')
    key = ENV.get('GPT_AK'); assert key
    endpoint = 'https://' + ENV.get('MODEL_GATEWAY_HOST', 'aidp-i18ntt-sg.tiktok-row.net') + '/api/modelhub/online/v2/crawl?' + urlencode({'ak': key})
    payload = {'model': ENV.get('GEMINI_MODEL', 'gemini-3.5-flash'), 'stream': False, 'max_tokens': 11000,
               'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt_text},
                 {'type': 'file_url', 'file_url': {'mime_type': 'video/mp4', 'url': base64.b64encode(carrier.read_bytes()).decode(),
                  'extra': json.dumps({'videoMetaData': {'fps': 1}})}}]}]}
    response = httpx.post(endpoint, json=payload, timeout=300)
    if not response.is_success: raise RuntimeError('Listening gateway HTTP error')
    result = response.json(); content = result['choices'][0]['message']['content']
    if isinstance(content, list): content = ''.join(x.get('text', '') for x in content if isinstance(x, dict))
    raw = str(content).strip(); (OUT / f'{name}-response.txt').write_text(raw)
    if raw.startswith('```'): raw = raw.split('\n', 1)[1].rsplit('```', 1)[0].strip()
    report = {'reviewedAt': now(), 'method': 'model-assisted actual-file blind listening; not human listening',
              'expectedTranscriptHiddenFromReviewer': prompt_file is None, 'source': str(source.relative_to(ROOT)),
              'sourceSha256': sha(source), 'sourceDuration': duration, 'carrierSha256': sha(carrier),
              'carrierDuration': carrier_probe['duration'], 'promptSha256': fingerprint, 'observation': json.loads(raw)}
    (OUT / f'{name}-prompt.txt').write_text(prompt_text); save(dest, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


def signal(source):
    raw = run([FF, '-v', 'error', '-i', str(source), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', '-']).stdout
    pcm = np.frombuffer(raw, dtype='<f4')
    result = run([FF, '-hide_banner', '-i', str(source), '-af', 'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-'])
    (OUT / f'{source.stem}-silence.log').write_bytes(result.stderr)
    starts = list(map(float, re.findall(r'silence_start: ([\d.]+)', result.stderr.decode())))
    ends = list(map(float, re.findall(r'silence_end: ([\d.]+)', result.stderr.decode())))
    if len(starts) > len(ends): ends.append(len(pcm)/RATE)
    gaps = [{'start': a, 'end': b, 'duration': round(b-a, 6)} for a,b in zip(starts,ends)]
    report = {'sourceSha256': sha(source), 'decodedDuration': len(pcm)/RATE, 'sampleRate': RATE,
              'peak': float(np.max(np.abs(pcm))), 'clippedSamples': int(np.sum(np.abs(pcm)>=1)),
              'finite': bool(np.isfinite(pcm).all()), 'silenceThresholdDb': -38, 'silenceGaps': gaps}
    save(OUT / f'{source.stem}-signal.json', report); print(json.dumps(report, ensure_ascii=False, indent=2))


def loudness(path):
    result = run([FF, '-hide_banner', '-i', str(path), '-af', 'loudnorm=I=-19:TP=-2.5:LRA=9:print_format=json', '-f', 'null', '-'])
    return json.loads(re.findall(r'\{\s*"input_i".*?\}', result.stderr.decode(), re.S)[-1])


def stamp(seconds):
    ms = round(seconds*1000)
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'


def build(cuts_path):
    """Cuts and phrases are manually approved AFTER actual-file blind listening."""
    cuts = json.loads(cuts_path.read_text()); source = ROOT / cuts['source']
    if cuts.get('status') != 'reviewed' or cuts['sourceSha256'] != sha(source): raise ValueError('Reviewed source hash required')
    if len(cuts.get('cues', [])) != len(CUES): raise ValueError('Exactly twelve complete cues required')
    duration = probe(source)['duration']; timeline = np.zeros(118*RATE, dtype=np.float32)
    records = []; phrases = []; reel = []
    for authored, cut in zip(CUES, cuts['cues']):
        ident, start, visual_end, authored_text, anchor = authored
        text = cut['text']
        if cut['id'] != ident: raise ValueError('Cue identity differs from approved script')
        if text != authored_text and not cut.get('textVariationApproval'): raise ValueError('Unapproved spoken-text variation')
        a, b = cut['sourceIn'], cut['sourceOut']
        if not 0 <= a < b <= duration: raise ValueError('Invalid cut')
        # Never shorten or stretch speech to make it fit a montage window.
        actual = round((b-a)*RATE)/RATE
        if start+actual > visual_end: raise ValueError(f'{ident} exceeds approved window; report to director first')
        raw = OUT / f'{ident}-cut.wav'; wav = OUT / f'{ident}.wav'; mp3 = OUT / f'{ident}.mp3'
        run([FF, '-y', '-v', 'error', '-i', str(source), '-af',
             f'atrim=start={a}:end={b},asetpts=PTS-STARTPTS,afade=t=in:d=0.006,afade=t=out:st={actual-.009}:d=0.009',
             '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s24le', '-map_metadata', '-1', str(raw)])
        m = loudness(raw)
        af = ('loudnorm=I=-19:TP=-2.5:LRA=9:measured_I={input_i}:measured_TP={input_tp}:'
              'measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true').format(**m)
        run([FF, '-y', '-v', 'error', '-i', str(raw), '-af', af, '-ar', str(RATE), '-ac', '1', '-c:a', 'pcm_s24le', '-map_metadata', '-1', str(wav)])
        run([FF, '-y', '-v', 'error', '-i', str(wav), '-c:a', 'libmp3lame', '-b:a', '192k', '-map_metadata', '-1', str(mp3)])
        pcm = np.frombuffer(run([FF, '-v', 'error', '-xerror', '-i', str(wav), '-ar', str(RATE), '-ac', '1', '-f', 'f32le', '-']).stdout, dtype='<f4')
        if len(pcm) != round(actual*RATE) or not np.isfinite(pcm).all() or np.max(np.abs(pcm)) >= 1: raise RuntimeError('Invalid decoded clip signal')
        actual = len(pcm)/RATE; end = start+actual; index = round(start*RATE)
        timeline[index:index+len(pcm)] += pcm; reel.extend([pcm, np.zeros(round(.65*RATE), dtype=np.float32)])
        measured = loudness(wav)
        record = {'id': ident, 'text': text, 'start': start, 'end': round(end, 6), 'duration': actual,
                  'visualEnd': visual_end, 'visualAnchor': anchor, 'windowFit': True,
                  'wav': str(wav.relative_to(ROOT)), 'wavSha256': sha(wav), 'mp3': str(mp3.relative_to(ROOT)), 'mp3Sha256': sha(mp3),
                  'sourceCuts': [[a,b]], 'sourceSha256': sha(source), 'sampleRate': RATE, 'channels': 1, 'samples': len(pcm),
                  'loudness': {'integratedLufs': float(measured['input_i']), 'truePeakDbtp': float(measured['input_tp'])},
                  'fullDecode': True, 'timeStretch': False, 'internalSilenceRemoved': False}
        if text != authored_text:
            record['generatedFromText'] = authored_text
            record['textVariationApproval'] = cut['textVariationApproval']
        records.append(record)
        if ''.join(p['text'] for p in cut['phrases']) != text: raise ValueError('Phrase text coverage differs')
        for n, phrase in enumerate(cut['phrases'], 1):
            x, y = phrase['sourceSpeech']
            if not a <= x < y <= b: raise ValueError('Phrase extends outside its source cut')
            speech_start = start + x-a; speech_end = start+y-a
            phrases.append({'cueId': ident, 'phrase': n, 'text': phrase['text'],
                            'speechStart': round(speech_start, 3), 'speechEnd': round(speech_end, 3),
                            'start': round(max(start, speech_start-.04), 3), 'end': round(min(end, speech_end+.14), 3),
                            'sourceSpeech': [x,y]})
    for previous, following in zip(phrases, phrases[1:]):
        previous['end'] = min(previous['end'], following['start'])
    for name, pcm in [('narration-118s.wav', timeline), ('clips-review.wav', np.concatenate(reel[:-1]))]:
        run([FF, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '1', '-i', 'pipe:0', '-c:a', 'pcm_s24le', '-map_metadata', '-1', str(OUT/name)], input=pcm.astype('<f4').tobytes())
    save(OUT / 'phrase-subtitles.json', {'sourceSha256': sha(source),
         'method': 'actual-file blind transcript identity plus source waveform/silence bounds; 40ms lead/140ms tail, not equal text division', 'cues': phrases})
    (OUT/'narration-phrases.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(p["start"])} --> {stamp(p["end"])}\n{p["text"]}' for i,p in enumerate(phrases))+'\n')
    (OUT/'narration-cues.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(p["start"])} --> {stamp(p["end"])}\n{p["text"]}' for i,p in enumerate(records))+'\n')
    manifest = {'version': 'demo-film-v2-first-person-narration', 'status': 'built_needs_final_listening',
                'source': str(source.relative_to(ROOT)), 'sourceSha256': sha(source),
                'voice': 'one continuous prompt-defined young adult female A-Yao; not an identity clone',
                'model': 'not exposed by project text_to_audio endpoint', 'cues': records,
                'stem': str((OUT/'narration-118s.wav').relative_to(ROOT)), 'stemSha256': sha(OUT/'narration-118s.wav'),
                'stemDuration': probe(OUT/'narration-118s.wav')['duration'], 'phraseSubtitles': str((OUT/'phrase-subtitles.json').relative_to(ROOT)),
                'phraseSrt': str((OUT/'narration-phrases.srt').relative_to(ROOT)),
                'visualSync': 'fits director-provided revision windows; parent verifies final picture alignment, especially newly captured V03'}
    save(OUT/'clips.json', manifest)
    print(json.dumps({'built': True, 'cues': [{k:c[k] for k in ['id','duration','start','end','visualEnd']} for c in records], 'phrases': len(phrases), 'stemDuration': manifest['stemDuration']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['generate', 'listen', 'signal', 'build'])
    parser.add_argument('--take', type=int, choices=[1,2], default=1)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--name', default='take-1-blind')
    parser.add_argument('--prompt-file', type=Path)
    parser.add_argument('--cuts', type=Path, default=OUT/'reviewed-cuts.json')
    args = parser.parse_args()
    try:
        if args.action == 'generate': generate(args.take)
        elif args.action == 'listen': listen(args.source or OUT/f'take-{args.take}.wav', args.name, args.prompt_file)
        elif args.action == 'build': build(args.cuts)
        else: signal(args.source or OUT/f'take-{args.take}.wav')
    except Exception as error:
        # Credentials and HTTP request/signed-URL representations are never logged.
        print(type(error).__name__ + ': narration stage failed; sensitive details omitted')
        raise SystemExit(1)
