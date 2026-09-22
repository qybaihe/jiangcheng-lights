import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools'))
import cinema_audio_v3 as c

# Authored after actual-master/contact review, never generated from planned lengths.
SEQUENCES={
'granny':[
 ('granny-memory-entry',.25,['G01'],'Granny has just set the noodle bowl in front of grandfather; both are in the same stable two-person shot.'),
 ('granny-memory-child-pickup',2.75,['G01'],'Grandfather answers across the bowl before her offer; the bowl is already served.'),
 ('granny-memory-offer',4.98,['G01'],'Granny gestures toward the alley around 4–6 seconds, offering to pick up the child; the same two people remain in frame.'),
 ('granny-memory-consent',9.50,['G01'],'Grandfather accepts while they exchange a small smile, before taking his chopsticks.'),
 ('granny-memory-humor',12.55,['G01'],'Granny gives the gentle rejoinder as grandfather relaxes and picks up chopsticks.'),
 ('granny-memory-bamboo',20.20,['G02'],'Grandfather speaks from outside frame while granny carefully releases the pencil from the sleeping child; no invented visible arrival.'),
 ('granny-memory-wash-hands',21.95,['G02'],'Granny responds before the actual cut to grandfather washing his hands, while finishing the quiet pencil action.'),
],
'chef':[
 ('chef-memory-entry',.3,['C01'],'Both are visible; grandfather positions the borrowed light to help Cai at the stall.'),
 ('chef-memory-ask',2.7,['C01'],'He checks the lamp placement while still next to the light.'),
 ('chef-memory-borrow',8.0,['C01'],'Cai says she will return the light over the end of the real coin-counting insert, continuing into the two-person view.'),
 ('chef-memory-two-lamps',10.1,['C01'],'The two-person view has returned; grandfather replies while the useful light remains on the counter.'),
 ('chef-memory-extra-bowl',14.4,['C02'],'Cai has the prepared meal in hand; grandfather speaks about paying while looking down at his money.'),
 ('chef-memory-eat',17.25,['C02'],'Cai sets the prepared meal down and gently interrupts his concern about payment.'),
 ('chef-memory-child-onion',22.5,['C02'],'Grandfather reminds Cai about the child portion while she moves back toward the cooking area.'),
 ('chef-memory-ready',25.8,['C03'],'Her answer is heard over the actual settled pale lunchbox and matching red lid, not the rejected later money-handling shot.'),
],
'ending':[
 ('ending-memory-entry',1.0,['E01'],'Zhou and grandfather are carrying the same table toward the window as Zhou checks its position.'),
 ('ending-memory-child-place',3.35,['E01'],'Grandfather answers while they carry the desk into place, leaving a corner for the child.'),
 ('ending-memory-dinner',12.3,['E02'],'In the real wide shot Cai is already holding the pale lunchbox with its red lid while the blue cloth is laid flat.'),
 ('ending-memory-thanks',16.416,['E02'],'Grandfather answers with the food still clearly present; ends before the source box-color-drift shot that was cut.'),
 ('ending-memory-child',27.917,['E04'],'The child raises their head at local 1.167 seconds and looks toward grandfather throughout the question.'),
 ('ending-memory-promise',31.45,['E04'],'Grandfather answers just as the child lowers their head and resumes writing; the shot ends after the writing settles.'),
]}
for scene,lines in SEQUENCES.items():
 ready,video,info=c.source_scene(scene);proof=c.read(c.WORK/'visual-proof'/scene/'inspection.json');voice=c.read(c.PUBLIC/'story-voice-manifest.json');cues=[]
 for ident,start,shots,anchor in lines:
  dur=voice['lines'][ident]['variants']['default']['duration'];evidence=[]
  for at in [start,min(start+dur*.5,info['duration']-.05),min(start+dur-.05,info['duration']-.05)]:
   path=c.WORK/'visual-proof'/scene/f'{ident}-{at:.3f}.jpg'
   c.run([c.FFMPEG,'-y','-v','error','-ss',f'{at:.3f}','-i',str(video),'-frames:v','1','-q:v','2',str(path)])
   evidence.append({'at':round(at,3),'frame':str(path.relative_to(c.ROOT))})
  cues.append({'id':ident,'start':start,'shotIds':shots,'visualAnchor':anchor,'evidence':evidence})
 effects=[]
 if scene in ('granny','chef'):
  r=next(x for x in c.read(c.WORK/'qa/effects-lossless-rewrap.json')['effects'] if x['effect']=='breeze')
  effects=[{'url':r['url'],'sha256':r['sha256'],'review':'accepted','reviewEvidence':r['reviewEvidence'],'losslessRewrapEvidence':'output/cinema-audio-v3/qa/effects-lossless-rewrap.json','start':0,'duration':info['duration'],'sourceIn':0,'sourceDuration':7,'gainDb':12.95,'loop':True,'fadeIn':.9,'fadeOut':1.2,'visualAnchor':'Extremely low outdoor breeze only; the 8–11 second unidentified source friction is never used; no invented sink/coins/box handling foley.'}]
 silence={
  'granny':[{'start':14.422,'end':20.2,'reason':'Transition to the sleeping child and the careful pencil removal.'},{'start':24.806,'end':33,'reason':'The reminder has already been spoken; full handwashing and tap closure play without explanatory speech.'}],
  'chef':[{'start':3.9,'end':8.0,'reason':'Cai works by the borrowed light before the quiet return promise.'},{'start':28.056,'end':30.5,'reason':'Let the prepared child meal remain visible after her answer.'}],
  'ending':[{'start':5.606,'end':12,'reason':'The shared table is set in place and steadied.'},{'start':17.496,'end':27.917,'reason':'Child arrives, sits, opens the notebook and then actually looks up to ask; no extra explaining narration.'},{'start':32.938,'end':34.125,'reason':'Child resumes writing after the reassuring answer.'}],
 }[scene]
 spec={'status':'reviewed','reviewMethod':'Actual final-master frame/contact review with per-line action anchors and exact final source hash, not planned or equally spaced windows.','silentSha256':info['sha256'],'actualTimeline':ready['timeline'],'cues':cues,'musicSourceIn':{'granny':0,'chef':13,'ending':0}[scene],'musicGainDb':0,'effects':effects,'silentSegmentReasons':silence}
 if scene=='ending':spec['effectRationale']='No approved spot effect specifically matches these interior actions; use quiet existing score rather than invent unrelated foley.'
 c.atomic_json(c.MAPS/f'{scene}.json',spec)
 print(scene,'authored',len(cues),'exact line cues')
