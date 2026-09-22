#!/usr/bin/env python3
"""Blind review of the frozen 30 s Remotion render, preserving actual AAC packets."""
from pathlib import Path
import sys,subprocess,hashlib,json,base64,datetime
from urllib.request import Request,urlopen
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[3];OUT=ROOT/'output/demo-film-v1';WORK=OUT/'mix-review';SOURCE=OUT/'江城有灯-30秒风格样片-1080p-v1.mp4';EXPECTED_SHA='2d8d9d912be0890442d38bd1c04e2e087eabc673101ad1da90dee2f47eedca29'
sys.path.insert(0,str(ROOT/'tools'))
from media import ENV
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(cmd):return subprocess.run(cmd,check=True,capture_output=True)
def probe(p):return json.loads(run(['ffprobe','-v','error','-show_entries','format=duration,size:stream=index,codec_type,codec_name,sample_rate,channels,duration','-of','json',str(p)]).stdout)
def packet_hash(p):return run(['ffmpeg','-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']).stdout.decode().strip()
def main():
 assert sha(SOURCE)==EXPECTED_SHA
 info=probe(SOURCE);duration=float(info['format']['duration']);carrier=WORK/'final-mix-neutral.mp4'
 run(['ffmpeg','-y','-v','error','-f','lavfi','-i','color=c=0x171e24:s=320x180:r=24','-i',str(SOURCE),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-tune','stillimage','-pix_fmt','yuv420p','-c:a','copy','-t',str(duration),'-movflags','+faststart',str(carrier)])
 source_packet_hash=packet_hash(SOURCE);carrier_packet_hash=packet_hash(carrier);assert source_packet_hash==carrier_packet_hash
 prompt='''Listen throughout the actual final-mix audio carried by this intentionally neutral blank video. No source descriptions, expected transcript, expected speaker count, or planned timings are supplied. Do not infer audio from the blank image. Return only JSON: audioAccessible:boolean; speechSegments:[{start,end,heardChineseText,heardNamePinyin,intelligibility,voiceDescription,delivery,maskedWords}]; simultaneousSpeakers:[{start,end,evidence}]; speechMasking:[{start,end,evidence}]; noticeableVoiceTimbreChanges:[{at,fromDescription,toDescription,naturalOrDistracting,evidence}]; musicDescription; soundEffectsOrGameAudioDescription; transitionObservations:[{at,description,abruptOrNatural}]; openingQuality; endingQuality; clicksClippedWordsOrDistortion:[{at,evidence}]; unwantedExtraSpeechOrSinging; overallNarrationContinuity; overallMixVerdict; confidence; uncertainties. Transcribe every actual audible Chinese word exactly; if a name spelling is ambiguous supply heard pinyin and tones. Specifically judge whether all narration stays intelligible above the score and other sound, whether two voices talk over each other, whether there are obvious distracting changes of speaker timbre across narration passages, and whether scene transitions produce harsh jumps, sudden gaps, jarring sound changes, or music level pumping. Timbre compatibility is not proof of the same voice identity or cloning; describe audible qualities without claiming identity. Distinguish natural deliberate pauses and game effects from audio glitches. Report any issue with a specific actual time. If the opening or ending is abruptly cut rather than natural, describe what is cut. Acknowledge if audio is inaccessible. This is blind listening with no expected text supplied.'''
 (WORK/'listening-prompt.txt').write_text(prompt)
 key=ENV.get('GPT_AK');assert key
 endpoint='https://'+ENV.get('MODEL_GATEWAY_HOST','aidp-i18ntt-sg.tiktok-row.net')+'/api/modelhub/online/v2/crawl?'+urlencode({'ak':key})
 payload={'model':ENV.get('GEMINI_MODEL','gemini-3.5-flash'),'stream':False,'max_tokens':6500,'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'file_url','file_url':{'mime_type':'video/mp4','url':base64.b64encode(carrier.read_bytes()).decode(),'extra':json.dumps({'videoMetaData':{'fps':1}})}}]}]}
 with urlopen(Request(endpoint,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST'),timeout=240) as response:result=json.load(response)
 content=result['choices'][0]['message']['content']
 if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
 text=str(content).strip()
 if text.startswith('```'):text=text.split('\n',1)[1].rsplit('```',1)[0].strip()
 observation=json.loads(text)
 assert sha(SOURCE)==EXPECTED_SHA
 report={'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),'method':'model-assisted blind listening to frozen Remotion final MP4 mix through a neutral carrier; not human listening','source':str(SOURCE.relative_to(ROOT)),'sourceMp4Sha256':EXPECTED_SHA,'sourceProbe':info,'carrier':str(carrier.relative_to(ROOT)),'carrierSha256':sha(carrier),'carrierProbe':probe(carrier),'audioPacketHash':source_packet_hash,'carrierAudioPacketHash':carrier_packet_hash,'audioPacketsUnchanged':True,'expectedTranscriptAndCueTimesHiddenFromReviewer':True,'sourceUnmodifiedAfterReview':True,'observation':observation}
 (OUT/'final-mix-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as exc:
  print(type(exc).__name__+': mix review failed; request details omitted');raise SystemExit(1)
