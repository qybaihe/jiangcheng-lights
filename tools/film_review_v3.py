"""Independent model-assisted review of actual local clips, with credential-safe logs.

This is a supplementary temporal check, not a replacement for root frame review.
Results are cached by source content hash and brief hash; no arbitrary URL input.
"""
import argparse,base64,hashlib,json,subprocess,sys
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request,urlopen
from media import ENV,ROOT

def review(source,brief):
    source=source.resolve();out=ROOT/'output/cinema-v3/independent-review';out.mkdir(parents=True,exist_ok=True)
    sha=hashlib.sha256(source.read_bytes()).hexdigest();bh=hashlib.sha256(brief.encode()).hexdigest()
    dest=out/f'{source.stem}-{sha[:8]}-{bh[:6]}.json'
    if dest.exists():print(dest.read_text());return
    carrier=out/f'{source.stem}-{sha[:8]}-review.mp4'
    subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-y','-i',str(source),'-vf','scale=768:-2',
        '-c:v','libx264','-crf','23','-preset','fast','-c:a','aac','-b:a','144k','-movflags','+faststart',str(carrier)],check=True)
    prompt=('Inspect this actual generated video from beginning to end. Do not turn the intended script into a claim about what happened. '
      'Use what you can SEE and HEAR. If inaccessible say so. The following is a continuity brief, not evidence: '+brief+
      '\nReturn JSON only with accessible(boolean), observedActions(array of {start,end,observation}), '
      'hardCutsSeconds(array), continuityIssues(array of {time,issue,severity}), '
      'anatomyOrObjectMorphs(array with timestamps), visibleText(array), cameraMotion, frozenOrLoopedAction(boolean), '
      'dialoguePresent(boolean), audioObservations, endingCompletesAction(boolean), usability(pass/revise/uncertain), '
      'confidence(low/medium/high), uncertainty. Watch hands, held objects, unintended teleportation and false geographic landmark changes. '
      'For a short insert, completing a small purposeful action is enough; do not demand a whole story in a single shot. '
      'Distinguish intentional hand-painted animation style from actual broken geometry. Do not judge mute silent masters as failed audio.')
    key=ENV.get('GPT_AK');host=ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')
    if not key:raise RuntimeError('Configured review key missing')
    endpoint=f'https://{host}/api/modelhub/online/v2/crawl?'+urlencode({'ak':key})
    payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':5000,'messages':[{'role':'user','content':[
      {'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':6}})}}]}]}
    request=Request(endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urlopen(request,timeout=240) as response:data=json.load(response)
    raw=data['choices'][0]['message']['content']
    if isinstance(raw,list):raw=''.join(item.get('text','') for item in raw if isinstance(item,dict))
    raw=str(raw).strip()
    if raw.startswith('```'):raw=raw.split('\n',1)[1].rsplit('```',1)[0].strip()
    result={'source':str(source.relative_to(ROOT)),'sourceSha256':sha,'method':'independent model-assisted actual-video review at 6 sampling frames/second; not human viewing','brief':brief,'review':json.loads(raw)}
    dest.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('--brief',required=True);a=p.parse_args()
    try:review(a.source,a.brief)
    except Exception as exc:
        # urllib exceptions can contain an authenticated URL, so omit details.
        print(f'Video review failed ({type(exc).__name__}); request details omitted',file=sys.stderr);sys.exit(1)
