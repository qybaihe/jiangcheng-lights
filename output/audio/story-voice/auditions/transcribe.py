"""Local Chinese ASR spot check; no audio is uploaded by this script."""
from pathlib import Path
import importlib.metadata
import datetime
import json
import mlx_whisper
import argparse
parser=argparse.ArgumentParser()
parser.add_argument("--model",default="mlx-community/whisper-base-mlx")
parser.add_argument("--output",default="asr-review.json")
args=parser.parse_args()

root=Path(__file__).resolve().parents[4]
audio_root=Path(__file__).resolve().parent
samples=json.loads((audio_root/'manifest.json').read_text())['samples']
production=json.loads((root/'public/media/story-voice-manifest.json').read_text())
for line_id in ['intro-commissions']:
 line=production['lines'][line_id]
 sample=line['variants']['default']
 samples.append({'profileId':'grandpa-proper-nouns','voiceId':sample['voiceId'],'lineId':line_id,'text':line['text'],'file':'public'+sample['url']})
report={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'provider':'local-mlx-whisper','clientVersion':importlib.metadata.version('mlx-whisper'),'model':args.model,'language':'zh','method':'Local ASR of 9 role auditions plus a proper-noun line; no initial transcript prompt. A transcript is auxiliary evidence, not human listening approval.','samples':[]}
for sample in samples:
 print('ASR',sample['profileId'],flush=True)
 result=mlx_whisper.transcribe(str(root/sample['file']),path_or_hf_repo=report['model'],language='zh',temperature=0,condition_on_previous_text=False,verbose=False)
 row={**sample,'transcript':result['text'],'segments':[{'start':x['start'],'end':x['end'],'text':x['text'],'avgLogprob':x.get('avg_logprob'),'noSpeechProb':x.get('no_speech_prob')} for x in result['segments']]}
 report['samples'].append(row)
 (audio_root/args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(result['text'],flush=True)
