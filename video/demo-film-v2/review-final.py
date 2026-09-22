"""Supplementary model-assisted review of actual v2 master bytes, never the script."""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode
import argparse, base64, hashlib, json, subprocess, sys
import httpx

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from media import ENV
OUT=ROOT/'output/demo-film-v2'
REVIEW=OUT/'review'
FILM=OUT/'江城有灯-比赛Demo-1080p-v2.mp4'
FF='/opt/homebrew/bin/ffmpeg'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main(mode):
    REVIEW.mkdir(parents=True,exist_ok=True)
    carrier=REVIEW/f'{mode}-review-carrier.mp4'
    if mode=='mix':
        subprocess.run([FF,'-y','-v','error','-f','lavfi','-i','color=c=0x172820:s=320x180:r=30','-i',str(FILM),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','copy','-t','118','-movflags','+faststart',str(carrier)],check=True)
        prompt='''Listen to the complete actual audio in this deliberately blank 118-second video. No expected transcript is supplied. Give compact JSON only: audioAccessible:boolean; heardSpeech:[{start,end,text,speaker,delivery}], narratorConsistency:{consistent:boolean,description}, emotionalArc, characterConversationalNotAnnouncer:boolean, unnaturalMoments:[{time,reason}], overlapOrMasking:[{time,wordsAffected}], clippedWords:[{time,words}], musicAndEffectsBalance, endingComplete:boolean, passOrRevise, confidence, uncertainties. Transcribe the actual Chinese words, not inferred context; include particles. One row per complete sentence group, about 13 rows, not every word; the native game character is a different speaker. Report only real problems and do not fill empty lists. Assess if the narrator is telling a personal story naturally, if any spoken words are obscured by background music or game dialogue, or cut off at a transition. Use decimal seconds 0–118. All speech and music must be assessed from the supplied audio; don't pretend to hear if inaccessible. Keep output below 3500 tokens.'''
        offset=0
    else:
        subprocess.run([FF,'-y','-v','error','-ss','16','-i',str(FILM),'-t','23','-vf','scale=960:540','-c:v','libx264','-crf','21','-preset','fast','-c:a','aac','-b:a','192k','-movflags','+faststart',str(carrier)],check=True)
        prompt='''Inspect this actual 23-second game-demo excerpt, not an imagined intended story. Return compact JSON only with videoAccessible, observedActions:[{start,end,visibleAction}], directionContinuity, arrivalAndDismountVisible:boolean, actualNpcInteractionVisible:boolean, taskProgressVisible, disruptiveCollisionsOrStalls:[{time,evidence}], overlaysLegible, dialogueOrSubtitleProblems:[{time,evidence}], passOrRevise, confidence, uncertainties. Distinguish chapter labels from events actually visible in the game. Watch the bicycle, route/map, rider, stopping, walking and NPC contact. Editing/time compression is allowed; do not require an uncut trip. Do not infer completion only from an editorial caption. Keep timestamps relative to this 23-second clip, decimal seconds, and response under 1600 tokens.'''
        offset=16
    dest=REVIEW/f'{mode}-actual-master-review.json'
    fingerprint=hashlib.sha256(prompt.encode()).hexdigest()
    if dest.exists():
        previous=json.loads(dest.read_text())
        if previous['sourceSha256']==sha(FILM) and previous['promptSha256']==fingerprint:
            print(json.dumps(previous,ensure_ascii=False));return
        raise ValueError('Review exists for different bytes; archive before retry')
    endpoint='https://'+ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')+'/api/modelhub/online/v2/crawl?'+urlencode({'ak':ENV['GPT_AK']})
    payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':5500,'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':1 if mode=='mix' else 6}})}}]}]}
    response=httpx.post(endpoint,json=payload,timeout=300)
    if not response.is_success:raise RuntimeError('Review gateway HTTP failure')
    raw=response.json()['choices'][0]['message']['content']
    if isinstance(raw,list):raw=''.join(x.get('text','') for x in raw if isinstance(x,dict))
    raw=str(raw).strip();(REVIEW/f'{mode}-response.txt').write_text(raw)
    if raw.startswith('```'):raw=raw.split('\n',1)[1].rsplit('```',1)[0].strip()
    result={'reviewedAt':datetime.now(timezone.utc).isoformat(),'method':'model-assisted actual-file review; not human listening','source':str(FILM.relative_to(ROOT)),'sourceSha256':sha(FILM),'carrier':str(carrier.relative_to(ROOT)),'carrierSha256':sha(carrier),'sourceOffset':offset,'promptSha256':fingerprint,'expectedTranscriptHidden':True,'observation':json.loads(raw)}
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('mode',choices=['mix','task-route']);args=p.parse_args()
    try:main(args.mode)
    except Exception as e:
        print(type(e).__name__+': actual-film review failed; request details omitted',file=sys.stderr);raise SystemExit(1)
