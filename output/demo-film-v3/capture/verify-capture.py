from pathlib import Path
import json, hashlib, subprocess
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
names=['01-river-photo-alignment','02-meal-packing','03-meal-community-delivery']
windows=[(2,3),(1,4),(6.5,4)]
clips=[]
for name,(start,duration) in zip(names,windows):
 path=out/(name+'.mp4')
 probe=json.loads(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
 check=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(path),'-f','null','-'],capture_output=True,text=True)
 video=next(s for s in probe['streams'] if s['codec_type']=='video')
 assert (video['width'],video['height'])==(1920,1080)
 assert video['r_frame_rate']=='30/1'
 assert check.returncode==0 and not check.stderr.strip()
 assert start+duration<=float(probe['format']['duration'])
 clips.append({'name':name,'path':str(path),'duration':float(probe['format']['duration']),'size':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'video':{k:video.get(k) for k in ['codec_name','width','height','r_frame_rate','color_space','color_range']},'decode':'passed','sourceIn':start,'editDuration':duration})
report=json.loads((out/'report.json').read_text())
photo=json.loads((out/'photo-rescue-state.json').read_text())
assert report['status']=='complete' and not report['errors']
final=report['milestones'][-1]
assert 'river' in photo['state']['photos']['completed']
assert all(v['delivered'] for v in final['state']['meals']['rounds']['evening']['boxes'].values())
assert 'chef' in final['state']['flags']
assert not any('chef' in m['state']['flags'] for m in report['milestones'] if m.get('name') in ['all-three-food-boxes-actually-packed','two-west-deliveries-earned'])
value={'status':'passed','captureMethod':'Native browser tab getDisplayMedia + MediaRecorder VP8/Opus, transcoded H.264/AAC. Real CDP key/mouse controls; no footage UI changes. Native 1920×1080 capture.','checkpoint':'v2 genuine granny-delivery-and-drawing-earned checkpoint; no new challenge progress seeded. All photo, supply, meal actions genuinely completed in this capture.','newGameplayCompleted':{'riverPhoto':True,'supplies':['box','water','battery'],'packedNamedMeals':3,'physicalHandovers':3,'chefAwardedOnlyAtThirdHandover':True},'reportInputs':len(report['inputs']),'runtimeErrors':len(report['errors']),'clips':clips,'notes':['The photo take was recovered from its existing native Blob with chunked CDP transfer after a large-message connection limit; no recapture, fabricated frames, or gameplay reset.','New voice lines in these takes are text-only where no TTS asset exists. Final promotional edit intentionally keeps the already-approved continuous v2 voiceover/music track instead of these game audio tracks.','Photo success is the native immediate camera return into A-yao dialogue; there is no invented success overlay.','Delivery dialogue first line is A-yao: 小许，蔡姨给你留了藕汤。']}
(out/'SOURCE-VERIFICATION.json').write_text(json.dumps(value,ensure_ascii=False,indent=2))
(out/'EDIT-CANDIDATES.json').write_text(json.dumps(clips,ensure_ascii=False,indent=2))
# unify all takes including recovered photo
prior=[x for x in json.loads((out/'manifest.json').read_text()) if x['name']!='01-river-photo-alignment']
photoClip={**clips[0],'description':'江边旧照对景：实际拖动对齐钟楼、桥影、栏杆，Enter成功快门','stateAfter':photo['state'],'recommendedSourceIn':2,'recommendedSourceOut':5}
(out/'manifest.json').write_text(json.dumps([photoClip]+prior,ensure_ascii=False,indent=2))
print(json.dumps(value,ensure_ascii=False,indent=2))
