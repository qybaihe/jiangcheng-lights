#!/usr/bin/env python3
"""One randomized, phoneme-only blind contrast. Never edits the first review."""
from pathlib import Path
import array,base64,datetime,hashlib,json,secrets,subprocess,sys
from urllib.request import Request,urlopen
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[3];W=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools'))
from media import ENV
MIX=ROOT/'output/demo-film-v1/review-drafts/style-proof-fullrange.mp4';DRY=ROOT/'public/media/opening-narration-v1/opening-errand.mp3'
MIX_SHA='2d8d9d912be0890442d38bd1c04e2e087eabc673101ad1da90dee2f47eedca29'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_entries','format=duration:stream=sample_rate,channels','-of','json',str(p)]).stdout)
def main():
 assert sha(MIX)==MIX_SHA
 first_review=W.parent/'final-mix-review.json';first_sha=sha(first_review)
 sources=[{'kind':'actual-final-mix','source':str(MIX.relative_to(ROOT)),'sourceSha256':sha(MIX),'start':10.7,'end':13.5},
          {'kind':'released-original-dry-voice','source':str(DRY.relative_to(ROOT)),'sourceSha256':sha(DRY),'start':2.1,'end':4.9}]
 # The dry placement is 8.6 s on the film clock, so source 2.1–4.9 = film 10.7–13.5.
 labels=['K'+secrets.token_hex(2).upper(),'R'+secrets.token_hex(2).upper()];secrets.SystemRandom().shuffle(sources)
 joined=array.array('f');mapping=[];gap=1.0;RATE=48000
 for label,row in zip(labels,sources):
  clip=W/f'name-contrast-{label}.wav'
  # Both passages use the same decode/downmix path, without volume normalisation.
  run(['ffmpeg','-y','-v','error','-xerror','-i',str(ROOT/row['source']),'-map','0:a:0','-af',f"atrim=start={row['start']}:end={row['end']},asetpts=PTS-STARTPTS",'-ar',str(RATE),'-ac','1','-c:a','pcm_s24le',str(clip)])
  samples=array.array('f');samples.frombytes(run(['ffmpeg','-v','error','-xerror','-i',str(clip),'-ar',str(RATE),'-ac','1','-f','f32le','pipe:1']).stdout)
  start=len(joined)/RATE;joined.extend(samples);end=len(joined)/RATE
  mapping.append({**row,'blindLabel':label,'clip':str(clip.relative_to(ROOT)),'clipSha256':sha(clip),'reviewStart':start,'reviewEnd':end,'duration':len(samples)/RATE})
  joined.extend(array.array('f',[0])*round(gap*RATE))
 del joined[-round(gap*RATE):]
 montage=W/'name-contrast.wav';run(['ffmpeg','-y','-v','error','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-c:a','pcm_s24le',str(montage)],input=joined.tobytes())
 duration=len(joined)/RATE;carrier=W/'name-contrast-neutral.mp4'
 run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=0x171e24:s=320x180:r=24','-i',str(montage),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-tune','stillimage','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(duration),'-movflags','+faststart',str(carrier)])
 public_map=[{'label':r['blindLabel'],'start':r['reviewStart'],'end':r['reviewEnd']} for r in mapping]
 prompt='''Listen only to the actual phonetic sounds in the two short audio passages in this neutral video. They are randomized labels, not speaker names. No expected sentence, names, words, alternatives, or source identities are supplied. The passages are excerpts, so an incomplete word at the very end may be an intentional boundary. For each passage, transcribe ONLY the Mandarin pinyin syllables you actually hear, preferably with tone numbers, keeping uncertain syllables marked as uncertain. Do not write Chinese characters, reconstruct semantic sentences, invent a name, choose a plausible proper name, or use language-model probability to fill missing phonemes. Return only JSON: passages:[{label,heardPinyinSyllables,uncertainSyllables,phoneticClarity,backgroundDescription,backgroundObscuresSyllables,evidence}], comparison:{phoneticSequenceSameOrDifferent,heardDifferences,whichIfAnyIsLessDistinct,reason}, confidence, uncertainties. If you cannot reliably distinguish a particular vowel or glide, say so rather than guessing. Describe only actual heard differences, including whether any audible background makes the pronunciation less distinct. Passage timing in seconds: '''+json.dumps(public_map)
 (W/'name-contrast-prompt.txt').write_text(prompt)
 provenance={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'originalFilmSha256':MIX_SHA,'firstReviewSha256Before':first_sha,'sourceOffsetRelationship':'dry voice at film 8.6 s; dry [2.1,4.9] matches film [10.7,13.5]','noVolumeNormalisation':True,'bothDecodeTo':'48000 Hz mono PCM24; identical decode/downmix path','randomizedMappingNotSuppliedToReviewer':mapping,'montage':str(montage.relative_to(ROOT)),'montageSha256':sha(montage),'carrier':str(carrier.relative_to(ROOT)),'carrierSha256':sha(carrier),'carrierProbe':probe(carrier),'reviewerReceivedOnly':public_map}
 (W/'name-contrast-provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
 key=ENV.get('GPT_AK');assert key
 endpoint='https://'+ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')+'/api/modelhub/online/v2/crawl?'+urlencode({'ak':key})
 payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':5000,'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':1}})}}]}]}
 with urlopen(Request(endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST'),timeout=240) as response:result=json.load(response)
 content=result['choices'][0]['message']['content']
 if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
 text=str(content).strip()
 if text.startswith('```'):text=text.split('\n',1)[1].rsplit('```',1)[0].strip()
 observation=json.loads(text)
 assert sha(MIX)==MIX_SHA and sha(first_review)==first_sha
 report={'method':'one randomized model-assisted phoneme-only blind contrast; not human listening','sourceAndExpectedNameHiddenFromReviewer':True,'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),**provenance,'firstReviewPreserved':True,'observation':observation}
 (W/'name-contrast-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as exc:print(type(exc).__name__+': narrow review failed; request details omitted');raise SystemExit(1)
