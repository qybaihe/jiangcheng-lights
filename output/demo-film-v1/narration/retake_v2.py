#!/usr/bin/env python3
"""One clearly voiced conversational retake; v1 audition remains untouched."""
import argparse
import produce as p
p.WORK=p.WORK/'take-v2';p.WORK.mkdir(parents=True,exist_ok=True)
p.PROMPT=p.PROMPT.replace('声音像一位成年女性轻轻对朋友讲起一段日常回忆。','声音像一位成年女性对坐在一米外的朋友正常说话，正常交談音量，正常声带发声，不是在耳边说话。')
p.PROMPT=p.PROMPT.replace('柔和自然的普通话成年女声，吐字清楚、亲近、温暖、松弛。','自然温暖的普通话成年女声，声音清楚有支撑、声带振动充分，吐字清楚，平和松弛。绝对不要耳语、气声、喘息或音量很小的私语。')
p.PROMPT=p.PROMPT.replace('温和笃定但不抬高音量地说','用正常说话音量清楚而平和地说')
a=argparse.ArgumentParser();a.add_argument('action',choices=['generate','listen']);v=a.parse_args()
try:
 if v.action=='generate':p.generate()
 else:p.listen(p.WORK/'audition.wav','audition')
except Exception as exc:
 print(type(exc).__name__+': retake stage failed; request details omitted')
 raise SystemExit(1)
